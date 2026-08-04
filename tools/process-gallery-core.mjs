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
    const prepared = prepareObj(job.input);
    try {
      const glb = await obj2gltf(prepared.objPath, { binary: true, checkTransparency: false });
      return await io.readBinary(new Uint8Array(glb));
    } finally {
      prepared.cleanup();
    }
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

// ---------------------------------------------------------------------------
// Texture repair. Many source assets reference textures by ABSOLUTE paths from
// the original author's machine (C:\Users\...) that don't exist here, so the
// converter falls back to a flat grey material. These helpers repoint them at
// the real local files instead.
// ---------------------------------------------------------------------------

const MAP_KEYS = /^(\s*)(map_Kd|map_Ka|map_Ke|map_Ks|map_Bump|map_bump|bump|norm|map_Ns|map_d|refl)\b(.*)$/gim;

/** Directories to search for a texture referenced by an OBJ's MTL. */
function textureSearchDirs(objDir) {
  const dirs = [objDir];
  const scan = (d) => {
    try {
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e);
        if (fs.statSync(p).isDirectory() && (/\.fbm$/i.test(e) || /textures?/i.test(e))) {
          dirs.push(p);
          for (const e2 of fs.readdirSync(p)) { // one level deeper (nested textures/)
            const p2 = path.join(p, e2);
            if (fs.statSync(p2).isDirectory() && /textures?/i.test(e2)) dirs.push(p2);
          }
        }
      }
    } catch { /* unreadable dir */ }
  };
  scan(objDir);
  return dirs;
}

/**
 * If the OBJ's MTL references textures by dead/absolute paths, write a temp
 * OBJ+MTL with each map repointed to the matching local file (by basename) or,
 * if none exists locally, the dead map line dropped. Returns the path to feed
 * obj2gltf plus a cleanup fn. No-op (returns the original) when nothing changes.
 */
export function prepareObj(objPath) {
  const noop = { objPath, cleanup() {} };
  let objText;
  try { objText = fs.readFileSync(objPath, 'utf8'); } catch { return noop; }
  const mtlMatch = objText.match(/^\s*mtllib\s+(.+)$/m);
  if (!mtlMatch) return noop;
  const objDir = path.dirname(objPath);
  let mtlPath = path.join(objDir, mtlMatch[1].trim());
  if (!fs.existsSync(mtlPath)) {
    // The OBJ's mtllib often names a renamed/missing file (uploads_* prefixes);
    // fall back to any .mtl beside the OBJ, preferring one matching the stem.
    const stem = path.basename(mtlMatch[1].trim(), '.mtl').toLowerCase();
    let mtls = [];
    try { mtls = fs.readdirSync(objDir).filter((f) => /\.mtl$/i.test(f)); } catch { /* */ }
    const best = mtls.find((f) => f.toLowerCase().includes(stem)) ?? mtls[0];
    if (!best) return noop;
    mtlPath = path.join(objDir, best);
  }

  const searchDirs = textureSearchDirs(path.dirname(objPath));
  const findTex = (token) => {
    const base = path.basename(token.replace(/\\/g, '/'));
    for (const d of searchDirs) { const f = path.join(d, base); if (fs.existsSync(f)) return f; }
    return null;
  };

  let changed = false;
  const mtlText = fs.readFileSync(mtlPath, 'utf8').replace(MAP_KEYS, (line, ind, key, rest) => {
    const toks = rest.trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) return line;
    const pathTok = toks[toks.length - 1]; // path is the final token (after any -s/-o options)
    const asIs = path.isAbsolute(pathTok) ? pathTok : path.join(path.dirname(mtlPath), pathTok);
    if (fs.existsSync(asIs)) { changed = true; return `${ind}${key} ${asIs.replace(/\\/g, '/')}`; }
    const local = findTex(pathTok);
    changed = true;
    return local ? `${ind}${key} ${local.replace(/\\/g, '/')}` : `# dropped ${key} (no local texture)`;
  });
  if (!changed) return noop;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'objfix-'));
  fs.writeFileSync(path.join(tmpDir, 'material.mtl'), mtlText);
  fs.writeFileSync(path.join(tmpDir, 'model.obj'), objText.replace(/^\s*mtllib\s+.+$/m, 'mtllib material.mtl'));
  return { objPath: path.join(tmpDir, 'model.obj'), cleanup() { fs.rmSync(tmpDir, { recursive: true, force: true }); } };
}

/** Walk up from a source file to find a sibling `Textures` directory. */
function findTexturesDir(file) {
  let dir = path.dirname(file);
  for (let i = 0; i < 4; i++) {
    const cand = path.join(dir, 'Textures');
    if (fs.existsSync(cand)) { try { if (fs.statSync(cand).isDirectory()) return cand; } catch { /* */ } }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Monogon FBX materials arrive with UVs but no bound baseColor texture (the
 * diffuse lives in a sibling Textures/ atlas that fbx2gltf didn't link, so prune
 * strips it → a flat/translucent blob). Bind the matching diffuse atlas by
 * material name and force the material opaque.
 */
export function bindMonogonTextures(doc, fbxPath) {
  const texDir = findTexturesDir(fbxPath);
  if (!texDir) return;
  let files;
  try { files = fs.readdirSync(texDir).filter((f) => /\.(png|jpe?g)$/i.test(f)); } catch { return; }
  if (files.length === 0) return;
  const diffuses = files.filter((f) => /diffuse|basecolor|albedo/i.test(f) && !/emissive|normal|rough|metal/i.test(f));
  const pool = diffuses.length ? diffuses : files;
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cache = new Map();

  const pickFor = (matName) => {
    const key = norm(matName).replace(/^m/, '');
    let f = key.length > 3 ? pool.find((fn) => norm(fn).includes(key)) : null;
    if (!f) f = pool.find((fn) => /building/i.test(fn)) ?? pool[0];
    return f ?? null;
  };

  for (const mat of doc.getRoot().listMaterials()) {
    // fbx2gltf assigns a ~70-byte placeholder baseColor texture for unresolved
    // FBX maps; treat anything under 4 KB as "no real texture" and rebind.
    const existing = mat.getBaseColorTexture();
    if (existing && (existing.getImage()?.byteLength ?? 0) > 4096) continue;
    const fname = pickFor(mat.getName());
    if (!fname) continue;
    let tex = cache.get(fname);
    if (!tex) {
      const bytes = fs.readFileSync(path.join(texDir, fname));
      const mime = /\.jpe?g$/i.test(fname) ? 'image/jpeg' : 'image/png';
      tex = doc.createTexture(fname).setImage(new Uint8Array(bytes)).setMimeType(mime);
      cache.set(fname, tex);
    }
    mat.setBaseColorTexture(tex);
    mat.setBaseColorFactor([1, 1, 1, 1]);
    mat.setAlphaMode('OPAQUE');
  }
}

/**
 * Structures sources ship no usable textures (dead absolute paths, or the file
 * isn't in the download). Give texture-less materials a colour from their name
 * (M_Yellow/M_Red/...) or a deterministic cyberpunk palette, plus a little
 * emissive, so they read as buildings rather than one grey blob.
 */
export function applyStructureColors(doc) {
  const named = {
    yellow: [0.92, 0.76, 0.22], red: [0.86, 0.26, 0.32], white: [0.9, 0.9, 0.95],
    blue: [0.3, 0.55, 0.92], green: [0.38, 0.8, 0.52], orange: [0.95, 0.55, 0.2],
    grey: [0.55, 0.56, 0.62], gray: [0.55, 0.56, 0.62], black: [0.14, 0.15, 0.2],
  };
  const palette = [[0.72, 0.76, 0.85], [0.5, 0.62, 0.82], [0.82, 0.68, 0.5], [0.55, 0.5, 0.68], [0.45, 0.72, 0.75]];
  doc.getRoot().listMaterials().forEach((mat, i) => {
    if (mat.getBaseColorTexture()) return;
    const n = (mat.getName() || '').toLowerCase();
    let col = null;
    for (const k of Object.keys(named)) if (n.includes(k)) { col = named[k]; break; }
    if (!col) col = palette[i % palette.length];
    mat.setBaseColorFactor([col[0], col[1], col[2], 1]);
    mat.setEmissiveFactor([col[0] * 0.14, col[1] * 0.14, col[2] * 0.2]);
    mat.setMetallicFactor(0.1);
    mat.setRoughnessFactor(0.7);
    mat.setAlphaMode('OPAQUE');
  });
}

/**
 * Convert one job to an optimized GLB buffer + metadata.
 * @returns {{buffer:Buffer, bbox:number[], tris:number, hasEmissive:boolean, textures:number}}
 */
export async function createGalleryConverter() {
  const io = await createTransformIO();
  const sharp = (await import('sharp')).default;

  const load = async (job) => {
    const d = await convertToDocument(io, job);
    if (job.category === 'monogon') bindMonogonTextures(d, job.input);
    if (job.category === 'structures') applyStructureColors(d);
    return d;
  };

  return async (job, res) => {
    const document = await load(job);
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
      const fresh = await load(job);
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
