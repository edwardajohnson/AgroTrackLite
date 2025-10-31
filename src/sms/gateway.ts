import express from 'express';
import type { Request, Response } from 'express';
import { parseSms } from '../nlp/router.ts';
import type { Intent } from '../nlp/router.ts';
import { handleIntent } from '../workflow/handleIntent.ts';

export async function smsWebhook(req: Request, res: Response) {
  const from = req.body.from;
  const text = req.body.text;
  if (!from || !text) {
    res.status(200).send("Missing 'from' or 'text'");
    return;
  }
  try {
    const intent: Intent = parseSms(from, text);
    await handleIntent(intent);
    res.status(200).send(`Simulated SMS for ${from}: ${text}`);
  } catch (e: any) {
    console.error('smsWebhook error:', e.message);
    res.status(200).send("Sorry, we couldn't process that. Send 'help' for usage.");
  }
}

