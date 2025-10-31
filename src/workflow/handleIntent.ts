// src/workflow/handleIntent.ts
import { logToHCS } from '../hedera/hcsLogger.ts';
import { sendSms } from '../sms/send.ts';
import type { ParsedIntent } from '../nlp/router.ts';
import { enqueueReleaseEscrow } from '../agent/planner.ts';

/** In-memory pending deliveries keyed by OTP */
const pendingByOtp = new Map<
  string,
  { qty: number; unit: string; grade?: string; farmerId: string; buyerId: string }
>();

/** 🔎 Debug helper for /api/pending and tests */
export function __debugGetPending() {
  return Object.fromEntries(pendingByOtp.entries());
}

/** 🧩 Helper so tools/AI can store a pending delivery */
export function storePendingDelivery(args: { otp: string; qty: number; unit: string; grade?: string }): boolean {
  const FARMER_ID = (process.env.FARMER_ACCOUNT_ID || '').trim();
  const BUYER_ID  = (process.env.BUYER_ACCOUNT_ID  || '').trim();

  if (!args?.otp || !args.qty || args.qty <= 0 || !FARMER_ID || !BUYER_ID) {
    console.error('⚠️ storePendingDelivery: invalid args or missing env vars', { args, FARMER_ID, BUYER_ID });
    return false;
  }

  pendingByOtp.set(args.otp, {
    qty: args.qty,
    unit: args.unit || 'kg',
    grade: args.grade,
    farmerId: FARMER_ID,
    buyerId: BUYER_ID,
  });

  console.log(`🗂 Stored pending delivery OTP ${args.otp}: ${args.qty}${args.unit || 'kg'} grade=${args.grade || '-'}`);
  return true;
}

/** Safe HCS log (won’t throw) */
async function safeHcsLog(label: string, payload: unknown) {
  try {
    await logToHCS(label, payload);
  } catch (err: any) {
    console.error(`❌ HCS log failed for ${label}:`, err?.message || err);
  }
}

/** Main intent handler */
export async function handleIntent(from: string, intent: ParsedIntent): Promise<void> {
  await safeHcsLog('IncomingIntent', { from, intent });

  switch (intent.type) {
    case 'DELIVERY_CONFIRMATION': {
      const qty   = Number(intent.data?.quantity ?? 0);
      const unit  = (intent.data?.unit ?? 'kg').trim();
      const otp   = (intent.data?.otp ?? '').trim();
      const grade = (intent.data?.grade ?? 'N/A').toString().trim();

      if (!otp || !qty) {
        await sendSms(from, '❌ Missing OTP or quantity. Example: "Delivered 200kg OTP 553904 Grade A"');
        await safeHcsLog('DeliveryRejected', { reason: 'missing_otp_or_qty', from, otp, qty });
        return;
      }

      const stored = storePendingDelivery({ otp, qty, unit, grade });
      if (!stored) {
        await sendSms(from, '⚠️ Could not record delivery (config missing FARMER/BUYER or invalid input).');
        await safeHcsLog('PendingDeliveryNotStored', { otp, qty, unit, grade });
        return;
      }

      await sendSms(from, `✅ Delivery recorded: ${qty}${unit} (Grade ${grade}) OTP ${otp}. Awaiting buyer confirm.`);
      await safeHcsLog('DeliveryRecorded', { from, otp, qty, unit, grade });
      return;
    }

    case 'BUYER_CONFIRM': {
      const otp = (intent.data?.otp ?? '').trim();
      if (!otp) {
        await sendSms(from, '⚠️ Missing OTP in confirmation. Example: "Confirm 553904"');
        await safeHcsLog('BuyerConfirmRejected', { reason: 'missing_otp', from });
        return;
      }

      const pending = pendingByOtp.get(otp);
      if (!pending) {
        await sendSms(from, `❌ No pending delivery found for OTP ${otp}.`);
        await safeHcsLog('BuyerConfirmNoPending', { from, otp });
        return;
      }

      // Queue escrow release via planner (adds retries/approvals)
      const amount = pending.qty; // demo policy: 1 token per kg
      const taskId = await enqueueReleaseEscrow({
        otp,
        amount,
        farmerId: pending.farmerId,
        buyerId: pending.buyerId,
      });

      await safeHcsLog('EscrowReleaseEnqueued', {
        otp,
        amount,
        farmerId: pending.farmerId,
        buyerId: pending.buyerId,
        taskId,
      });

      const needsApproval = (process.env.REQUIRE_OPERATOR_APPROVAL || 'false').toLowerCase() === 'true';
      if (needsApproval) {
        await sendSms(from, `⏳ Escrow queued for approval (task ${taskId}). You’ll get a confirmation after approval.`);
      } else {
        await sendSms(from, `⏳ Escrow queued (task ${taskId}). You’ll get a confirmation when processed.`);
      }

      pendingByOtp.delete(otp);
      return;
    }

    case 'HELP_REQUEST': {
      const msg =
        '📘 Help:\n' +
        '- "Delivered 200kg OTP 553904 Grade A" to record a delivery\n' +
        '- "Confirm 553904" (buyer) to release escrow\n' +
        '- "help" to see this menu again';
      await sendSms(from, msg);
      await safeHcsLog('HelpProvided', { from });
      return;
    }

    case 'NEW_LISTING': {
      const ref = 'TX' + Math.floor(100000 + Math.random() * 900000);
      await sendSms(from, `🆕 Listing received: ${intent.data?.raw ?? 'your produce'}. Ref ${ref}. Visible for 48h.`);
      await safeHcsLog('ListingCreated', { from, ref, raw: intent.data?.raw });
      return;
    }

    case 'UNKNOWN':
    default: {
      await sendSms(from, '🤔 Sorry, I did not understand that. Text "help" for commands.');
      await safeHcsLog('UnknownIntent', { from, intent });
      return;
    }
  }
}

