/**
 * process-height-variants.mjs — generate 5 NEW neocity building heights by
 * cutting a plane through the LOWER HALF of a tall tower and KEEPING THE UPPER
 * portion (the crown / setbacks / roof detail), then grounding it. This yields
 * silhouettes that read clearly different from the source towers (vs. keeping
 * the base, which just looks like the original building shortened). Real
 * Sutherland–Hodgman triangle/plane clipping preserves wall textures/UVs; a flat
 * floor cap closes the cut underside.
 *
 * Output: public/models/neocity-variants/{*.glb, manifest.json} (category VARIANT).
 * Usage: node tools/process-height-variants.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, draco, flatten, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { documentBbox, countTris, pieceHasEmissive, publishDirectory } from './process-gallery-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEOCITY = path.resolve(__dirname, '..', 'public', 'models', 'neocity');
const OUT = path.resolve(__dirname, '..', 'public', 'models', 'neocity-variants');

// ---------- source / cut selection ----------

/** Towers = the vertical building masses (not bases/antennas/props). */
function readTowers() {
  const manifest = JSON.parse(fs.readFileSync(path.join(NEOCITY, 'manifest.json'), 'utf8'));
  return manifest
    .filter((e) => /Main|Building/.test(e.name) && (e.category === 'LG' || e.category === 'MD') && e.bbox[1] > 24)
    .map((e) => ({ name: e.name, file: path.join(NEOCITY, path.basename(e.file)), height: e.bbox[1] }))
    .sort((a, b) => b.height - a.height);
}

/**
 * Choose 5 (source, cut) pairs. Cut lies in the tower's LOWER HALF (fraction
 * < 0.5 of height); the kept upper portion becomes a building of height
 * H*(1-fraction). Each resulting height is kept >2m from every existing tower
 * height and from the other variants.
 */
function pickVariants(towers) {
  const existing = towers.map((t) => t.height);
  const sources = towers.slice(0, 5); // 5 tallest distinct towers → substantial crowns
  const fracs = [0.42, 0.38, 0.34, 0.40, 0.36];
  const chosen = [];
  const clash = (v) => existing.some((x) => Math.abs(x - v) <= 2) || chosen.some((c) => Math.abs(c.result - v) <= 2);

  sources.forEach((src, i) => {
    const H = src.height;
    let f = fracs[i % fracs.length];
    let result = Math.round(H * (1 - f));
    let guard = 0;
    while (clash(result) && guard++ < 40) {
      f += 0.015;
      if (f > 0.48) f = 0.2;
      result = Math.round(H * (1 - f));
    }
    if (clash(result)) return;
    chosen.push({ src, cut: +(H * f).toFixed(3), result });
  });
  return chosen;
}

// ---------- geometry clipping ----------

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpVert(a, b, t) {
  return {
    p: [lerp(a.p[0], b.p[0], t), lerp(a.p[1], b.p[1], t), lerp(a.p[2], b.p[2], t)],
    n: a.n && b.n ? [lerp(a.n[0], b.n[0], t), lerp(a.n[1], b.n[1], t), lerp(a.n[2], b.n[2], t)] : null,
    uv: a.uv && b.uv ? [lerp(a.uv[0], b.uv[0], t), lerp(a.uv[1], b.uv[1], t)] : null,
  };
}

/** Clip a triangle to the half-space y >= c (KEEP UPPER). Returns 0..2 tris. */
function clipTriangle(v, c) {
  const poly = [];
  for (let i = 0; i < 3; i++) {
    const a = v[i], b = v[(i + 1) % 3];
    const ain = a.p[1] >= c, bin = b.p[1] >= c;
    if (ain) poly.push(a);
    if (ain !== bin) {
      const t = (c - a.p[1]) / (b.p[1] - a.p[1]);
      poly.push(lerpVert(a, b, t));
    }
  }
  const tris = [];
  for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
  return tris;
}

function triArea2(a, b, c) {
  const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
  const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return cx * cx + cy * cy + cz * cz;
}

function readVerts(prim) {
  const pos = prim.getAttribute('POSITION').getArray();
  const nor = prim.getAttribute('NORMAL')?.getArray() ?? null;
  const uv = prim.getAttribute('TEXCOORD_0')?.getArray() ?? null;
  const idxAcc = prim.getIndices();
  const count = pos.length / 3;
  const idx = idxAcc ? idxAcc.getArray() : Array.from({ length: count }, (_, i) => i);
  const vert = (i) => ({
    p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
    n: nor ? [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]] : null,
    uv: uv ? [uv[i * 2], uv[i * 2 + 1]] : null,
  });
  return { idx, vert, hasNor: !!nor, hasUv: !!uv };
}

/** Clip every primitive to y >= c (keep upper); return XZ bbox of kept verts. */
function clipDocument(doc, c) {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const { idx, vert, hasNor, hasUv } = readVerts(prim);
      const P = [], N = [], U = [];
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const tris = clipTriangle([vert(idx[t]), vert(idx[t + 1]), vert(idx[t + 2])], c);
        for (const tri of tris) {
          if (triArea2(tri[0], tri[1], tri[2]) < 1e-12) continue;
          for (const vtx of tri) {
            P.push(vtx.p[0], vtx.p[1], vtx.p[2]);
            if (hasNor) N.push(vtx.n[0], vtx.n[1], vtx.n[2]);
            if (hasUv) U.push(vtx.uv[0], vtx.uv[1]);
            box.minX = Math.min(box.minX, vtx.p[0]); box.maxX = Math.max(box.maxX, vtx.p[0]);
            box.minZ = Math.min(box.minZ, vtx.p[2]); box.maxZ = Math.max(box.maxZ, vtx.p[2]);
          }
        }
      }
      if (P.length === 0) { prim.dispose(); continue; }
      prim.setIndices(null);
      prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)));
      if (hasNor) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)));
      else prim.setAttribute('NORMAL', null);
      if (hasUv) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)));
      else prim.setAttribute('TEXCOORD_0', null);
    }
    if (mesh.listPrimitives().length === 0) mesh.dispose();
  }
  return box;
}

/** Add a flat floor cap (2 downward triangles) covering the XZ box at height y. */
function addCap(doc, box, y) {
  const { minX, maxX, minZ, maxZ } = box;
  if (!Number.isFinite(minX)) return;
  const mat = doc.createMaterial('floor_cap')
    .setBaseColorFactor([0.04, 0.05, 0.08, 1])
    .setEmissiveFactor([0.05, 0.07, 0.14])
    .setMetallicFactor(0).setRoughnessFactor(0.9).setName('floor_cap');
  // two triangles wound to face downward (−Y)
  const P = [
    minX, y, minZ, maxX, y, maxZ, maxX, y, minZ,
    minX, y, minZ, minX, y, maxZ, maxX, y, maxZ,
  ];
  const N = new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? -1 : 0));
  const U = [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1];
  const prim = doc.createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)));
  const mesh = doc.createMesh('floor_cap_mesh').addPrimitive(prim);
  const node = doc.createNode('floor_cap_node').setMesh(mesh);
  doc.getRoot().listScenes()[0].addChild(node);
}

/** Shift every POSITION so the scene's min Y sits on 0; returns the offset. */
function ground(doc) {
  let minY = Infinity;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION').getArray();
      for (let i = 1; i < a.length; i += 3) minY = Math.min(minY, a[i]);
    }
  if (!Number.isFinite(minY) || Math.abs(minY) < 1e-6) return 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute('POSITION');
      const a = acc.getArray().slice();
      for (let i = 1; i < a.length; i += 3) a[i] -= minY;
      acc.setArray(a);
    }
  return minY;
}

// ---------- main ----------

async function main() {
  const [encoder, decoder] = await Promise.all([draco3d.createEncoderModule({}), draco3d.createDecoderModule({})]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });

  const towers = readTowers();
  if (towers.length < 3) { console.error('Not enough neocity towers found; run assets:kitbash first.'); process.exit(1); }
  const variants = pickVariants(towers);
  console.log(`Existing tower heights: ${towers.map((t) => t.height.toFixed(1)).join(', ')}`);
  console.log(`New variant heights: ${variants.map((v) => v.result).join(', ')}\n`);

  fs.mkdirSync(OUT, { recursive: true });
  const stage = fs.mkdtempSync(path.resolve(OUT, '..', '.variants-'));
  const manifest = [];

  try {
    for (const { src, cut } of variants) {
      const doc = await io.read(src.file);
      // bake any node transforms into geometry, then flatten to a clean scene
      await doc.transform(flatten());
      for (const node of doc.getRoot().listNodes()) {
        try { clearNodeTransform(node); } catch { /* mesh shared / already clear */ }
      }
      ground(doc);                       // tower now sits 0..H
      const box = clipDocument(doc, cut); // discard lower part, keep y >= cut
      ground(doc);                       // drop the kept crown back down to y=0
      addCap(doc, box, 0);               // close the cut underside
      await doc.transform(prune(), weld({ tolerance: 1e-4 }), dedup(), draco({ quantizationVolume: 'scene' }));

      const bbox = documentBbox(doc);
      const tris = countTris(doc);
      const name = `${src.name}_H${Math.round(bbox[1])}`;
      const buf = Buffer.from(await io.writeBinary(doc));
      fs.writeFileSync(path.join(stage, `${name}.glb`), buf);
      manifest.push({ name, file: `neocity-variants/${name}.glb`, bbox, tris, hasEmissive: pieceHasEmissive(doc), category: 'VARIANT' });
      console.log(`  ${name.padEnd(34)} keep top of ${src.name} (${src.height.toFixed(1)}m, cut@${cut.toFixed(1)}m) → ${bbox[1].toFixed(1)}m  ${(buf.length / 1024).toFixed(0)} KB tris=${tris}`);
    }

    manifest.sort((a, b) => a.bbox[1] - b.bbox[1]);
    fs.writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    publishDirectory(stage, OUT);
    console.log(`\nDone. ${manifest.length} height variants → ${OUT}`);
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
