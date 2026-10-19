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
  const plural = (n, forms) => { const [one, few, many, frac = few] = forms.split(','); if (!Number.isInteger(n)) return frac; const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many; };
  const word = s => T.words[s] || s;
  /* ---- analytics goals: GA4 events and Yandex Metrika goals with the same names (DEPLOY.md → «Цели») ---- */
  const goalsSent = new Set();
  const goal = (name, params = {}, once = false) => {
    if (once) { if (goalsSent.has(name)) return; goalsSent.add(name); }
    const p = { ...params, page: location.pathname };
    try { window.gtag?.('event', name, p); } catch {}
    try { if (window.ym && window.aknietYM) window.ym(window.aknietYM, 'reachGoal', name, p); } catch {}
  };
  // phone, WhatsApp, Telegram, mail, route and social links all carry data-contact
  const CONTACT_GOALS = { phone: 'contact_phone', whatsapp: 'contact_whatsapp', telegram: 'contact_telegram', email: 'contact_email', route: 'contact_route', instagram: 'contact_social', tiktok: 'contact_social', threads: 'contact_social' };
  document.addEventListener('click', e => { const a = e.target.closest('[data-contact]'); if (a && CONTACT_GOALS[a.dataset.contact]) goal(CONTACT_GOALS[a.dataset.contact], { network: a.dataset.contact }); });
  const priceFrom = sum => fill(T.priceFrom, { sum });

  // WebGL drawn by the processor (no GPU: SwiftShader, llvmpipe) keeps the page busy for seconds — the 3D scenes then stay flat
  window.aknietSoftGL ??= (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl'); if (!gl) return true;
      const info = gl.getExtension('WEBGL_debug_renderer_info'), name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch { return true; }
  })();

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
  // keep everything inside the bar: tighten links → drop the phone → fold the links into the menu, until it fits
  const hEnd = header.lastElementChild;
  const fitHeader = () => {
    header.classList.remove('fit-1', 'fit-2', 'fit-3');
    for (const step of ['fit-1', 'fit-2', 'fit-3']) {
      const hr = header.getBoundingClientRect(), er = hEnd.getBoundingClientRect();
      if (er.right <= hr.right - 6) break;
      header.classList.add(step);
    }
  };
  fitHeader(); addEventListener('resize', fitHeader); document.fonts?.ready.then(fitHeader);

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
    // over light surfaces (cream and gold cards, gold buttons) the gold dot turns dark. The design always sets
    // dark text on light surfaces, so the text colour under the pointer tells which one it is — this also covers
    // gradients and photos with a light veil, where the background itself says little
    const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const isLight = el => {
      const m = getComputedStyle(el).color.match(/[\d.]+/g); if (!m) return false;
      const [r, g, b] = m.map(Number);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.18;
    };
    const mark = el => {
      if (!el || c.contains(el)) return;
      const v = el.closest('[data-cursor="view"]'), h = el.closest('a,button,label,input,textarea,summary,.tile');
      c.classList.toggle('view', !!v); c.classList.toggle('hover', !v && !!h); c.classList.toggle('light', isLight(el));
    };
    document.addEventListener('mouseover', e => mark(e.target));
    // scrolling moves the page under a still pointer without a mouseover
    let checking = false;
    addEventListener('scroll', () => { if (checking) return; checking = true; requestAnimationFrame(() => { checking = false; mark(document.elementFromPoint(mx, my)); }); }, { passive: true });
  }

  /* ---- form ---- */
  const form = $id('form');
  let prefill = () => {};
  // +996 500 20 84 87 — Kyrgyz numbers get grouped, foreign ones are left as typed
  const fmtPhone = v => {
    let d = v.replace(/\D/g, ''); if (!d) return '';
    if (d.startsWith('0')) d = '996' + d.slice(1);
    if (!d.startsWith('996')) return '+' + d.slice(0, 15);
    d = d.slice(0, 12);
    return '+' + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean).join(' ');
  };
  const phoneValid = v => { const d = v.replace(/\D/g, ''); return d.startsWith('996') ? d.length === 12 : d.length >= 10; };
  // phone field behaviour shared by the form and the quiz: +996 on focus, grouping while typing
  const phoneField = (input, box) => {
    input.addEventListener('focus', () => { if (!input.value) input.value = '+996 '; });
    input.addEventListener('blur', () => { if (input.value.replace(/\D/g, '') === '996') input.value = ''; });
    input.addEventListener('input', () => { input.value = fmtPhone(input.value); if (phoneValid(input.value)) box.classList.remove('invalid'); });
  };
  if (form) {
    const phone = $id('phone'), nameIn = $id('name');
    const phoneOk = () => phoneValid(phone.value);
    const nameOk = () => nameIn.value.trim().length > 1;
    phoneField(phone, $id('f-phone'));
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
      const done = () => { goal('lead_form', { via: lead.via, type: lead.type, from: lead.project ? 'project' : 'form' }); $id('sent-title').textContent = SENT[lead.via] || SENT['Звонок']; form.classList.add('sent'); };
      if (location.protocol === 'file:') return done(); // local preview without a server
      btn.disabled = true; err.hidden = true;
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
        .then(r => { if (!r.ok) throw new Error(r.status); done(); })
        .catch(() => { err.hidden = false; })
        .finally(() => { btn.disabled = false; });
    });

    /* ---- prefill the form from projects / calculator ---- */
    const pick = $id('pick'), pickText = $id('pick-text');
    const fProject = $id('f-project'), fArea = $id('f-area'), fTerrace = $id('f-terrace'), fTerraceType = $id('f-terrace-type');
    prefill = d => {
      const r = d.type && form.querySelector(`input[name="type"][value="${d.type}"]`); if (r) r.checked = true;
      fProject.value = d.project || ''; fArea.value = d.area || ''; fTerrace.value = d.terrace || ''; fTerraceType.value = d.terrace ? d.terrace_type || '' : '';
      const t = [d.project, d.area && d.area + ' ' + T.m2 + (d.terrace ? fill(T.plusTerrace, { n: d.terrace, kind: T.terraceKind[d.terrace_type] || '' }).replace('  ', ' ') : ''), d.price].filter(Boolean).join(' · ');
      pickText.textContent = t; pick.hidden = !t;
      form.classList.remove('sent');
      if (fine) setTimeout(() => nameIn.focus({ preventScroll: true }), lenis ? 1400 : 600);
    };
    $id('pick-x').addEventListener('click', () => { fProject.value = fArea.value = fTerrace.value = fTerraceType.value = ''; pick.hidden = true; });
    document.addEventListener('click', e => { const a = e.target.closest('[data-lead]'); if (a) prefill(JSON.parse(a.dataset.lead)); });
  }

  const money = n => '$' + n.toLocaleString('ru-RU');
  // an open and a closed terrace have their own price per m²; 0 — not set in the admin panel, that kind is not offered
  let PRICE_M2 = 440;
  const TERRACE = { open: 300, closed: 350 };
  const deckPrice = (m2, type) => m2 * (TERRACE[type === 'closed' ? 'closed' : 'open'] || 0);

  /* ---- price calculator ---- */
  const area = $id('area'), terrace = $id('terrace'), presets = document.querySelectorAll('.presets button');
  // daily rent: how many nights at the client's price cover the house, a rough count without running costs
  const rentOn = $id('rent-on'), rent = $id('rent');
  function payback(total) {
    const on = rentOn.checked, rate = Math.round(+rent.value);
    $id('rent-box').hidden = $id('calc-pay').hidden = !on;
    if (!on || !(rate > 0)) { $id('pay-nights').textContent = on ? '—' : ''; $id('pay-unit').textContent = ''; $id('pay-time').textContent = $id('rent-live').textContent = on ? T.payEmpty : ''; return ''; }
    const n = Math.ceil(total / rate), months = n / 30.4, years = Math.round(n / 365 * 10) / 10;
    const t = months < 12 ? Math.max(1, Math.round(months)) + ' ' + plural(Math.max(1, Math.round(months)), T.payMonths) : years.toLocaleString('ru-RU') + ' ' + plural(years, T.payYears);
    $id('pay-nights').textContent = n.toLocaleString('ru-RU');
    $id('pay-unit').textContent = plural(n, T.payDays);
    $id('pay-time').textContent = fill(T.payTime, { t });
    $id('rent-live').textContent = '= ' + n.toLocaleString('ru-RU') + ' ' + plural(n, T.payDays) + ' · ' + fill(T.payTime, { t });
    return fill(T.calcRent, { rent: rate.toLocaleString('ru-RU'), n: n.toLocaleString('ru-RU'), days: plural(n, T.payDays) });
  }
  const slider = (el, out, text) => {
    out.value = el.value + ' ' + T.m2;
    el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
    el.setAttribute('aria-valuetext', text);
  };
  let syncFloat = () => {};
  function calc() {
    if (!area) return;
    const checked = document.querySelector('input[name="cstyle"]:checked'), style = checked.value, styleLabel = document.querySelector(`label[for="${checked.id}"]`).textContent;
    const kind = document.querySelector('input[name="cterrace"]:checked')?.value || 'open';
    const a = +area.value, t = terrace && TERRACE[kind] ? +terrace.value : 0;
    const house = a * PRICE_M2, deck = deckPrice(t, kind), sum = money(house + deck), rentNote = rentOn ? payback(house + deck) : '';
    slider(area, $id('area-out'), fill(T.areaText, { n: a }));
    if (terrace) slider(terrace, $id('terrace-out'), t ? fill(T.areaText, { n: t }) : T.terraceNone);
    $id('calc-sum').textContent = sum;
    $id('calc-style').textContent = styleLabel;
    $id('calc-area').textContent = a;
    const split = $id('calc-split');
    if (split) { split.hidden = !t; split.textContent = t ? fill(T.calcSplit, { house: money(house), kind: T.terraceKind[kind], n: t, terrace: money(deck) }) : ''; }
    presets.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.area === a && (!terrace || (+(b.dataset.terrace || 0) === t && (!t || b.dataset.terraceType === kind))))));
    $id('calc-go').dataset.lead = JSON.stringify({ type: style, project: fill(T.calcProject, { style: styleLabel }) + (rentNote ? ' · ' + rentNote : ''), area: a, ...(t ? { terrace: t, terrace_type: kind } : {}), price: priceFrom(sum) });
    syncFloat();
  }
  if (area) {
    area.addEventListener('input', calc);
    terrace?.addEventListener('input', calc);
    document.querySelectorAll('input[name="cterrace"]').forEach(r => r.addEventListener('change', calc));
    document.querySelectorAll('input[name="cstyle"]').forEach(r => r.addEventListener('change', calc));
    if (rentOn) { $id('rent-row').hidden = false; rentOn.addEventListener('change', () => { if (rentOn.checked) goal('calc_rent', {}, true); calc(); }); rent.addEventListener('input', calc); }
    $id('price').addEventListener('input', () => goal('calc_use', {}, true));
    $id('price').addEventListener('click', e => { if (e.target.closest('.presets button')) goal('calc_use', {}, true); });
    $id('calc-go').addEventListener('click', () => goal('calc_estimate'));
    presets.forEach(b => b.addEventListener('click', () => { area.value = b.dataset.area; if (terrace && b.dataset.terrace) { terrace.value = b.dataset.terrace; const r = $id(b.dataset.terraceType === 'closed' ? 'ct2' : 'ct1'); if (r && !r.disabled) r.checked = true; } calc(); }));
    calc();
  }

  /* ---- calculator, phones and tablets: the price card sits below the inputs, so a cloud with the live price
     floats over the calculator. It trails the scroll a little and, as the price card comes up, flies into the
     price and dissolves there. Everything follows the scroll position, so scrolling back up plays it in reverse ---- */
  const calcBox = document.querySelector('.c-calc'), outB = $id('calc-sum');
  if (calcBox && outB) {
    const outSum = outB.closest('.calc-sum'), stack = matchMedia('(max-width:1100px)');
    const wrap = document.createElement('div');
    wrap.className = 'calc-float'; wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="cf"><i class="cf-bg"></i><span class="cf-meta"></span><span class="cf-row"><span class="cf-from"></span><b class="cf-sum"></b></span><span class="cf-pay"></span></div>';
    document.body.append(wrap);
    const cf = wrap.firstChild, bg = cf.querySelector('.cf-bg'), sumEl = cf.querySelector('.cf-sum'), fade = cf.querySelectorAll('.cf-meta,.cf-from,.cf-pay');
    syncFloat = () => {
      cf.querySelector('.cf-meta').textContent = $id('calc-style').textContent + ' · ' + $id('calc-area').textContent + ' ' + T.m2;
      cf.querySelector('.cf-from').textContent = outSum.firstChild.textContent.trim();
      sumEl.textContent = outB.textContent;
      const pay = $id('calc-pay'), nights = $id('pay-nights').textContent;
      cf.querySelector('.cf-pay').textContent = pay && !pay.hidden && nights ? pay.querySelector('.calc-pay-k').textContent + ': ' + nights + ' ' + $id('pay-unit').textContent : '';
    };
    syncFloat();
    const clamp = v => Math.min(1, Math.max(0, v)), smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    let lastY = scrollY, lag = 0, queued = false, shown = false;
    const show = on => { if (on === shown) return; shown = on; wrap.classList.toggle('on', on); document.body.classList.toggle('calc-float-on', on); };
    function frame() {
      queued = false;
      if (!stack.matches) { show(false); outSum.style.opacity = ''; return; }
      const H = innerHeight, cr = calcBox.getBoundingClientRect(), tr = outB.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      // a: the cloud appears while the calculator rises into view; m: once the card's price has risen to the cloud,
      // the cloud rides up with it, grows to its size and dissolves into it
      const a = smooth(H * 0.92, H * 0.62, cr.top);
      const restL = wr.left + cf.offsetLeft, restT = wr.top + cf.offsetTop, bx = sumEl.offsetLeft, by = sumEl.offsetTop;
      const reach = H * 0.2, m = clamp((restT + by - tr.top) / reach), e = reduce ? 0 : 1 - (1 - m) ** 3;
      const vel = scrollY - lastY; lastY = scrollY;
      lag = reduce ? 0 : lag + (Math.max(-26, Math.min(26, vel * 0.9)) - lag) * 0.14;
      const drift = reduce ? 0 : (clamp((H - cr.top) / (H + cr.height)) - 0.5) * -18;
      const sc = 1 + (tr.height / sumEl.offsetHeight - 1) * e;
      const tx = e * (tr.left - restL - bx * sc), ty = e * (tr.top - restT - by * sc) + (1 - e) * (lag + drift) + (1 - a) * 28;
      cf.style.setProperty('--e', e);
      cf.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${sc})`;
      cf.style.opacity = a * (1 - smooth(0.84, 1, m));
      bg.style.opacity = 1 - smooth(0, 0.7, m);
      fade.forEach(el => { el.style.opacity = 1 - smooth(0, 0.45, m); });
      const on = a > 0.01 && m < 0.999;
      outSum.style.opacity = on && !reduce ? smooth(0.72, 1, m) : '';
      show(on);
      if (Math.abs(lag) > 0.05) request();
    }
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', request);
    stack.addEventListener('change', request);
    calcBox.closest('section')?.addEventListener('input', request);
    wrap.addEventListener('click', () => { const card = outB.closest('.c-calc-out'); lenis ? lenis.scrollTo(card, { offset: -90 }) : card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); });
    request();
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
  let PROJECTS = [{"id":1,"slug":"tau","style":"af","name":"Тау","area":43,"beds":1,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":6,"h":5.5,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":3.5,"name":"Кухня-гостиная"},{"x":0,"y":3.5,"w":2.4,"h":2,"name":"Санузел"},{"x":2.4,"y":3.5,"w":3.6,"h":2,"name":"Прихожая"},{"x":0,"y":5.5,"w":6,"h":2,"name":"Терраса","terrace":true}]},{"name":"Антресоль","w":6,"h":5.5,"void":[0,0,6,3.8],"image":null,"rooms":[{"x":0,"y":3.8,"w":6,"h":1.7,"name":"Спальня"}]}],"terrace":12,"terrace_type":"open"},{"id":2,"slug":"karagay","style":"af","name":"Карагай","area":68,"beds":2,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":7,"h":7,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":7,"h":4,"name":"Кухня-гостиная"},{"x":0,"y":4,"w":3.5,"h":3,"name":"Спальня"},{"x":3.5,"y":4,"w":2,"h":3,"name":"Санузел"},{"x":5.5,"y":4,"w":1.5,"h":3,"name":"Вход"},{"x":0,"y":7,"w":7,"h":2.5,"name":"Терраса","terrace":true}]},{"name":"2 этаж","w":7,"h":7,"void":[0,0,7,4.3],"image":null,"rooms":[{"x":0,"y":4.3,"w":7,"h":2.7,"name":"Спальня 2"}]}],"terrace":17.5,"terrace_type":"open"},{"id":3,"slug":"jailoo","style":"barn","name":"Жайлау","area":86,"beds":2,"baths":1,"price":null,"plan":[{"name":"1 этаж","w":12,"h":7.2,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":7.2,"name":"Кухня-гостиная"},{"x":6,"y":0,"w":3.4,"h":4,"name":"Спальня"},{"x":9.4,"y":0,"w":2.6,"h":4,"name":"Спальня 2"},{"x":6,"y":4,"w":2.2,"h":3.2,"name":"Холл"},{"x":8.2,"y":4,"w":2,"h":3.2,"name":"Санузел"},{"x":10.2,"y":4,"w":1.8,"h":3.2,"name":"Постирочная"},{"x":0,"y":7.2,"w":6,"h":2.5,"name":"Терраса","terrace":true}]}],"terrace":15,"terrace_type":"closed"},{"id":4,"slug":"alatoo","style":"barn","name":"Ала-Тоо","area":120,"beds":3,"baths":2,"price":null,"plan":[{"name":"1 этаж","w":10,"h":7,"void":null,"image":null,"rooms":[{"x":0,"y":0,"w":6,"h":7,"name":"Кухня-гостиная"},{"x":6,"y":0,"w":4,"h":3.6,"name":"Спальня"},{"x":6,"y":3.6,"w":2,"h":3.4,"name":"Санузел"},{"x":8,"y":3.6,"w":2,"h":3.4,"name":"Прихожая"},{"x":0,"y":7,"w":6,"h":3,"name":"Терраса","terrace":true}]},{"name":"2 этаж","w":10,"h":7,"void":[0,5,10,2],"image":null,"rooms":[{"x":0,"y":0,"w":3.6,"h":3.4,"name":"Спальня 2"},{"x":3.6,"y":0,"w":2.8,"h":5,"name":"Холл"},{"x":6.4,"y":0,"w":3.6,"h":3.4,"name":"Спальня 3"},{"x":0,"y":3.4,"w":3.6,"h":1.6,"name":"Санузел 2"},{"x":6.4,"y":3.4,"w":3.6,"h":1.6,"name":"Гардероб"}]}],"terrace":18,"terrace_type":"closed"}];
  const projectBy = slug => PROJECTS.find(p => p.slug === slug);
  const styleName = p => p.style === 'af' ? 'A-frame' : 'Барнхаус'; // the form's radio values
  const projectPrice = p => money(p.price || p.area * PRICE_M2 + deckPrice(p.terrace || 0, p.terrace_type));
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
    plan.querySelector('.plan-specs').innerHTML = [[T.specs[0], p.area + ' ' + T.m2], [T.specs[1], p.beds], [T.specs[2], p.baths], ...(p.terrace ? [[T.specs[3], `${m2(p.terrace)} ${T.m2}, ${T.terraceKind[p.terrace_type === 'closed' ? 'closed' : 'open']}`]] : [])].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    plan.querySelector('.plan-rooms').innerHTML = p.plan.map(f => (p.plan.length > 1 ? `<li class="fl">${esc(word(f.name))}</li>` : '') + f.rooms.map(r => `<li><span>${esc(word(r.name))}</span><span>${m2(r.w * r.h)} ${T.m2}</span></li>`).join('')).join('');
    plan.querySelector('.plan-price b').textContent = priceFrom(price);
    plan.querySelector('.plan-go').dataset.lead = JSON.stringify({ type: styleName(p), project: `«${p.name}»`, area: p.area, ...(p.terrace ? { terrace: Math.round(p.terrace), terrace_type: p.terrace_type || 'open' } : {}), price: priceFrom(price) });
    floorsEl.innerHTML = p.plan.length > 1 ? p.plan.map(f => `<button type="button">${esc(word(f.name))}</button>`).join('') : '';
    floorsEl.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => showFloor(p, i)));
    showFloor(p, 0);
    goal('project_plan', { project: p.slug });
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

  /* ---- quiz «Подберём дом»: 6 questions → up to 3 projects from the catalog → a lead ---- */
  // Opens from any [data-quiz] button and from a link ending in #quiz (handy for ads and Instagram).
  // The answers reach the manager in Russian whatever the page language.
  const QUIZ_RU = [['Для чего', ['жить круглый год', 'дача, отдых на выходных', 'сдавать посуточно', 'пока выбирает']], ['Сколько человек', ['1–2', '3–4', '5 и больше']],
    ['Стиль', ['барнхаус', 'A-frame', 'пока не знает']], ['Бюджет', ['до $25 000', '$25 000–40 000', '$40 000–60 000', 'больше $60 000', 'не знает']],
    ['Участок', ['есть', 'скоро будет', 'нет']], ['Начать стройку', ['в ближайший месяц', 'в течение 3 месяцев', 'позже']]];
  const QUIZ_BUDGET = [[0, 25000], [25000, 40000], [40000, 60000], [60000, Infinity], null];
  const projectSum = p => p.price || p.area * PRICE_M2 + deckPrice(p.terrace || 0, p.terrace_type);
  function quizPick(a) {
    const beds = [1, 2, 3][a[1]] ?? 2, style = ['barn', 'af', null][a[2]], budget = QUIZ_BUDGET[a[3]];
    const score = p => {
      let s = -Math.abs((p.beds || 1) - beds) * 2;
      if (style && p.style === style) s += 3;
      if (budget) { const sum = projectSum(p); s += sum <= budget[1] * 1.1 ? (sum >= budget[0] * 0.9 ? 3 : 1) : -4; }
      if (a[0] === 2 && p.area <= 90) s += 1; // for daily rent a compact house pays back sooner
      return s;
    };
    return PROJECTS.map(p => [score(p), p]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(x => x[1]);
  }
  let quiz = null;
  // the finished quiz is kept for this tab (sessionStorage): «Ваша подборка» brings it back on any page without answering again
  const QUIZ_KEY = 'akniet-quiz';
  const quizSaved = () => {
    try { const v = JSON.parse(sessionStorage.getItem(QUIZ_KEY)); return v && Array.isArray(v.answers) && v.answers.length === T.quiz?.q.length ? v : null; }
    catch { return null; }
  };
  const FAB_OFF = 'akniet-quiz-fab-off';
  const quizSave = v => { try { sessionStorage.setItem(QUIZ_KEY, JSON.stringify(v)); } catch {} };
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function quizBuild() {
    const Q = T.quiz, total = Q.q.length, el = document.createElement('dialog');
    el.className = 'quiz'; el.setAttribute('aria-labelledby', 'quiz-q');
    el.innerHTML = `<div class="quiz-in" data-lenis-prevent><div class="quiz-top"><div class="quiz-head"><span class="eyebrow" id="quiz-step"></span><button type="button" class="quiz-x" aria-label="${esc(Q.close)}">×</button></div><div class="quiz-bar"><i></i></div></div><div class="quiz-body"></div></div>`;
    document.body.append(el);
    const body = el.querySelector('.quiz-body'), bar = el.querySelector('.quiz-bar i'), stepEl = el.querySelector('#quiz-step');
    let answers = [], i = 0;
    const focusTitle = () => body.querySelector('h3').focus({ preventScroll: true });
    const back = () => i ? `<button type="button" class="quiz-back">← ${esc(Q.back)}</button>` : '';
    const top = () => el.querySelector('.quiz-in').scrollTo(0, 0);
    function show() {
      if (i >= total) return result();
      const q = Q.q[i];
      stepEl.textContent = fill(Q.step, { n: i + 1, total });
      bar.style.transform = `scaleX(${i / total})`;
      top();
      body.innerHTML = `<h3 id="quiz-q" tabindex="-1">${esc(q.t)}</h3><div class="quiz-opts">${q.o.map((o, j) =>
        `<button type="button" class="quiz-opt" data-i="${j}" aria-pressed="${answers[i] === j}"><b>${esc(o)}</b>${q.h ? `<small>${esc(q.h[j])}</small>` : ''}</button>`).join('')}</div>${back()}`;
      focusTitle();
    }
    // fresh: the quiz was just answered (not reopened from «Ваша подборка»)
    function result(fresh = true) {
      if (fresh) { goal('quiz_result', { purpose: QUIZ_RU[0][1][answers[0]], budget: QUIZ_RU[3][1][answers[3]] }); quizSave({ answers, sent: false }); try { sessionStorage.removeItem(FAB_OFF); } catch {} }
      const sent = !!quizSaved()?.sent;
      stepEl.textContent = Q.doneStep; bar.style.transform = 'scaleX(1)'; top();
      const picks = quizPick(answers), root = document.documentElement.lang === 'ky' ? '/ky/' : '/';
      body.innerHTML = `<h3 id="quiz-q" tabindex="-1">${esc(picks.length ? Q.result : Q.resultNone)}</h3>
        <div class="quiz-picks">${picks.map(p => `<a class="quiz-pick" href="${root}projects/#${encodeURIComponent(p.slug)}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="quiz-noimg" aria-hidden="true"></span>'}<span><small>${esc(word(styleName(p)))} · ${p.area} ${T.m2} · ${esc(fill(Q.beds, { n: p.beds }))}</small><b>«${esc(p.name)}»</b><em>${esc(priceFrom(projectPrice(p)))}</em></span></a>`).join('')}</div>
        ${sent ? `<p class="quiz-done quiz-note" role="status"><span aria-hidden="true">✓</span><span><b>${esc(Q.sentChip)}.</b> ${esc(Q.sentText)}</span></p>` : `<p class="quiz-note">${esc(Q.resultText)}</p>
        <form class="form quiz-form" novalidate>
          <div class="fld" id="qz-f-name"><input id="qz-name" name="name" placeholder=" " autocomplete="name"><label for="qz-name">${esc(Q.name)}</label><span class="err">${esc(Q.errName)}</span></div>
          <div class="fld" id="qz-f-phone"><input id="qz-phone" name="phone" type="tel" inputmode="tel" placeholder=" " autocomplete="tel"><label for="qz-phone">${esc(Q.phone)}</label><span class="err">${esc(Q.errPhone)}</span></div>
          <span class="cap" id="qz-cap-via">${esc(Q.via)}</span>
          <div class="seg" role="radiogroup" aria-labelledby="qz-cap-via">${['Звонок', 'WhatsApp', 'Telegram'].map((v, j) => `<input type="radio" name="via" id="qz-v${j}" value="${v}"${j ? '' : ' checked'}><label for="qz-v${j}">${esc(Q.viaO[j])}</label>`).join('')}</div>
          <p class="form-err" role="alert" hidden>${esc(Q.fail)}</p>
          <button class="btn ink" type="submit">${esc(Q.send)} ${ARROW}</button>
          <p class="form-note">${esc(Q.consent)}</p>
        </form>`}${back()} <button type="button" class="quiz-back quiz-again">↻ ${esc(Q.again)}</button>`;
      focusTitle();
      if (sent) return;
      const f = body.querySelector('form'), nameIn = f.elements.name, phoneIn = f.elements.phone;
      phoneField(phoneIn, $id('qz-f-phone'));
      nameIn.addEventListener('input', () => nameIn.value.trim().length > 1 && $id('qz-f-name').classList.remove('invalid'));
      f.addEventListener('submit', e => {
        e.preventDefault();
        const okN = nameIn.value.trim().length > 1, okP = phoneValid(phoneIn.value);
        $id('qz-f-name').classList.toggle('invalid', !okN); $id('qz-f-phone').classList.toggle('invalid', !okP);
        if (!okN || !okP) return f.querySelector('.invalid input').focus();
        const via = f.elements.via.value, btn = f.querySelector('button[type="submit"]'), err = f.querySelector('.form-err');
        const lead = { name: nameIn.value, phone: phoneIn.value, via, type: ['Барнхаус', 'A-frame', 'Нужен совет'][answers[2]],
          project: 'Квиз: ' + (picks.map(p => `«${p.name}»`).join(', ') || '—'), msg: QUIZ_RU.map(([k, o], j) => `${k}: ${o[answers[j]]}`).join('\n'), lang: document.documentElement.lang };
        const done = () => {
          goal('lead_quiz', { via });
          quizSave({ answers, sent: true });
          stepEl.textContent = Q.doneStep;
          body.innerHTML = `<div class="quiz-sent"><span class="chip ink">${esc(Q.sentChip)}</span><h3 id="quiz-q" tabindex="-1">${esc(Q.sentTitle)}</h3><p>${esc(Q.sentText)}</p><button type="button" class="btn ghost-ink quiz-close">${esc(Q.close)}</button></div>`;
          focusTitle();
        };
        if (location.protocol === 'file:') return done();
        btn.disabled = true; err.hidden = true;
        fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
          .then(r => { if (!r.ok) throw new Error(r.status); done(); })
          .catch(() => { err.hidden = false; })
          .finally(() => { btn.disabled = false; });
      });
    }
    const close = () => { if (el.open) { el.close(); unlock(); updateFab(); } };
    el.addEventListener('close', () => { unlock(); updateFab(); });
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('.quiz-x, .quiz-close, .quiz-pick')) return close();
      const o = e.target.closest('.quiz-opt'); if (o) { answers[i] = +o.dataset.i; i++; if (i === 1) goal('quiz_start'); return show(); }
      if (e.target.closest('.quiz-again')) { answers = []; i = 0; return show(); }
      if (e.target.closest('.quiz-back')) { i = Math.min(i, total) - 1; show(); }
    });
    // a saved result opens straight away; otherwise the first question
    return { el, reset: () => { const saved = quizSaved(); if (saved) { answers = saved.answers.slice(); i = total; result(false); } else { answers = []; i = 0; show(); } } };
  }
  function quizOpen() {
    if (!T.quiz) return;
    quiz ||= quizBuild();
    goal('quiz_open');
    quiz.reset(); quiz.el.showModal(); quiz.el.append(cursorEl); lenis?.stop(); document.documentElement.style.overflow = 'hidden';
    updateFab();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-quiz]')) { e.preventDefault(); quizOpen(); } });
  // «Ваша подборка»: a floating button with the picked houses, on every page while the tab is open
  // × hides it for the rest of the visit; a newly finished quiz brings it back. The pick itself stays saved
  const fab = T.quiz ? document.createElement('div') : null;
  if (fab) {
    fab.className = 'quiz-fab'; fab.hidden = true; document.body.append(fab);
    fab.addEventListener('click', e => {
      if (!e.target.closest('.quiz-fab-x')) return quizOpen();
      try { sessionStorage.setItem(FAB_OFF, '1'); } catch {}
      fab.classList.add('out'); setTimeout(updateFab, 300);
    });
  }
  function updateFab() {
    if (!fab) return;
    const saved = quizSaved(), picks = saved ? quizPick(saved.answers) : [];
    let off = false; try { off = !!sessionStorage.getItem(FAB_OFF); } catch {}
    fab.hidden = !saved || off || !!quiz?.el.open; fab.classList.remove('out');
    if (fab.hidden) return;
    fab.innerHTML = `<button type="button" class="quiz-fab-go"><span class="thumbs" aria-hidden="true">${picks.map(p => `<i${p.image ? ` style="background-image:url('${esc(p.image)}')"` : ''}></i>`).join('')}</span>`
      + `<span>${esc(T.quiz.saved)}<small>${picks.length} ${esc(plural(picks.length, T.quiz.projectsUnit))}</small></span></button>`
      + `<button type="button" class="quiz-fab-x" aria-label="${esc(T.quiz.hide)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>`;
  }

  /* ---- «Получить каталог в WhatsApp»: name + number → a lead; the manager gets the catalog link (/catalog/) in it ---- */
  document.querySelectorAll('.cat-form').forEach(f => {
    const nameIn = f.elements.name, phoneIn = f.elements.phone, [nameBox, phoneBox] = f.querySelectorAll('.fld');
    phoneField(phoneIn, phoneBox);
    nameIn.addEventListener('input', () => nameIn.value.trim().length > 1 && nameBox.classList.remove('invalid'));
    f.addEventListener('submit', e => {
      e.preventDefault();
      const okN = nameIn.value.trim().length > 1, okP = phoneValid(phoneIn.value);
      nameBox.classList.toggle('invalid', !okN); phoneBox.classList.toggle('invalid', !okP);
      if (!okN || !okP) return f.querySelector('.invalid input').focus();
      const lang = document.documentElement.lang, btn = f.querySelector('button[type="submit"]'), err = f.querySelector('.form-err');
      const lead = { name: nameIn.value, phone: phoneIn.value, via: 'WhatsApp', type: 'Нужен совет', project: 'Каталог проектов в WhatsApp',
        msg: 'Отправить каталог: ' + location.origin + (lang === 'ky' ? '/ky/catalog/' : '/catalog/'), lang };
      const done = () => { goal('lead_catalog'); f.classList.add('done'); f.querySelector('.cat-sent').hidden = false; };
      if (location.protocol === 'file:') return done();
      btn.disabled = true; err.hidden = true;
      fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
        .then(r => { if (!r.ok) throw new Error(r.status); done(); })
        .catch(() => { err.hidden = false; })
        .finally(() => { btn.disabled = false; });
    });
  });
  // «Рассчитать окупаемость» (data-rent) opens the calculator with the daily-rent part on
  document.addEventListener('click', e => { if (e.target.closest('[data-rent]') && rentOn && !rentOn.checked) { rentOn.checked = true; rentOn.dispatchEvent(new Event('change')); } });

  /* ---- content from the admin panel (GET /api/content); the HTML keeps the defaults ---- */
  // data-price="43" — a project of 43 m², its price follows the price per m² from the admin
  const syncProjectPrices = () => document.querySelectorAll('[data-price]').forEach(el => { el.textContent = priceFrom(money(+el.dataset.price * PRICE_M2 + deckPrice(+(el.dataset.terrace || 0), el.dataset.terraceType))); });
  // data-unit="one,few,many[,fraction]": 1 год · 3 года · 5 лет; a fraction takes the 4th form or "few" (1,5 месяца).
  // After «от» the case changes, so those spans list genitive forms: от 1 месяца · от 2 месяцев
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
    TERRACE.open = +c.price_terrace_open_m2 > 0 ? +c.price_terrace_open_m2 : 0;
    TERRACE.closed = +c.price_terrace_closed_m2 > 0 ? +c.price_terrace_closed_m2 : 0;
    const needs = { terrace: !!(TERRACE.open || TERRACE.closed), terrace_open: !!TERRACE.open, terrace_closed: !!TERRACE.closed, houses_built: +c.houses_built > 0, years_on_market: +c.years_on_market > 0, rentals: !!c.rentals?.length };
    document.querySelectorAll('[data-needs]').forEach(e => { e.hidden = !needs[e.dataset.needs]; });
    // a kind without a price can not be picked
    [['ct1', 'open', 'ct2'], ['ct2', 'closed', 'ct1']].forEach(([id, kind, other]) => { const r = $id(id); if (!r) return; r.disabled = !TERRACE[kind]; if (r.disabled && r.checked) $id(other).checked = true; });
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
  updateFab();
  if (location.hash === '#quiz') { history.replaceState(null, '', location.pathname + location.search); quizOpen(); }

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

  // section marks: the hairline draws across as the section comes in
  document.querySelectorAll('.sec-mark').forEach(el => ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => el.classList.add('drawn') }));

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
