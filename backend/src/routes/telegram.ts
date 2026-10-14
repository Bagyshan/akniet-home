import { Router } from 'express';
import { config } from '../config.js';

export const telegram = Router();

// POST /api/telegram/webhook — заготовка под команды бота (например, /leads, смена статуса заявки).
// Подключение: setWebhook с url=https://<домен>/api/telegram/webhook и secret_token=TELEGRAM_WEBHOOK_SECRET.
telegram.post('/webhook', (req, res) => {
  const secret = config.telegram.webhookSecret;
  if (!secret || req.get('x-telegram-bot-api-secret-token') !== secret) return res.sendStatus(403);
  const text: string | undefined = req.body?.message?.text;
  console.log(`[telegram webhook stub] update ${req.body?.update_id}: ${text ?? '(no text)'}`);
  // TODO: обработка команд бота
  res.sendStatus(200);
});
