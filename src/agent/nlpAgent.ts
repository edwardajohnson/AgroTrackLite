import OpenAI from "openai";
import { logToHCS } from "../hedera/hcsLogger.ts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function interpretFreeText(from: string, text: string) {
  const prompt = `
You are an agricultural AI agent. Interpret the farmer message and extract structured intent:
- type (e.g., DELIVERY_CONFIRMATION, DAMAGE_REPORT, PRICE_QUERY, WEATHER_UPDATE)
- key details (quantities, location, grade, cause, etc.)

Message: "${text}"
Return JSON only.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  try {
    const raw = response.choices[0].message.content;
    const intent = JSON.parse(raw || "{}");
    await logToHCS("AI_Intent", { from, text, intent });
    return intent;
  } catch (err) {
    console.error("AI parse error:", err);
    return { type: "UNKNOWN", raw: text };
  }
}

