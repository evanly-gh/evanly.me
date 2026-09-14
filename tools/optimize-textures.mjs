/**
 * optimize-textures.mjs — shrink the runtime texture set for GPU memory and
 * download size (the diagnosis measured ~314 MB of uncompressed RGBA on the GPU,
 * dominated by a 4096² moon albedo and 1.5-2.5K poster PNGs).
 *
 *  - textures/moon/moon-albedo.webp  4096x2048 → 2048x1024 (45 MB → 11 MB on GPU)
 *  - images/sections/rememberme.jpg   1686x2528 → 1024x1536 WebP (23 MB → 8 MB)
 *  - images/sections/*.png            same size, WebP q92 (download size only)
 *  - images/billboards/*.png          same size, WebP q90; the originals are
 *    removed and the code loads `.webp` (the runtime screen atlas resamples
 *    these anyway, so no visible change)
 *
 * Usage: node tools/optimize-textures.mjs   (idempotent; skips converted files)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const mb = (n) => (n / 1e6).toFixed(2) + ' MB';
let before = 0; let after = 0;

async function convert(src, dst, { width, height, quality }) {
  if (!fs.existsSync(src)) return;
  // Read into memory so no handle stays open on `src` (Windows refuses to
  // rename over an open file when src === dst).
  const input = sharp(fs.readFileSync(src));
  const meta = await input.metadata();
  let pipeline = input;
  if (width && meta.width > width) pipeline = pipeline.resize({ width, height, fit: 'inside', withoutEnlargement: true });
  await pipeline.webp({ quality, effort: 6 }).toFile(dst + '.tmp');
  const from = fs.statSync(src).size;
  before += from;
  fs.unlinkSync(src);
  fs.renameSync(dst + '.tmp', dst);
  const to = fs.statSync(dst).size;
  after += to;
  const out = await sharp(dst).metadata();
  console.log(`${path.relative(PUBLIC, src).padEnd(44)} ${meta.width}x${meta.height} ${mb(from).padStart(9)} → ${path.basename(dst).padEnd(24)} ${out.width}x${out.height} ${mb(to).padStart(9)}`);
}

// Moon albedo: halve the resolution (it fills ~600 px on screen at most).
const moon = path.join(PUBLIC, 'textures', 'moon', 'moon-albedo.webp');
if ((await sharp(moon).metadata()).width > 2048) {
  await convert(moon, moon, { width: 2048, height: 1024, quality: 90 });
  // Keep the provenance manifest truthful: the optimized output is now 2048².
  const metaPath = path.join(PUBLIC, 'textures', 'moon', 'metadata.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const albedo = (meta.assets ?? []).find((a) => a.id === 'albedo');
    if (albedo) {
      const out = await sharp(moon).metadata();
      const bytes = fs.statSync(moon).size;
      const sha256 = createHash('sha256').update(fs.readFileSync(moon)).digest('hex');
      if (albedo.optimization?.resize) Object.assign(albedo.optimization.resize, { width: out.width, height: out.height });
      if (albedo.optimization?.webp) albedo.optimization.webp.quality = 90;
      if (albedo.output) Object.assign(albedo.output, { width: out.width, height: out.height, bytes, sha256 });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      console.log('updated textures/moon/metadata.json (albedo output 2048x1024)');
    }
  }
} else {
  console.log('moon albedo already ≤ 2048 wide');
}

// Section posters.
const sections = path.join(PUBLIC, 'images', 'sections');
for (const file of fs.readdirSync(sections)) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const src = path.join(sections, file);
  const dst = path.join(sections, file.replace(/\.(png|jpe?g)$/i, '.webp'));
  const portrait = /rememberme/i.test(file);
  await convert(src, dst, portrait ? { width: 1024, height: 1536, quality: 90 } : { quality: 92 });
}

// Ad billboard artwork (the contact sheet is a source artefact, left alone).
const billboards = path.join(PUBLIC, 'images', 'billboards');
for (const file of fs.readdirSync(billboards)) {
  if (!/\.png$/i.test(file) || file.startsWith('_')) continue;
  const src = path.join(billboards, file);
  await convert(src, src.replace(/\.png$/i, '.webp'), { quality: 90 });
}

console.log(`\ntotal ${mb(before)} → ${mb(after)}`);
