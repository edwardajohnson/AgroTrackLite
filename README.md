# AgroTrack-Lite 🌾 (Hedera AI + DePIN, SMS-first)

Low-cost, SMS-first marketplace + escrow for smallholder farmers. Farmers text updates; the system parses intent (rule-based or AI), logs events to **Hedera Consensus Service (HCS)**, and (next steps) simulates escrow with **Hedera Token Service (HTS)**. No smartphone or wallet app required.

## ✨ Features
- 📱 **SMS-first UX** (works on basic phones)
- 🧠 Intent parsing (rule-based now; AI agent optional)
- 🧾 **On-chain audit trail** via HCS
- 🧰 Clean TypeScript + Express skeleton, ready for Agent Kit
- 🪵 Rotating SMS logs in `logs/sms-YYYY-MM-DD.log`

## 🧭 Architecture (MVP)


## 🚀 Quickstart
```bash
git clone https://github.com/edwardajohnson/AgroTrackLite.git
cd AgroTrackLite
cp .env.example .env               # fill values
npm install
npm run dev
