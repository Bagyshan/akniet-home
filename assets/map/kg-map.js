/* Kyrgyzstan map for the site and the admin panel.
   Relief image + vector layers (kg-geo.js) + points. No tiles, no third-party map service.
   Zoom: «+»/«−», two-finger pinch, trackpad pinch / Ctrl+wheel, double click. Pan: drag.
   On touch screens one finger scrolls the page until the map is zoomed in. */
(() => {
  const D = window.aknietMapData;
  const W = D.w, H = D.h, WORLD = 256 * 2 ** D.z;
  const R = Math.PI / 180;
  const toPx = (lat, lon) => [(lon + 180) / 360 * WORLD - D.x0, (1 - Math.log(Math.tan(lat * R) + 1 / Math.cos(lat * R)) / Math.PI) / 2 * WORLD - D.y0];
  const toLatLon = (x, y) => {
    const n = Math.PI - 2 * Math.PI * (y + D.y0) / WORLD;
    return [Math.atan(Math.sinh(n)) / R, (x + D.x0) / WORLD * 360 - 180];
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const MAX_K = 5;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // opts: lang, relief (url), text { zoomIn, zoomOut, card(point) → Node }, onPick(lat, lon), onPinClick(point)
  window.AknietMap = function (root, opts = {}) {
    const lang = opts.lang || 'ru';
    root.classList.add('kgmap');
    root.replaceChildren();

    const stage = el('div', 'kg-stage');
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const img = el('img', 'kg-relief'); img.alt = ''; img.decoding = 'async'; img.src = opts.relief || 'assets/map/relief.webp';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'kg-vec'); svg.setAttribute('aria-hidden', 'true');
    const add = (d, cls) => { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); p.setAttribute('class', cls); p.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(p); };
    D.oblasts.forEach(o => add(o.d, 'kg-oblast'));
    add(D.rivers, 'kg-river');
    D.lakes.forEach(l => add(l.d, 'kg-lake'));
    add(D.border, 'kg-border');
    stage.append(img, svg);

    // labels and pins live outside the scaled stage, so text and dots keep their size
    const labels = el('div', 'kg-labels'), pins = el('div', 'kg-pins');
    const label = (x, y, text, cls) => { const e = el('span', 'kg-label ' + cls, text); e._x = x; e._y = y; labels.append(e); return e; };
    D.oblasts.filter(o => o.ru).forEach(o => label(o.x, o.y, o[lang] || o.ru, 'kg-l-oblast'));
    D.lakes.filter(l => l.ru).forEach(l => label(l.x, l.y, l[lang] || l.ru, 'kg-l-lake'));
    D.cities.forEach(c => label(c.x, c.y, c[lang] || c.ru, 'kg-l-city' + (c.cap ? ' kg-cap' : '')));

    const card = el('div', 'kg-card'); card.setAttribute('role', 'tooltip'); card.id = 'kg-card-' + Math.random().toString(36).slice(2, 8); card.hidden = true;
    const zoom = el('div', 'kg-zoom');
    const zIn = el('button', '', '+'), zOut = el('button', '', '−');
    zIn.type = zOut.type = 'button';
    zIn.setAttribute('aria-label', opts.text?.zoomIn || 'Приблизить'); zOut.setAttribute('aria-label', opts.text?.zoomOut || 'Отдалить');
    zoom.append(zIn, zOut);
    root.append(stage, labels, pins, card, zoom);

    /* ---- view: s = scale of the base grid, (tx, ty) = offset ---- */
    let cw = 0, ch = 0, s0 = 1, s = 1, tx = 0, ty = 0, raf = 0;
    const k = () => s / s0;
    function clamp() {
      const mw = W * s, mh = H * s;
      tx = mw <= cw ? (cw - mw) / 2 : Math.min(0, Math.max(cw - mw, tx));
      ty = mh <= ch ? (ch - mh) / 2 : Math.min(0, Math.max(ch - mh, ty));
    }
    function render() {
      raf = 0;
      stage.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
      const big = W * s;
      root.classList.toggle('kg-zoomed', k() > 1.01);
      root.classList.toggle('kg-show-oblasts', big >= 1000);
      root.classList.toggle('kg-show-cities', big >= 1500);
      for (const p of pins.children) p.style.transform = `translate(${tx + p._x * s}px,${ty + p._y * s}px)`;
      for (const e of labels.children) {
        e.style.transform = `translate(${tx + e._x * s}px,${ty + e._y * s}px)`;
        // a city under a pin: the pin wins, the label hides
        if (e.classList.contains('kg-l-city')) e.classList.toggle('kg-covered', [...pins.children].some(p => Math.hypot((p._x - e._x) * s, (p._y - e._y) * s) < 22));
      }
      if (!card.hidden && card._pin) placeCard(card._pin);
      zIn.disabled = k() >= MAX_K - 0.01; zOut.disabled = k() <= 1.01;
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
    function setScale(ns, cx = cw / 2, cy = ch / 2) {
      ns = Math.min(s0 * MAX_K, Math.max(s0, ns));
      tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns;
      clamp(); schedule();
    }
    function animateTo(ns, cx, cy) {
      const from = s, t0 = performance.now(), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const step = now => {
        const p = reduce ? 1 : Math.min((now - t0) / 280, 1), e = 1 - (1 - p) ** 3;
        setScale(from + (ns - from) * e, cx, cy);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    function fit() {
      const r = root.getBoundingClientRect(), kk = cw ? k() : 1;
      const cx = cw ? (cw / 2 - tx) / s : W / 2, cy = ch ? (ch / 2 - ty) / s : H / 2;
      cw = r.width; ch = r.height; s0 = Math.min(cw / W, ch / H); s = s0 * kk;
      tx = cw / 2 - cx * s; ty = ch / 2 - cy * s; clamp(); render();
    }
    new ResizeObserver(fit).observe(root);
    zIn.addEventListener('click', () => animateTo(s * 1.7));
    zOut.addEventListener('click', () => animateTo(s / 1.7));

    /* ---- gestures ---- */
    const ptrs = new Map(); let pinch = null, drag = null, moved = 0;
    const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    root.addEventListener('pointerdown', e => {
      if (e.target.closest('.kg-zoom, .kg-pin, .kg-card')) return;
      ptrs.set(e.pointerId, local(e));
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s }; drag = null;
      } else if (ptrs.size === 1) {
        // touch at full view: leave the gesture to the page scroll
        if (e.pointerType === 'touch' && k() <= 1.01) { drag = null; moved = 0; return; }
        drag = { x: e.clientX, y: e.clientY, tx, ty }; moved = 0;
        root.setPointerCapture(e.pointerId);
      }
    });
    root.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, local(e));
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        setScale(pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        moved = 99; e.preventDefault();
      } else if (drag) {
        tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y;
        moved = Math.max(moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
        root.classList.toggle('kg-dragging', moved > 3);
        clamp(); schedule();
      }
    });
    const end = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (e.type === 'pointerup' && moved < 5 && opts.onPick && !e.target.closest('.kg-pin, .kg-zoom, .kg-card')) {
        const [x, y] = local(e), [lat, lon] = toLatLon((x - tx) / s, (y - ty) / s);
        opts.onPick(+lat.toFixed(5), +lon.toFixed(5));
      }
      if (!ptrs.size) { drag = null; root.classList.remove('kg-dragging'); }
    };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    // trackpad pinch and Ctrl+wheel zoom; a plain wheel keeps scrolling the page
    root.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const [x, y] = local(e);
      setScale(s * Math.exp(-e.deltaY * 0.01), x, y);
    }, { passive: false });
    root.addEventListener('dblclick', e => { if (e.target.closest('.kg-zoom, .kg-pin, .kg-card')) return; const [x, y] = local(e); animateTo(s * 1.8, x, y); });

    /* ---- points + info card ---- */
    let points = [], selected = null;
    function placeCard(pin) {
      const px = tx + pin._x * s, py = ty + pin._y * s, cwid = card.offsetWidth, chei = card.offsetHeight;
      let x = Math.min(Math.max(px - cwid / 2, 8), cw - cwid - 8), y = py - chei - 18;
      card.classList.toggle('below', y < 8);
      if (y < 8) y = py + 18;
      card.style.transform = `translate(${x}px,${y}px)`;
    }
    function showCard(pin) {
      if (!opts.text?.card) return;
      card.replaceChildren(opts.text.card(pin._point));
      card.hidden = false; card._pin = pin;
      pins.querySelectorAll('.kg-pin').forEach(p => p.classList.toggle('on', p === pin));
      pin.setAttribute('aria-describedby', card.id);
      placeCard(pin);
    }
    function hideCard() {
      card.hidden = true; card._pin = null;
      pins.querySelectorAll('.kg-pin.on').forEach(p => { p.classList.remove('on'); p.removeAttribute('aria-describedby'); });
    }
    const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    function drawPins() {
      pins.replaceChildren(...points.map(pt => {
        const b = el('button', 'kg-pin' + (pt.draft ? ' draft' : '') + (selected != null && pt.id === selected ? ' sel' : ''));
        b.type = 'button'; b.setAttribute('aria-label', pt.name || '');
        [b._x, b._y] = toPx(pt.lat, pt.lon); b._point = pt;
        if (opts.onPinClick) b.addEventListener('click', () => opts.onPinClick(pt));
        else {
          if (hover) { b.addEventListener('pointerenter', () => showCard(b)); b.addEventListener('pointerleave', hideCard); }
          b.addEventListener('focus', () => showCard(b)); b.addEventListener('blur', hideCard);
          b.addEventListener('click', e => { e.stopPropagation(); card._pin === b && !hover ? hideCard() : showCard(b); });
        }
        return b;
      }));
      hideCard(); schedule();
    }
    // a tap anywhere else closes the card on touch screens
    document.addEventListener('click', e => { if (!card.hidden && !e.target.closest('.kg-pin, .kg-card')) hideCard(); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') hideCard(); });

    fit();
    return {
      setPoints(list, sel = null) { points = list || []; selected = sel; drawPins(); },
      toPx, toLatLon,
    };
  };
})();
