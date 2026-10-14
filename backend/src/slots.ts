import { pool } from './db.js';

// Пронумерованные ячейки сайта. Пустое поле — на сайте стоковое значение этой ячейки.
// Every text field has a Kyrgyz twin "<field>_ky" for the /ky/ page.
export const SLOT_SECTIONS = {
  materials: { count: 10, fields: { kind: 24, kind_ky: 24, title: 60, title_ky: 60, subtitle: 80, subtitle_ky: 80 } },
  gallery:   { count: 6,  fields: { caption: 60, caption_ky: 60 } },
} as const;

export const LANGS = ['ru', 'ky'] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (l: unknown): l is Lang => LANGS.includes(l as Lang);

export type Section = keyof typeof SLOT_SECTIONS;
export type SlotData = Record<string, string>;
export const isSection = (s: string): s is Section => Object.hasOwn(SLOT_SECTIONS, s);

// Only images processed by /api/admin/upload
const IMAGE_RE = /^\/uploads\/[a-f0-9]{32}\.webp$/;

// The page sees plain field names: on /ky/ the Kyrgyz text, or the Russian one while there is no translation
export async function readSlotsFor(section: Section, lang: Lang): Promise<(SlotData | null)[]> {
  return (await readSlots(section)).map(d => {
    if (!d) return null;
    const out: SlotData = {};
    for (const f of new Set(Object.keys(d).map(k => k.replace(/_ky$/, '')))) {
      const v = lang === 'ky' ? d[`${f}_ky`] || d[f] : d[f];
      if (v) out[f] = v;
    }
    return out;
  });
}

export async function readSlots(section: Section): Promise<(SlotData | null)[]> {
  const out: (SlotData | null)[] = Array(SLOT_SECTIONS[section].count).fill(null);
  const { rows } = await pool.query<{ slot: number; data: SlotData }>('SELECT slot, data FROM slots WHERE section = $1', [section]);
  for (const r of rows) if (r.slot <= out.length) out[r.slot - 1] = r.data;
  return out;
}

// Keeps only known, non-empty fields. Returns [data, errors].
export function cleanSlot(section: Section, body: Record<string, unknown>): [SlotData, string[]] {
  const data: SlotData = {}, errors: string[] = [];
  for (const [field, max] of Object.entries(SLOT_SECTIONS[section].fields)) {
    const v = body[field];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || v.trim().length > max) errors.push(`${field}: текст до ${max} символов`);
    else data[field] = v.trim();
  }
  if (body.image) {
    if (typeof body.image === 'string' && IMAGE_RE.test(body.image)) data.image = body.image;
    else errors.push('image: загрузите фото через админку');
  }
  return [data, errors];
}

export async function writeSlot(section: Section, slot: number, data: SlotData, user: string) {
  if (!Object.keys(data).length) return deleteSlot(section, slot);
  await pool.query(
    `INSERT INTO slots (section, slot, data, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (section, slot) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [section, slot, data, user],
  );
}

export async function deleteSlot(section: Section, slot: number) {
  await pool.query('DELETE FROM slots WHERE section = $1 AND slot = $2', [section, slot]);
}
