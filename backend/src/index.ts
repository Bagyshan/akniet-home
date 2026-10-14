import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { admin } from './routes/admin.js';
import { content } from './routes/content.js';
import { leads } from './routes/leads.js';
import { telegram } from './routes/telegram.js';
import { telegramEnabled } from './telegram.js';
import { invalidatePages, renderPage, robotsTxt, sitemapXml } from './render.js';
import { isLang } from './slots.js';

const app = express();
const started = new Date();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, uniquelocal'); // nginx in the compose network
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});
// server-rendered pages; nginx sends / and /ky/ here
app.get('/ssr/:lang', async (req, res) => {
  if (!isLang(req.params.lang)) return res.sendStatus(404);
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Language': req.params.lang }).send(await renderPage(req.params.lang));
});
app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robotsTxt()));
app.get('/sitemap.xml', async (_req, res) => {
  const { rows } = await pool.query<{ at: Date | null }>(`SELECT max(at) AS at FROM (
    SELECT max(updated_at) AS at FROM content UNION ALL SELECT max(updated_at) FROM slots UNION ALL SELECT max(updated_at) FROM map_points) t`);
  res.type('application/xml').send(sitemapXml(rows[0]?.at ?? started));
});

app.use('/api/leads', leads);
app.use('/api/content', content);
app.use('/api/admin', admin);
app.use('/api/telegram', telegram);
app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'bad json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, errors: ['Файл больше 15 МБ'] });
  console.error(err);
  res.status(err.status ?? 500).json({ ok: false, error: 'server error' });
});

await migrate();
const server = app.listen(config.port, () => console.log(`backend on :${config.port}, telegram ${telegramEnabled ? 'on' : 'stub'}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
