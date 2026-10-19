import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { clean, deleteItem, isKind, listItems, reorder, saveItem, type Kind } from '../catalog.js';
import { CONTENT_FIELDS, checkValue, isContentKey, readContent, writeContent, type ContentKey } from '../content.js';
import { pool } from '../db.js';
import { cleanPoint, deletePoint, listPoints, savePoint } from '../points.js';
import { SLOT_SECTIONS, cleanSlot, deleteSlot, isSection, readSlots, writeSlot } from '../slots.js';
import { isUploadKind, saveImage } from '../uploads.js';
import { invalidatePages } from '../render.js';
import { syncLeadMessage, telegramEnabled } from '../telegram.js';

const STATUSES = ['new', 'in_work', 'done', 'spam'];

export const admin = Router();

// Basic auth happens in nginx; it forwards the checked login as X-Admin-User
// and blanks the header on every other route. No header — the request did not pass nginx auth.
admin.use((req: Request, res: Response, next: NextFunction) => {
  const user = req.get('x-admin-user');
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.locals.user = user;
  next();
});

// anything saved in the admin panel → the server-rendered pages are rebuilt on the next request
admin.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => res.statusCode < 300 && invalidatePages());
  next();
});

admin.get('/me', (_req, res) => res.json({ user: res.locals.user, telegram: telegramEnabled }));

admin.get('/content', async (_req, res) => {
  const values = await readContent();
  res.json(Object.entries(CONTENT_FIELDS).map(([key, f]) => ({ key, group: f.group, label: f.label, type: f.type, hint: 'hint' in f ? f.hint : undefined, options: 'options' in f ? f.options : undefined, default: f.default, value: values[key as ContentKey] })));
});

// PUT /api/admin/content  { "price_m2": 450, "houses_built": 30, ... }
admin.put('/content', async (req, res) => {
  const patch: Partial<Record<ContentKey, unknown>> = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (!isContentKey(k)) { errors.push(`${k}: неизвестное поле`); continue; }
    const err = checkValue(k, v);
    err ? errors.push(err) : (patch[k] = v);
  }
  if (errors.length) return res.status(422).json({ ok: false, errors });
  await writeContent(patch, res.locals.user);
  res.json({ ok: true });
});

// GET /api/admin/leads?status=new&limit=50&offset=0
admin.get('/leads', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200), offset = Math.max(Number(req.query.offset) || 0, 0);
  const status = STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
  const { rows } = await pool.query(
    `SELECT *, count(*) OVER() AS total FROM leads WHERE ($1::text IS NULL OR status = $1)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );
  res.json({ total: Number(rows[0]?.total ?? 0), items: rows.map(({ total, ...r }) => r) });
});

admin.patch('/leads/:id', async (req, res) => {
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(422).json({ ok: false, errors: ['status'] });
  const id = Number(req.params.id);
  // back to «Новая» frees the lead: the «Беру» button comes back in Telegram
  const { rowCount } = await pool.query(
    `UPDATE leads SET status = $1, status_at = now(),
       taken_by = CASE WHEN $1 = 'new' THEN NULL ELSE taken_by END, taken_by_id = CASE WHEN $1 = 'new' THEN NULL ELSE taken_by_id END
     WHERE id = $2 AND status <> $1`, [status, id]);
  // nothing updated: either the status is already the same, or there is no such lead
  if (!rowCount && !(await pool.query('SELECT 1 FROM leads WHERE id = $1', [id])).rowCount) return res.status(404).json({ ok: false });
  res.json({ ok: true });
  if (rowCount) syncLeadMessage(id).catch(e => console.error(`lead #${id}: telegram message not updated`, e));
});

// ---- numbered slots: materials 1–10, gallery 1–6 ----
const slotParams = (req: Request, res: Response) => {
  const section = String(req.params.section), slot = Number(req.params.slot);
  if (!isSection(section) || !Number.isInteger(slot) || slot < 1 || slot > SLOT_SECTIONS[section].count) {
    res.status(404).json({ ok: false, error: 'no such slot' });
    return null;
  }
  return { section, slot };
};

admin.get('/slots/:section', async (req, res) => {
  const section = String(req.params.section);
  if (!isSection(section)) return res.status(404).json({ ok: false });
  res.json(await readSlots(section));
});

// PUT /api/admin/slots/materials/3  { "kind": "Дерево", "title": "…", "subtitle": "…", "image": "/uploads/….webp" }
admin.put('/slots/:section/:slot', async (req, res) => {
  const p = slotParams(req, res); if (!p) return;
  const [data, errors] = cleanSlot(p.section, req.body ?? {});
  if (errors.length) return res.status(422).json({ ok: false, errors });
  await writeSlot(p.section, p.slot, data, res.locals.user);
  res.json({ ok: true, data });
});

// DELETE — back to the stock card
admin.delete('/slots/:section/:slot', async (req, res) => {
  const p = slotParams(req, res); if (!p) return;
  await deleteSlot(p.section, p.slot);
  res.json({ ok: true });
});

// POST /api/admin/upload?kind=material|gallery|project|plan  body: the image file itself
admin.post('/upload', express.raw({ type: 'image/*', limit: '15mb' }), async (req, res) => {
  const kind = req.query.kind;
  if (!isUploadKind(kind)) return res.status(422).json({ ok: false, errors: ['kind'] });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(422).json({ ok: false, errors: ['Пришлите файл изображения'] });
  try {
    res.status(201).json({ ok: true, ...(await saveImage(req.body, kind)) });
  } catch {
    res.status(422).json({ ok: false, errors: ['Не удалось прочитать изображение — подойдут JPG, PNG или WebP'] });
  }
});

// ---- map points ----
admin.get('/points', async (_req, res) => res.json(await listPoints()));

// POST /api/admin/points  { lat, lon, name, name_ky, houses, area }; PUT /api/admin/points/:id — the same body
admin.post('/points', async (req, res) => {
  const [p, errors] = cleanPoint(req.body ?? {});
  if (errors.length) return res.status(422).json({ ok: false, errors });
  res.status(201).json({ ok: true, id: await savePoint(p, res.locals.user) });
});
admin.put('/points/:id', async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(404).json({ ok: false });
  const [p, errors] = cleanPoint(req.body ?? {});
  if (errors.length) return res.status(422).json({ ok: false, errors });
  const id = await savePoint(p, res.locals.user, Number(req.params.id));
  res.status(id ? 200 : 404).json({ ok: Boolean(id), id });
});
admin.delete('/points/:id', async (req, res) => {
  if (!Number.isInteger(Number(req.params.id))) return res.status(404).json({ ok: false });
  const n = await deletePoint(Number(req.params.id));
  res.status(n ? 200 : 404).json({ ok: Boolean(n) });
});

// ---- projects and cases: /api/admin/catalog/projects, /api/admin/catalog/cases ----
const kindOf = (req: Request, res: Response): Kind | null => {
  const k = String(req.params.kind);
  if (isKind(k)) return k;
  res.status(404).json({ ok: false, error: 'no such list' });
  return null;
};
const idOf = (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isInteger(id) && id > 0) return id;
  res.status(404).json({ ok: false });
  return null;
};
admin.get('/catalog/:kind', async (req, res) => {
  const kind = kindOf(req, res); if (!kind) return;
  res.json(await listItems(kind));
});
// POST — a new item at the end of the list; PUT /:id — the same body
admin.post('/catalog/:kind', async (req, res) => {
  const kind = kindOf(req, res); if (!kind) return;
  const [data, errors] = clean(kind, req.body ?? {});
  if (errors.length) return res.status(422).json({ ok: false, errors });
  const r = await saveItem(kind, data, res.locals.user);
  if (r.error) return res.status(422).json({ ok: false, errors: [r.error] });
  res.status(201).json({ ok: true, id: r.id });
});
// PUT /api/admin/catalog/projects/order  { "ids": [3, 1, 2] }
admin.put('/catalog/:kind/order', async (req, res) => {
  const kind = kindOf(req, res); if (!kind) return;
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every(i => Number.isInteger(i) && i > 0) || ids.length > 500) return res.status(422).json({ ok: false, errors: ['ids'] });
  await reorder(kind, ids);
  res.json({ ok: true });
});
admin.put('/catalog/:kind/:id', async (req, res) => {
  const kind = kindOf(req, res); if (!kind) return;
  const id = idOf(req, res); if (!id) return;
  const [data, errors] = clean(kind, req.body ?? {});
  if (errors.length) return res.status(422).json({ ok: false, errors });
  const r = await saveItem(kind, data, res.locals.user, id);
  if (r.error) return res.status(422).json({ ok: false, errors: [r.error] });
  res.status(r.id ? 200 : 404).json({ ok: Boolean(r.id), id: r.id });
});
admin.delete('/catalog/:kind/:id', async (req, res) => {
  const kind = kindOf(req, res); if (!kind) return;
  const id = idOf(req, res); if (!id) return;
  const n = await deleteItem(kind, id);
  res.status(n ? 200 : 404).json({ ok: Boolean(n) });
});
