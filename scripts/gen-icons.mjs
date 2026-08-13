// Rasterize the LinkBank mark (Concept 5) into the app icon set, then assemble
// favicon.ico from the small PNGs. Run: node scripts/gen-icons.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, '..', 'static');

// The mark on a rounded gradient tile. `pad` is the transparent margin ratio
// around the tile (maskable icons need safe-zone padding; favicons want none).
function svg(px, { pad = 0, radiusRatio = 11 / 48 } = {}) {
  const inset = px * pad;
  const tile = px - inset * 2;
  const r = tile * radiusRatio;
  // Mark occupies the 15..33 band of a 48 grid; scale into the tile.
  const s = tile / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${px}" y2="${px}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4b83f0"/><stop offset="1" stop-color="#8659e8"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${r}" fill="url(#g)"/>
  <g transform="translate(${inset},${inset}) scale(${s})" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round">
    <path d="M15 15h13a5 5 0 0 1 0 10h-3"/>
    <path d="M33 33H20a5 5 0 0 1 0-10h3"/>
  </g>
</svg>`;
}

async function raster(page, px, opts) {
  const s = svg(px, opts);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{background:transparent}</style></head><body>${s}</body></html>`;
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const el = await page.$('svg');
  return await el.screenshot({ omitBackground: true, type: 'png' });
}

// Minimal ICO encoder: pack PNG-format entries into an .ico container.
function buildIco(entries) {
  // entries: [{ size, png: Buffer }]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + dir.length;
  const bodies = [];
  entries.forEach((e, i) => {
    const b = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0); // width (0 = 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1); // height
    dir.writeUInt8(0, b + 2); // palette
    dir.writeUInt8(0, b + 3); // reserved
    dir.writeUInt16LE(1, b + 4); // color planes
    dir.writeUInt16LE(32, b + 6); // bpp
    dir.writeUInt32LE(e.png.length, b + 8); // size of data
    dir.writeUInt32LE(offset, b + 12); // offset
    offset += e.png.length;
    bodies.push(e.png);
  });
  return Buffer.concat([header, dir, ...bodies]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const jobs = [
  { name: 'icon-16.png', px: 16 },
  { name: 'icon-32.png', px: 32 },
  { name: 'icon-48.png', px: 48 },
  { name: 'apple-touch-icon.png', px: 180 },
  { name: 'icon-192.png', px: 192 },
  { name: 'icon-512.png', px: 512 },
  { name: 'icon-192-maskable.png', px: 192, opts: { pad: 0.1, radiusRatio: 0 } },
  { name: 'icon-512-maskable.png', px: 512, opts: { pad: 0.1, radiusRatio: 0 } }
];

const made = {};
for (const j of jobs) {
  const buf = await raster(page, j.px, j.opts ?? {});
  writeFileSync(join(staticDir, j.name), buf);
  made[j.name] = buf;
  console.log('wrote', j.name, buf.length, 'bytes');
}

// favicon.ico from 16/32/48
const ico = buildIco([
  { size: 16, png: made['icon-16.png'] },
  { size: 32, png: made['icon-32.png'] },
  { size: 48, png: made['icon-48.png'] }
]);
writeFileSync(join(staticDir, 'favicon.ico'), ico);
console.log('wrote favicon.ico', ico.length, 'bytes');

await browser.close();
console.log('done');
