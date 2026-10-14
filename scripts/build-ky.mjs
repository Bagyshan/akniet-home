#!/usr/bin/env node
// Builds the Kyrgyz page ky/index.html from the Russian source index-stone.html and the dictionary i18n/ky.json.
//
//   node scripts/build-ky.mjs            — build, list strings that have no translation yet (they stay Russian)
//   node scripts/build-ky.mjs --strict   — the same, but fail when something is untranslated
//   node scripts/build-ky.mjs --extract  — print the untranslated strings as JSON, to add them to ky.json
//
// ky.json:
//   "html" — whole fragments (with inline tags), for sentences where Kyrgyz word order differs;
//            the key is the Russian fragment exactly as in the source (whitespace is not significant)
//   "text" — single text pieces between tags and attribute values (alt, aria-label, title, placeholder, content, data-unit)
//   "js"   — the #i18n JSON block for strings used by scripts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = new Set(process.argv.slice(2));
const src = readFileSync(path.join(root, 'index-stone.html'), 'utf8');
const dict = JSON.parse(readFileSync(path.join(root, 'i18n/ky.json'), 'utf8'));

const norm = s => s.replace(/\s+/g, ' ').trim();
const hasRu = s => /[А-Яа-яЁё]/.test(s);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const missing = new Map(); // ru string → context

// 1. Whole fragments → placeholders, so their Kyrgyz text is not processed again
const held = [];
let out = src;
for (const [ru, ky] of Object.entries(dict.html)) {
  const re = new RegExp(esc(norm(ru)).replace(/ /g, '\\s+'), 'g');
  if (!re.test(out)) { console.warn(`ky.json html: not found in the source, skipped:\n  ${norm(ru).slice(0, 120)}`); continue; }
  out = out.replace(re, () => `\u0000${held.push(ky) - 1}\u0000`);
}

// 2. Text pieces and attributes; scripts, styles and comments are left alone
const ATTR = /(\s(?:alt|aria-label|title|placeholder|content|data-unit)=")([^"]*)(")/g;
const tr = (s, ctx) => {
  const key = norm(s);
  if (!key || !hasRu(key)) return s;
  const ky = dict.text[key];
  if (ky === undefined) { if (!missing.has(key)) missing.set(key, ctx); return s; }
  return s.match(/^\s*/)[0] + ky + s.match(/\s*$/)[0]; // keep the surrounding whitespace
};
out = out.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<[^>]+>)/).map((part, i, all) => {
  if (part.startsWith('<script') || part.startsWith('<style') || part.startsWith('<!--')) return part;
  if (part.startsWith('<')) return part.replace(ATTR, (_, a, v, z) => a + tr(v, part.slice(0, 80)) + z);
  return tr(part, (all[i - 1] || '').slice(0, 80));
}).join('');
out = out.replace(/\u0000(\d+)\u0000/g, (_, n) => held[n]);

// 3. Script strings, language, links between the two versions, asset paths one level up
out = out
  .replace(/(<script type="application\/json" id="i18n">)[\s\S]*?(<\/script>)/, (_, a, z) => a + JSON.stringify(dict.js, null, 1) + z)
  .replace('<html lang="ru">', '<html lang="ky">')
  .replace(/<a ([^>]*)data-lang-link="(ru|ky)"([^>]*)>/g, (_, a, lang, z) => {
    const attrs = (a + z).replace(/\s*aria-current="[^"]*"/, '').replace(/href="[^"]*"/, `href="${lang === 'ru' ? '../' : './'}"`);
    return `<a ${attrs.trim()} data-lang-link="${lang}"${lang === 'ky' ? ' aria-current="true"' : ''}>`;
  })
  .replace(/(["'(])assets\//g, '$1../assets/')
  .replace('href="site.webmanifest"', 'href="../site.webmanifest"')
  .replace('<head>', '<head>\n<!-- Сгенерировано scripts/build-ky.mjs из index-stone.html и i18n/ky.json — не редактируйте вручную -->');

if (arg.has('--extract')) {
  console.log(JSON.stringify(Object.fromEntries([...missing.keys()].map(k => [k, ''])), null, 1));
  process.exit(0);
}
mkdirSync(path.join(root, 'ky'), { recursive: true });
writeFileSync(path.join(root, 'ky/index.html'), out);
console.log(`ky/index.html: ${held.length} fragments, ${Object.keys(dict.text).length} strings in the dictionary`);
if (missing.size) {
  console.warn(`No translation yet (${missing.size}), shown in Russian:`);
  for (const [k, ctx] of missing) console.warn(`  «${k}»   ← ${norm(ctx)}`);
  if (arg.has('--strict')) process.exit(1);
}
