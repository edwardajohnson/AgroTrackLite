// src/agent/report.ts
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logToHCS, currentTopicId } from '../hedera/hcsLogger.ts';
import type { Express, Request, Response } from 'express';

/** Fetch and decode recent messages from Mirror Node for this topic */
async function fetchTopicMessagesSince(sinceEpochSeconds: number, limit = 500) {
  const topicId = currentTopicId() || process.env.HCS_TOPIC_ID;
  if (!topicId) throw new Error('Topic not initialized');
  const mirror = process.env.HEDERA_MIRROR_URL || 'https://testnet.mirrornode.hedera.com';
  const url = `${mirror}/api/v1/topics/${topicId}/messages?limit=${limit}`;

  const out: Array<{ ts: number; label?: string; payload?: any }> = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const { data } = await axios.get(nextUrl);
    for (const m of data?.messages ?? []) {
      const ts = Number(String(m.consensus_timestamp).split('.')[0] || '0');
      const raw = Buffer.from(m.message, 'base64').toString('utf8');
      let json: any = null;
      try { json = JSON.parse(raw); } catch {}
      if (ts >= sinceEpochSeconds) {
        out.push({ ts, label: json?.label, payload: json?.payload });
      }
    }
    // Stop early if oldest page message already predates the window
    const last = data?.messages?.[data.messages.length - 1];
    if (!last) break;
    const lastTs = Number(String(last.consensus_timestamp).split('.')[0] || '0');
    if (lastTs < sinceEpochSeconds) break;

    // paginate if provided
    const links = data?.links || {};
    nextUrl = links?.next ? (links.next.startsWith('http') ? links.next : `${mirror}${links.next}`) : null;
  }
  return out;
}

function summarize(messages: Array<{ ts: number; label?: string; payload?: any }>) {
  const dayTotal = messages.length;
  const labels = (name: string) => messages.filter(m => m.label === name);
  const deliveries = labels('DeliveryRecorded');
  const stored = labels('PendingDeliveryStored');
  const buyerConf = labels('BuyerConfirmed');
  const enqueued = labels('TaskEnqueued');
  const done = labels('TaskDone');
  const escrowSim = labels('EscrowReleased_SIM');
  const escrowReal = labels('EscrowReleased');

  // Totals
  const totalDeliveries = deliveries.length;
  const totalStored = stored.length;
  const totalBuyerConfirms = buyerConf.length;
  const totalEscrow = escrowSim.length + escrowReal.length;

  // Quantity sum (when present)
  const qtyFrom = (rows: typeof messages) =>
    rows.reduce((acc, m) => acc + (Number(m.payload?.qty || m.payload?.quantity || 0) || 0), 0);
  const totalQtyDelivered = qtyFrom(deliveries);

  // Unique parties (best-effort)
  const uniq = (arr: any[]) => Array.from(new Set(arr)).length;
  const farmers = uniq(messages.map(m => m.payload?.farmerId).filter(Boolean));
  const buyers  = uniq(messages.map(m => m.payload?.buyerId).filter(Boolean));

  // Errors / retries
  const failed = labels('TaskFailed').length;
  const retries = labels('TaskRetryScheduled').length;

  return {
    counts: {
      dayTotal,
      totalDeliveries,
      totalStored,
      totalBuyerConfirms,
      totalEscrow,
      failed,
      retries,
    },
    totals: {
      totalQtyDelivered,
    },
    parties: {
      farmers,
      buyers,
    },
    escrow: {
      simulated: escrowSim.length,
      real: escrowReal.length,
    },
    meta: {
      firstTs: messages[0]?.ts || null,
      lastTs: messages[messages.length - 1]?.ts || null,
    }
  };
}

/** Create a daily report for YYYY-MM-DD (UTC day) and post to HCS */
export async function runDailyReport(forDateUTC?: Date) {
  const topicId = currentTopicId() || process.env.HCS_TOPIC_ID;
  if (!topicId) throw new Error('Topic not initialized');

  // Define the UTC window: previous day by default
  const now = forDateUTC ? new Date(forDateUTC) : new Date();
  // Report yesterday if not specified
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0); // today 00:00 UTC
  const start = end - 24 * 3600 * 1000; // yesterday 00:00 UTC

  const startSec = Math.floor(start / 1000);
  const msgs = await fetchTopicMessagesSince(startSec);
  const withinDay = msgs.filter(m => m.ts >= startSec && m.ts < Math.floor(end / 1000));

  const summary = summarize(withinDay);
  const dayStr = new Date(start).toISOString().slice(0, 10);

  // Write to HCS
  await logToHCS('DailyReport', {
    day: dayStr,
    topicId,
    summary
  });

  // Save a local copy
  const logDir = path.resolve('logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, `daily-report-${dayStr}.json`);
  fs.writeFileSync(file, JSON.stringify({ day: dayStr, topicId, summary }, null, 2), 'utf8');

  console.log(`📊 DailyReport posted for ${dayStr} (messages=${withinDay.length})`);
  return { day: dayStr, messages: withinDay.length, summary };
}

/** Start a scheduler that posts yesterday’s report at 00:05 UTC every day */
export function startDailyReportScheduler() {
  // compute ms until next 00:05 UTC
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 5, 0
  ));
  if (now.getUTCHours() >= 0 || (now.getUTCHours() === 0 && now.getUTCMinutes() >= 5)) {
    // schedule for next day
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const initialDelay = next.getTime() - now.getTime();

  setTimeout(() => {
    // run once, then every 24h
    runDailyReport().catch(err => console.error('DailyReport error:', err?.message || err));
    setInterval(() => {
      runDailyReport().catch(err => console.error('DailyReport error:', err?.message || err));
    }, 24 * 3600 * 1000);
  }, initialDelay);

  console.log(`⏰ DailyReport scheduler set. First run at (UTC): ${next.toISOString()}`);
}

/** Optional HTTP routes for manual trigger / preview */
export function registerReportRoutes(app: Express) {
  app.post('/api/report/run', async (_req: Request, res: Response) => {
    try {
      const out = await runDailyReport();
      res.status(200).json({ status: 'ok', ...out });
    } catch (e: any) {
      res.status(200).json({ status: 'error', message: e?.message || String(e) });
    }
  });

  app.get('/api/report/when', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      note: 'Reports run daily ~00:05 UTC for the prior day.',
    });
  });
}

