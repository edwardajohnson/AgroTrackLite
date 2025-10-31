// src/agent/planner.ts
import type { Express, Request, Response } from 'express';
import { logToHCS } from '../hedera/hcsLogger.ts';
import { simulateEscrowRelease } from '../hedera/escrow.ts';

type TaskType = 'releaseEscrow';
type TaskStatus = 'pending' | 'waiting_approval' | 'running' | 'failed' | 'done';
type Task = {
  id: string;
  type: TaskType;
  payload: any;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;     // epoch ms
  backoffMs: number;     // current backoff
  requiresApproval: boolean;
};

const REQUIRE_OPERATOR_APPROVAL = (process.env.REQUIRE_OPERATOR_APPROVAL || 'false').toLowerCase() === 'true';
const QUEUE_INTERVAL_MS = Number(process.env.QUEUE_INTERVAL_MS || 1000);
/** When approvals are OFF, delay first run by this much to make the demo visible */
const AUTO_RELEASE_DELAY_MS = Number(process.env.AUTO_RELEASE_DELAY_MS || 30_000);

const queue: Task[] = [];
let timer: NodeJS.Timeout | null = null;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- PUBLIC API ----------

export function initPlanner() {
  if (timer) return;
  timer = setInterval(tick, QUEUE_INTERVAL_MS);
  console.log(
    `🧠 Planner running (interval=${QUEUE_INTERVAL_MS} ms, requireApproval=${REQUIRE_OPERATOR_APPROVAL}, autoDelay=${AUTO_RELEASE_DELAY_MS} ms)`
  );
}

export function registerPlannerRoutes(app: Express) {
  app.get('/api/queue', (_req: Request, res: Response) => {
    res.json({ status: 'ok', size: queue.length, queue });
  });

  app.post('/api/approve', async (req: Request, res: Response) => {
    const id = String(req.query.id || req.body?.id || '');
    const t = queue.find(q => q.id === id);
    if (!t) return res.status(404).json({ status: 'error', message: 'task not found' });

    if (t.status !== 'waiting_approval') {
      return res.status(400).json({ status: 'error', message: `task status is ${t.status}, not waiting_approval` });
    }

    t.status = 'pending';
    t.nextRunAt = Date.now();
    await logToHCS('TaskApproved', { id: t.id, type: t.type, payload: t.payload });
    res.json({ status: 'ok', approved: id });
  });

  app.post('/api/queue/run', async (_req: Request, res: Response) => {
    await tick();
    res.json({ status: 'ok' });
  });
}

/** Enqueue an escrow release (buyer confirm path). Returns task id. */
export async function enqueueReleaseEscrow(params: { otp: string; amount: number; farmerId: string; buyerId: string }) {
  const { otp, amount, farmerId, buyerId } = params;
  const requiresApproval = REQUIRE_OPERATOR_APPROVAL;

  const initialDelay = requiresApproval ? 0 : AUTO_RELEASE_DELAY_MS; // <- delay for demo visibility when auto mode
  const task: Task = {
    id: uid(),
    type: 'releaseEscrow',
    payload: { otp, amount, farmerId, buyerId },
    status: requiresApproval ? 'waiting_approval' : 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextRunAt: Date.now() + initialDelay,
    backoffMs: 1500,
    requiresApproval,
  };
  queue.push(task);
  await logToHCS('TaskEnqueued', {
    id: task.id, type: task.type, payload: task.payload, requiresApproval, initialDelayMs: initialDelay
  });
  return task.id;
}

// ---------- CORE LOOP ----------

async function tick() {
  const now = Date.now();
  // process one due task per tick
  const task = queue.find(t => (t.status === 'pending' || t.status === 'failed') && t.nextRunAt <= now);
  if (!task) return;

  try {
    task.status = 'running';
    await logToHCS('TaskRunning', { id: task.id, type: task.type, attempts: task.attempts });

    switch (task.type) {
      case 'releaseEscrow': {
        const { otp, amount, farmerId, buyerId } = task.payload;
        await simulateEscrowRelease(farmerId, buyerId, amount); // demo mode → EscrowReleased_SIM
        await logToHCS('TaskDone', { id: task.id, type: task.type, otp, amount, farmerId, buyerId });
        task.status = 'done';
        break;
      }
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  } catch (err: any) {
    task.attempts += 1;
    if (task.attempts >= task.maxAttempts) {
      task.status = 'failed';
      await logToHCS('TaskFailed', { id: task.id, type: task.type, error: err?.message || String(err), terminal: true });
    } else {
      task.status = 'failed';
      task.nextRunAt = Date.now() + task.backoffMs;
      task.backoffMs = Math.min(task.backoffMs * 2, 60_000); // cap at 60s
      await logToHCS('TaskRetryScheduled', {
        id: task.id, type: task.type, attempts: task.attempts, nextRunInMs: task.backoffMs
      });
    }
  }
}

