import { groundRoadMemberships, groundRoadEdgePoints, protectedFootprintClearance } from './roads';
import {
  AD_BILLBOARDS,
  type AdBillboardDef,
  type BillboardMount,
} from './adBillboards';
import { buildSignLayout } from './signLayout';
import { buildCityLayout } from './cityLayout';
import {
  buildingPlacementBounds,
  projectedFootprintHalfExtent,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import { ABOUT_PLAZA_PLACEMENTS, aboutSightlinePointMargin } from './aboutReveal';
import { STUNT_BACKDROP } from './stuntLayout';
import { RESEARCH_WALLS } from './researchLayout';
import { SHIBUYA_FILLER_PLACEMENTS } from './shibuyaFillers';

/**
 * Generates the city's ad-billboard placements. Unlike the old approach (which
 * reused signLayout's slots — biased to the BACK row because its road-clearance
 * gate rejects the 6 m front setback), this walks every building and mounts
 * billboards on the ones whose road-facing facade sits right on the street, then
 * fills the three section scenes (about / projects / research) on their empty
 * facades. Placements are laid front-row-first and spaced so none overlap.
 * Frustum culling keeps the on-screen draw count in check.
 */

export interface AdPlacement {
  id: string;
  def: AdBillboardDef;
  mount: BillboardMount;
  anchor: 'center' | 'ground';
  position: [number, number, number];
  rotationY: number;
  fitBox: [number, number];
}

export const HANG_ARM_LEN = 3.2; // wall->blade projection (matches CenterBlade)

// Section building roles handled by their own fill pass (not the street pass).
const SECTION_ROLES = new Set([
  'about-hero-backdrop',
  'about-plaza',
  'stunt-backdrop',
  'research-front',
  'research-back',
  'shibuya-back',
]);

const MAX_STREET = 150; // safety cap on street billboards

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick(id: string, mount: BillboardMount): AdBillboardDef {
  return AD_BILLBOARDS[hash(`${id}:${mount}`) % AD_BILLBOARDS.length];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function norm2(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** Orientation-aware bold size: landscape driven by width, portrait by height. */
function boldSize(
  aspect: number,
  slotW: number,
  slotH: number,
  wide: [number, number],
  tall: [number, number],
): [number, number] {
  if (aspect >= 1) {
    const w = clamp(slotW * 1.2, wide[0], wide[1]);
    return [w, w / aspect];
  }
  const h = clamp(slotH * 1.6, tall[0], tall[1]);
  return [h * aspect, h];
}

/**
 * Build a billboard mounted on a wall face. `n` is the outward face normal (XZ,
 * normalized); the billboard faces along it. Chooses flat / hanging / pillar by
 * hash. Returns null if it can't sit sensibly on the face.
 */
function faceBillboard(
  id: string,
  faceX: number,
  faceZ: number,
  n: [number, number],
  faceHalfW: number,
  buildingHeight: number,
  opts: { hanging?: boolean; pillar?: boolean } = {},
): AdPlacement | null {
  const rotationY = Math.atan2(n[0], n[1]);
  const faceW = faceHalfW * 2;
  const slotW = Math.max(faceW - 2, 5);
  const slotH = clamp(buildingHeight * 0.42, 8, 24);
  const r = hash(id) % 100;
  // Big per-billboard size variance (0.5x–1.35x) so they don't all read the same
  // size — some small storefront signs, some large hero boards.
  const vary = 0.5 + (hash(`${id}:v`) % 100) / 100 * 0.85;
  const scale = (fit: [number, number]): [number, number] => [fit[0] * vary, fit[1] * vary];

  // Shrink to fit within the building's face (small buildings get small signs).
  const fitToFace = (fit: [number, number], maxW: number, maxH: number): [number, number] => {
    const s = Math.min(1, maxW / fit[0], maxH / fit[1]);
    return [fit[0] * s, fit[1] * s];
  };

  if (opts.hanging && r < 22) {
    const def = pick(id, 'hanging-blade');
    const fit = fitToFace(
      scale(boldSize(def.aspect, slotW, slotH, [6, 11], [7, 14])),
      faceW * 0.8,
      buildingHeight * 0.65,
    );
    const y = clamp(buildingHeight * 0.6, fit[1] / 2 + 7, Math.max(fit[1] / 2 + 7, buildingHeight - 2));
    return {
      id, def, mount: 'hanging-blade', anchor: 'center',
      position: [faceX + n[0] * HANG_ARM_LEN, y, faceZ + n[1] * HANG_ARM_LEN],
      rotationY, fitBox: fit,
    };
  }
  if (opts.pillar && r < 40) {
    // Push further off the facade (2.4 m) so the shallow plinth sits clear in
    // front of the wall instead of clipping into the building side.
    const gx = faceX + n[0] * 2.4;
    const gz = faceZ + n[1] * 2.4;
    if (protectedFootprintClearance(gx, gz, 1.2) > 0) {
      const def = pick(id, 'freestanding-pillar');
      const fit = fitToFace(
        scale(boldSize(def.aspect, slotW, slotH, [8, 14], [9, 15])),
        Math.max(faceW, 10),
        20,
      );
      return {
        id, def, mount: 'freestanding-pillar', anchor: 'ground',
        position: [gx, 0, gz], rotationY, fitBox: fit,
      };
    }
  }

  // Flat wall panel, kept within the building's face (width + height).
  const def = pick(id, 'flat-wall');
  const [w, h] = fitToFace(
    scale(boldSize(def.aspect, slotW, slotH, [9, 22], [9, 20])),
    Math.max(faceW - 1.5, 4),
    buildingHeight * 0.82,
  );
  const y = clamp(buildingHeight * 0.55, h / 2 + 4, Math.max(h / 2 + 4, buildingHeight - h / 2 - 2));
  return {
    id, def, mount: 'flat-wall', anchor: 'center',
    position: [faceX + n[0] * 0.3, y, faceZ + n[1] * 0.3],
    rotationY, fitBox: [w, h],
  };
}

let cachedAll: AdPlacement[] | null = null;

export function getAllAdPlacements(): AdPlacement[] {
  if (cachedAll) return cachedAll;
  const out: AdPlacement[] = [];
  const placed: Array<{ x: number; z: number; r: number; ground: boolean }> = [];
  // Ground-standing (freestanding-pillar) billboards must sit far apart so they
  // read as scattered street furniture, not one clustered row of evenly-spaced
  // pillars. Enforce a big minimum gap between any two ground pillars.
  const GROUND_MIN_GAP = 60;

  const tryAdd = (p: AdPlacement | null): boolean => {
    if (!p) return false;
    const r = p.fitBox[0] / 2;
    const x = p.position[0];
    const z = p.position[2];
    const ground = p.anchor === 'ground';
    for (const q of placed) {
      const d = Math.hypot(x - q.x, z - q.z);
      if (d < r + q.r + 6) return false; // generic overlap spacing
      if (ground && q.ground && d < GROUND_MIN_GAP) return false; // scatter pillars
    }
    placed.push({ x, z, r, ground });
    out.push(p);
    return true;
  };

  // ---- Street-front buildings: mount on the facade that faces the nearest road ----
  const buildings = buildCityLayout();
  // Sampled curb points along every ground road; the direction from a building
  // toward its nearest curb is the way it must FACE (outDir was unreliable and
  // left billboards facing away from the street).
  const edges = groundRoadEdgePoints(10);
  // Nearest curb point + its road binormal (perpendicular to the road). Facing
  // along the binormal keeps every billboard PARALLEL to the road (bases aligned,
  // not slanted), and the curb position lets us keep them off the roadway.
  const nearestEdge = (cx: number, cz: number) => {
    let best: (typeof edges)[number] | null = null;
    let bestD = Infinity;
    for (const e of edges) {
      const dx = e.pos.x - cx;
      const dz = e.pos.z - cz;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  interface Cand {
    id: string; b: OrientedBuildingBounds; n: [number, number];
    halfT: number; faceX: number; faceZ: number; clr: number;
  }
  const cands: Cand[] = [];
  buildings.forEach((pl, index) => {
    if (!pl.outDir) return; // gate to real road-facing buildings (not props)
    if (pl.layoutRole && SECTION_ROLES.has(pl.layoutRole)) return;
    const id = pl.id ?? `st-${index}`;
    if (hash(`${id}:skip`) % 100 < 20) return; // thin the crowd (~20% dropped)
    const b = buildingPlacementBounds(pl);
    if (b.height < 13) return;
    const edge = nearestEdge(b.center.x, b.center.z);
    if (!edge) return;
    // Face perpendicular to the road (road binormal), flipped toward the road.
    const toRoad = norm2(edge.pos.x - b.center.x, edge.pos.z - b.center.z);
    const binSign = edge.bin.x * toRoad[0] + edge.bin.z * toRoad[1] >= 0 ? 1 : -1;
    const n = norm2(edge.bin.x * binSign, edge.bin.z * binSign);
    const halfN = projectedFootprintHalfExtent(b, { x: n[0], z: n[1] });
    const halfT = projectedFootprintHalfExtent(b, { x: -n[1], z: n[0] });
    if (halfT * 2 < 8) return;
    const faceX = b.center.x + n[0] * halfN;
    const faceZ = b.center.z + n[1] * halfN;
    const mem = groundRoadMemberships(faceX, faceZ)
      .filter((m) => !m.endpointCap)
      .sort((a, c) => a.clearance - c.clearance)[0];
    if (!mem) return;
    // Street-front band: front row sits ~6 m off the edge; keep the front+mid row
    // that lines the streets, exclude only the deep back row.
    if (mem.clearance < 2 || mem.clearance > 22) return;
    cands.push({ id, b, n, halfT, faceX, faceZ, clr: mem.clearance });
  });
  cands.sort((a, c) => a.clr - c.clr); // front row first wins the spacing contest
  let streetCount = 0;
  for (const c of cands) {
    if (streetCount >= MAX_STREET) break;
    if (tryAdd(faceBillboard(`st-${c.id}`, c.faceX, c.faceZ, c.n, c.halfT, c.b.height, { hanging: true, pillar: true }))) {
      streetCount += 1;
    }
  }

  // ---- Holograms at validated floating anchors ----
  for (const s of buildSignLayout(buildings)) {
    if (s.mode !== 'hologram') continue;
    const def = pick(s.id, 'holo-floating');
    tryAdd({
      id: `holo-${s.id}`, def, mount: 'holo-floating', anchor: 'center',
      position: s.position, rotationY: s.rotationY,
      fitBox: boldSize(def.aspect, s.width, s.height, [18, 30], [16, 26]),
    });
  }

  // ---- About plaza: flank/east/NE towers, facing the camera (+Z) ----
  ABOUT_PLAZA_PLACEMENTS.forEach((pl, i) => {
    if (!/(_Main|BuildingD)/.test(pl.file)) return; // towers only, skip clutter/trees
    const b = buildingPlacementBounds(pl);
    if (b.height < 24) return;
    const halfN = projectedFootprintHalfExtent(b, { x: 0, z: 1 });
    const halfT = projectedFootprintHalfExtent(b, { x: 1, z: 0 });
    const faceX = b.center.x;
    const faceZ = b.center.z + halfN;
    if (aboutSightlinePointMargin({ x: faceX, z: faceZ }, 10) <= 0) return; // don't block the reveal
    tryAdd(faceBillboard(`about-${i}`, faceX, faceZ, [0, 1], halfT, b.height));
  });

  // ---- Projects: unused stunt backdrops (1/4/5), facing the hero camera (-X) ----
  for (const pl of STUNT_BACKDROP) {
    if (!/backdrop-(1|4|5)$/.test(pl.id ?? '')) continue;
    const b = buildingPlacementBounds(pl);
    const halfT = projectedFootprintHalfExtent(b, { x: 0, z: 1 });
    const faceX = 300; // west facade
    const faceZ = b.center.z;
    tryAdd(faceBillboard(`proj-${pl.id}`, faceX, faceZ, [-1, 0], halfT, b.height));
  }

  // ---- Research: empty front walls (skip the two gateway rows + the far end) ----
  for (const pl of RESEARCH_WALLS) {
    if (pl.layoutRole !== 'research-front') continue;
    const z = pl.position[2];
    if (Math.abs(z + 410) < 10 || Math.abs(z + 522) < 10 || z < -590) continue; // gateway/end panels
    if ((hash(pl.id ?? `${z}`) & 1) === 0) continue; // ~half of them, spaced
    const b = buildingPlacementBounds(pl);
    const side = pl.outDir ? Math.sign(pl.outDir[0]) : 1;
    const n: [number, number] = [side, 0];
    const halfN = projectedFootprintHalfExtent(b, { x: side, z: 0 });
    const halfT = projectedFootprintHalfExtent(b, { x: 0, z: 1 });
    tryAdd(faceBillboard(`res-${pl.id}`, b.center.x + side * halfN, b.center.z, n, halfT, Math.max(b.height, 30)));
  }

  // ---- Shibuya side-street fillers: billboards on the crossing-facing facade ----
  for (const pl of SHIBUYA_FILLER_PLACEMENTS) {
    if (!pl.outDir) continue;
    const b = buildingPlacementBounds(pl);
    const n = norm2(pl.outDir[0], pl.outDir[1]);
    const halfN = projectedFootprintHalfExtent(b, { x: n[0], z: n[1] });
    const halfT = projectedFootprintHalfExtent(b, { x: -n[1], z: n[0] });
    tryAdd(faceBillboard(
      `shibfill-${b.center.x | 0}-${b.center.z | 0}`,
      b.center.x + n[0] * halfN, b.center.z + n[1] * halfN, n, halfT, b.height,
      { hanging: true },
    ));
  }

  // ---- Bridge onramp: two long horizontal roadside ads (replace the removed
  // overhead gateway signs). Landscape art, flanking the road just before water. ----
  const onramp: Array<{ id: string; image: string; x: number; rotationY: number }> = [
    { id: 'onramp-w', image: 'xenia', x: 220, rotationY: Math.PI / 2 },
    { id: 'onramp-e', image: 'waveform', x: 260, rotationY: -Math.PI / 2 },
  ];
  for (const o of onramp) {
    const def = AD_BILLBOARDS.find((d) => d.image === o.image) ?? AD_BILLBOARDS[0];
    const w = 34;
    tryAdd({
      id: o.id, def, mount: 'flat-wall', anchor: 'center',
      position: [o.x, 13, -572], rotationY: o.rotationY,
      fitBox: [w, w / def.aspect],
    });
  }

  cachedAll = out;
  return out;
}
