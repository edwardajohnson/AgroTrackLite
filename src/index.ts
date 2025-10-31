// src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

import { parseIntent } from './nlp/router.ts';
import { handleIntent } from './workflow/handleIntent.ts';
import { initTopic, currentTopicId } from './hedera/hcsLogger.ts';
import { registerApiRoutes } from './api/messages.ts';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.send('ok'));

/** Append inbound logs to the same rotating file used by send.ts */
function logInbound(from: string, text: string, intent: unknown) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const logDir = path.resolve('logs');
  const logFile = path.join(logDir, `sms-${dateStr}.log`);
  const entry =
    `[${now.toISOString()}] SMS ← ${from}: ${text}\n` +
    `           intent: ${JSON.stringify(intent)}\n`;

  // Console output
  console.log(entry.trim());

  // File output
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `\n${entry}`, 'utf8');
  } catch (err) {
    console.error('Error writing inbound SMS log:', err);
  }
}

app.post('/webhook/sms', async (req, res) => {
  const from = String(req.body.from || '').trim();
  const text = String(req.body.text || '').trim();

  if (!from || !text) {
    res.status(200).json({ status: 'error', message: "Missing 'from' or 'text'" });
    return;
  }

  try {
    const intent = parseIntent(text);

    // Log inbound message + parsed intent (console + file)
    logInbound(from, text, intent);

    // Run business workflow (also sends/logs outbound SMS)
    await handleIntent(from, intent);

    // Respond with useful JSON for curl/Postman
    res.status(200).json({
      status: 'received',
      topicId: currentTopicId() || null,
      from,
      text,
      intent
    });
  } catch (e: any) {
    console.error('webhook error:', e?.message || e);
    res.status(200).json({
      status: 'error',
      message: 'Unable to process message right now. Send "HELP" for commands.'
    });
  }
});

/** 🔌 Register API routes (HCS messages, pending OTPs, demo runner) */
registerApiRoutes(app);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 AgroTrack-Lite API running on http://localhost:${PORT}`);
  // Initialize (or auto-create) the HCS topic on startup so we have a ready ID.
  try {
    await initTopic();
    console.log(`✅ HCS ready. Topic: ${currentTopicId()}`);
  } catch (e: any) {
    console.error('❌ HCS init failed:', e?.message || e);
    console.error('   Check .env: HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY / HCS_TOPIC_ID (optional).');
  }
});

