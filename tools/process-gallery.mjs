/**
 * process-gallery.mjs — convert every usable Cyber Assets pack into optimized
 * GLBs + a per-pack manifest under public/models/<pack>/, for the `?gallery`
 * dev page. One row per pack; original geometry dimensions preserved.
 *
 * Usage:
 *   node tools/process-gallery.mjs                 # all packs
 *   node tools/process-gallery.mjs --only=bikes,robots
 *   node tools/process-gallery.mjs --res=768       # override texture size
 *
 * Packs whose tooling is unavailable (FBX) or whose sources are missing are
 * skipped: an empty manifest.json is still written so the gallery's static
 * imports always resolve (the row simply renders empty / is filtered out).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGalleryConverter, publishDirectory } from './process-gallery-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CY = path.join(os.homedir(), 'Downloads', 'Cyber Assets');
const MODELS = path.resolve(__dirname, '..', 'public', 'models');

// --- CLI ---
const argv = process.argv.slice(2);
let only = null;
let resOverride = null;
for (const a of argv) {
  if (a.startsWith('--only=')) only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
  else if (a.startsWith('--res=')) { const n = parseInt(a.slice(6), 10); if (Number.isFinite(n)) resOverride = n; }
  else { console.error(`Unknown option: ${a}`); process.exit(1); }
}

/** Recursively list files under dir matching a lowercase extension. */
function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, ext));
    else if (name.toLowerCase().endsWith(ext)) out.push(full);
  }
  return out;
}

function sanitize(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'piece';
}

/** Build jobs (unique names) from a list of source file paths. */
function jobsFrom(files, type, category, nameOf) {
  const seen = new Map();
  const jobs = [];
  for (const input of files) {
    let base = nameOf ? nameOf(input) : sanitize(path.basename(input));
    let name = base;
    let n = 2;
    while (seen.has(name)) name = `${base}_${n++}`;
    seen.set(name, true);
    jobs.push({ name, input, type, category });
  }
  return jobs;
}

// --- Pack definitions ---
const PACKS = [
  {
    key: 'bikes', res: 1024,
    jobs: () => jobsFrom(
      walk(path.join(CY, 'Cyber bikes'), '.obj'), 'obj', 'bikes',
      // name after the top-level bike folder (Chopper, Cross, ...)
      (input) => sanitize(path.relative(path.join(CY, 'Cyber bikes'), input).split(path.sep)[0]),
    ),
  },
  {
    key: 'robots', res: 1024,
    jobs: () => jobsFrom(walk(path.join(CY, 'Cyber Robots'), '.obj'), 'obj', 'robots'),
  },
  {
    key: 'hovercars', res: 1024,
    jobs: () => jobsFrom(walk(path.join(CY, 'Cyber hovercars'), '.obj'), 'obj', 'hovercars'),
  },
  {
    key: 'structures', res: 1024,
    jobs: () => jobsFrom([
      ...walk(path.join(CY, 'Cyber building'), '.obj'),
      ...walk(path.join(CY, 'Cyber citygen'), '.obj'),
      ...walk(path.join(CY, 'Cyber Resteraunt'), '.obj'),
    ], 'obj', 'structures', (input) => {
      // These share an ugly upload prefix; name by their parent folder instead.
      const parent = path.basename(path.dirname(input));
      return sanitize(parent.replace(/^Cyber\s*/i, ''));
    }),
  },
  {
    key: 'quaternius', res: 512,
    jobs: () => {
      const root = path.join(CY, 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001', 'Cyberpunk Game Kit - Quaternius');
      const subs = ['Character', 'Enemies', 'Pickups and Objects', 'Platforms'];
      const files = subs.flatMap((s) => walk(path.join(root, s), '.gltf'));
      return jobsFrom(files, 'gltf', 'quaternius');
    },
  },
  {
    key: 'monogon', res: 1024,
    jobs: () => jobsFrom(walk(path.join(CY, 'Cyber monogon stuff'), '.fbx'), 'fbx', 'monogon'),
  },
];

async function processPack(pack, convert) {
  const jobs = pack.jobs();
  const outDir = path.join(MODELS, pack.key);
  if (jobs.length === 0) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'manifest.json'), '[]\n');
    console.warn(`  [${pack.key}] no source files found — wrote empty manifest`);
    return { key: pack.key, count: 0, bytes: 0, skipped: 'no-sources' };
  }

  const res = resOverride ?? pack.res;
  const stageDir = fs.mkdtempSync(path.join(MODELS, `.gallery-${pack.key}-`));
  const manifest = [];
  let bytes = 0;
  let fbxMissing = 0;

  try {
    for (const job of jobs) {
      try {
        const { buffer, bbox, tris, hasEmissive } = await convert(job, res);
        fs.writeFileSync(path.join(stageDir, `${job.name}.glb`), buffer);
        bytes += buffer.length;
        manifest.push({ name: job.name, file: `${pack.key}/${job.name}.glb`, bbox, tris, hasEmissive, category: pack.key });
        console.log(`  [${pack.key}] ${job.name.padEnd(28)} ${(buffer.length / 1024).toFixed(0).padStart(6)} KB  tris=${tris}${hasEmissive ? ' [E]' : ''}`);
      } catch (e) {
        if (e.message === 'FBX_TOOLING_MISSING') { fbxMissing++; continue; }
        console.warn(`  [${pack.key}] SKIP ${job.name}: ${e.message}`);
      }
    }

    if (fbxMissing === jobs.length) {
      // Whole pack unconvertible (no FBX tooling). Publish an empty manifest.
      fs.rmSync(stageDir, { recursive: true, force: true });
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'manifest.json'), '[]\n');
      console.warn(`  [${pack.key}] fbx2gltf unavailable — pack skipped (empty manifest)`);
      return { key: pack.key, count: 0, bytes: 0, skipped: 'fbx-tooling' };
    }

    manifest.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(path.join(stageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    publishDirectory(stageDir, outDir);
    return { key: pack.key, count: manifest.length, bytes };
  } finally {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!fs.existsSync(CY)) { console.error(`Cyber Assets not found: ${CY}`); process.exit(1); }
  fs.mkdirSync(MODELS, { recursive: true });
  const convert = await createGalleryConverter();
  const selected = only ? PACKS.filter((p) => only.includes(p.key)) : PACKS;
  if (selected.length === 0) { console.error(`No packs matched --only=${only}`); process.exit(1); }

  console.log(`Converting ${selected.length} pack(s) → ${MODELS}\n`);
  const results = [];
  for (const pack of selected) {
    console.log(`== ${pack.key} ==`);
    results.push(await processPack(pack, convert));
  }

  console.log('\n=== Summary ===');
  let total = 0;
  for (const r of results) {
    total += r.bytes;
    const tag = r.skipped ? `SKIPPED (${r.skipped})` : `${r.count} pieces, ${(r.bytes / 1024).toFixed(0)} KB`;
    console.log(`  ${r.key.padEnd(12)} ${tag}`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${(total / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
