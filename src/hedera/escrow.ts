// src/hedera/escrow.ts
import { logToHCS } from './hcsLogger.ts';

// Real HTS imports are only used when DEMO mode is off
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TransferTransaction,
} from '@hashgraph/sdk';

/**
 * DEMO MODE:
 * - true  (default): do NOT call HTS; only log to HCS + console.
 * - false: perform real HTS token ops on testnet (requires associations, balances, etc.)
 */
const DEMO_ESCROW = (process.env.ESCROW_DEMO_MODE ?? 'true').toLowerCase() === 'true';

// Cached values
let ESCROW_TOKEN_ID = (process.env.ESCROW_TOKEN_ID || '').trim();
let client: Client | null = null;

function getClient(): Client {
  if (client) return client;
  const OP_ID = process.env.HEDERA_ACCOUNT_ID;
  const OP_KEY = process.env.HEDERA_PRIVATE_KEY;
  const NETWORK = process.env.HEDERA_NETWORK || 'testnet';

  if (!OP_ID || !OP_KEY) {
    throw new Error('HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY missing; cannot use real HTS mode.');
  }
  client = Client.forName(NETWORK).setOperator(AccountId.fromString(OP_ID), PrivateKey.fromString(OP_KEY));
  return client!;
}

/**
 * Ensure a fungible token exists to represent escrowed value.
 * Only used when DEMO_ESCROW === false.
 */
export async function ensureEscrowToken(): Promise<string> {
  if (DEMO_ESCROW) {
    // In demo mode we don't need a token; return a synthetic id for display only.
    return ESCROW_TOKEN_ID || '0.0.DEMO';
  }

  if (ESCROW_TOKEN_ID) return ESCROW_TOKEN_ID;

  const c = getClient();
  const opId = process.env.HEDERA_ACCOUNT_ID!;
  const createTx = await new TokenCreateTransaction()
    .setTokenName('AgroTrackCredit')
    .setTokenSymbol('AGC')
    .setTokenType(TokenType.FUNGIBLE_COMMON)
    .setDecimals(2)
    .setInitialSupply(1_000_000)            // demo supply
    .setTreasuryAccountId(opId)
    .execute(c);

  const receipt = await createTx.getReceipt(c);
  ESCROW_TOKEN_ID = receipt.tokenId?.toString() || '';
  if (!ESCROW_TOKEN_ID) throw new Error('Failed to create AGC token');

  console.log(`✅ [HTS] Created escrow token: ${ESCROW_TOKEN_ID}`);
  await logToHCS('Escrow_Token_Created', { tokenId: ESCROW_TOKEN_ID });
  return ESCROW_TOKEN_ID;
}

/**
 * Simulate (or execute) escrow release.
 * - DEMO mode: write EscrowReleased_SIM to HCS + console.
 * - Real mode: transfer AGC from treasury (operator) to farmer.
 */
export async function simulateEscrowRelease(farmerId: string, buyerId: string, amount: number) {
  if (DEMO_ESCROW) {
    await logToHCS('EscrowReleased_SIM', {
      farmerId,
      buyerId,
      amount,
      unit: 'AGC',
      note: 'Demo mode (no HTS transfer)',
    });
    console.log(`💸 [SIM] Released ${amount} AGC to ${farmerId} (buyer: ${buyerId})`);
    return;
  }

  // ---- Real HTS transfer path (testnet) ----
  const c = getClient();
  const tokenId = await ensureEscrowToken();

  // NOTE: On real testnet, the farmer account MUST be associated with tokenId beforehand.
  // This demo assumes association is already done off-path.

  const treasury = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);

  const tx = await new TransferTransaction()
    .addTokenTransfer(tokenId, treasury, -amount)
    .addTokenTransfer(tokenId, AccountId.fromString(farmerId), amount)
    .execute(c);

  const receipt = await tx.getReceipt(c);

  await logToHCS('EscrowReleased', {
    farmerId,
    buyerId,
    amount,
    tokenId,
    status: receipt.status.toString(),
  });

  console.log(`💸 [HTS] Released ${amount} AGC (${tokenId}) to ${farmerId} — status: ${receipt.status.toString()}`);
}

