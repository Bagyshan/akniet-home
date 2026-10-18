// Server-side rendering of the site pages: / and /ky/, /technology/, /map/, /projects/ and their /ky/ copies.
// The page templates are the static HTML (index-stone.html, technology/index.html… and the generated ky/…); this module puts the admin
// content into it — the same rules the page script applies in the browser — and adds the SEO head: canonical, hreflang,
// Open Graph, JSON-LD, verification tags and analytics. The result is cached until the admin panel saves something.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { config } from './config.js';
import { readCatalogFor, type PageCase, type PageProject, type PageRental } from './catalog.js';
import { readContent } from './content.js';
import { listPointsFor } from './points.js';
import { readSlotsFor, type Lang } from './slots.js';

// '' is the home page; the others live in their own folder: /map/ → map/index.html
export const PAGES = ['', 'technology', 'map', 'projects', 'extras', 'invest', 'catalog'] as const;
// the catalog is a document for sending to clients (print / PDF): it repeats /projects/, so search engines skip it
const NOINDEX: readonly Page[] = ['catalog'];
export type Page = (typeof PAGES)[number];
export const isPage = (v: unknown): v is Page => PAGES.includes(v as Page);
const pagePath = (page: Page, lang: Lang) => (lang === 'ky' ? '/ky/' : '/') + (page ? page + '/' : '');
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { html: string; at: number }>();
const templates = new Map<string, string>();

export const invalidatePages = () => cache.clear();

export async function renderPage(lang: Lang, page: Page = ''): Promise<string> {
  const key = pagePath(page, lang);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.html;
  if (!templates.has(key)) templates.set(key, await readFile(path.join(config.siteDir, key, 'index.html'), 'utf8'));
  const [fields, materials, gallery, points, catalog] = await Promise.all([readContent(), readSlotsFor('materials', lang), readSlotsFor('gallery', lang), listPointsFor(lang), readCatalogFor(lang)]);
  const html = build(templates.get(key)!, lang, page, { ...fields, materials, gallery, points, ...catalog } as Content);
  cache.set(key, { html, at: Date.now() });
  return html;
}

type Slot = Record<string, string> | null;
type Content = Record<string, any> & {
  materials: Slot[]; gallery: Slot[]; points: { name: string; houses: number; area: number; lat: number; lon: number }[];
  projects: PageProject[]; cases: PageCase[]; rentals: PageRental[]; faq: { q: string; a: string }[];
  extras: { slug: string; name: string; lead: string; text: string; image: string | null; points: string[]; works: { image: string | null; title: string; note: string }[] }[];
};

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

function build(template: string, lang: Lang, page: Page, c: Content): string {
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
  // per m² of an open and a closed terrace; 0 — not set, that kind is not offered
  const terracePrice = { open: +c.price_terrace_open_m2 > 0 ? +c.price_terrace_open_m2 : 0, closed: +c.price_terrace_closed_m2 > 0 ? +c.price_terrace_closed_m2 : 0 };
  const deck = (m2: number, type?: string) => m2 * (type === 'closed' ? terracePrice.closed : terracePrice.open);

  /* ---- projects, cases, FAQ from the admin panel: the first card in each list is the template ---- */
  renderCatalog(document, lang, page, c, T, price, terracePrice);
  // blocks about the terrace stay hidden until a terrace price is set in the admin panel; the same for each kind
  // and for the company figures (years on the market, houses built) while they are empty
  const needs: Record<string, boolean> = { terrace: !!(terracePrice.open || terracePrice.closed), terrace_open: !!terracePrice.open, terrace_closed: !!terracePrice.closed,
    houses_built: +c.houses_built > 0, years_on_market: +c.years_on_market > 0, rentals: c.rentals.length > 0 };
  for (const e of $$('[data-needs]')) needs[e.dataset.needs] ? e.removeAttribute('hidden') : e.setAttribute('hidden', '');

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
  // small previews of the materials (home page)
  c.materials.forEach((m, i) => {
    if (m?.image) $$(`[data-mat="${i + 1}"]`).forEach(t => t.setAttribute('style', `--w:url("${m.image}")`));
  });
  for (const el of $$('[data-price]')) el.textContent = fill(T.priceFrom, { sum: money(+el.dataset.price * price + deck(+(el.dataset.terrace || 0), el.dataset.terraceType)) });
  const area = +($('#area')?.getAttribute('value') || 86);
  if ($('#calc-sum')) $('#calc-sum').textContent = money(area * price);
  if ($('#year')) $('#year').textContent = String(new Date().getFullYear());

  // map points as a list under the map (the same markup the page script draws): the map itself is drawn by a script,
  // the list gives the same facts to search engines and to visitors without JavaScript
  const list = $('#kg-list');
  if (list) {
    for (const p of [...c.points].sort((a, b) => b.houses - a.houses)) {
      const li = document.createElement('li');
      const add = (tag: string, t: string) => { const e = document.createElement(tag); e.textContent = t; li.append(e); };
      add('b', p.name); add('span', `${nf(p.houses)} ${plural(p.houses, T.map.houses)}`); add('span', `${nf(p.area)} ${T.map.area}`);
      list.append(li);
    }
  }

  /* ---- SEO head ---- */
  const site = config.siteUrl;
  const url = site + pagePath(page, lang);
  const months = numRu(c.build_months_avg) + ' ' + plural(+c.build_months_avg, T.seo.monthsUnit);
  const warranty = numRu(c.warranty_years) + ' ' + plural(+c.warranty_years, T.seo.yearsUnit);
  // the home page description carries the current price and terms; the inner pages keep the one written in their HTML
  const description = page ? $('meta[name="description"]')?.getAttribute('content') || '' : fill(T.seo.description, { price, months, warranty });
  const title = text($('title'));
  const ogImage = site + T.seo.ogImage;
  const head = document.head;
  const meta = (attrs: Record<string, string>) => { const m = document.createElement('meta'); for (const [k, v] of Object.entries(attrs)) m.setAttribute(k, v); head.append(m); };
  const link = (attrs: Record<string, string>) => { const l = document.createElement('link'); for (const [k, v] of Object.entries(attrs)) l.setAttribute(k, v); head.append(l); };

  $('meta[name="description"]')?.setAttribute('content', description);
  $$('link[rel="alternate"][hreflang]').forEach(l => l.remove());
  link({ rel: 'canonical', href: url });
  link({ rel: 'alternate', hreflang: 'ru', href: site + pagePath(page, 'ru') });
  link({ rel: 'alternate', hreflang: 'ky', href: site + pagePath(page, 'ky') });
  link({ rel: 'alternate', hreflang: 'x-default', href: site + pagePath(page, 'ru') });
  meta({ name: 'robots', content: NOINDEX.includes(page) ? 'noindex, follow' : 'index, follow, max-image-preview:large' });
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
        makesOffer: [...T.seo.services.map((name: string) => [name, price]), ...(terracePrice.open ? [[T.seo.terraceOpenService, terracePrice.open]] : []), ...(terracePrice.closed ? [[T.seo.terraceClosedService, terracePrice.closed]] : [])].map(([name, p]) => ({
          '@type': 'Offer', itemOffered: { '@type': 'Service', name, areaServed: { '@type': 'Country', name: T.seo.country } },
          priceSpecification: { '@type': 'UnitPriceSpecification', price: p, priceCurrency: 'USD', unitText: 'м²', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MTK' } },
        })),
      },
      { '@type': 'WebSite', '@id': site + '/#website', url: site + '/', name: T.seo.siteName, inLanguage: ['ru', 'ky'], publisher: { '@id': company } },
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, description, inLanguage: lang, isPartOf: { '@id': site + '/#website' }, about: { '@id': company }, primaryImageOfPage: ogImage,
        ...(page ? { breadcrumb: { '@id': url + '#breadcrumb' } } : {}) },
      // inner pages: Главная → this page, the names as in the breadcrumbs on the page
      ...(page ? [{ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
        { '@type': 'ListItem', position: 1, name: text($('.crumbs a')), item: site + pagePath('', lang) },
        { '@type': 'ListItem', position: 2, name: text($('.crumbs [aria-current]')), item: url },
      ] }] : []),
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
    s.textContent = stash(`window.aknietYM=${id};(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`);
    head.append(s);
  }
  return document.toString().replace(/\/\*@@script(\d+)@@\*\//g, (_, i) => bodies[+i]);
}

/* ---- lists from the admin panel ---- */
// {price} … in a FAQ answer → the same marked-up values as in the page (filled from the content right after)
const FAQ_UNITS: Record<Lang, Record<string, [string, string]>> = {
  ru: { '{months}': ['build_months_avg', 'месяц,месяца,месяцев'], '{months_min}': ['build_months_min', 'месяца,месяцев,месяцев,месяца'], '{warranty}': ['warranty_years', 'год,года,лет'] },
  ky: { '{months}': ['build_months_avg', 'ай,ай,ай'], '{months_min}': ['build_months_min', 'айдан,айдан,айдан'], '{warranty}': ['warranty_years', 'жыл,жыл,жыл'] },
};
const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const area = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU');

function renderCatalog(document: any, lang: Lang, page: Page, c: Content, T: any, price: number, terracePrice: { open: number; closed: number }) {
  const $ = (s: string): any => document.querySelector(s);
  const styleName = (p: { style: string }) => (p.style === 'af' ? 'A-frame' : 'Барнхаус'); // the form's radio values
  const styleLabel = (p: { style: string }) => T.words[styleName(p)] || styleName(p);
  const priceText = (p: PageProject) => fill(T.priceFrom, { sum: money(p.price || p.area * price + p.terrace * terracePrice[p.terrace_type]) });
  const setText = (root: any, sel: string, t: string) => { const e = root.querySelector(sel); if (e) e.textContent = t; };
  const setArea = (root: any, n: number) => {
    const e = root.querySelector('.area'); if (!e) return;
    const small = e.querySelector('small'); e.textContent = String(n); if (small) e.append(small);
  };
  // the card's price follows the price per m² (data-price) unless the project has its own price
  const setPrice = (root: any, p: PageProject) => {
    const b = root.querySelector('[data-price]'); if (!b) return;
    b.textContent = priceText(p);
    for (const a of ['data-price', 'data-terrace', 'data-terrace-type']) b.removeAttribute(a);
    if (!p.price) { b.setAttribute('data-price', String(p.area)); b.setAttribute('data-terrace', String(p.terrace)); b.setAttribute('data-terrace-type', p.terrace_type); }
  };
  const setImage = (root: any, sel: string, src: string | null, alt: string) => {
    const img = root.querySelector(sel); if (!img) return;
    if (src) img.setAttribute('src', src);
    img.setAttribute('alt', alt);
  };
  const fillList = <T>(list: any, items: T[], fillOne: (card: any, item: T) => void) => {
    if (!list) return;
    const tpl = list.firstElementChild; if (!tpl) return;
    const cards = items.map(item => { const card = tpl.cloneNode(true); fillOne(card, item); return card; });
    list.replaceChildren(...cards);
  };

  // short cards: on the home page the projects marked «на главной», on /invest/ all of them
  const up = page ? '../' : '';
  const shortCard = (card: any, p: PageProject) => {
    card.setAttribute('href', up + 'projects/#' + p.slug);
    setImage(card, 'img', p.image, `${styleLabel(p)} «${p.name}»`);
    setText(card, '.pimg .chip', styleLabel(p));
    setText(card, 'h3', `«${p.name}»`);
    setArea(card, p.area); setPrice(card, p);
  };
  const home = $('[data-list="home-projects"]');
  const onHome = c.projects.filter(p => p.on_home);
  if (home && !onHome.length) home.closest('section')?.remove();
  else fillList(home, onHome, shortCard);
  const rent = $('[data-list="rent-projects"]');
  if (rent && !c.projects.length) rent.closest('section')?.remove();
  else fillList(rent, c.projects, shortCard);

  // catalog for clients (/catalog/): a page per project; the plans are drawn by the page script from #cms
  const specs = (p: PageProject) => [`${p.area} ${T.m2}`, p.beds, p.baths, p.floors, p.terrace ? `${area(p.terrace)} ${T.m2}, ${T.terraceKind[p.terrace_type]}` : T.noTerrace];
  const roomsHTML = (p: PageProject) => p.plan.map(f => (p.plan.length > 1 ? `<li class="fl">${esc(f.name)}</li>` : '')
    + f.rooms.map(r => `<li><span>${esc(r.name)}</span><span>${area(r.w * r.h)} ${T.m2}</span></li>`).join('')).join('');
  fillList($('[data-list="catalog"]'), c.projects, (card, p) => {
    card.setAttribute('id', p.slug);
    setImage(card, '.doc-img', p.image, `${styleLabel(p)} «${p.name}»`);
    setText(card, '.chip', styleLabel(p));
    setText(card, 'h2', `«${p.name}»`);
    setPrice(card, p);
    const dd = card.querySelectorAll('.doc-specs dd');
    specs(p).forEach((v, i) => dd[i] && (dd[i].textContent = String(v)));
    setText(card, '.doc-text', p.text);
    const rooms = card.querySelector('.doc-rooms'); if (rooms) rooms.innerHTML = roomsHTML(p);
    card.querySelector('[data-plans]')?.setAttribute('data-plans', p.slug);
  });

  // daily-rent examples (/invest/): the figures the admin gave, income and payback counted here
  fillList($('[data-list="rentals"]'), c.rentals, (card, r) => {
    setImage(card, '.pimg img', r.image, r.title);
    setText(card, '.pimg .chip', r.place);
    const eyebrow = card.querySelector('.eyebrow');
    if (r.project) eyebrow.textContent = `${styleLabel(r.project)} «${r.project.name}»`; else eyebrow.remove();
    setText(card, 'h3', r.title);
    const I = T.invest, income = r.nights ? r.price_night * r.nights : 0;
    const years = r.invest && income ? Math.round(r.invest / income * 10) / 10 : 0;
    const nightsBack = r.invest ? Math.ceil(r.invest / r.price_night) : 0;
    const facts: Record<string, string | null> = {
      area: r.area ? `${area(r.area)} ${T.m2}` : null,
      price: money(r.price_night),
      nights: r.nights ? `${r.nights} ${plural(r.nights, I.nights)}` : null,
      income: income ? money(income) : null,
      invest: r.invest ? money(r.invest) : null,
      payback: years ? `≈ ${numRu(years)} ${plural(years, I.years)}` : nightsBack ? `${nightsBack.toLocaleString('ru-RU')} ${plural(nightsBack, I.days)}` : null,
    };
    for (const [k, v] of Object.entries(facts)) {
      const box = card.querySelector(`[data-f="${k}"]`); if (!box) continue;
      if (v === null) box.remove(); else box.querySelector('dd').textContent = v;
    }
    const story = card.querySelector('.body > p');
    if (r.story) story.textContent = r.story; else story.remove();
  });

  // projects page: detailed cards
  fillList($('[data-list="projects"]'), c.projects, (card, p) => {
    card.setAttribute('id', p.slug); card.setAttribute('data-style', p.style);
    setImage(card, '.pd-img img', p.image, `${styleLabel(p)} «${p.name}»`);
    setText(card, '.pd-img .chip', styleLabel(p));
    setText(card, 'h3', `«${p.name}»`);
    setArea(card, p.area);
    setText(card, '.pd-text', p.text);
    const dd = card.querySelectorAll('.pd-specs dd');
    [p.beds, p.baths, p.floors, p.terrace ? `${area(p.terrace)} ${T.m2}, ${T.terraceKind[p.terrace_type]}` : T.noTerrace].forEach((v, i) => dd[i] && (dd[i].textContent = String(v)));
    const rooms = card.querySelector('.pd-rooms');
    if (rooms) rooms.innerHTML = p.plan.map(f => (p.plan.length > 1 ? `<li class="fl">${esc(f.name)}</li>` : '')
      + f.rooms.map(r => `<li><span>${esc(r.name)}</span><span>${area(r.w * r.h)} ${T.m2}</span></li>`).join('')).join('');
    setPrice(card, p);
    card.querySelector('[data-plan]')?.setAttribute('data-plan', p.slug);
    card.querySelector('[data-lead]')?.setAttribute('data-lead', JSON.stringify({ type: styleName(p), project: `«${p.name}»`, area: p.area, ...(p.terrace ? { terrace: Math.round(p.terrace), terrace_type: p.terrace_type } : {}) }));
  });

  // cases
  const cases = $('[data-list="cases"]');
  if (cases && !c.cases.length) cases.closest('section')?.remove();
  else fillList(cases, c.cases, (card, k) => {
    setImage(card, '.pimg img', k.image, k.title);
    setText(card, '.pimg .chip', k.region);
    const eyebrow = card.querySelector('.eyebrow'), more = card.querySelector('.more-link');
    if (k.project) {
      eyebrow.textContent = `${styleLabel(k.project)} «${k.project.name}»`;
      more.setAttribute('href', '#' + k.project.slug);
    } else { eyebrow.remove(); more.remove(); }
    setText(card, 'h3', k.title);
    const dd = card.querySelectorAll('.case-facts dd');
    [k.area, k.term, k.season].forEach((v, i) => dd[i] && (dd[i].textContent = v));
    setText(card, '.body > p', k.story);
  });

  // extras: cards on the home page, sections and their links on /extras/
  const homeExtras = $('[data-list="home-extras"]');
  if (homeExtras && !c.extras.length) homeExtras.closest('section')?.remove();
  else fillList(homeExtras, c.extras, (card, x) => {
    card.setAttribute('href', 'extras/#' + x.slug);
    setImage(card, 'img', x.image, x.name);
    setText(card, 'h3', x.name); setText(card, 'p', x.lead);
  });
  fillList($('[data-list="extras-links"]'), c.extras, (a, x) => { a.setAttribute('href', '#' + x.slug); a.textContent = x.name; });
  fillList($('[data-list="extras"]'), c.extras, (sec, x) => {
    sec.setAttribute('id', x.slug);
    setImage(sec, '.ex-cover img', x.image, x.name);
    setText(sec, 'h2', x.name); setText(sec, '.ex-text', x.text);
    const ul = sec.querySelector('.ex-points');
    if (x.points.length) ul.innerHTML = x.points.map(p => `<li>${esc(p)}</li>`).join(''); else ul.remove();
    sec.querySelector('[data-lead]')?.setAttribute('data-lead', JSON.stringify({ type: 'Нужен совет', project: x.name }));
    const works = sec.querySelector('.ex-works');
    if (!x.works.length) works.remove();
    else fillList(works, x.works, (w, it) => { setImage(w, 'img', it.image, it.title); setText(w, 'b', it.title); setText(w, 'span', it.note); });
  });

  // FAQ
  const faq = $('[data-list="faq"]');
  if (faq) {
    const tpl = faq.querySelector('details'), more = faq.querySelector('.faq-more');
    faq.querySelectorAll('details').forEach((d: any) => d.remove());
    const units = FAQ_UNITS[lang];
    for (const item of c.faq) {
      // a question about a terrace whose price is not set is not shown
      if ((!terracePrice.open && /\{terrace_open_price\}/.test(item.a)) || (!terracePrice.closed && /\{terrace_closed_price\}/.test(item.a))) continue;
      const d = tpl.cloneNode(true), sum = d.querySelector('summary'), icon = sum.querySelector('i');
      sum.textContent = item.q; sum.append(icon);
      d.querySelector('.a').innerHTML = esc(item.a).replace(/\{(price|terrace_open_price|terrace_closed_price|months|months_min|warranty)\}/g, (t: string) =>
        t === '{price}' ? '$<span data-cms="price_m2">440</span>' : t === '{terrace_open_price}' ? '$<span data-cms="price_terrace_open_m2"></span>' : t === '{terrace_closed_price}' ? '$<span data-cms="price_terrace_closed_m2"></span>'
          : `<span data-cms="${units[t][0]}" data-unit="${units[t][1]}"></span>`);
      faq.insertBefore(d, more);
    }
  }

  // calculator: «Как в проектах» buttons are the project areas
  const presets = $('[data-list="presets"]');
  if (presets && c.projects.length) {
    const tpl = presets.querySelector('button');
    presets.querySelectorAll('button').forEach((b: any) => b.remove());
    for (const a of [...new Set(c.projects.map(p => p.area))].sort((x, y) => x - y).slice(0, 6)) {
      const b = tpl.cloneNode(true); b.setAttribute('data-area', String(a)); b.textContent = `${a} ${T.m2}`;
      // the preset also sets the terrace of that project
      const p = c.projects.find(x => x.area === a)!;
      b.setAttribute('data-terrace', String(Math.round(p.terrace))); b.setAttribute('data-terrace-type', p.terrace_type);
      presets.append(b);
    }
  }
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
  const url = (page: Page, lang: Lang) => {
    const alt = `<xhtml:link rel="alternate" hreflang="ru" href="${site}${pagePath(page, 'ru')}"/><xhtml:link rel="alternate" hreflang="ky" href="${site}${pagePath(page, 'ky')}"/><xhtml:link rel="alternate" hreflang="x-default" href="${site}${pagePath(page, 'ru')}"/>`;
    return `<url><loc>${site}${pagePath(page, lang)}</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>${page ? '0.8' : '1.0'}</priority>${alt}</url>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.filter(page => !NOINDEX.includes(page)).flatMap(page => [url(page, 'ru'), url(page, 'ky')]).join('\n')}
</urlset>
`;
}
