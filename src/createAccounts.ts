// src/createAccounts.ts
import 'dotenv/config';
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
} from '@hashgraph/sdk';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing ${name} in .env`);
  }
  return v;
}

async function main() {
  // 1) Load & validate env
  const OP_ID = requireEnv('HEDERA_ACCOUNT_ID');     // e.g. 0.0.456789
  const OP_KEY = requireEnv('HEDERA_PRIVATE_KEY');   // e.g. 302e02...

  // 2) Build client explicitly with parsed types (avoids silent "undefined")
  const client = Client.forTestnet();
  client.setOperator(AccountId.fromString(OP_ID), PrivateKey.fromString(OP_KEY));

  // 3) Create a new test account with 10ℏ (repeat to make Farmer/Buyer/Escrow)
  const newKey = PrivateKey.generateED25519();
  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(10))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log('✅ New Account ID:', receipt.accountId?.toString());
  console.log('🔑 Private Key   :', newKey.toString());
  console.log('🔒 Public Key    :', newKey.publicKey.toString());
}

main().catch((err) => {
  console.error('❌ createAccounts failed:', err.message);
  process.exit(1);
});

