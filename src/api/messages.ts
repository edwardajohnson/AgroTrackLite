// src/api/messages.ts
import axios from 'axios';
import type { Express, Request, Response } from 'express';
import { currentTopicId } from '../hedera/hcsLogger.ts';
import { parseIntent } from '../nlp/router.ts';
import { handleIntent, __debugGetPending } from '../workflow/handleIntent.ts';

function base64ToString(b64: string) {
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function registerApiRoutes(app: Express) {
  // GET /api/messages?limit=50
  app.get('/api/messages', async (req: Request, res: Response) => {
    const topicId = currentTopicId() || process.env.HCS_TOPIC_ID;
    if (!topicId) {
      res.status(200).json({ status: 'error', message: 'HCS topic not initialized yet' });
      return;
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const mirror = process.env.HEDERA_MIRROR_URL || 'https://testnet.mirrornode.hedera.com';
    const url = `${mirror}/api/v1/topics/${topicId}/messages?limit=${limit}`;

    try {
      const { data } = await axios.get(url);
      const rows = (data?.messages || []).map((m: any) => {
        const decoded = base64ToString(m.message);
        let json: any = null;
        try { json = JSON.parse(decoded); } catch {}
        return {
          consensus_timestamp: m.consensus_timestamp,
          sequence_number: m.sequence_number,
          running_hash_version: m.running_hash_version,
          raw: decoded,
          json,
        };
      });

      res.status(200).json({
        status: 'ok',
        topicId,
        count: rows.length,
        messages: rows,
      });
    } catch (e: any) {
      res.status(200).json({ status: 'error', message: e?.message || e });
    }
  });

  // GET /api/pending
  app.get('/api/pending', (_req, res) => {
    res.status(200).json({ status: 'ok', data: __debugGetPending() });
  });

  // POST /api/test  (runs a demo: delivery then buyer confirm)
  app.post('/api/test', async (req, res) => {
    const otp = String(req.body.otp || '553904');
    const qty = Number(req.body.qty || 200);
    const grade = String(req.body.grade || 'A');

    const farmer = '+254700000001';
    const buyer  = '+254700000002';

    // Simulate farmer delivery
    const text1 = `Delivered ${qty}kg OTP ${otp} Grade ${grade}`;
    const i1 = parseIntent(text1);
    await handleIntent(farmer, i1);

    // Simulate buyer confirm
    const text2 = `Confirm ${otp}`;
    const i2 = parseIntent(text2);
    await handleIntent(buyer, i2);

    res.status(200).json({ status: 'ok', ran: { otp, qty, grade }, farmer, buyer });
  });
}

