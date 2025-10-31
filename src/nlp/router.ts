/**
 * Basic NLP intent router for AgroTrack-Lite
 * Recognizes:
 *  - DELIVERY_CONFIRMATION: "Delivered 198kg OTP 553904 Grade B"
 *  - BUYER_CONFIRM:        "Confirm 553904"
 *  - HELP_REQUEST:         "help"
 *  - NEW_LISTING:          "Maize 200kg Kisumu"
 *  - UNKNOWN:              everything else
 */

export type IntentType =
  | 'DELIVERY_CONFIRMATION'
  | 'BUYER_CONFIRM'
  | 'HELP_REQUEST'
  | 'NEW_LISTING'
  | 'UNKNOWN';

export type ParsedIntent = {
  type: IntentType;
  data?: Record<string, string>;
};

export function parseIntent(text: string): ParsedIntent {
  const lower = text.toLowerCase().trim();

  // BUYER_CONFIRM: "Confirm 553904"
  {
    const m = lower.match(/^confirm\s+(\d{4,8})\b/i);
    if (m) {
      return { type: 'BUYER_CONFIRM', data: { otp: m[1] } };
    }
  }

  // DELIVERY_CONFIRMATION: "Delivered 198kg OTP 553904 Grade B"
  if (lower.includes('delivered')) {
    const qty   = lower.match(/(\d+(?:\.\d+)?)\s*kg/)?.[1] ?? '';
    const otp   = lower.match(/\botp\s+(\w+)/i)?.[1] ?? '';
    const grade = lower.match(/\bgrade\s+([a-d])\b/i)?.[1]?.toUpperCase() ?? '';
    return {
      type: 'DELIVERY_CONFIRMATION',
      data: { quantity: qty, unit: 'kg', otp, grade },
    };
  }

  // HELP_REQUEST
  if (lower === 'help') {
    return { type: 'HELP_REQUEST' };
  }

  // NEW_LISTING (very lightweight detection)
  if (/(maize|beans|coffee|tea|rice)/i.test(text)) {
    return { type: 'NEW_LISTING', data: { raw: text } };
  }

  return { type: 'UNKNOWN' };
}

