/* Floor plan drawing, shared by the projects page (assets/site.js) and the admin panel preview.
   A floor: { name, w, h, void: [x, y, w, h] | null, image: url | null, rooms: [{ x, y, w, h, name, terrace? }] }, sizes in metres.
   A terrace room is drawn as a wooden deck and may lie outside the house outline; the drawing grows to fit it.
   With an image the uploaded drawing is shown instead of the scheme. */
window.AknietPlan = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const area = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  // t: { m, m2, secondLight, label } — unit words and the aria-label of the drawing in the page language
  function html(f, t) {
    if (f.image) return `<img src="${esc(f.image)}" alt="${esc(t.label)}" decoding="async">`;
    const pad = 0.7, ink = '#312d32';
    const x0 = Math.min(0, ...f.rooms.map(r => r.x)), y0 = Math.min(0, ...f.rooms.map(r => r.y));
    const x1 = Math.max(f.w, ...f.rooms.map(r => r.x + r.w)), y1 = Math.max(f.h, ...f.rooms.map(r => r.y + r.h));
    let g = `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}" role="img" aria-label="${esc(t.label)}" font-family="Onest, sans-serif">
      <defs><pattern id="hatch" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2=".3" stroke="#d5a039" stroke-width=".05"/></pattern>
      <pattern id="deck" width="1" height=".24" patternUnits="userSpaceOnUse"><rect width="1" height=".24" fill="#e9cfa6"/><line x1="0" y1=".23" x2="1" y2=".23" stroke="#b98a5a" stroke-width=".03"/></pattern></defs>
      <text x="${f.w / 2}" y="-.25" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55">${area(f.w)} ${t.m}</text>
      <text x="${f.w + .25}" y="${f.h / 2}" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55" transform="rotate(90 ${f.w + .25} ${f.h / 2})">${area(f.h)} ${t.m}</text>`;
    if (f.void) { const [x, y, w, h] = f.void; g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)"/><text x="${x + w / 2}" y="${y + h / 2}" font-size=".3" text-anchor="middle" dominant-baseline="middle" fill="#8a6114">${esc(t.secondLight)}</text>`; }
    for (const { x, y, w, h, name, terrace } of f.rooms) {
      const fs = Math.max(0.12, Math.min(0.36, (w - 0.4) / (String(name).length * 0.62)));
      g += terrace ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#deck)" stroke="#8a6114" stroke-width=".06" stroke-dasharray=".2 .12"/>`
        : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff8ec" stroke="${ink}" stroke-width=".06"/>`;
      g += `
        <text x="${x + w / 2}" y="${y + h / 2 - fs * 0.15}" font-size="${fs}" font-weight="600" text-anchor="middle" fill="${ink}">${esc(name)}</text>
        <text x="${x + w / 2}" y="${y + h / 2 + fs * 1.05}" font-size="${fs * 0.85}" text-anchor="middle" fill="#8a6114">${area(w * h)} ${t.m2}</text>`;
    }
    return g + `<rect x="0" y="0" width="${f.w}" height="${f.h}" fill="none" stroke="${ink}" stroke-width=".2"/></svg>`;
  }
  return { html, area, esc };
})();
