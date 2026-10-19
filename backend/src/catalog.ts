import { pool } from './db.js';
import type { Lang } from './slots.js';

// Projects (/projects/ and the short cards on the home page), cases (built houses), FAQ and extras (saunas, gazebos… on /extras/),
// edited in the admin panel.
// Every text has a Kyrgyz twin "<field>_ky"; the page gets one text in its language (Russian while there is no translation).
export const KINDS = ['projects', 'cases', 'faq', 'extras', 'rentals'] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);

// terrace: drawn as a deck and may stick out of the house outline
export type TerraceType = 'open' | 'closed';
export type Room = { x: number; y: number; w: number; h: number; name: string; name_ky: string | null; terrace?: boolean };
export type Floor = { name: string; name_ky: string | null; w: number; h: number; void: [number, number, number, number] | null; image: string | null; rooms: Room[] };
export type Project = {
  slug: string; style: 'af' | 'barn'; name: string; name_ky: string | null; area: number; terrace: number; terrace_type: TerraceType; beds: number; baths: number;
  floors: string; floors_ky: string | null; text: string; text_ky: string | null; price: number | null;
  image: string | null; on_home: boolean; plan: Floor[];
  videos: string[]; // Instagram posts / reels, shown in the plan window
};
export type Case = {
  image: string | null; region: string; region_ky: string | null; title: string; title_ky: string | null;
  area: string; term: string; term_ky: string | null; season: string; season_ky: string | null; story: string; story_ky: string | null;
  project: number | null; // id of the project the case was built from
  photos: string[]; // gallery in the case window, after the main photo
  videos: string[]; // Instagram posts / reels
};
// {price} {terrace_open_price} {terrace_closed_price} {months} {months_min} {warranty} in an answer become the values from the admin «Основное» tab
// A client's house let by the day (page /invest/): what it earns. Income and payback are counted on the page from these numbers
export type Rental = {
  image: string | null; title: string; title_ky: string | null; place: string; place_ky: string | null;
  area: number | null; project: number | null; price_night: number; nights: number | null; invest: number | null; story: string; story_ky: string | null;
};
export type Faq = { q: string; q_ky: string | null; a: string; a_ky: string | null };
// An extra kind of building: card on the home page (name, lead), section on /extras/ (text, points — one per line, works)
export type Work = { image: string | null; title: string; title_ky: string | null; note: string; note_ky: string | null };
export type Extra = {
  slug: string; name: string; name_ky: string | null; lead: string; lead_ky: string | null; text: string; text_ky: string | null;
  points: string; points_ky: string | null; image: string | null; works: Work[];
};
type Item<T> = { id: number; position: number; data: T };

// Photos uploaded through the admin panel, plus the stock demo photos the site started with
const IMAGE_RE = /^(\/uploads\/[a-f0-9]{32}\.webp|https:\/\/images\.pexels\.com\/photos\/\d+\/[\w.-]+\?[\w=&]+)$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// an Instagram post, reel or IGTV; kept as https://www.instagram.com/<p|reel|tv>/<code>/ (the embed needs exactly that)
const IG_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]{5,40})\/?(?:[?#].*)?$/i;
export const MAX_VIDEOS = 8, MAX_PHOTOS = 12;

/* ---- validation: returns [clean data, errors] ---- */
class Check {
  errors: string[] = [];
  constructor(private b: Record<string, unknown>) {}
  text(key: string, label: string, max: number, required = true) {
    const v = this.b[key];
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : null;
    if (s === null || s.length > max) { this.errors.push(`${label}: текст до ${max} символов`); return ''; }
    if (!s && required) this.errors.push(`${label}: заполните поле`);
    return s;
  }
  ky(key: string, label: string, max: number) { return this.text(key, label + ' (кыр)', max, false) || null; }
  num(key: string, label: string, min: number, max: number, { int = false, optional = false } = {}): number | null {
    const v = this.b[key];
    if (optional && (v === null || v === undefined || v === '')) return null;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
    if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) { this.errors.push(`${label}: ${int ? 'целое ' : ''}число от ${min} до ${max}`); return min; }
    return Math.round(n * 100) / 100;
  }
  // Instagram links: an array, or one per line
  videos(key: string, label: string) {
    const v = this.b[key];
    const list = (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []).map(x => String(x ?? '').trim()).filter(Boolean);
    if (list.length > MAX_VIDEOS) this.errors.push(`${label}: не больше ${MAX_VIDEOS} ссылок`);
    const out: string[] = [];
    for (const u of list.slice(0, MAX_VIDEOS)) {
      const m = IG_RE.exec(u);
      if (!m) { this.errors.push(`${label}: «${u.slice(0, 60)}» — нужна ссылка на пост или рилс Instagram, например https://www.instagram.com/reel/…`); continue; }
      const url = `https://www.instagram.com/${m[1].toLowerCase().startsWith('reel') ? 'reel' : m[1].toLowerCase()}/${m[2]}/`;
      if (!out.includes(url)) out.push(url);
    }
    return out;
  }
  photos(key: string, label: string) {
    const v = Array.isArray(this.b[key]) ? (this.b[key] as unknown[]) : [];
    if (v.length > MAX_PHOTOS) this.errors.push(`${label}: не больше ${MAX_PHOTOS} фото`);
    const out: string[] = [];
    for (const x of v.slice(0, MAX_PHOTOS)) {
      if (typeof x === 'string' && IMAGE_RE.test(x)) out.push(x);
      else this.errors.push(`${label}: загрузите фото через админку`);
    }
    return out;
  }
  image(key: string, label: string) {
    const v = this.b[key];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string' && IMAGE_RE.test(v)) return v;
    this.errors.push(`${label}: загрузите фото через админку`);
    return null;
  }
}

function cleanFloor(raw: unknown, n: number): [Floor, string[]] {
  const c = new Check(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
  const at = `Этаж ${n}`;
  const f: Floor = {
    name: c.text('name', `${at}: название`, 30), name_ky: c.ky('name_ky', `${at}: название`, 30),
    w: c.num('w', `${at}: ширина дома, м`, 1, 60)!, h: c.num('h', `${at}: длина дома, м`, 1, 60)!,
    void: null, image: c.image('image', `${at}: картинка планировки`), rooms: [],
  };
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r?.void)) {
    const v = r.void.map(Number);
    if (v.length === 4 && v.every(x => Number.isFinite(x) && x >= 0 && x <= 60) && v[2] > 0 && v[3] > 0) f.void = v as Floor['void'];
    else c.errors.push(`${at}: второй свет — четыре числа`);
  }
  const rooms = Array.isArray(r?.rooms) ? r.rooms : [];
  if (rooms.length > 24) c.errors.push(`${at}: не больше 24 комнат`);
  rooms.slice(0, 24).forEach((room, i) => {
    const rc = new Check(room && typeof room === 'object' ? room : {});
    const ra = `${at}, комната ${i + 1}`;
    f.rooms.push({
      name: rc.text('name', `${ra}: название`, 30), name_ky: rc.ky('name_ky', `${ra}: название`, 30),
      x: rc.num('x', `${ra}: X`, 0, 60)!, y: rc.num('y', `${ra}: Y`, 0, 60)!,
      w: rc.num('w', `${ra}: ширина`, 0.3, 60)!, h: rc.num('h', `${ra}: длина`, 0.3, 60)!,
      ...((room as Record<string, unknown>)?.terrace === true ? { terrace: true } : {}),
    });
    c.errors.push(...rc.errors);
  });
  if (!f.image && !f.rooms.length) c.errors.push(`${at}: добавьте комнаты или загрузите картинку планировки`);
  return [f, c.errors];
}

export function cleanProject(b: Record<string, unknown>): [Project, string[]] {
  const c = new Check(b);
  const slug = c.text('slug', 'Адрес на странице', 40);
  if (slug && !SLUG_RE.test(slug)) c.errors.push('Адрес на странице: латинские буквы, цифры и дефис, например ala-too');
  const p: Project = {
    slug, style: b.style === 'af' ? 'af' : 'barn',
    name: c.text('name', 'Название', 40), name_ky: c.ky('name_ky', 'Название', 40),
    area: c.num('area', 'Площадь, м²', 10, 2000)!, terrace: c.num('terrace', 'Терраса, м²', 0, 500, { optional: true }) ?? 0, terrace_type: b.terrace_type === 'closed' ? 'closed' : 'open', beds: c.num('beds', 'Спальни', 0, 30, { int: true })!, baths: c.num('baths', 'Санузлы', 0, 30, { int: true })!,
    floors: c.text('floors', 'Этажи', 30), floors_ky: c.ky('floors_ky', 'Этажи', 30),
    text: c.text('text', 'Описание', 400), text_ky: c.ky('text_ky', 'Описание', 400),
    price: c.num('price', 'Цена под ключ, $', 1000, 1e7, { optional: true }),
    image: c.image('image', 'Фото'), on_home: b.on_home === true, plan: [],
    videos: c.videos('videos', 'Видео из Instagram'),
  };
  const plan = Array.isArray(b.plan) ? b.plan : [];
  if (!plan.length) c.errors.push('Планировка: добавьте хотя бы один этаж');
  if (plan.length > 4) c.errors.push('Планировка: не больше 4 этажей');
  plan.slice(0, 4).forEach((f, i) => { const [floor, errs] = cleanFloor(f, i + 1); p.plan.push(floor); c.errors.push(...errs); });
  return [p, c.errors];
}

export function cleanCase(b: Record<string, unknown>): [Case, string[]] {
  const c = new Check(b);
  const k: Case = {
    image: c.image('image', 'Фото'),
    region: c.text('region', 'Место', 50), region_ky: c.ky('region_ky', 'Место', 50),
    title: c.text('title', 'Заголовок', 80), title_ky: c.ky('title_ky', 'Заголовок', 80),
    area: c.text('area', 'Площадь', 30),
    term: c.text('term', 'Срок', 30), term_ky: c.ky('term_ky', 'Срок', 30),
    season: c.text('season', 'Сезон', 30), season_ky: c.ky('season_ky', 'Сезон', 30),
    story: c.text('story', 'История', 600), story_ky: c.ky('story_ky', 'История', 600),
    project: c.num('project', 'Проект', 1, 1e9, { int: true, optional: true }),
    photos: c.photos('photos', 'Галерея'),
    videos: c.videos('videos', 'Видео из Instagram'),
  };
  return [k, c.errors];
}
export function cleanRental(b: Record<string, unknown>): [Rental, string[]] {
  const c = new Check(b);
  const r: Rental = {
    image: c.image('image', 'Фото'),
    title: c.text('title', 'Заголовок', 80), title_ky: c.ky('title_ky', 'Заголовок', 80),
    place: c.text('place', 'Место', 50), place_ky: c.ky('place_ky', 'Место', 50),
    area: c.num('area', 'Площадь, м²', 10, 2000, { optional: true }),
    project: c.num('project', 'Проект', 1, 1e9, { int: true, optional: true }),
    price_night: c.num('price_night', 'Цена за сутки, $', 1, 100000)!,
    nights: c.num('nights', 'Ночей в год', 1, 366, { int: true, optional: true }),
    invest: c.num('invest', 'Вложения, $', 100, 1e8, { optional: true }),
    story: c.text('story', 'История', 600, false), story_ky: c.ky('story_ky', 'История', 600),
  };
  return [r, c.errors];
}

export function cleanFaq(b: Record<string, unknown>): [Faq, string[]] {
  const c = new Check(b);
  const f: Faq = { q: c.text('q', 'Вопрос', 200), q_ky: c.ky('q_ky', 'Вопрос', 200), a: c.text('a', 'Ответ', 1500), a_ky: c.ky('a_ky', 'Ответ', 1500) };
  for (const t of [f.a, f.a_ky].join(' ').match(/\{[^}]*\}/g) || []) if (!FAQ_TOKENS.includes(t)) c.errors.push(`Ответ: неизвестная вставка ${t} — можно ${FAQ_TOKENS.join(', ')}`);
  return [f, c.errors];
}
export const FAQ_TOKENS = ['{price}', '{terrace_open_price}', '{terrace_closed_price}', '{months}', '{months_min}', '{warranty}'];

export function cleanExtra(b: Record<string, unknown>): [Extra, string[]] {
  const c = new Check(b);
  const slug = c.text('slug', 'Адрес на странице', 40);
  if (slug && !SLUG_RE.test(slug)) c.errors.push('Адрес на странице: латинские буквы, цифры и дефис, например bani');
  const x: Extra = {
    slug, name: c.text('name', 'Название', 60), name_ky: c.ky('name_ky', 'Название', 60),
    lead: c.text('lead', 'Коротко (для главной)', 160), lead_ky: c.ky('lead_ky', 'Коротко (для главной)', 160),
    text: c.text('text', 'Описание', 800), text_ky: c.ky('text_ky', 'Описание', 800),
    points: c.text('points', 'Что делаем', 800, false), points_ky: c.ky('points_ky', 'Что делаем', 800),
    image: c.image('image', 'Обложка'), works: [],
  };
  const works = Array.isArray(b.works) ? b.works : [];
  if (works.length > 12) c.errors.push('Примеры работ: не больше 12');
  works.slice(0, 12).forEach((w, i) => {
    const wc = new Check(w && typeof w === 'object' ? w : {}), at = `Пример ${i + 1}`;
    x.works.push({ image: wc.image('image', `${at}: фото`), title: wc.text('title', `${at}: подпись`, 60), title_ky: wc.ky('title_ky', `${at}: подпись`, 60), note: wc.text('note', `${at}: детали`, 60, false), note_ky: wc.ky('note_ky', `${at}: детали`, 60) });
    if (!x.works[i].image) wc.errors.push(`${at}: загрузите фото`);
    c.errors.push(...wc.errors);
  });
  return [x, c.errors];
}

export const clean = (kind: Kind, b: Record<string, unknown>): [Project | Case | Faq | Extra | Rental, string[]] =>
  kind === 'projects' ? cleanProject(b) : kind === 'cases' ? cleanCase(b) : kind === 'extras' ? cleanExtra(b) : kind === 'rentals' ? cleanRental(b) : cleanFaq(b);

/* ---- storage ---- */
export async function listItems<T = Project | Case | Faq | Extra | Rental>(kind: Kind): Promise<Item<T>[]> {
  return (await pool.query<Item<T>>(`SELECT id, position, data FROM ${kind} ORDER BY position, id`)).rows;
}

export async function saveItem(kind: Kind, data: Project | Case | Faq | Extra | Rental, user: string, id?: number) {
  if (kind === 'projects' || kind === 'extras') {
    const { rows } = await pool.query(`SELECT id FROM ${kind} WHERE data->>'slug' = $1 AND id <> $2`, [(data as Project | Extra).slug, id ?? 0]);
    if (rows.length) return { error: 'Адрес на странице уже занят' };
  }
  const { rows } = id
    ? await pool.query<{ id: number }>(`UPDATE ${kind} SET data = $1, updated_at = now(), updated_by = $2 WHERE id = $3 RETURNING id`, [data, user, id])
    : await pool.query<{ id: number }>(`INSERT INTO ${kind} (position, data, updated_by) VALUES ((SELECT coalesce(max(position) + 1, 0) FROM ${kind}), $1, $2) RETURNING id`, [data, user]);
  return { id: rows[0]?.id ?? null };
}

export const deleteItem = async (kind: Kind, id: number) => (await pool.query(`DELETE FROM ${kind} WHERE id = $1`, [id])).rowCount ?? 0;

// ids in the new order; the ones left out keep their place after them
export async function reorder(kind: Kind, ids: number[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, id] of ids.entries()) await client.query(`UPDATE ${kind} SET position = $1 WHERE id = $2`, [i, id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ---- for the page: one language, the fields the page uses ---- */
const pick = (d: Record<string, any>, f: string, lang: Lang) => (lang === 'ky' && d[f + '_ky']) || d[f];

export type PageProject = Omit<Project, `${string}_ky` | 'plan'> & { id: number; plan: (Omit<Floor, 'name_ky' | 'rooms'> & { rooms: Omit<Room, 'name_ky'>[] })[] };
export type PageCase = Omit<Case, `${string}_ky` | 'project'> & { id: number; project: { slug: string; name: string; style: Project['style'] } | null };
export type PageRental = Omit<Rental, `${string}_ky` | 'project'> & { project: { slug: string; name: string; style: Project['style'] } | null };

export async function readCatalogFor(lang: Lang) {
  const [projects, cases, faq, extras, rentals] = await Promise.all([listItems<Project>('projects'), listItems<Case>('cases'), listItems<Faq>('faq'), listItems<Extra>('extras'), listItems<Rental>('rentals')]);
  const ps: PageProject[] = projects.map(({ id, data: d }) => ({
    id, slug: d.slug, style: d.style, name: pick(d, 'name', lang), area: d.area, terrace: d.terrace || 0, terrace_type: d.terrace_type === 'closed' ? 'closed' : 'open', beds: d.beds, baths: d.baths,
    floors: pick(d, 'floors', lang), text: pick(d, 'text', lang), price: d.price, image: d.image, on_home: d.on_home, videos: d.videos ?? [],
    plan: d.plan.map(f => ({ name: pick(f, 'name', lang), w: f.w, h: f.h, void: f.void, image: f.image, rooms: f.rooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, name: pick(r, 'name', lang), ...(r.terrace ? { terrace: true } : {}) })) })),
  }));
  const byId = new Map(ps.map(p => [p.id, p]));
  const cs: PageCase[] = cases.map(({ id, data: d }) => {
    const p = d.project ? byId.get(d.project) : undefined;
    return {
      id, image: d.image, photos: d.photos ?? [], videos: d.videos ?? [], region: pick(d, 'region', lang), title: pick(d, 'title', lang), area: d.area, term: pick(d, 'term', lang),
      season: pick(d, 'season', lang), story: pick(d, 'story', lang), project: p ? { slug: p.slug, name: p.name, style: p.style } : null,
    };
  });
  const rs: PageRental[] = rentals.map(({ data: d }) => {
    const p = d.project ? byId.get(d.project) : undefined;
    return {
      image: d.image, title: pick(d, 'title', lang), place: pick(d, 'place', lang), area: d.area ?? p?.area ?? null, price_night: d.price_night, nights: d.nights, invest: d.invest,
      story: pick(d, 'story', lang) || '', project: p ? { slug: p.slug, name: p.name, style: p.style } : null,
    };
  });
  return {
    projects: ps, cases: cs, rentals: rs, faq: faq.map(({ data: d }) => ({ q: pick(d, 'q', lang) as string, a: pick(d, 'a', lang) as string })),
    extras: extras.map(({ data: d }) => ({
      slug: d.slug, name: pick(d, 'name', lang) as string, lead: pick(d, 'lead', lang) as string, text: pick(d, 'text', lang) as string, image: d.image,
      points: (pick(d, 'points', lang) || '').split('\n').map((s: string) => s.trim()).filter(Boolean) as string[],
      works: d.works.map(w => ({ image: w.image, title: pick(w, 'title', lang) as string, note: pick(w, 'note', lang) as string })),
    })),
  };
}
