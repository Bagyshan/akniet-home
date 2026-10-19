import { config } from './config.js';

const { token, chatId } = config.telegram;
export const telegramEnabled = Boolean(token && chatId);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export type LeadMessage = { id: number; name: string; phone: string; house_type?: string | null; contact_via?: string | null; project?: string | null; area?: number | null; terrace?: number | null; terrace_type?: string | null; message?: string | null; lang?: string; page?: string | null; source?: string | null };

// site sections by the first part of the address (/ky/ is the same page in Kyrgyz)
const PAGES: Record<string, string> = { '': 'Главная', projects: 'Проекты', technology: 'Технологии', extras: 'Постройки', invest: 'Под аренду', map: 'Карта объектов', catalog: 'Каталог' };
export const pageName = (page: string) => PAGES[page.replace(/^\/(ky\/)?/, '').split('/')[0]] ?? page;
const SOURCES: Record<string, string> = { form: 'форма заявки', quiz: 'квиз «Подобрать дом»', catalog: 'каталог в WhatsApp' };

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
