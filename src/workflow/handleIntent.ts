// src/workflow/handleIntent.ts
import type { ParsedIntent } from '../nlp/router.ts';
import { sendSms } from '../sms/send.ts';
import { logToHCS } from '../hedera/hcsLogger.ts';
import { simulateEscrowRelease } from '../hedera/escrow.ts';

const FARMER_ID = (process.env.FARMER_ACCOUNT_ID || '').trim();
const BUYER_ID  = (process.env.BUYER_ACCOUNT_ID  || '').trim();

/**
 * Minimal in-memory store of pending deliveries keyed by OTP.
 * In production, replace with a real datastore (SQLite/PG/Redis).
 */
const pendingByOtp = new Map<
  string,
  { qty: number; unit: string; grade?: string; farmerId: string; buyerId: string }
>();

/** Expose pending for /api/pending (debug & demos) */
export function __debugGetPending() {
  return Object.fromEntries(pendingByOtp.entries());
}

/** Never break UX if HCS is misconfigured */
async function safeHcsLog(label: string, payload: object) {
  try {
    await logToHCS(label, payload);
  } catch (e: any) {
    console.error(`HCS log failed for ${label}:`, e?.message || e);
  }
}

export async function handleIntent(from: string, intent: ParsedIntent): Promise<void> {
  // Always log inbound
  await safeHcsLog('IncomingIntent', { from, intent });

  switch (intent.type) {
    case 'DELIVERY_CONFIRMATION': {
      const qty   = Number(intent.data?.quantity ?? 0);
      const unit  = (intent.data?.unit ?? 'kg').trim();
      const otp   = (intent.data?.otp ?? '').trim();
      const grade = (intent.data?.grade ?? '?').trim() || '?';

      // Acknowledge to farmer
      await sendSms(
        from,
        `✅ Delivery recorded: ${qty}${unit} (Grade ${grade}) OTP ${otp}. Awaiting buyer confirmation to release payout.`
      );
      await safeHcsLog('DeliveryRecorded', { from, qty, unit, grade, otp });

      // Store pending only when we have enough info to later release escrow
      if (otp && qty > 0 && FARMER_ID && BUYER_ID) {
        pendingByOtp.set(otp, { qty, unit, grade, farmerId: FARMER_ID, buyerId: BUYER_ID });
        await safeHcsLog('PendingDeliveryStored', {
          otp,
          qty,
          unit,
          grade,
          farmerId: FARMER_ID,
          buyerId: BUYER_ID,
        });
      } else {
        await safeHcsLog('PendingDeliveryNotStored', {
          reason: 'missing_fields',
          otp,
          qty,
          unit,
          grade,
          FARMER_ID,
          BUYER_ID,
        });
      }
      return;
    }

    case 'BUYER_CONFIRM': {
      const otp = (intent.data?.otp ?? '').trim();

      await sendSms(from, `✅ Buyer confirmation received for OTP ${otp}. Attempting payout release…`);
      await safeHcsLog('BuyerConfirmed', { from, otp });

      const pending = otp ? pendingByOtp.get(otp) : undefined;
      if (!pending) {
        await sendSms(from, `⚠️ No pending delivery found for OTP ${otp}.`);
        await safeHcsLog('BuyerConfirmNoPending', { otp });
        return;
      }

      try {
        // Demo policy: 1 AGC token per kg (adjust as needed)
        const amount = pending.qty;

        // In demo mode this writes EscrowReleased_SIM to HCS (no HTS transfer).
        // If ESCROW_DEMO_MODE=false and associations are set, it will run a real HTS transfer.
        await simulateEscrowRelease(pending.farmerId, pending.buyerId, amount);

        await safeHcsLog('EscrowReleasedByBuyer', {
          otp,
          amount,
          tokenUnit: pending.unit,
          farmerId: pending.farmerId,
          buyerId: pending.buyerId,
        });

        await sendSms(from, `💸 Escrow released: ${amount} AGC for OTP ${otp}.`);
        pendingByOtp.delete(otp);
      } catch (e: any) {
        console.error('Escrow release failed:', e?.message || e);
        await safeHcsLog('EscrowReleaseFailed', { otp, error: String(e?.message || e) });
        await sendSms(from, `⚠️ Error releasing escrow for OTP ${otp}. Please retry shortly.`);
      }
      return;
    }

    case 'HELP_REQUEST': {
      const msg =
        '📘 Help:\n' +
        '- "Maize 200kg Kisumu" to list\n' +
        '- "Delivered 198kg OTP 553904 Grade B" to confirm delivery\n' +
        '- "Confirm 553904" (buyer) to release funds\n' +
        '- "HELP" for this menu';
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
      await sendSms(from, '⚠️ Sorry, I could not understand that. Send "HELP" for commands.');
      await safeHcsLog('UnknownIntent', { from, intent });
      return;
    }
  }
}

