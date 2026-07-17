/**
 * process-kitbash.mjs — Offline pipeline: KitBash NeoCity OBJ → per-piece
 * DRACO GLB with PBR materials/textures PRESERVED.
 *
 * Attempt-3 rewrite. Differs from cybersite's version: no `unlit`, no
 * vertex-color bake, no material merge — original named materials and their
 * texture maps are kept. Two-step textures: embedded PNG (default) or KTX2
 * (`--ktx2`). Scoped runs via `--only`.
 *
 * Usage:
 *   node tools/process-kitbash.mjs [obj] [--only=BldgLG_C,BldgSM_A] [--ktx2]
 */
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CLI parsing ---
const argv = process.argv.slice(2);
const flags = { only: null, ktx2: false, obj: null };
for (const a of argv) {
  if (a.startsWith('--only=')) flags.only = a.slice(7).split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--ktx2') flags.ktx2 = true;
  else if (!a.startsWith('--')) flags.obj = a;
}

const DEFAULT_OBJ = path.join(
  os.homedir(), 'Downloads', 'Cyber Assets', 'Cyber_kitbash_neocity',
  'kb3d_neocity-native.obj'
);
const srcObj = flags.obj ? path.resolve(flags.obj.replace(/^~/, os.homedir())) : DEFAULT_OBJ;
const srcDir = path.dirname(srcObj);
const outDir = path.resolve(__dirname, '..', 'public', 'models', 'neocity');

// --- Source validation (fail LOUD, not silent-grey like attempt 2) ---
if (!fs.existsSync(srcObj)) {
  console.error(`ERROR: source OBJ not found: ${srcObj}`);
  process.exit(1);
}
const mtlPath = srcObj.replace(/\.obj$/i, '.mtl');
if (!fs.existsSync(mtlPath)) {
  console.error(`ERROR: MTL not found next to OBJ: ${mtlPath}`);
  process.exit(1);
}
// The MTL references KB3DTextures/4k/<name>.png. Verify at least one resolves.
const texDir = path.join(srcDir, 'KB3DTextures', '4k');
const altTexDir = path.join(srcDir, 'kb3d_neocity.png.4k');
if (!fs.existsSync(texDir) || fs.readdirSync(texDir).length === 0) {
  console.error(
    `ERROR: textures not found at ${texDir}\n` +
    `The MTL expects KB3DTextures/4k/<name>.png. Populate it first:\n` +
    `  cd "${srcDir}"\n` +
    `  mklink /D "KB3DTextures\\4k" "kb3d_neocity.png.4k"   (admin cmd)\n` +
    `Actual textures live at: ${altTexDir}`
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
console.log(`Source OBJ : ${srcObj}`);
console.log(`Textures   : ${texDir}`);
console.log(`Output dir : ${outDir}`);
console.log(`Mode       : ${flags.ktx2 ? 'KTX2' : 'embedded PNG'}${flags.only ? `  only=[${flags.only.join(',')}]` : ''}`);

// Tasks 7-9 append conversion/split/optimize/write below.

import { createRequire } from 'module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const require = createRequire(import.meta.url);

console.log('\n[1/4] Converting OBJ -> GLB (PBR preserved, ~25s) ...');
const obj2gltf = require('obj2gltf');
const t0 = Date.now();
// NOTE: no `unlit`. PBR materials + texture maps are preserved.
let fullGlb = await obj2gltf(srcObj, { binary: true, checkTransparency: false });
console.log(`  Done, GLB ${(fullGlb.length / 1048576).toFixed(1)} MB`);

console.log('[2/4] Loading into gltf-transform ...');
const encoder = await draco3d.createEncoderModule({});
const decoder = await draco3d.createDecoderModule({});
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
const masterDoc = await io.readBinary(new Uint8Array(fullGlb));
fullGlb = null;
const masterScene = masterDoc.getRoot().listScenes()[0];
const masterNodes = masterScene.listChildren();
console.log(`  ${masterNodes.length} scene children (expect 47)`);
