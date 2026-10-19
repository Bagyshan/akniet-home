import { Router } from 'express';
import { pool } from '../db.js';
import { notifyLead } from '../telegram.js';

const HOUSE_TYPES = ['Барнхаус', 'A-frame', 'Нужен совет'];
const CONTACT_VIA = ['Звонок', 'WhatsApp', 'Telegram'];
const SOURCES = ['form', 'quiz', 'catalog'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const leads = Router();

// POST /api/leads — the form on the site
leads.post('/', async (req, res) => {
  const b = req.body ?? {};
  // honeypot: bots fill the hidden "website" field; answer OK and drop it
  if (str(b.website, 200)) return res.status(201).json({ ok: true });

  const name = str(b.name, 100), phone = str(b.phone, 32);
  const digits = phone.replace(/\D/g, '');
  const errors: string[] = [];
  if (name.length < 2) errors.push('name');
  if (digits.startsWith('996') ? digits.length !== 12 : digits.length < 10 || digits.length > 15) errors.push('phone');
  if (errors.length) return res.status(422).json({ ok: false, errors });

  const type = HOUSE_TYPES.includes(b.type) ? b.type : null;
  const via = CONTACT_VIA.includes(b.via) ? b.via : null;
  const area = Number.parseInt(b.area, 10), terrace = Number.parseInt(b.terrace, 10);
  const lead = {
    name, phone, house_type: type, contact_via: via, lang: b.lang === 'ky' ? 'ky' : 'ru',
    project: str(b.project, 200) || null,
    area: area > 0 && area < 2000 ? area : null,
    terrace: terrace > 0 && terrace < 1000 ? terrace : null,
    terrace_type: terrace > 0 && (b.terrace_type === 'open' || b.terrace_type === 'closed') ? b.terrace_type : null,
    message: str(b.msg, 2000) || null,
    // the page the visitor was on: a site path only (/projects/, /ky/invest/), never a full URL
    page: /^\/[\w\-/]*$/.test(str(b.page, 200)) ? str(b.page, 200) : null,
    source: SOURCES.includes(b.source) ? b.source : null,
  };

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO leads (name, phone, house_type, contact_via, project, area, terrace, terrace_type, message, lang, page, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [lead.name, lead.phone, lead.house_type, lead.contact_via, lead.project, lead.area, lead.terrace, lead.terrace_type, lead.message, lead.lang, lead.page, lead.source],
  );
  const id = Number(rows[0].id);
  res.status(201).json({ ok: true, id });

  // the visitor does not wait for Telegram; the response is already sent, so errors only get logged
  notifyLead({ id, ...lead })
    .then(async sent => { if (sent) await pool.query('UPDATE leads SET telegram_sent = true WHERE id = $1', [id]); })
    .catch(e => console.error(`lead #${id}: telegram status not saved`, e));
});
