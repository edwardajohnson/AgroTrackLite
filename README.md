# AgroTrack-Lite 🌾 (Hedera AI + DePIN, SMS-first)

Low-cost, SMS-first marketplace + escrow for smallholder farmers. Farmers text updates; the system parses intent (rule-based or AI), logs events to **Hedera Consensus Service (HCS)**, and (next steps) simulates escrow with **Hedera Token Service (HTS)**. No smartphone or wallet app required.

## ✨ Features
- 📱 **SMS-first UX** (works on basic phones)
- 🧠 Intent parsing (rule-based now; AI agent optional)
- 🧾 **On-chain audit trail** via HCS
- 🧰 Clean TypeScript + Express skeleton, ready for Agent Kit
- 🪵 Rotating SMS logs in `logs/sms-YYYY-MM-DD.log`

## 🧭 Architecture (MVP)


## 🖥️ Judge Dashboard (HCS Viewer)

This repo contains a minimal React dashboard under `dashboard/` to visualize Hedera Consensus Service messages and pending OTPs.

### Run
```bash
# Backend (root)
npm run dev
```

# Frontend (dashboard/)
cd dashboard
npm install
npm run dev

## 🚀 Quickstart
```bash
git clone https://github.com/edwardajohnson/AgroTrackLite.git
cd AgroTrackLite
cp .env.example .env               # fill values
npm install
npm run dev
```

## Health check:

GET http://localhost:3000/health  → ok

## 🧪 Test via cURL

Create listing:

curl -X POST http://localhost:3000/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254700000001" \
  -d "text=Maize 200kg Kisumu"


Confirm delivery:

curl -X POST http://localhost:3000/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254700000001" \
  -d "text=Delivered 198kg OTP 553904 Grade B"


View logs:

cat logs/sms-$(date +%F).log

## ⚙️ Environment

See .env.example. Minimum:

HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e02...
# Optional: leave blank to auto-create
HCS_TOPIC_ID=
NLP_MODE=rules   # or ai
OPENAI_API_KEY=  # if NLP_MODE=ai
PORT=3000

## 📂 Project Structure
src/
  agents/        # (optional) AI agent(s)
  hedera/        # hcsLogger.ts
  nlp/           # router.ts (rule-based NLP)
  sms/           # send.ts (logs to console + file)
  workflow/      # handleIntent.ts (business logic)
  index.ts       # server + routes
logs/            # rotating logs (created at runtime)

## 🧠 AI Mode (optional)

Set NLP_MODE=ai and OPENAI_API_KEY. The AI agent will return structured intents and log them to HCS.

🧾 HCS Verification

After sending SMS:

Find the topic ID in server startup logs (✅ HCS ready. Topic: 0.0.xxxxx)

Open: https://hashscan.io/testnet/topic/<topicId>

## 🛣️ Roadmap

 HTS escrow simulation (token mint/transfer)

 Buyer portal /buyer/confirm → release escrow

 Basic dashboard (stream HCS events)

 Hedera Agent Kit actions (OTP verification, risk checks)

## 🔒 Security

Do not commit .env

Keys are for testnet only

Validate and rate-limit real SMS gateways

## 📜 License

MIT


---

# 2) Add `.env.example`

Create `.env.example`:

```bash
# Hedera network + operator
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e02...

# HCS topic (optional; leave blank to auto-create one and copy ID from console)
HCS_TOPIC_ID=

# NLP: "rules" or "ai"
NLP_MODE=rules
OPENAI_API_KEY=

# Server
PORT=3000
```

