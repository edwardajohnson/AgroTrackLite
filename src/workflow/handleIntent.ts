// src/workflow/handleIntent.ts
import type { ParsedIntent } from '../nlp/router.ts';
import { sendSms } from '../sms/send.ts';
import { logToHCS } from '../hedera/hcsLogger.ts';

/**
 * Handle a parsed intent from an incoming SMS.
 * - Logs every step to Hedera HCS (Incoming + Outcome)
 * - Sends a user-visible SMS response (logged to console/file by sendSms)
 */
export async function handleIntent(from: string, intent: ParsedIntent): Promise<void> {
  // Always log the inbound intent first
  await safeHcsLog('IncomingIntent', { from, intent });

  switch (intent.type) {
    case 'DELIVERY_CONFIRMATION': {
      const qty = intent.data?.quantity ?? '?';
      const unit = intent.data?.unit ?? 'kg';
      const otp = intent.data?.otp ?? 'UNKNOWN';
      const grade = intent.data?.grade ?? '?';

      const message =
        `✅ Delivery confirmed: ${qty}${unit} (Grade ${grade}). ` +
        `OTP ${otp}. Payment pending verification.`;
      await sendSms(from, message);

      await safeHcsLog('DeliveryConfirmed', { from, quantity: qty, unit, grade, otp });
      return;
    }

    case 'HELP_REQUEST': {
      const message =
        '📘 Help:\n' +
        '- "Maize 200kg Kisumu" to list produce\n' +
        '- "Delivered 198kg OTP 553904 Grade B" to confirm delivery\n' +
        '- "HELP" for this menu';
      await sendSms(from, message);

      await safeHcsLog('HelpProvided', { from });
      return;
    }

    case 'NEW_LISTING': {
      const ref = 'TX' + Math.floor(100000 + Math.random() * 900000);
      const message =
        `🆕 Listing received: ${intent.data?.raw ?? 'your produce'}. ` +
        `Ref ${ref}. Buyers will see this for 48h.`;
      await sendSms(from, message);

      await safeHcsLog('ListingCreated', { from, ref, raw: intent.data?.raw });
      return;
    }

    case 'UNKNOWN':
    default: {
      const message = '⚠️ Sorry, I could not understand that. Send "HELP" for commands.';
      await sendSms(from, message);

      await safeHcsLog('UnknownIntent', { from, raw: intent });
      return;
    }
  }
}

/** HCS logging with safety net so user flows never break if HCS is misconfigured */
async function safeHcsLog(label: string, payload: object) {
  try {
    await logToHCS(label, payload);
  } catch (e) {
    // Non-fatal: keep UX responsive even if chain logging fails
    console.error(`HCS log failed for ${label}:`, (e as Error).message);
  }
}

