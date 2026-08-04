/**
 * process-height-variants.mjs — generate 5 NEW neocity building heights by
 * clipping tall towers at a horizontal plane, filling the largest gaps in the
 * existing height distribution. Real geometry surgery (Sutherland–Hodgman
 * triangle/plane clipping with attribute interpolation) so wall textures/UVs
 * survive, plus a flat roof cap so the cut top doesn't read as hollow.
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

// ---------- height / source selection ----------

/** Towers = the vertical building masses (not bases/antennas/props). */
function readTowers() {
  const manifest = JSON.parse(fs.readFileSync(path.join(NEOCITY, 'manifest.json'), 'utf8'));
  return manifest
    .filter((e) => /Main|Building/.test(e.name) && (e.category === 'LG' || e.category === 'MD') && e.bbox[1] > 15)
    .map((e) => ({ name: e.name, file: path.join(NEOCITY, path.basename(e.file)), height: e.bbox[1] }))
    .sort((a, b) => a.height - b.height);
}

/** Pick 5 target heights in the largest gaps of the existing height set. */
function pickTargets(towers) {
  const heights = towers.map((t) => t.height);
  const gaps = [];
  for (let i = 0; i < heights.length - 1; i++) {
    gaps.push({ lo: heights[i], hi: heights[i + 1], size: heights[i + 1] - heights[i] });
  }
  gaps.sort((a, b) => b.size - a.size);
  const targets = [];
  for (const g of gaps) {
    if (targets.length >= 5) break;
    let h = Math.round((g.lo + g.hi) / 2);
    // keep >1m from any existing height and any already-chosen target
    const clash = (v) => heights.some((x) => Math.abs(x - v) <= 1) || targets.some((t) => Math.abs(t - v) <= 1);
    let guard = 0;
    while (clash(h) && guard++ < 20) h += 1;
    if (!clash(h)) targets.push(h);
  }
  return targets.sort((a, b) => a - b);
}

/** Shortest tower still taller than target+3 (most detail retained), else tallest. */
function pickSource(towers, target) {
  const taller = towers.filter((t) => t.height > target + 3).sort((a, b) => a.height - b.height);
  return taller[0] ?? towers[towers.length - 1];
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

/** Clip a triangle to the half-space y <= h. Returns 0..2 triangles. */
function clipTriangle(v, h) {
  const poly = [];
  for (let i = 0; i < 3; i++) {
    const a = v[i], b = v[(i + 1) % 3];
    const ain = a.p[1] <= h, bin = b.p[1] <= h;
    if (ain) poly.push(a);
    if (ain !== bin) {
      const t = (h - a.p[1]) / (b.p[1] - a.p[1]);
      poly.push(lerpVert(a, b, t));
    }
  }
  const tris = [];
  for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
  return tris;
}

function triArea2(a, b, c) {
  // squared area *4 via cross product magnitude — used to drop degenerate tris
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

/** Clip every primitive of the document in place; return XZ bbox of kept verts. */
function clipDocument(doc, h) {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const { idx, vert, hasNor, hasUv } = readVerts(prim);
      const P = [], N = [], U = [];
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const tris = clipTriangle([vert(idx[t]), vert(idx[t + 1]), vert(idx[t + 2])], h);
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

/** Add a flat roof cap (2 triangles) covering the XZ box at height h. */
function addCap(doc, box, h) {
  const { minX, maxX, minZ, maxZ } = box;
  if (!Number.isFinite(minX)) return;
  const mat = doc.createMaterial('roof_cap')
    .setBaseColorFactor([0.05, 0.06, 0.09, 1])
    .setEmissiveFactor([0.08, 0.12, 0.22])
    .setMetallicFactor(0).setRoughnessFactor(0.85).setName('roof_cap');
  // two CCW-from-above triangles
  const P = [
    minX, h, minZ, maxX, h, minZ, maxX, h, maxZ,
    minX, h, minZ, maxX, h, maxZ, minX, h, maxZ,
  ];
  const N = new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0));
  const U = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  const prim = doc.createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)));
  const mesh = doc.createMesh('roof_cap_mesh').addPrimitive(prim);
  const node = doc.createNode('roof_cap_node').setMesh(mesh);
  doc.getRoot().listScenes()[0].addChild(node);
}

/** Shift every POSITION so the scene sits on y=0; returns the applied offset. */
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
  const targets = pickTargets(towers);
  console.log(`Existing tower heights: ${towers.map((t) => t.height.toFixed(1)).join(', ')}`);
  console.log(`Target new heights: ${targets.join(', ')}\n`);

  fs.mkdirSync(OUT, { recursive: true });
  const stage = fs.mkdtempSync(path.resolve(OUT, '..', '.variants-'));
  const manifest = [];

  try {
    for (const h of targets) {
      const src = pickSource(towers, h);
      const doc = await io.read(src.file);
      // bake any node transforms into geometry, then flatten to a clean scene
      await doc.transform(flatten());
      for (const node of doc.getRoot().listNodes()) {
        try { clearNodeTransform(node); } catch { /* mesh shared / already clear */ }
      }
      ground(doc);
      const box = clipDocument(doc, h);
      addCap(doc, box, h);
      await doc.transform(prune(), weld({ tolerance: 1e-4 }), dedup(), draco({ quantizationVolume: 'scene' }));

      const bbox = documentBbox(doc);
      const tris = countTris(doc);
      const name = `${src.name}_H${h}`;
      const buf = Buffer.from(await io.writeBinary(doc));
      fs.writeFileSync(path.join(stage, `${name}.glb`), buf);
      manifest.push({ name, file: `neocity-variants/${name}.glb`, bbox, tris, hasEmissive: pieceHasEmissive(doc), category: 'VARIANT' });
      console.log(`  ${name.padEnd(36)} from ${src.name} (${src.height.toFixed(1)}m → ${bbox[1].toFixed(1)}m)  ${(buf.length / 1024).toFixed(0)} KB tris=${tris}`);
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
