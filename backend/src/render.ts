// Server-side rendering of the home page (/ and /ky/).
// The page template is the static HTML (index-stone.html and the generated ky/index.html); this module puts the admin
// content into it — the same rules the page script applies in the browser — and adds the SEO head: canonical, hreflang,
// Open Graph, JSON-LD, verification tags and analytics. The result is cached until the admin panel saves something.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { config } from './config.js';
import { readContent } from './content.js';
import { listPointsFor } from './points.js';
import { readSlotsFor, type Lang } from './slots.js';

const TEMPLATES: Record<Lang, string> = { ru: 'index.html', ky: 'ky/index.html' };
const TTL = 10 * 60 * 1000;
const cache = new Map<Lang, { html: string; at: number }>();
const templates = new Map<Lang, string>();

export const invalidatePages = () => cache.clear();

export async function renderPage(lang: Lang): Promise<string> {
  const hit = cache.get(lang);
  if (hit && Date.now() - hit.at < TTL) return hit.html;
  if (!templates.has(lang)) templates.set(lang, await readFile(path.join(config.siteDir, TEMPLATES[lang]), 'utf8'));
  const [fields, materials, gallery, points] = await Promise.all([readContent(), readSlotsFor('materials', lang), readSlotsFor('gallery', lang), listPointsFor(lang)]);
  const html = build(templates.get(lang)!, lang, { ...fields, materials, gallery, points } as Content);
  cache.set(lang, { html, at: Date.now() });
  return html;
}

type Slot = Record<string, string> | null;
type Content = Record<string, any> & { materials: Slot[]; gallery: Slot[]; points: { name: string; houses: number; area: number; lat: number; lon: number }[] };

/* ---- the same helpers as the page script ---- */
const plural = (n: number, forms: string) => {
  const [one, few, many, frac = few] = forms.split(',');
  if (!Number.isInteger(n)) return frac;
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many;
};
const numRu = (n: number) => String(n).replace('.', ',');
const money = (n: number) => '$' + n.toLocaleString('ru-RU');
const nf = (n: number) => Number(n).toLocaleString('ru-RU');
const digits = (v: string) => String(v).replace(/\D/g, '');
const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
const isPhone = (v: string) => /^[+\d\s()-]+$/.test(v);
const CONTACT_DEFAULTS: Record<string, string> = { phone: '+996 500 20 84 87', whatsapp: '+996 500 20 84 87', telegram: '+996 500 20 84 87', email: 'akniethome305@gmail.com' };
const contactHref: Record<string, (v: string) => string> = {
  phone: v => 'tel:+' + digits(v),
  whatsapp: v => 'https://wa.me/' + digits(v),
  telegram: v => (isPhone(v) ? 'https://t.me/+' + digits(v) : 'https://t.me/' + v.replace(/^@/, '')),
  email: v => 'mailto:' + v,
  instagram: v => v, tiktok: v => v, threads: v => v,
};
const routeUrl = (lat: number, lon: number) => `https://2gis.kg/bishkek/directions/points/%7C${lon.toFixed(6)}%2C${lat.toFixed(6)}`;
const DAYS: Record<string, string[]> = { 'Mo-Fr': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 'Mo-Sa': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
DAYS['Mo-Su'] = [...DAYS['Mo-Sa'], 'Sunday'];

function swapText(node: any, from: string, to: string) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
    else if (n.nodeType === 1) swapText(n, from, to);
  }
}
const text = (el: any) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function build(template: string, lang: Lang, c: Content): string {
  // linkedom serializes script text through String.replace, so "$'" or "$&" inside a script gets mangled.
  // Script bodies are kept aside as tokens and put back after serialization.
  const bodies: string[] = [];
  const stash = (body: string) => `/*@@script${bodies.push(body) - 1}@@*/`;
  const { document } = parseHTML(template.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (_, a, body, z) => a + stash(body) + z));
  const $ = (s: string): any => document.querySelector(s);
  const $$ = (s: string) => [...document.querySelectorAll(s)] as any[];
  const bodyOf = (el: any) => bodies[+/@@script(\d+)@@/.exec(el.textContent)![1]];
  const T = JSON.parse(bodyOf($('#i18n')));
  const price = +c.price_m2 > 0 ? +c.price_m2 : 440;

  /* ---- content ---- */
  for (const el of $$('[data-cms]')) {
    const v = c[el.dataset.cms];
    if (typeof v !== 'number') continue;
    if (el.classList.contains('count')) el.dataset.to = String(v);
    el.textContent = el.dataset.unit ? numRu(v) + ' ' + plural(v, el.dataset.unit) : numRu(v);
    el.classList.remove('ph'); el.removeAttribute('title');
  }
  for (const el of $$('[data-cms-unit]')) { const v = c[el.dataset.cmsUnit]; if (typeof v === 'number') el.textContent = plural(v, el.dataset.unit); }
  const address = (lang === 'ky' && c.address_ky) || c.address;
  if (address) $$('[data-cms="address"]').forEach(e => (e.textContent = address));
  const hours = `${T.days[c.work_days] || c.work_days}, ${c.work_from}–${c.work_to}`;
  $$('[data-cms="hours"]').forEach(e => (e.textContent = hours));
  $$('[data-contact="route"]').forEach(a => a.setAttribute('href', routeUrl(c.office_lat, c.office_lon)));
  for (const a of $$('[data-contact]')) {
    const key = a.dataset.contact, v = c[key];
    if (!v || !contactHref[key]) continue;
    a.setAttribute('href', contactHref[key](v));
    if (CONTACT_DEFAULTS[key]) swapText(a, CONTACT_DEFAULTS[key], key === 'telegram' && !isPhone(v) ? '@' + v.replace(/^@/, '') : v);
  }
  c.materials.forEach((m, i) => {
    const t = m && $(`.tile[data-slot="${i + 1}"]`); if (!t) return;
    if (m.image) t.setAttribute('style', (t.getAttribute('style') || '').replace(/--w:[^;]*/, `--w:url("${m.image}")`));
    if (m.kind) t.querySelector('.kind').textContent = m.kind;
    if (m.title) t.querySelector('.lab b').textContent = m.title;
    if (m.subtitle) t.querySelector('.lab span').textContent = m.subtitle;
  });
  c.gallery.forEach((g, i) => {
    const f = g && $(`.shot[data-slot="${i + 1}"]`); if (!f) return;
    const img = f.querySelector('img');
    if (g.image) img.setAttribute('src', g.image);
    if (g.caption) { f.querySelector('.chip').textContent = g.caption; img.setAttribute('alt', g.caption); }
  });
  for (const card of $$('.proj')) card.querySelector('.price b').textContent = fill(T.priceFrom, { sum: money(parseInt(text(card.querySelector('.area'))) * price) });
  const area = +($('#area')?.getAttribute('value') || 86);
  if ($('#calc-sum')) $('#calc-sum').textContent = money(area * price);
  if ($('#year')) $('#year').textContent = String(new Date().getFullYear());

  // map points as a list: the map itself is drawn by a script, the list gives the same facts to search engines and screen readers
  const map = $('#kg-map');
  if (map && c.points.length) {
    const ul = document.createElement('ul');
    ul.className = 'sr-only';
    for (const p of c.points) {
      const li = document.createElement('li');
      li.textContent = `${p.name}: ${nf(p.houses)} ${plural(p.houses, T.map.houses)}, ${nf(p.area)} ${T.map.area}`;
      ul.append(li);
    }
    map.after(ul);
  }

  /* ---- SEO head ---- */
  const site = config.siteUrl;
  const url = site + (lang === 'ky' ? '/ky/' : '/');
  const months = numRu(c.build_months_avg) + ' ' + plural(+c.build_months_avg, T.seo.monthsUnit);
  const warranty = numRu(c.warranty_years) + ' ' + plural(+c.warranty_years, T.seo.yearsUnit);
  const description = fill(T.seo.description, { price, months, warranty });
  const title = text($('title'));
  const ogImage = site + T.seo.ogImage;
  const head = document.head;
  const meta = (attrs: Record<string, string>) => { const m = document.createElement('meta'); for (const [k, v] of Object.entries(attrs)) m.setAttribute(k, v); head.append(m); };
  const link = (attrs: Record<string, string>) => { const l = document.createElement('link'); for (const [k, v] of Object.entries(attrs)) l.setAttribute(k, v); head.append(l); };

  $('meta[name="description"]')?.setAttribute('content', description);
  $$('link[rel="alternate"][hreflang]').forEach(l => l.remove());
  link({ rel: 'canonical', href: url });
  link({ rel: 'alternate', hreflang: 'ru', href: site + '/' });
  link({ rel: 'alternate', hreflang: 'ky', href: site + '/ky/' });
  link({ rel: 'alternate', hreflang: 'x-default', href: site + '/' });
  meta({ name: 'robots', content: 'index, follow, max-image-preview:large' });
  meta({ property: 'og:type', content: 'website' });
  meta({ property: 'og:site_name', content: T.seo.siteName });
  meta({ property: 'og:title', content: title });
  meta({ property: 'og:description', content: description });
  meta({ property: 'og:url', content: url });
  meta({ property: 'og:image', content: ogImage });
  meta({ property: 'og:image:width', content: '1200' });
  meta({ property: 'og:image:height', content: '630' });
  meta({ property: 'og:image:alt', content: title });
  meta({ property: 'og:locale', content: T.seo.ogLocale });
  meta({ property: 'og:locale:alternate', content: T.seo.ogLocale === 'ru_RU' ? 'ky_KG' : 'ru_RU' });
  meta({ name: 'twitter:card', content: 'summary_large_image' });
  meta({ name: 'twitter:title', content: title });
  meta({ name: 'twitter:description', content: description });
  meta({ name: 'twitter:image', content: ogImage });
  if (config.seo.googleVerification) meta({ name: 'google-site-verification', content: config.seo.googleVerification });
  if (config.seo.yandexVerification) meta({ name: 'yandex-verification', content: config.seo.yandexVerification });

  const faq = $$('.faq details').map(d => ({ '@type': 'Question', name: text(d.querySelector('summary')), acceptedAnswer: { '@type': 'Answer', text: text(d.querySelector('.a')) } }));
  const company = site + '/#company';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'GeneralContractor', '@id': company, name: T.seo.siteName, alternateName: 'Akniet', url: site + '/',
        logo: site + '/assets/logo-gold.png', image: ogImage, description,
        telephone: '+' + digits(c.phone), email: c.email,
        address: { '@type': 'PostalAddress', streetAddress: address, addressLocality: T.seo.city, addressCountry: 'KG' },
        geo: { '@type': 'GeoCoordinates', latitude: c.office_lat, longitude: c.office_lon },
        hasMap: routeUrl(c.office_lat, c.office_lon),
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[c.work_days] || DAYS['Mo-Sa'], opens: c.work_from, closes: c.work_to }],
        areaServed: { '@type': 'Country', name: T.seo.country },
        priceRange: fill(T.seo.priceRange, { price }),
        sameAs: [c.instagram, c.tiktok, c.threads].filter(Boolean),
        makesOffer: T.seo.services.map((name: string) => ({
          '@type': 'Offer', itemOffered: { '@type': 'Service', name, areaServed: { '@type': 'Country', name: T.seo.country } },
          priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', unitText: 'м²', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MTK' } },
        })),
      },
      { '@type': 'WebSite', '@id': site + '/#website', url: site + '/', name: T.seo.siteName, inLanguage: ['ru', 'ky'], publisher: { '@id': company } },
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description, inLanguage: lang, isPartOf: { '@id': site + '/#website' }, about: { '@id': company }, primaryImageOfPage: ogImage },
      ...(faq.length ? [{ '@type': 'FAQPage', '@id': url + '#faq', inLanguage: lang, mainEntity: faq }] : []),
    ],
  };
  const json = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
  const ldScript = document.createElement('script');
  ldScript.setAttribute('type', 'application/ld+json');
  ldScript.textContent = stash(json(ld));
  head.append(ldScript);

  // the page script reads this instead of calling /api/content
  const data = document.createElement('script');
  data.setAttribute('type', 'application/json'); data.id = 'cms';
  data.textContent = stash(json(c));
  $('#i18n').after(data);

  /* ---- analytics (only when configured in .env) ---- */
  if (config.seo.ga4) {
    const s1 = document.createElement('script'); s1.setAttribute('async', ''); s1.setAttribute('src', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.seo.ga4)}`);
    const s2 = document.createElement('script');
    s2.textContent = stash(`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(config.seo.ga4)});`);
    head.append(s1, s2);
  }
  if (config.seo.metrika) {
    const id = Number(config.seo.metrika);
    const s = document.createElement('script');
    s.textContent = stash(`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`);
    head.append(s);
  }
  return document.toString().replace(/\/\*@@script(\d+)@@\*\//g, (_, i) => bodies[+i]);
}

/* ---- robots.txt and sitemap.xml ---- */
export const robotsTxt = () => `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${config.siteUrl}/sitemap.xml
`;

export function sitemapXml(lastmod: Date) {
  const day = lastmod.toISOString().slice(0, 10), site = config.siteUrl;
  const alt = `<xhtml:link rel="alternate" hreflang="ru" href="${site}/"/><xhtml:link rel="alternate" hreflang="ky" href="${site}/ky/"/><xhtml:link rel="alternate" hreflang="x-default" href="${site}/"/>`;
  const url = (loc: string) => `<url><loc>${loc}</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority>${alt}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${url(site + '/')}
${url(site + '/ky/')}
</urlset>
`;
}
