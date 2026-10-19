import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { syncLeadMessage, tg, webhookSecret } from '../telegram.js';

export const telegram = Router();

type User = { id: number; first_name?: string; last_name?: string; username?: string };
type Callback = { id: string; from: User; data?: string; message?: { chat: { id: number } } };
type Message = { chat: { id: number; type: string }; text?: string };

const nameOf = (u: User) => [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.username ? '@' + u.username : 'Менеджер');

// «Беру» / «Готово» under a lead in the managers' chat
async function onButton(q: Callback) {
  const answer = (text?: string, show_alert = false) => tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert });
  const m = /^(take|done):(\d+)$/.exec(q.data ?? '');
  // only the managers' chat may change leads
  if (!m || String(q.message?.chat.id) !== String(config.telegram.chatId)) return answer();
  const [, action, idStr] = m, id = Number(idStr), who = nameOf(q.from), uid = q.from.id;

  // conditional updates: when two managers press at the same moment, only one of them wins
  const { rowCount } = action === 'take'
    ? await pool.query(`UPDATE leads SET status = 'in_work', taken_by = $2, taken_by_id = $3, status_at = now() WHERE id = $1 AND status = 'new'`, [id, who, uid])
    : await pool.query(`UPDATE leads SET status = 'done', taken_by = coalesce(taken_by, $2), taken_by_id = coalesce(taken_by_id, $3), status_at = now()
        WHERE id = $1 AND (status = 'new' OR (status = 'in_work' AND (taken_by_id IS NULL OR taken_by_id = $3)))`, [id, who, uid]);

  if (rowCount) {
    await answer(action === 'take' ? `Заявка #${id} — ваша` : `Заявка #${id} закрыта`);
  } else {
    const { rows } = await pool.query<{ status: string; taken_by: string | null }>('SELECT status, taken_by FROM leads WHERE id = $1', [id]);
    const l = rows[0];
    await answer(!l ? 'Заявка не найдена'
      : l.status === 'in_work' ? `Заявку уже ведёт ${l.taken_by ?? 'другой менеджер'}${action === 'done' ? '. Отметить «Готово» может только тот, кто её взял' : ''}`
      : l.status === 'done' ? 'Заявка уже закрыта'
      : l.status === 'spam' ? 'Заявка помечена как спам' : 'Не получилось, попробуйте ещё раз', true);
  }
  // redraw in any case: the message may be older than the lead's status
  await syncLeadMessage(id);
}

// /chatid in a group → the bot answers with the chat's id (for TELEGRAM_CHAT_ID)
async function onMessage(msg: Message) {
  const cmd = /^\/(chatid|start)(@\w+)?(\s|$)/.exec(msg.text ?? '')?.[1];
  if (cmd === 'chatid') {
    await tg('sendMessage', { chat_id: msg.chat.id, parse_mode: 'HTML', text: `ID этого чата: <code>${msg.chat.id}</code>\nВпишите его в .env на сервере: <code>TELEGRAM_CHAT_ID=${msg.chat.id}</code>` });
  } else if (cmd === 'start' && msg.chat.type === 'private') {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Я присылаю заявки с сайта в группу продавцов «Акниет». Добавьте меня в группу и отправьте там /chatid.' });
  }
}

// POST /api/telegram/webhook — Telegram sends button presses and messages here (set up on start, see setupWebhook)
telegram.post('/webhook', async (req, res) => {
  if (!webhookSecret || req.get('x-telegram-bot-api-secret-token') !== webhookSecret) return res.sendStatus(403);
  res.sendStatus(200); // answer at once: Telegram resends updates to a slow webhook
  const u = req.body ?? {};
  try {
    if (u.callback_query) await onButton(u.callback_query);
    else if (u.message) await onMessage(u.message);
  } catch (e) {
    console.error(`telegram webhook: update ${u.update_id} failed`, e);
  }
});
