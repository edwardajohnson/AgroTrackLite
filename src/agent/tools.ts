// src/agent/tools.ts
import { logToHCS } from '../hedera/hcsLogger.ts';
import { simulateEscrowRelease } from '../hedera/escrow.ts';
import { storePendingDelivery } from '../workflow/handleIntent.ts';

export type ToolResult = { ok: true; data?: unknown } | { ok: false; error: string };

export async function hcsLogTool(label: string, payload: unknown): Promise<ToolResult> {
  try {
    await logToHCS(label, payload ?? {});
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Store a pending delivery keyed by OTP (uses FARMER/BUYER ids from env) */
export async function otpStoreTool(params: {
  otp: string;
  quantity: number;
  unit?: string;
  grade?: string;
}): Promise<ToolResult> {
  try {
    const { otp, quantity, unit = 'kg', grade } = params;
    if (!otp || !quantity || quantity <= 0) return { ok: false, error: 'invalid otp/quantity' };
    const stored = storePendingDelivery({ otp, qty: quantity, unit, grade });
    if (!stored) return { ok: false, error: 'missing FARMER/BUYER env or invalid args' };
    await logToHCS('PendingDeliveryStored_viaTool', { otp, quantity, unit, grade });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Direct escrow release (demo mode logs to HCS; real mode uses HTS if enabled) */
export async function escrowReleaseTool(params: {
  farmerId: string;
  buyerId: string;
  amount: number;
}): Promise<ToolResult> {
  try {
    const { farmerId, buyerId, amount } = params;
    if (!farmerId || !buyerId || !amount || amount <= 0) {
      return { ok: false, error: 'invalid farmer/buyer/amount' };
    }
    await simulateEscrowRelease(farmerId, buyerId, amount);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

