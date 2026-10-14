import { Router } from 'express';
import { readContent } from '../content.js';
import { listPointsFor } from '../points.js';
import { isLang, readSlotsFor } from '../slots.js';

export const content = Router();

// GET /api/content?lang=ru|ky — public values the page applies to [data-cms], [data-contact] and numbered slots
content.get('/', async (req, res) => {
  const lang = isLang(req.query.lang) ? req.query.lang : 'ru';
  const [fields, materials, gallery, points] = await Promise.all([readContent(), readSlotsFor('materials', lang), readSlotsFor('gallery', lang), listPointsFor(lang)]);
  res.set('Cache-Control', 'public, max-age=30').json({ ...fields, materials, gallery, points });
});
