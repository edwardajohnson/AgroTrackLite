// src/nlp/ai.ts
import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Keep this schema aligned with your ParsedIntent in router.ts
 */
const IntentSchema = z.object({
  type: z.enum(['DELIVERY_CONFIRMATION', 'BUYER_CONFIRM', 'HELP_REQUEST', 'NEW_LISTING', 'UNKNOWN']),
  data: z
    .object({
      quantity: z.union([z.number(), z.string()]).optional(),
      unit: z.string().optional(),
      otp: z.string().optional(),
      grade: z.string().optional(),
      raw: z.string().optional(),
    })
    .optional(),
});
export type AiParsedIntent = z.infer<typeof IntentSchema>;

/**
 * LLM-based interpreter for free text → structured intent.
 * Returns safe fallback { type: 'UNKNOWN' } on any failure.
 */
export async function interpretFreeText(from: string, text: string): Promise<AiParsedIntent> {
  const sys = `You are an agricultural SMS intent parser.
Return STRICT JSON ONLY (no prose), matching:
{
  "type": "DELIVERY_CONFIRMATION" | "BUYER_CONFIRM" | "HELP_REQUEST" | "NEW_LISTING" | "UNKNOWN",
  "data"?: { "quantity"?: number, "unit"?: string, "otp"?: string, "grade"?: string, "raw"?: string }
}
Rules:
- "Delivered 200kg OTP 553904 Grade A" → DELIVERY_CONFIRMATION with quantity=200, unit="kg", otp="553904", grade="A".
- "Confirm 553904" → BUYER_CONFIRM with otp.
- "help" (any case) → HELP_REQUEST.
- "Maize 200kg Kisumu" → NEW_LISTING with data.raw set to the full message.
- Else → UNKNOWN.
- No extra keys. No comments.`;

  const user = `Sender: ${from}
Message: ${text}
Respond with JSON only.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '{"type":"UNKNOWN"}';
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { type: 'UNKNOWN' }; }

    const result = IntentSchema.safeParse(parsed);
    if (!result.success) return { type: 'UNKNOWN', data: { raw: text } };

    // normalize quantity if it's a numeric string
    if (result.data.data?.quantity && typeof result.data.data.quantity === 'string') {
      const n = Number(result.data.data.quantity);
      if (!Number.isNaN(n)) result.data.data.quantity = n;
    }
    return result.data;
  } catch {
    return { type: 'UNKNOWN' };
  }
}

