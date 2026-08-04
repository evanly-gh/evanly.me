/**
 * process-gallery-core.mjs — shared multi-format → optimized-GLB conversion for
 * the `?gallery` dev page. Converts OBJ (obj2gltf), glTF (direct), and FBX
 * (fbx2gltf) sources into DRACO + WebP GLBs with ORIGINAL geometry dimensions
 * preserved (no rescale, no simplify — the gallery shows assets as-authored).
 *
 * Mirrors the conventions of process-props-core.mjs / process-kitbash.mjs but is
 * deliberately lenient: this is dev scaffolding, so per-file byte budgets are not
 * enforced and a single bad source is skipped by the caller rather than aborting.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const require = createRequire(import.meta.url);
const obj2gltf = require('obj2gltf');

/** Material-name hints that mark a piece as emissive (neon/glass/etc.), matching
 *  process-kitbash.mjs so the gallery HUD/labels can flag glowing pieces. */
export const EMISSIVE_PATTERNS = ['light', 'glass', 'banner', 'letters', 'neon', 'decal', 'screen', 'sign', 'led'];

export function pieceHasEmissive(document) {
  for (const m of document.getRoot().listMaterials()) {
    const n = (m.getName() || '').toLowerCase();
    if (EMISSIVE_PATTERNS.some((p) => n.includes(p))) return true;
    const e = m.getEmissiveFactor?.();
    if (e && (e[0] > 0.01 || e[1] > 0.01 || e[2] > 0.01)) return true;
  }
  return false;
}

export function documentBbox(document) {
  const bounds = document.getRoot().listScenes().map((scene) => getBounds(scene));
  if (bounds.length === 0) return [0, 0, 0];
  const min = [0, 1, 2].map((axis) => Math.min(...bounds.map((b) => b.min[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...bounds.map((b) => b.max[axis])));
  return max.map((v, i) => +(v - min[i]).toFixed(3));
}

export function countTris(document) {
  let t = 0;
  for (const mesh of document.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      t += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  return Math.round(t);
}

export async function createTransformIO() {
  const [encoder, decoder] = await Promise.all([
    draco3d.createEncoderModule({}),
    draco3d.createDecoderModule({}),
  ]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
}

/** Read any supported source into a gltf-transform Document. FBX support is
 *  optional: if fbx2gltf is not installed the FBX branch throws
 *  'FBX_TOOLING_MISSING' so the caller can skip the whole pack cleanly. */
export async function convertToDocument(io, job) {
  if (job.type === 'obj') {
    const glb = await obj2gltf(job.input, { binary: true, checkTransparency: false });
    return io.readBinary(new Uint8Array(glb));
  }
  if (job.type === 'gltf') {
    return io.read(job.input);
  }
  if (job.type === 'fbx') {
    let convertFbx;
    try {
      convertFbx = (await import('fbx2gltf')).default;
    } catch {
      throw new Error('FBX_TOOLING_MISSING');
    }
    const tmp = path.join(os.tmpdir(), `fbx-${process.pid}-${Math.abs(hashStr(job.input))}.glb`);
    let outPath;
    try {
      outPath = await convertFbx(job.input, tmp, ['--binary', '--pbr-metallic-roughness']);
    } catch (e) {
      // Older signatures / flag differences: retry minimal.
      outPath = await convertFbx(job.input, tmp, ['--binary']);
    }
    const finalPath = typeof outPath === 'string' && fs.existsSync(outPath) ? outPath : tmp;
    if (!fs.existsSync(finalPath)) throw new Error(`fbx2gltf produced no output for ${job.input}`);
    const buf = fs.readFileSync(finalPath);
    fs.rmSync(finalPath, { force: true });
    return io.readBinary(new Uint8Array(buf));
  }
  throw new Error(`unknown job type: ${job.type}`);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Convert one job to an optimized GLB buffer + metadata.
 * @returns {{buffer:Buffer, bbox:number[], tris:number, hasEmissive:boolean, textures:number}}
 */
export async function createGalleryConverter() {
  const io = await createTransformIO();
  const sharp = (await import('sharp')).default;

  return async (job, res) => {
    const document = await convertToDocument(io, job);
    const bbox = documentBbox(document);
    if (!bbox.every((v) => Number.isFinite(v) && v >= 0) || bbox.every((v) => v === 0)) {
      throw new Error(`degenerate/empty geometry (bbox=${JSON.stringify(bbox)})`);
    }
    const hasEmissive = pieceHasEmissive(document);

    // Optimize. Texture compression can fail on odd source images; if it does,
    // fall back to geometry-only compression so the piece still ships (textured
    // from the original embedded image).
    const geomOnly = [prune(), weld({ tolerance: 1e-4 }), dedup(), draco({ quantizationVolume: 'scene' })];
    try {
      await document.transform(
        prune(),
        weld({ tolerance: 1e-4 }),
        dedup(),
        textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [res, res] }),
        draco({ quantizationVolume: 'scene' }),
      );
    } catch (e) {
      // Re-read a clean document (the failed transform may have left it partial).
      const fresh = await convertToDocument(io, job);
      await fresh.transform(...geomOnly);
      const buffer = Buffer.from(await io.writeBinary(fresh));
      return { buffer, bbox, tris: countTris(fresh), hasEmissive, textures: fresh.getRoot().listTextures().length };
    }

    const buffer = Buffer.from(await io.writeBinary(document));
    return { buffer, bbox, tris: countTris(document), hasEmissive, textures: document.getRoot().listTextures().length };
  };
}

/** Publish a fully-staged directory to outDir. Removes any existing outDir first,
 *  then renames the stage into place; on Windows the rename can hit EPERM
 *  (handles not yet released), so fall back to a recursive copy. */
export function publishDirectory(stageDir, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  try {
    fs.renameSync(stageDir, outDir);
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'ENOTEMPTY') throw error;
    fs.cpSync(stageDir, outDir, { recursive: true });
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}
