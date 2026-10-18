/* Shared script of all pages. Every block checks that its section is on the page: the calculator lives on the home
   page, the map on /map/, the floor plans on /projects/, the form at the bottom of every page. */
(() => {
  const $id = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const hasGsap = !!window.gsap;
  $id('year').textContent = new Date().getFullYear();
  // UI strings of the current language (#i18n); fill('от {sum}', { sum }) → «от $18 920»
  const T = JSON.parse($id('i18n').textContent);
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const word = s => T.words[s] || s;
  const priceFrom = sum => fill(T.priceFrom, { sum });

  /* ---- smooth scroll ---- */
  let lenis = null;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    if (hasGsap) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
    else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  }
  const scrollTo = target => lenis ? lenis.scrollTo(target, { duration: 1.4, offset: -90 }) : document.querySelector(target)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href'); if (id.length < 2) return;
    if (!document.querySelector(id)) return;
    e.preventDefault(); closeMenu(); closePlan(); scrollTo(id);
  }));

  /* ---- intro: the hero text animates in CSS; the 3D scene starts its camera move now ---- */
  window.aknietIntroAt = performance.now();
  window.dispatchEvent(new Event('akniet:intro'));

  /* ---- header hide on scroll ---- */
  const header = $id('header'); let lastY = 0;
  const onScroll = y => { header.classList.toggle('hidden', y > lastY && y > 500 && !document.body.classList.contains('menu-open')); lastY = y; };
  lenis ? lenis.on('scroll', e => onScroll(e.scroll)) : addEventListener('scroll', () => onScroll(scrollY), { passive: true });

  /* ---- mobile menu sheet ---- */
  const menuBtn = $id('menu-btn');
  function closeMenu() { document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open); menuBtn.setAttribute('aria-expanded', String(open));
  });
  addEventListener('keydown', e => e.key === 'Escape' && closeMenu());

  /* ---- cursor ---- */
  if (fine && !reduce) {
    const c = $id('cursor'), ring = c.querySelector('.ring');
    document.documentElement.classList.add('has-cursor');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    const loop = () => { rx += (mx - rx) * 0.22; ry += (my - ry) * 0.22; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); };
    loop();
    document.addEventListener('mouseover', e => {
      const v = e.target.closest('[data-cursor="view"]'), h = e.target.closest('a,button,label,input,textarea,summary,.tile');
      c.classList.toggle('view', !!v); c.classList.toggle('hover', !v && !!h);
    });
  }

  /* ---- form ---- */
  const form = $id('form');
  let prefill = () => {};
  if (form) {
    const phone = $id('phone'), nameIn = $id('name');
    // +996 500 20 84 87 — Kyrgyz numbers get grouped, foreign ones are left as typed
    const fmtPhone = v => {
      let d = v.replace(/\D/g, ''); if (!d) return '';
      if (d.startsWith('0')) d = '996' + d.slice(1);
      if (!d.startsWith('996')) return '+' + d.slice(0, 15);
      d = d.slice(0, 12);
      return '+' + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean).join(' ');
    };
    const phoneOk = () => { const d = phone.value.replace(/\D/g, ''); return d.startsWith('996') ? d.length === 12 : d.length >= 10; };
    const nameOk = () => nameIn.value.trim().length > 1;
    phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+996 '; });
    phone.addEventListener('blur', () => { if (phone.value.replace(/\D/g, '') === '996') phone.value = ''; });
    phone.addEventListener('input', () => { phone.value = fmtPhone(phone.value); if (phoneOk()) $id('f-phone').classList.remove('invalid'); });
    nameIn.addEventListener('input', () => nameOk() && $id('f-name').classList.remove('invalid'));
    const SENT = T.sent;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const okN = nameOk(), okP = phoneOk();
      $id('f-name').classList.toggle('invalid', !okN);
      $id('f-phone').classList.toggle('invalid', !okP);
      if (!okN || !okP) return form.querySelector('.invalid input').focus();
      // заявка: { project, area, name, phone, type, via, msg, website(honeypot) } → backend → БД + Telegram
      const lead = { ...Object.fromEntries(new FormData(form)), lang: document.documentElement.lang }, btn = form.querySelector('button[type="submit"]'), err = $id('form-err');
      const done = () => { $id('sent-title').textContent = SENT[lead.via] || SENT['Звонок']; form.classList.add('sent'); };
      if (location.protocol === 'file:') return done(); // local preview without a server
      btn.disabled = true; err.hidden = true;
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
        .then(r => { if (!r.ok) throw new Error(r.status); done(); })
        .catch(() => { err.hidden = false; })
        .finally(() => { btn.disabled = false; });
    });

    /* ---- prefill the form from projects / calculator ---- */
    const pick = $id('pick'), pickText = $id('pick-text');
    const fProject = $id('f-project'), fArea = $id('f-area'), fTerrace = $id('f-terrace');
    prefill = d => {
      const r = d.type && form.querySelector(`input[name="type"][value="${d.type}"]`); if (r) r.checked = true;
      fProject.value = d.project || ''; fArea.value = d.area || ''; fTerrace.value = d.terrace || '';
      const t = [d.project, d.area && d.area + ' ' + T.m2 + (d.terrace ? fill(T.plusTerrace, { n: d.terrace }) : ''), d.price].filter(Boolean).join(' · ');
      pickText.textContent = t; pick.hidden = !t;
      form.classList.remove('sent');
      if (fine) setTimeout(() => nameIn.focus({ preventScroll: true }), lenis ? 1400 : 600);
    };
    $id('pick-x').addEventListener('click', () => { fProject.value = fArea.value = fTerrace.value = ''; pick.hidden = true; });
    document.addEventListener('click', e => { const a = e.target.closest('[data-lead]'); if (a) prefill(JSON.parse(a.dataset.lead)); });
  }

  const money = n => '$' + n.toLocaleString('ru-RU');
  // the terrace has its own price per m²; 0 — not set in the admin panel, the terrace is not offered
  let PRICE_M2 = 440, TERRACE_M2 = 0;

  /* ---- price calculator ---- */
  const area = $id('area'), terrace = $id('terrace'), presets = document.querySelectorAll('.presets button');
  const slider = (el, out, text) => {
    out.value = el.value + ' ' + T.m2;
    el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
    el.setAttribute('aria-valuetext', text);
  };
  function calc() {
    if (!area) return;
    const checked = document.querySelector('input[name="cstyle"]:checked'), style = checked.value, styleLabel = document.querySelector(`label[for="${checked.id}"]`).textContent;
    const a = +area.value, t = TERRACE_M2 && terrace ? +terrace.value : 0;
    const house = a * PRICE_M2, deck = t * TERRACE_M2, sum = money(house + deck);
    slider(area, $id('area-out'), fill(T.areaText, { n: a }));
    if (terrace) slider(terrace, $id('terrace-out'), t ? fill(T.areaText, { n: t }) : T.terraceNone);
    $id('calc-sum').textContent = sum;
    $id('calc-style').textContent = styleLabel;
    $id('calc-area').textContent = a;
    const split = $id('calc-split');
    if (split) { split.hidden = !t; split.textContent = t ? fill(T.calcSplit, { house: money(house), n: t, terrace: money(deck) }) : ''; }
    presets.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.area === a && (!TERRACE_M2 || +(b.dataset.terrace || 0) === t))));
    $id('calc-go').dataset.lead = JSON.stringify({ type: style, project: fill(T.calcProject, { style: styleLabel }), area: a, ...(t ? { terrace: t } : {}), price: priceFrom(sum) });
  }
  if (area) {
    area.addEventListener('input', calc);
    terrace?.addEventListener('input', calc);
    document.querySelectorAll('input[name="cstyle"]').forEach(r => r.addEventListener('change', calc));
    presets.forEach(b => b.addEventListener('click', () => { area.value = b.dataset.area; if (terrace && b.dataset.terrace) terrace.value = b.dataset.terrace; calc(); }));
    calc();
  }

  /* ---- projects: filter ---- */
  // TODO: демо-кейсы — заменить на реальные типовые проекты
  const filterBtns = document.querySelectorAll('.filter button');
  function setFilter(f) {
    filterBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    document.querySelectorAll('[data-style]').forEach(c => {
      const show = f === 'all' || c.dataset.style === f;
      c.classList.toggle('off', !show);
      if (show) { c.classList.add('in'); if (hasGsap && !reduce) gsap.fromTo(c, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'opacity,transform' }); }
    });
    if (hasGsap) ScrollTrigger.refresh();
  }
  filterBtns.forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));

  /* ---- projects: floor plans ---- */
  // The projects come from the admin panel (#cms → projects, the server puts them there); this copy of the stock
  // projects is for a static page without the server. Drawing: assets/plan.js
  let PROJECTS = [{"id":1,"slug":"tau","style":"af","name":"Тау","area":43,"beds":1,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":6,"h":5.5,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":3.5,"name":"Кухня-гостиная"},{"x":0,"y":3.5,"w":2.4,"h":2,"name":"Санузел"},{"x":2.4,"y":3.5,"w":3.6,"h":2,"name":"Прихожая"},{"x":0,"y":5.5,"w":6,"h":2,"name":"Терраса","terrace":true}]},{"name":"Антресоль","w":6,"h":5.5,"void":[0,0,6,3.8],"image":null,"rooms":[{"x":0,"y":3.8,"w":6,"h":1.7,"name":"Спальня"}]}],"terrace":12},{"id":2,"slug":"karagay","style":"af","name":"Карагай","area":68,"beds":2,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":7,"h":7,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":7,"h":4,"name":"Кухня-гостиная"},{"x":0,"y":4,"w":3.5,"h":3,"name":"Спальня"},{"x":3.5,"y":4,"w":2,"h":3,"name":"Санузел"},{"x":5.5,"y":4,"w":1.5,"h":3,"name":"Вход"},{"x":0,"y":7,"w":7,"h":2.5,"name":"Терраса","terrace":true}]},{"name":"2 этаж","w":7,"h":7,"void":[0,0,7,4.3],"image":null,"rooms":[{"x":0,"y":4.3,"w":7,"h":2.7,"name":"Спальня 2"}]}],"terrace":17.5},{"id":3,"slug":"jailoo","style":"barn","name":"Жайлау","area":86,"beds":2,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":12,"h":7.2,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":7.2,"name":"Кухня-гостиная"},{"x":6,"y":0,"w":3.4,"h":4,"name":"Спальня"},{"x":9.4,"y":0,"w":2.6,"h":4,"name":"Спальня 2"},{"x":6,"y":4,"w":2.2,"h":3.2,"name":"Холл"},{"x":8.2,"y":4,"w":2,"h":3.2,"name":"Санузел"},{"x":10.2,"y":4,"w":1.8,"h":3.2,"name":"Постирочная"},{"x":0,"y":7.2,"w":6,"h":2.5,"name":"Терраса","terrace":true}]}],"terrace":15},{"id":4,"slug":"alatoo","style":"barn","name":"Ала-Тоо","area":120,"beds":3,"baths":2,"price":null,"plan":[{"name":"1 этаж","w":10,"h":7,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":7,"name":"Кухня-гостиная"},{"x":6,"y":0,"w":4,"h":3.6,"name":"Спальня"},{"x":6,"y":3.6,"w":2,"h":3.4,"name":"Санузел"},{"x":8,"y":3.6,"w":2,"h":3.4,"name":"Прихожая"},{"x":0,"y":7,"w":6,"h":3,"name":"Терраса","terrace":true}]},{"name":"2 этаж","w":10,"h":7,"void":[0,5,10,2],"image":null,"rooms":[{"x":0,"y":0,"w":3.6,"h":3.4,"name":"Спальня 2"},{"x":3.6,"y":0,"w":2.8,"h":5,"name":"Холл"},{"x":6.4,"y":0,"w":3.6,"h":3.4,"name":"Спальня 3"},{"x":0,"y":3.4,"w":3.6,"h":1.6,"name":"Санузел 2"},{"x":6.4,"y":3.4,"w":3.6,"h":1.6,"name":"Гардероб"}]}],"terrace":18}];
  const projectBy = slug => PROJECTS.find(p => p.slug === slug);
  const styleName = p => p.style === 'af' ? 'A-frame' : 'Барнхаус'; // the form's radio values
  const projectPrice = p => money(p.price || p.area * PRICE_M2 + (p.terrace || 0) * TERRACE_M2);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const m2 = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  const planHTML = f => window.AknietPlan.html({ ...f, rooms: f.rooms.map(r => ({ ...r, name: word(r.name) })) },
    { m: T.m, m2: T.m2, secondLight: T.secondLight, label: fill(T.scheme, { floor: word(f.name) }) });
  // the dialog sits in the top layer, so the custom cursor moves inside it while it is open
  const cursorEl = $id('cursor');
  const plan = $id('plan'), planSvg = plan?.querySelector('.plan-svg'), floorsEl = plan?.querySelector('.floors');
  function showFloor(p, i) {
    planSvg.innerHTML = planHTML(p.plan[i]);
    floorsEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  function openPlan(slug) {
    const p = projectBy(slug); if (!p) return;
    const price = projectPrice(p);
    plan.querySelector('.plan-style').textContent = word(styleName(p));
    plan.querySelector('#plan-title').textContent = `«${p.name}» · ${p.area} ${T.m2}`;
    plan.querySelector('.plan-specs').innerHTML = [[T.specs[0], p.area + ' ' + T.m2], [T.specs[1], p.beds], [T.specs[2], p.baths], ...(p.terrace ? [[T.specs[3], m2(p.terrace) + ' ' + T.m2]] : [])].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    plan.querySelector('.plan-rooms').innerHTML = p.plan.map(f => (p.plan.length > 1 ? `<li class="fl">${esc(word(f.name))}</li>` : '') + f.rooms.map(r => `<li><span>${esc(word(r.name))}</span><span>${m2(r.w * r.h)} ${T.m2}</span></li>`).join('')).join('');
    plan.querySelector('.plan-price b').textContent = priceFrom(price);
    plan.querySelector('.plan-go').dataset.lead = JSON.stringify({ type: styleName(p), project: `«${p.name}»`, area: p.area, ...(p.terrace ? { terrace: Math.round(p.terrace) } : {}), price: priceFrom(price) });
    floorsEl.innerHTML = p.plan.length > 1 ? p.plan.map(f => `<button type="button">${esc(word(f.name))}</button>`).join('') : '';
    floorsEl.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => showFloor(p, i)));
    showFloor(p, 0);
    plan.showModal(); plan.append(cursorEl); lenis?.stop(); document.documentElement.style.overflow = 'hidden';
  }
  // 'close' fires async, so unlock scrolling right away — a link inside the dialog scrolls next
  const unlock = () => { document.body.append(cursorEl); lenis?.start(); document.documentElement.style.overflow = ''; };
  const closePlan = () => { if (plan?.open) { plan.close(); unlock(); } };
  if (plan) {
    plan.addEventListener('close', unlock);
    plan.addEventListener('click', e => { if (e.target === plan) closePlan(); });
    plan.querySelector('.plan-close').addEventListener('click', closePlan);
    document.addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (b) openPlan(b.dataset.plan); });
  }

  /* ---- content from the admin panel (GET /api/content); the HTML keeps the defaults ---- */
  // data-price="43" — a project of 43 m², its price follows the price per m² from the admin
  const syncProjectPrices = () => document.querySelectorAll('[data-price]').forEach(el => { el.textContent = priceFrom(money(+el.dataset.price * PRICE_M2 + +(el.dataset.terrace || 0) * TERRACE_M2)); });
  // data-unit="one,few,many[,fraction]": 1 год · 3 года · 5 лет; a fraction takes the 4th form or "few" (1,5 месяца).
  // After «от» the case changes, so those spans list genitive forms: от 1 месяца · от 2 месяцев
  const plural = (n, forms) => { const [one, few, many, frac = few] = forms.split(','); if (!Number.isInteger(n)) return frac; const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
  const numRu = n => String(n).replace('.', ',');
  const digits = v => String(v).replace(/\D/g, '');
  // contact values as shown in the HTML; their text is swapped inside every [data-contact] link
  const CONTACT_DEFAULTS = { phone: '+996 500 20 84 87', whatsapp: '+996 500 20 84 87', telegram: '+996 500 20 84 87', email: 'akniethome305@gmail.com' };
  const contactHref = {
    phone: v => 'tel:+' + digits(v),
    whatsapp: v => 'https://wa.me/' + digits(v),
    telegram: v => /^[+\d\s()-]+$/.test(v) ? 'https://t.me/+' + digits(v) : 'https://t.me/' + v.replace(/^@/, ''),
    email: v => 'mailto:' + v,
    instagram: v => v, tiktok: v => v, threads: v => v,
  };
  // 2GIS route to the office; the start point is the visitor's location
  const routeUrl = (lat, lon) => `https://2gis.kg/bishkek/directions/points/%7C${(+lon).toFixed(6)}%2C${(+lat).toFixed(6)}`;
  function swapText(el, from, to) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) if (n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
  }
  function applyContent(c) {
    document.querySelectorAll('[data-cms]').forEach(el => {
      const v = c[el.dataset.cms]; if (v === null || v === undefined || v === '' || typeof v !== 'number') return;
      if (el.classList.contains('count')) el.dataset.to = v;
      el.textContent = el.dataset.unit ? numRu(v) + ' ' + plural(+v, el.dataset.unit) : numRu(v);
      el.classList.remove('ph'); el.removeAttribute('title');
    });
    document.querySelectorAll('[data-cms-unit]').forEach(el => { const v = c[el.dataset.cmsUnit]; if (v !== null && v !== undefined && v !== '') el.textContent = plural(+v, el.dataset.unit); });
    if (+c.price_m2 > 0) PRICE_M2 = +c.price_m2;
    TERRACE_M2 = +c.price_terrace_m2 > 0 ? +c.price_terrace_m2 : 0;
    document.querySelectorAll('[data-needs="price_terrace_m2"]').forEach(e => { e.hidden = !TERRACE_M2; });
    calc(); syncProjectPrices();

    const lang = document.documentElement.lang;
    const addr = (lang === 'ky' && c.address_ky) || c.address;
    if (addr) document.querySelectorAll('[data-cms="address"]').forEach(e => e.textContent = addr);
    if (c.work_days && c.work_from && c.work_to) document.querySelectorAll('[data-cms="hours"]').forEach(e => e.textContent = `${T.days[c.work_days] || c.work_days}, ${c.work_from}–${c.work_to}`);
    if (c.office_lat && c.office_lon) document.querySelectorAll('[data-contact="route"]').forEach(a => a.href = routeUrl(c.office_lat, c.office_lon));
    document.querySelectorAll('[data-contact]').forEach(a => {
      const key = a.dataset.contact, v = c[key]; if (!v || !contactHref[key]) return;
      a.href = contactHref[key](v);
      if (CONTACT_DEFAULTS[key]) swapText(a, CONTACT_DEFAULTS[key], key === 'telegram' && !/^[+\d\s()-]+$/.test(v) ? '@' + v.replace(/^@/, '') : v);
    });

    // materials and gallery: numbered slots, an empty field keeps the stock card
    (c.materials || []).forEach((m, i) => {
      const t = m && document.querySelector(`.tile[data-slot="${i + 1}"]`); if (!t) return;
      if (m.image) t.style.setProperty('--w', `url("${m.image}")`);
      if (m.kind) t.querySelector('.kind').textContent = m.kind;
      if (m.title) t.querySelector('.lab b').textContent = m.title;
      if (m.subtitle) t.querySelector('.lab span').textContent = m.subtitle;
    });
    // small previews of the same materials (home page)
    (c.materials || []).forEach((m, i) => { if (m?.image) document.querySelectorAll(`[data-mat="${i + 1}"]`).forEach(t => t.style.setProperty('--w', `url("${m.image}")`)); });
    (c.gallery || []).forEach((g, i) => {
      const f = g && document.querySelector(`.shot[data-slot="${i + 1}"]`); if (!f) return;
      const img = f.querySelector('img');
      if (g.image) img.src = g.image;
      if (g.caption) { f.querySelector('.chip').textContent = g.caption; img.alt = g.caption; }
    });
    if (c.projects) PROJECTS = c.projects;
    if (c.points) { mapPoints = c.points; kgMap?.setPoints(mapPoints); drawList(); }
    if (hasGsap) ScrollTrigger.refresh();
  }
  /* ---- map of Kyrgyzstan: its scripts and relief load when the section gets close ---- */
  const mapEl = $id('kg-map'), listEl = $id('kg-list'); let kgMap = null, mapPoints = [];
  const nf = n => Number(n).toLocaleString('ru-RU');
  function mapCard(p) {
    const box = document.createElement('div'), stat = (num, label) => { const d = document.createElement('div'), b = document.createElement('strong'), sp = document.createElement('span'); b.textContent = num; sp.textContent = label; d.append(b, sp); return d; };
    const name = document.createElement('b'); name.textContent = p.name;
    const stats = document.createElement('div'); stats.className = 'kg-stats';
    stats.append(stat(nf(p.houses), plural(+p.houses, T.map.houses)), stat(nf(p.area), T.map.area));
    box.append(name, stats);
    return box;
  }
  // the same places as a list under the map: easier to read on a phone
  function drawList() {
    if (!listEl) return;
    listEl.replaceChildren(...[...mapPoints].sort((a, b) => b.houses - a.houses).map(p => {
      const li = document.createElement('li'), b = document.createElement('b'), h = document.createElement('span'), a = document.createElement('span');
      b.textContent = p.name; h.textContent = nf(p.houses) + ' ' + plural(+p.houses, T.map.houses); a.textContent = nf(p.area) + ' ' + T.map.area;
      li.append(b, h, a);
      return li;
    }));
  }
  const loadScript = src => new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = fail; document.head.append(sc); });
  if (mapEl) new IntersectionObserver(async ([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    try { await loadScript(mapEl.dataset.geo); await loadScript(mapEl.dataset.engine); } catch { return; }
    kgMap = window.AknietMap(mapEl, { lang: document.documentElement.lang, relief: mapEl.dataset.relief, text: { zoomIn: T.map.zoomIn, zoomOut: T.map.zoomOut, card: mapCard } });
    kgMap.setPoints(mapPoints);
  }, { rootMargin: '700px 0px' }).observe(mapEl);

  // server-rendered page: the content is already in the HTML and in #cms; a static copy asks the API
  const embedded = $id('cms');
  if (embedded) applyContent(JSON.parse(embedded.textContent));
  else if (location.protocol !== 'file:') fetch('/api/content?lang=' + document.documentElement.lang).then(r => r.ok ? r.json() : null).then(c => c && applyContent(c)).catch(() => {});

  /* ---- FAQ: 4 questions, the rest behind «Показать ещё» ---- */
  const faqBox = document.querySelector('.faq'), faqMore = $id('faq-more');
  if (faqBox && faqMore && faqBox.querySelectorAll('details').length > 4) {
    faqBox.classList.add('short'); faqMore.hidden = false;
    faqMore.addEventListener('click', () => {
      const open = faqBox.classList.toggle('short') === false;
      faqMore.setAttribute('aria-expanded', String(open));
      faqMore.querySelector('span').textContent = open ? T.faqLess : T.faqMore;
      if (open) faqBox.querySelectorAll('details')[4].querySelector('summary').focus({ preventScroll: true });
      else scrollTo('#faq');
      if (hasGsap) ScrollTrigger.refresh();
    });
  }

  /* ---- metal frame scheme draws itself once in view ---- */
  const frameSvg = $id('frame-svg');
  if (frameSvg) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { frameSvg.classList.add('drawn'); o.disconnect(); } }, { threshold: 0.35 }).observe(frameSvg);

  /* ---- nav: highlight the section in view ---- */
  const navLinks = [...document.querySelectorAll('.header nav a[href^="#"], .sheet > a[href^="#"]')];
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => { const on = a.getAttribute('href') === '#' + e.target.id; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'); });
  }), { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach(s => spy.observe(s));

  /* ---- mobile quick-contact bar: after the hero, hidden at the contact form ---- */
  const mbar = $id('mbar'), contact = $id('contact'); let pastHero = false, atContact = false;
  const syncBar = () => mbar.classList.toggle('show', pastHero && !atContact);
  new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; syncBar(); }).observe(document.querySelector('.hero, .page-hero'));
  if (contact) new IntersectionObserver(([e]) => { atContact = e.isIntersecting; syncBar(); }, { threshold: 0.15 }).observe(contact);

  if (!hasGsap || reduce) {
    document.documentElement.classList.add('static');
    document.querySelectorAll('.step').forEach(s => s.classList.add('active'));
    return;
  }

  /* ---- GSAP: cards pop in batches ---- */
  ScrollTrigger.batch('.rv', { start: 'top 90%', onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07, overwrite: true,
    onComplete: () => els.forEach(el => { el.classList.add('in'); gsap.set(el, { clearProps: 'opacity,transform' }); }) }) });

  // count-up numbers
  document.querySelectorAll('.count').forEach(el => {
    const pad = el.textContent.length, o = { v: 0 };
    // read data-to on enter: the admin content may have changed it after load
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => {
      const to = +el.dataset.to, frac = !Number.isInteger(to); // e.g. 1,5 months from the admin
      gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => el.textContent = frac ? o.v.toFixed(1).replace('.', ',') : String(Math.round(o.v)).padStart(pad, '0') });
    } });
  });

  // process: line + steps light up
  const steps = gsap.utils.toArray('.step');
  if (steps.length) ScrollTrigger.create({ trigger: '#steps', start: 'top 80%', end: 'bottom 55%', scrub: true,
    onUpdate: self => { gsap.set('#track-line', { scaleX: self.progress }); steps.forEach((s, i) => s.classList.toggle('active', self.progress >= i / (steps.length - 1) - 0.02)); } });

  // gallery rail drifts with scroll
  if ($id('rail-a')) gsap.fromTo('#rail-a', { x: () => 0 }, { x: () => -($id('rail-a').scrollWidth - innerWidth), ease: 'none', scrollTrigger: { trigger: '.gallery', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });

  addEventListener('load', () => ScrollTrigger.refresh());
})();
