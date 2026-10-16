/* Floor plan drawing, shared by the projects page (assets/site.js) and the admin panel preview.
   A floor: { name, w, h, void: [x, y, w, h] | null, image: url | null, rooms: [{ x, y, w, h, name }] }, sizes in metres.
   With an image the uploaded drawing is shown instead of the scheme. */
window.AknietPlan = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const area = v => (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  // t: { m, m2, secondLight, label } — unit words and the aria-label of the drawing in the page language
  function html(f, t) {
    if (f.image) return `<img src="${esc(f.image)}" alt="${esc(t.label)}" decoding="async">`;
    const pad = 0.7, ink = '#312d32';
    let g = `<svg viewBox="${-pad} ${-pad} ${f.w + pad * 2} ${f.h + pad * 2}" role="img" aria-label="${esc(t.label)}" font-family="Onest, sans-serif">
      <defs><pattern id="hatch" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2=".3" stroke="#d5a039" stroke-width=".05"/></pattern></defs>
      <text x="${f.w / 2}" y="-.25" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55">${area(f.w)} ${t.m}</text>
      <text x="${f.w + .25}" y="${f.h / 2}" font-size=".28" text-anchor="middle" fill="${ink}" opacity=".55" transform="rotate(90 ${f.w + .25} ${f.h / 2})">${area(f.h)} ${t.m}</text>`;
    if (f.void) { const [x, y, w, h] = f.void; g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#hatch)"/><text x="${x + w / 2}" y="${y + h / 2}" font-size=".3" text-anchor="middle" dominant-baseline="middle" fill="#8a6114">${esc(t.secondLight)}</text>`; }
    for (const { x, y, w, h, name } of f.rooms) {
      const fs = Math.max(0.12, Math.min(0.36, (w - 0.4) / (String(name).length * 0.62)));
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff8ec" stroke="${ink}" stroke-width=".06"/>
        <text x="${x + w / 2}" y="${y + h / 2 - fs * 0.15}" font-size="${fs}" font-weight="600" text-anchor="middle" fill="${ink}">${esc(name)}</text>
        <text x="${x + w / 2}" y="${y + h / 2 + fs * 1.05}" font-size="${fs * 0.85}" text-anchor="middle" fill="#8a6114">${area(w * h)} ${t.m2}</text>`;
    }
    return g + `<rect x="0" y="0" width="${f.w}" height="${f.h}" fill="none" stroke="${ink}" stroke-width=".2"/></svg>`;
  }
  return { html, area, esc };
})();
