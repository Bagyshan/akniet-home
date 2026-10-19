import { createHash } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';

const { token, chatId } = config.telegram;
export const telegramEnabled = Boolean(token && chatId);
// secret of the webhook (Telegram sends it back in a header): from .env, or derived from the token so nothing else has to be set
export const webhookSecret = config.telegram.webhookSecret || (token ? createHash('sha256').update('akniet-webhook:' + token).digest('hex').slice(0, 48) : '');

const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

// Bot API call; returns `result` or null (errors are only logged)
export async function tg<T = unknown>(method: string, body: object): Promise<T | null> {
  try {
    const res = await fetch(`${config.telegram.api}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
    if (!data?.ok) {
      // pressing a button again leaves the text the same; that is not an error
      if (!data?.description?.includes('message is not modified')) console.error(`telegram ${method}: HTTP ${res.status} ${data?.description ?? ''}`);
      return null;
    }
    return data.result ?? null;
  } catch (e) {
    console.error(`telegram ${method}: request failed`, e);
    return null;
  }
}

export type LeadMessage = { id: number; name: string; phone: string; house_type?: string | null; contact_via?: string | null; project?: string | null; area?: number | null; terrace?: number | null; terrace_type?: string | null; message?: string | null; lang?: string; page?: string | null; source?: string | null; status?: string; taken_by?: string | null; status_at?: Date | string | null };

// site sections by the first part of the address (/ky/ is the same page in Kyrgyz)
const PAGES: Record<string, string> = { '': 'Главная', projects: 'Проекты', technology: 'Технологии', extras: 'Постройки', invest: 'Под аренду', map: 'Карта объектов', catalog: 'Каталог' };
export const pageName = (page: string) => PAGES[page.replace(/^\/(ky\/)?/, '').split('/')[0]] ?? page;
const SOURCES: Record<string, string> = { form: 'форма заявки', quiz: 'квиз «Подобрать дом»', catalog: 'каталог в WhatsApp' };
const when = (d: Date | string) => new Date(d).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function formatLead(l: LeadMessage): string {
  const wa = l.phone.replace(/\D/g, '');
  return [
    `<b>Новая заявка #${l.id}</b>${l.lang === 'ky' ? ' · 🇰🇬 кыргызская версия' : ''}`,
    l.source === 'catalog' && `📄 <b>Отправить PDF-каталог в WhatsApp</b> → <a href="https://wa.me/${wa}">${esc(l.phone)}</a>`,
    l.page && `🌐 Страница: <a href="${esc(config.siteUrl + l.page)}">${esc(pageName(l.page))}</a>${l.source ? ` · ${SOURCES[l.source]}` : ''}`,
    `👤 ${esc(l.name)}`,
    `📞 ${esc(l.phone)}${l.contact_via ? ` · ${esc(l.contact_via)}` : ''}${l.contact_via === 'WhatsApp' ? ` · <a href="https://wa.me/${wa}">написать</a>` : ''}`,
    l.house_type && `🏠 ${esc(l.house_type)}`,
    l.project && `📐 ${esc(l.project)}${l.area ? `, ${l.area} м²` : ''}${l.terrace ? ` + ${l.terrace_type === 'closed' ? 'закрытая ' : l.terrace_type === 'open' ? 'открытая ' : ''}терраса ${l.terrace} м²` : ''}`,
    l.message && `💬 ${esc(l.message)}`,
  ].filter(Boolean).join('\n');
}

// the line under the lead: who took it and when
function statusLine(l: LeadMessage): string {
  const by = l.taken_by ? ` <b>${esc(l.taken_by)}</b>` : '', at = l.status_at ? ` · ${when(l.status_at)}` : '';
  return { in_work: `✋ В работе:${by}${at}`, done: `✅ Готово:${by}${at}`, spam: `🚫 Спам${at}` }[l.status ?? ''] ?? '';
}
const leadText = (l: LeadMessage) => formatLead(l) + (statusLine(l) && '\n\n' + statusLine(l));

// new → «Беру» and «Готово»; in work → «Готово»; done or spam → only the copy button
function leadKeyboard(l: LeadMessage) {
  const copy = [{ text: '📋 Скопировать номер', copy_text: { text: '+' + l.phone.replace(/\D/g, '') } }];
  const take = { text: '✋ Беру', callback_data: `take:${l.id}` }, done = { text: '✅ Готово', callback_data: `done:${l.id}` };
  const row = { new: [take, done], in_work: [done] }[l.status ?? 'new'] ?? [];
  return { inline_keyboard: row.length ? [row, copy] : [copy] };
}

// Sends to the managers' chat; returns the message id. Without a token it is a stub: logs and returns null.
export async function notifyLead(l: LeadMessage): Promise<number | null> {
  if (!telegramEnabled) {
    console.log(`[telegram stub] lead #${l.id} not sent: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are empty`);
    return null;
  }
  const m = await tg<{ message_id: number }>('sendMessage', { chat_id: chatId, text: leadText(l), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: leadKeyboard(l) });
  return m?.message_id ?? null;
}

// Redraws the lead's message after its status changed (buttons in the chat or the admin panel)
export async function syncLeadMessage(id: number): Promise<void> {
  if (!telegramEnabled) return;
  const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
  const l = rows[0];
  if (!l?.tg_message_id) return;
  await tg('editMessageText', { chat_id: chatId, message_id: Number(l.tg_message_id), text: leadText({ ...l, id: Number(l.id) }), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: leadKeyboard({ ...l, id: Number(l.id) }) });
}

// On start: point Telegram at /api/telegram/webhook so the buttons work. Needs a public https address (SITE_URL).
export async function setupWebhook(): Promise<void> {
  if (!token) return;
  if (!config.siteUrl.startsWith('https://') || /localhost|127\.0\.0\.1/.test(config.siteUrl)) {
    console.log(`telegram: webhook not set — ${config.siteUrl} is not a public https address (check SITE_URL / DOMAIN in .env), the buttons under leads will not answer`);
    return;
  }
  // Telegram may be unreachable right after a restart: a few more tries, a minute apart
  for (let i = 0; i < 5; i++) {
    const ok = await tg('setWebhook', { url: config.siteUrl + '/api/telegram/webhook', secret_token: webhookSecret, allowed_updates: ['message', 'callback_query'] });
    console.log(`telegram: webhook ${ok ? 'set' : 'NOT set'} → ${config.siteUrl}/api/telegram/webhook`);
    if (ok) return;
    await new Promise(r => setTimeout(r, 60_000).unref());
  }
}
