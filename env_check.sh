#!/usr/bin/env bash
set -e

echo "Reading .env..."
export $(grep -v '^#' .env | xargs) || true

echo "=== Required ==="
[[ "$HEDERA_NETWORK" == "testnet" ]] || echo "WARN: HEDERA_NETWORK should be testnet"
[[ "$HEDERA_ACCOUNT_ID" =~ ^0\.0\.[0-9]+$ ]] || echo "ERROR: HEDERA_ACCOUNT_ID invalid or missing"
[[ -n "$HEDERA_PRIVATE_KEY" ]] || echo "ERROR: HEDERA_PRIVATE_KEY missing"

echo "=== Planner ==="
echo "REQUIRE_OPERATOR_APPROVAL=${REQUIRE_OPERATOR_APPROVAL:-false}"
echo "AUTO_RELEASE_DELAY_MS=${AUTO_RELEASE_DELAY_MS:-30000}"

echo "=== NLP ==="
echo "NLP_MODE=${NLP_MODE:-rules}"
if [[ "${NLP_MODE}" == "ai" && -z "$OPENAI_API_KEY" ]]; then
  echo "ERROR: NLP_MODE=ai but OPENAI_API_KEY is missing"
fi

echo "=== SMS ==="
echo "SMS_MODE=${SMS_MODE:-stub}"

echo "=== Topic ==="
if [[ -z "$HCS_TOPIC_ID" ]]; then
  echo "INFO: HCS_TOPIC_ID empty; app will auto-create on startup."
else
  echo "HCS_TOPIC_ID=$HCS_TOPIC_ID"
fi

echo "Done."

