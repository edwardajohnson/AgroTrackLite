import fs from 'fs';
import path from 'path';

export async function sendSms(to: string, message: string): Promise<void> {
  const timestamp = new Date();
  const dateStr = timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
  const logDir = path.resolve('logs');
  const logFile = path.join(logDir, `sms-${dateStr}.log`);

  const logEntry = `[${timestamp.toISOString()}] SMS → ${to}: ${message}\n`;

  // Print live output to console for visibility
  console.log(logEntry.trim());

  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (err) {
    console.error('Error writing SMS log:', err);
  }
}

