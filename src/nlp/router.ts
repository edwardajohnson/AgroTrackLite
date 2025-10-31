/**
 * Basic NLP intent router for AgroTrack-Lite (Day 3)
 */

export type IntentType =
  | 'DELIVERY_CONFIRMATION'
  | 'HELP_REQUEST'
  | 'NEW_LISTING'
  | 'UNKNOWN';

export type ParsedIntent = {
  type: IntentType;
  data?: Record<string, string>;
};

export function parseIntent(text: string): ParsedIntent {
  const lower = text.toLowerCase().trim();

  // "Delivered 198kg OTP 553904 Grade B"
  if (lower.includes('delivered')) {
    const qty = lower.match(/(\d+(?:\.\d+)?)\s*kg/)?.[1] ?? '';
    const otp = lower.match(/\botp\s+(\w+)/)?.[1] ?? '';
    const grade = lower.match(/\bgrade\s+([a-d])\b/i)?.[1]?.toUpperCase() ?? '';
    return {
      type: 'DELIVERY_CONFIRMATION',
      data: { quantity: qty, unit: 'kg', otp, grade },
    };
  }

  if (lower === 'help') {
    return { type: 'HELP_REQUEST' };
  }

  // very simple listing detection, e.g. "Maize 200kg Kisumu"
  if (/(maize|beans|coffee|tea|rice)/i.test(text)) {
    return { type: 'NEW_LISTING', data: { raw: text } };
  }

  return { type: 'UNKNOWN' };
}

