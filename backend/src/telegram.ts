import { config } from './config.js';

const { token, chatId } = config.telegram;
export const telegramEnabled = Boolean(token && chatId);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export type LeadMessage = { id: number; name: string; phone: string; house_type?: string | null; contact_via?: string | null; project?: string | null; area?: number | null; terrace?: number | null; message?: string | null; lang?: string };

export function formatLead(l: LeadMessage): string {
  return [
    `<b>Новая заявка #${l.id}</b>${l.lang === 'ky' ? ' · с кыргызской версии сайта' : ''}`,
    `👤 ${esc(l.name)}`,
    `📞 ${esc(l.phone)}${l.contact_via ? ` · ${esc(l.contact_via)}` : ''}`,
    l.house_type && `🏠 ${esc(l.house_type)}`,
    l.project && `📐 ${esc(l.project)}${l.area ? `, ${l.area} м²` : ''}${l.terrace ? ` + терраса ${l.terrace} м²` : ''}`,
    l.message && `💬 ${esc(l.message)}`,
  ].filter(Boolean).join('\n');
}

// Sends to the managers' chat. Without a token it is a stub: logs and returns false.
export async function notifyLead(l: LeadMessage): Promise<boolean> {
  if (!telegramEnabled) {
    console.log(`[telegram stub] lead #${l.id} not sent: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are empty`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: formatLead(l), parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`telegram: HTTP ${res.status} ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.error('telegram: request failed', e);
    return false;
  }
}
