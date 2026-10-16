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
    const fProject = $id('f-project'), fArea = $id('f-area');
    prefill = d => {
      const r = d.type && form.querySelector(`input[name="type"][value="${d.type}"]`); if (r) r.checked = true;
      fProject.value = d.project || ''; fArea.value = d.area || '';
      const t = [d.project, d.area && d.area + ' ' + T.m2, d.price].filter(Boolean).join(' · ');
      pickText.textContent = t; pick.hidden = !t;
      form.classList.remove('sent');
      if (fine) setTimeout(() => nameIn.focus({ preventScroll: true }), lenis ? 1400 : 600);
    };
    $id('pick-x').addEventListener('click', () => { fProject.value = fArea.value = ''; pick.hidden = true; });
    document.addEventListener('click', e => { const a = e.target.closest('[data-lead]'); if (a) prefill(JSON.parse(a.dataset.lead)); });
  }

  const money = n => '$' + n.toLocaleString('ru-RU');
  let PRICE_M2 = 440;

  /* ---- price calculator ---- */
  const area = $id('area'), presets = document.querySelectorAll('.presets button');
  function calc() {
    if (!area) return;
    const checked = document.querySelector('input[name="cstyle"]:checked'), style = checked.value, styleLabel = document.querySelector(`label[for="${checked.id}"]`).textContent;
    const a = +area.value, sum = money(a * PRICE_M2);
    $id('area-out').value = a + ' ' + T.m2;
    area.style.setProperty('--p', (a - area.min) / (area.max - area.min) * 100 + '%');
    area.setAttribute('aria-valuetext', fill(T.areaText, { n: a }));
    $id('calc-sum').textContent = sum;
    $id('calc-style').textContent = styleLabel;
    $id('calc-area').textContent = a;
    presets.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.area === a)));
    $id('calc-go').dataset.lead = JSON.stringify({ type: style, project: fill(T.calcProject, { style: styleLabel }), area: a, price: priceFrom(sum) });
  }
  if (area) {
    area.addEventListener('input', calc);
    document.querySelectorAll('input[name="cstyle"]').forEach(r => r.addEventListener('change', calc));
    presets.forEach(b => b.addEventListener('click', () => { area.value = b.dataset.area; calc(); }));
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

  /* ---- projects: floor plans (rooms in metres: x, y, w, h, name) ---- */
  const PLANS = {
    tau: { name: 'Тау', type: 'A-frame', area: 43, beds: 1, baths: 1, floors: [
      { n: '1 этаж', w: 6, h: 5.5, rooms: [[0, 0, 6, 3.5, 'Кухня-гостиная'], [0, 3.5, 2.4, 2, 'Санузел'], [2.4, 3.5, 3.6, 2, 'Прихожая']] },
      { n: 'Антресоль', w: 6, h: 5.5, void: [0, 0, 6, 3.8], rooms: [[0, 3.8, 6, 1.7, 'Спальня']] }] },
    karagay: { name: 'Карагай', type: 'A-frame', area: 68, beds: 2, baths: 1, floors: [
      { n: '1 этаж', w: 7, h: 7, rooms: [[0, 0, 7, 4, 'Кухня-гостиная'], [0, 4, 3.5, 3, 'Спальня'], [3.5, 4, 2, 3, 'Санузел'], [5.5, 4, 1.5, 3, 'Вход']] },
      { n: '2 этаж', w: 7, h: 7, void: [0, 0, 7, 4.3], rooms: [[0, 4.3, 7, 2.7, 'Спальня 2']] }] },
    jailoo: { name: 'Жайлау', type: 'Барнхаус', area: 86, beds: 2, baths: 1, floors: [
      { n: '1 этаж', w: 12, h: 7.2, rooms: [[0, 0, 6, 7.2, 'Кухня-гостиная'], [6, 0, 3.4, 4, 'Спальня'], [9.4, 0, 2.6, 4, 'Спальня 2'], [6, 4, 2.2, 3.2, 'Холл'], [8.2, 4, 2, 3.2, 'Санузел'], [10.2, 4, 1.8, 3.2, 'Постирочная']] }] },
    alatoo: { name: 'Ала-Тоо', type: 'Барнхаус', area: 120, beds: 3, baths: 2, floors: [
      { n: '1 этаж', w: 10, h: 7, rooms: [[0, 0, 6, 7, 'Кухня-гостиная'], [6, 0, 4, 3.6, 'Спальня'], [6, 3.6, 2, 3.4, 'Санузел'], [8, 3.6, 2, 3.4, 'Прихожая']] },
      { n: '2 этаж', w: 10, h: 7, void: [0, 5, 10, 2], rooms: [[0, 0, 3.6, 3.4, 'Спальня 2'], [3.6, 0, 2.8, 5, 'Холл'], [6.4, 0, 3.6, 3.4, 'Спальня 3'], [0, 3.4, 3.6, 1.6, 'Санузел 2'], [6.4, 3.4, 3.6, 1.6, 'Гардероб']] }] },
  };
  const m2 = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  function planSVG(f) {
    const pad = 0.7, ink = '#312d32';
    let g = `<svg viewBox="${-pad} ${-pad} ${f.w + pad * 2} ${f.h + pad * 2}" role="img" aria-label="${fill(T.scheme, { floor: word(f.n) })}" font-family="Onest, sans-serif">
      <defs><pattern id="hatch" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2=".3" stroke="#d5a039" stroke-width=".05"/></pattern></defs>
      <text x="${f.w / 2}" y="-.25" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55">${m2(f.w)} ${T.m}</text>
      <text x="${f.w + .25}" y="${f.h / 2}" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55" transform="rotate(90 ${f.w + .25} ${f.h / 2})">${m2(f.h)} ${T.m}</text>`;
    if (f.void) { const [x, y, w, h] = f.void; g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)"/><text x="${x + w / 2}" y="${y + h / 2}" font-size=".3" text-anchor="middle" dominant-baseline="middle" fill="#8a6114">${T.secondLight}</text>`; }
    f.rooms.forEach(([x, y, w, h, n]) => {
      const fs = Math.min(0.36, (w - 0.4) / (word(n).length * 0.62));
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff8ec" stroke="${ink}" stroke-width=".06"/>
        <text x="${x + w / 2}" y="${y + h / 2 - fs * 0.15}" font-size="${fs}" font-weight="600" text-anchor="middle" fill="${ink}">${word(n)}</text>
        <text x="${x + w / 2}" y="${y + h / 2 + fs * 1.05}" font-size="${fs * 0.85}" text-anchor="middle" fill="#8a6114">${m2(w * h)} ${T.m2}</text>`;
    });
    return g + `<rect x="0" y="0" width="${f.w}" height="${f.h}" fill="none" stroke="${ink}" stroke-width=".2"/></svg>`;
  }
  // the dialog sits in the top layer, so the custom cursor moves inside it while it is open
  const cursorEl = $id('cursor');
  const plan = $id('plan'), planSvg = plan?.querySelector('.plan-svg'), floorsEl = plan?.querySelector('.floors');
  function showFloor(p, i) {
    planSvg.innerHTML = planSVG(p.floors[i]);
    floorsEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  function openPlan(id) {
    const p = PLANS[id], price = money(p.area * PRICE_M2);
    plan.querySelector('.plan-style').textContent = word(p.type);
    plan.querySelector('#plan-title').textContent = `«${p.name}» · ${p.area} ${T.m2}`;
    plan.querySelector('.plan-specs').innerHTML = [[T.specs[0], p.area + ' ' + T.m2], [T.specs[1], p.beds], [T.specs[2], p.baths]].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    plan.querySelector('.plan-rooms').innerHTML = p.floors.map(f => (p.floors.length > 1 ? `<li class="fl">${word(f.n)}</li>` : '') + f.rooms.map(([, , w, h, n]) => `<li><span>${word(n)}</span><span>${m2(w * h)} ${T.m2}</span></li>`).join('')).join('');
    plan.querySelector('.plan-price b').textContent = priceFrom(price);
    plan.querySelector('.plan-go').dataset.lead = JSON.stringify({ type: p.type, project: `«${p.name}»`, area: p.area, price: priceFrom(price) });
    floorsEl.innerHTML = p.floors.length > 1 ? p.floors.map((f, i) => `<button type="button">${word(f.n)}</button>`).join('') : '';
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
    document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => openPlan(b.dataset.plan)));
  }

  /* ---- content from the admin panel (GET /api/content); the HTML keeps the defaults ---- */
  // data-price="43" — a project of 43 m², its price follows the price per m² from the admin
  const syncProjectPrices = () => document.querySelectorAll('[data-price]').forEach(el => { el.textContent = priceFrom(money(+el.dataset.price * PRICE_M2)); });
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
    if (+c.price_m2 > 0) { PRICE_M2 = +c.price_m2; calc(); syncProjectPrices(); }

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
