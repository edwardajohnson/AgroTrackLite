# 🌾 AgroTrack-Lite  
AgroTrack-Lite 🌾 (Hedera AI + DePIN, SMS-first)
Built for the **Hedera Africa Hackathon 2025**

---

## 🚀 Overview

AgroTrack-Lite is a lightweight, verifiable traceability system for agricultural trade.  
It enables **farmers and buyers to confirm deliveries via SMS**, while the system logs all verified events on the **Hedera Consensus Service (HCS)** — ensuring transparency, trust, and auditability.

The system can operate in **two modes**:
- **Rule-based NLP** (fast local classification)
- **Agentic AI NLP** (GPT-powered intent interpretation)

---

## 🧠 Key Features

✅ Farmers send delivery details via SMS  
✅ Buyers confirm deliveries with OTP  
✅ Escrow logic releases payments automatically  
✅ Events immutably logged to **Hedera HCS**  
✅ Dashboard displays all transactions live  
✅ Optional **AI NLP Mode** for free-text interpretation  
✅ Built with modular, agent-ready architecture

---

## 🏗️ Architecture Summary

```text
Farmer/Buyer → Express API (SMS Webhook)
             → NLP Router (rules or AI)
             → Workflow Handler
             → Hedera HCS (Immutable Logs)
             → Dashboard Viewer (Live)
```

## 🖥️ Judge Dashboard (HCS Viewer)

This repo contains a minimal React dashboard under `dashboard/` to visualize Hedera Consensus Service messages and pending OTPs.

### Run

```bash
# Backend (root)
npm run dev
```

## Frontend (dashboard/)

```
cd dashboard
npm install
npm run dev
```

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

Farmer sends delivery
Create listing:

curl -X POST http://localhost:3000/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254700000001" \
  -d "text=Maize 200kg Kisumu"


Buyer confirms delivery
Confirm delivery:

curl -X POST http://localhost:3000/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "from=+254700000001" \
  -d "text=Delivered 198kg OTP 553904 Grade B"


## View logs:

cat logs/sms-$(date +%F).log

Expected topic log entries:

DeliveryRecorded
BuyerConfirmed
EscrowReleased

## ⚙️ Environment
```
See .env.example. Minimum:

HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=302e02...
```

## Optional: leave blank to auto-create
```
HCS_TOPIC_ID=
NLP_MODE=rules   # or ai
OPENAI_API_KEY=  # if NLP_MODE=ai
PORT=3000
```

## 📂 Project Structure

```
src/
  agents/        # (optional) AI agent(s)
  hedera/        # hcsLogger.ts
  nlp/           # router.ts (rule-based NLP)
  sms/           # send.ts (logs to console + file)
  workflow/      # handleIntent.ts (business logic)
  index.ts       # server + routes
logs/            # rotating logs (created at runtime)
```

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

##  `.env.example`

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

