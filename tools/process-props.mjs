/**
 * process-props.mjs — Convert individual OBJ props/vehicles/characters from the
 * "Cyber Assets" downloads into web-ready DRACO+WebP GLBs in public/models/props.
 *
 * Usage: node tools/process-props.mjs [--res=512]
 */
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { weld, dedup, prune, draco, textureCompress } from '@gltf-transform/functions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const obj2gltf = require('obj2gltf');

const res = (() => { const a = process.argv.find((s) => s.startsWith('--res=')); return a ? parseInt(a.slice(6), 10) : 512; })();
const CY = path.join(os.homedir(), 'Downloads', 'Cyber Assets');
const HOVER = path.join(CY, 'Cyber hovercars', 'HoverCars', 'HoverCars', 'meshes');
const QUAT = path.join(CY, 'Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001', 'Cyberpunk Game Kit - Quaternius');

const JOBS = [
  { name: 'veh_coupe', obj: path.join(HOVER, 'coupe', 'coupe.obj') },
  { name: 'veh_sedan', obj: path.join(HOVER, 'sedan', 'sedan.obj') },
  { name: 'veh_truck', obj: path.join(HOVER, 'truck', 'boxTruck.obj') },
  { name: 'veh_police', obj: path.join(HOVER, 'utility', 'police', 'police_car.obj') },
  { name: 'ped_char', obj: path.join(QUAT, 'Character', 'Character.obj') },
];

const outDir = path.resolve(__dirname, '..', 'public', 'models', 'props');
fs.mkdirSync(outDir, { recursive: true });

const encoder = await draco3d.createEncoderModule({});
const decoder = await draco3d.createDecoderModule({});
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
const sharp = (await import('sharp')).default;

const manifest = [];
for (const job of JOBS) {
  if (!fs.existsSync(job.obj)) { console.warn(`SKIP (missing): ${job.obj}`); continue; }
  process.stdout.write(`Converting ${job.name.padEnd(12)} ... `);
  try {
    const glb = await obj2gltf(job.obj, { binary: true, checkTransparency: false });
    const doc = await io.readBinary(new Uint8Array(glb));
    await doc.transform(
      prune(),
      weld({ tolerance: 1e-4 }),
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [res, res] }),
      draco({ quantizationVolume: 'scene' }),
    );
    const out = await io.writeBinary(doc);
    const file = path.join(outDir, `${job.name}.glb`);
    fs.writeFileSync(file, Buffer.from(out));
    manifest.push({ name: job.name, file: `props/${job.name}.glb`, kb: +(out.byteLength / 1024).toFixed(0) });
    console.log(`${(out.byteLength / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
  }
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nDone. ${manifest.length} props → ${outDir}`);
