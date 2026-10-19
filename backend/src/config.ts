const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
};

// SITE_URL must be a full address (https://akniet-home.kg); anything else (a typo, a stray word) falls back to https://DOMAIN
function siteUrl(): string {
  const raw = (process.env.SITE_URL ?? '').trim();
  if (/^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(raw)) return raw.replace(/\/$/, '');
  const fallback = 'https://' + env('DOMAIN', 'localhost').trim();
  if (raw) console.warn(`SITE_URL="${raw}" is not an address like https://akniet-home.kg — using ${fallback}`);
  return fallback;
}

export const config = {
  port: Number(env('PORT', '3000')),
  // shared with nginx, which serves it at /uploads/
  uploadDir: env('UPLOAD_DIR', '/data/uploads'),
  // page templates for server rendering (index.html, ky/index.html)
  siteDir: env('SITE_DIR', '/app/site'),
  // absolute address of the site, for canonical / hreflang / sitemap
  siteUrl: siteUrl(),
  seo: {
    googleVerification: env('GOOGLE_SITE_VERIFICATION', ''),
    yandexVerification: env('YANDEX_VERIFICATION', ''),
    ga4: env('GA4_ID', ''),
    metrika: env('YANDEX_METRIKA_ID', ''),
  },
  db: {
    host: env('POSTGRES_HOST', 'db'),
    port: Number(env('POSTGRES_PORT', '5432')),
    database: env('POSTGRES_DB'),
    user: env('POSTGRES_USER'),
    password: env('POSTGRES_PASSWORD'),
  },
  telegram: {
    // пусто — бот не подключён, заявки только сохраняются в БД (заглушка)
    token: env('TELEGRAM_BOT_TOKEN', ''),
    chatId: env('TELEGRAM_CHAT_ID', ''),
    webhookSecret: env('TELEGRAM_WEBHOOK_SECRET', ''),
    // Bot API address; changed only in tests (a local stand-in for Telegram)
    api: env('TELEGRAM_API', 'https://api.telegram.org').replace(/\/$/, ''),
  },
};
