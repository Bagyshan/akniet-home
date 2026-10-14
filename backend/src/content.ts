import { pool } from './db.js';

type FieldType = 'number' | 'phone' | 'telegram' | 'email' | 'url' | 'text' | 'days' | 'time' | 'lat' | 'lon';
type Field = { label: string; group: 'main' | 'contacts'; type: FieldType; default: number | string | null; hint?: string; options?: Record<string, string> };

// Поля сайта, которые меняются из админки. На странице: data-cms="<key>" (числа) и data-contact="<key>" (ссылки).
// null — значение не задано, на сайте остаётся то, что в вёрстке (заглушка).
export const CONTENT_FIELDS = {
  price_m2:         { group: 'main', label: 'Цена за м², $', type: 'number', default: 440 },
  warranty_years:   { group: 'main', label: 'Гарантия, лет', type: 'number', default: 5 },
  build_months_avg: { group: 'main', label: 'Срок стройки в среднем, месяцев', type: 'number', default: 2 },
  build_months_min: { group: 'main', label: 'Минимальный срок стройки, месяцев', type: 'number', default: 1.5, hint: 'Можно дробное: 1,5' },
  houses_built:     { group: 'main', label: 'Домов построено', type: 'number', default: null },
  years_on_market:  { group: 'main', label: 'Сколько лет строим дома', type: 'number', default: null },
  instagram_k:      { group: 'main', label: 'Подписчиков в Instagram, тыс.', type: 'number', default: 12 },

  phone:     { group: 'contacts', label: 'Телефон', type: 'phone', default: '+996 500 20 84 87', hint: 'Как показывать на сайте, например +996 500 20 84 87' },
  whatsapp:  { group: 'contacts', label: 'WhatsApp', type: 'phone', default: '+996 500 20 84 87' },
  telegram:  { group: 'contacts', label: 'Telegram', type: 'telegram', default: '+996 500 20 84 87', hint: 'Номер или @username' },
  email:     { group: 'contacts', label: 'Почта', type: 'email', default: 'akniethome305@gmail.com' },
  instagram: { group: 'contacts', label: 'Instagram', type: 'url', default: 'https://www.instagram.com/akniet.home/' },
  tiktok:    { group: 'contacts', label: 'TikTok', type: 'url', default: 'https://www.tiktok.com/@akniet_home' },
  threads:   { group: 'contacts', label: 'Threads', type: 'url', default: 'https://www.threads.net/@akniet.home' },

  address:    { group: 'contacts', label: 'Адрес офиса (рус)', type: 'text', default: 'г. Бишкек, ул. Осмонкула, 113' },
  address_ky: { group: 'contacts', label: 'Адрес офиса (кыр)', type: 'text', default: 'Бишкек ш., Осмонкул көч., 113' },
  office_lat: { group: 'contacts', label: 'Офис: широта', type: 'lat', default: 42.883309, hint: 'Для маршрута в 2ГИС и карточки компании в поиске' },
  office_lon: { group: 'contacts', label: 'Офис: долгота', type: 'lon', default: 74.624823 },
  work_days:  { group: 'contacts', label: 'Дни работы', type: 'days', default: 'Mo-Sa', options: { 'Mo-Fr': 'Пн–Пт', 'Mo-Sa': 'Пн–Сб', 'Mo-Su': 'Ежедневно' } },
  work_from:  { group: 'contacts', label: 'Открыто с', type: 'time', default: '10:00' },
  work_to:    { group: 'contacts', label: 'Открыто до', type: 'time', default: '20:00' },
} satisfies Record<string, Field>;

export type ContentKey = keyof typeof CONTENT_FIELDS;
export const isContentKey = (k: string): k is ContentKey => Object.hasOwn(CONTENT_FIELDS, k);

export async function readContent(): Promise<Record<ContentKey, unknown>> {
  const out = Object.fromEntries(Object.entries(CONTENT_FIELDS).map(([k, f]) => [k, f.default])) as Record<ContentKey, unknown>;
  const { rows } = await pool.query<{ key: string; value: unknown }>('SELECT key, value FROM content');
  for (const r of rows) if (isContentKey(r.key)) out[r.key] = r.value;
  return out;
}

const CHECKS: Record<FieldType, [(v: unknown) => boolean, string]> = {
  number:   [v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7, 'нужно число ≥ 0'],
  phone:    [v => typeof v === 'string' && /^\+?[\d\s()-]{7,24}$/.test(v) && v.replace(/\D/g, '').length >= 9, 'нужен номер телефона'],
  telegram: [v => typeof v === 'string' && (/^\+?[\d\s()-]{7,24}$/.test(v) || /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v)), 'нужен номер или @username'],
  email:    [v => typeof v === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) && v.length <= 120, 'нужна почта'],
  url:      [v => typeof v === 'string' && /^https:\/\/[^\s<>"]+$/.test(v) && v.length <= 300, 'нужна ссылка https://…'],
  text:     [v => typeof v === 'string' && v.trim().length > 0 && v.length <= 200, 'нужен текст до 200 символов'],
  days:     [v => v === 'Mo-Fr' || v === 'Mo-Sa' || v === 'Mo-Su', 'выберите дни'],
  time:     [v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'время в формате 10:00'],
  lat:      [v => typeof v === 'number' && v >= 39 && v <= 43.6, 'широта в пределах Кыргызстана (39–43,6)'],
  lon:      [v => typeof v === 'number' && v >= 69 && v <= 80.6, 'долгота в пределах Кыргызстана (69–80,6)'],
};

// Returns an error message, or null when the value fits the field. null resets the field to the default.
export function checkValue(key: ContentKey, value: unknown): string | null {
  if (value === null) return null;
  const [ok, msg] = CHECKS[CONTENT_FIELDS[key].type];
  return ok(value) ? null : `${CONTENT_FIELDS[key].label}: ${msg}`;
}

export async function writeContent(patch: Partial<Record<ContentKey, unknown>>, user: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) { await client.query('DELETE FROM content WHERE key = $1', [key]); continue; }
      await client.query(
        `INSERT INTO content (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), user],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
