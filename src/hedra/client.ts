import { Client, PrivateKey } from "@hashgraph/sdk";
import 'dotenv/config';

export function hedera() {
  const id = process.env.HEDERA_ACCOUNT_ID;
  const key = process.env.HEDERA_PRIVATE_KEY;
  if (!id || !key) {
    throw new Error("Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env");
  }
  const client = Client.forTestnet();
  client.setOperator(id, PrivateKey.fromString(key));
  return client;
}

