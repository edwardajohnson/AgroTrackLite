// src/hedera/hcsLogger.ts
import {
  Client,
  PrivateKey,
  AccountId,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';

const NETWORK = process.env.HEDERA_NETWORK || 'testnet';

// ---- Operator (the account that signs the tx) ----
const OP_ID = process.env.HEDERA_ACCOUNT_ID;
const OP_KEY = process.env.HEDERA_PRIVATE_KEY;

if (!OP_ID || !OP_KEY) {
  console.error(
    '❌ Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env — HCS logging will be disabled.'
  );
}

const client =
  OP_ID && OP_KEY
    ? Client.forName(NETWORK).setOperator(AccountId.fromString(OP_ID), PrivateKey.fromString(OP_KEY))
    : Client.forName(NETWORK);

let topicId = process.env.HCS_TOPIC_ID?.trim();

// Create a topic lazily if none provided
export async function initTopic(): Promise<string> {
  if (!OP_ID || !OP_KEY) throw new Error('Operator not configured');

  if (topicId) return topicId;
  const tx = await new TopicCreateTransaction()
    .setTopicMemo('AgroTrack-Lite HCS')
    .execute(client);

  const receipt = await tx.getReceipt(client);
  topicId = receipt.topicId?.toString();
  if (!topicId) throw new Error('Topic creation failed (no topicId in receipt)');
  console.log(`🧾 HCS topic ready: ${topicId}`);
  return topicId;
}

export async function logToHCS(label: string, payload: object) {
  if (!OP_ID || !OP_KEY) {
    console.warn(`⚠️ HCS disabled: ${label}`);
    return;
  }
  const tid = await initTopic();
  const msg = JSON.stringify({
    label,
    payload,
    ts: new Date().toISOString(),
  });
  await new TopicMessageSubmitTransaction()
    .setTopicId(tid)
    .setMessage(msg)
    .execute(client);
  console.log(`🪵 HCS log submitted → ${label}`);
}

// Optional: expose the current topic id (after init)
export function currentTopicId(): string | undefined {
  return topicId;
}

