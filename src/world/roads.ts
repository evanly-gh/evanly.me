import * as THREE from 'three';
import {
  buildShibuyaPlaza,
  buildShibuyaSideRoads,
  shibuyaPlazaContains,
  shibuyaPlazaClearance,
} from './intersections';
import { buildGroundRouteCurve } from './route';
import {
  orientedFootprintCorners,
  projectedFootprintHalfExtent,
  segmentFootprintClearance,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import { BRIDGE_CORRIDOR } from './bridgeLayout';

const UP = new THREE.Vector3(0, 1, 0);

export interface RoadDef {
  id: string;
  kind: 'main-route' | 'cross-street' | 'shibuya-side' | 'elevated-highway';
  curve: THREE.Curve<THREE.Vector3>;
  halfWidth: number;
  ground: boolean; // ground roads carve the building grid; elevated ones pass over
  level: number;   // y of the road deck
  source?: 'route-ground-projection';
}

// ── Main city road: the bike route's direct horizontal projection. Ground
//    asphalt stays level while x/z points and frames retain one route source. ──
const mainCurve = buildGroundRouteCurve();

// ── One secondary ground cross-street: crosses the main boulevard (which runs
//    along z≈0) perpendicularly at x=-60, making a clean + intersection. ──
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const cross = new THREE.CatmullRomCurve3(
  [V(-60, 0, 95), V(-60, 0, 0), V(-62, 0, -120), V(-70, 0, -210)], false, 'centripetal', 0.5);

// ── Decorative elevated highway: a modest-height background arc north/east of
//    the dense district. Endpoints remain beyond the city grid, while the
//    central sweep stays north of z=150 and away from Shibuya/stunt axes. ──
export const ELEVATED_HIGHWAY_ID = 'elevated-highway';
export const DECK_UNDERSIDE_OFFSET = 1.4;
export const BUILDING_DECK_VERTICAL_MARGIN = 4;
export const ELEVATED_DECK_HALF_WIDTH_PADDING = 0.8;
export const ELEVATED_DECK_SAMPLE_COUNT = 1024;
export const ELEVATED_HIGHWAY_CONTROL_POINTS = [
  V(-620, 74, 330),
  V(-360, 72, 230),
  V(-80, 76, 190),
  V(220, 75, 205),
  V(480, 72, 285),
  V(640, 74, 390),
] as const;
const hwy = new THREE.CatmullRomCurve3(
  ELEVATED_HIGHWAY_CONTROL_POINTS.map((point) => point.clone()),
  false, 'centripetal', 0.5);
const shibuyaSideRoads = buildShibuyaSideRoads();

export const ROADS: RoadDef[] = [
  {
    id: 'main-route',
    kind: 'main-route',
    curve: mainCurve,
    halfWidth: 11,
    ground: true,
    level: 0,
    source: 'route-ground-projection',
  },
  {
    id: 'cross-street',
    kind: 'cross-street',
    curve: cross,
    halfWidth: 7,
    ground: true,
    level: 0,
  },
  {
    id: ELEVATED_HIGHWAY_ID,
    kind: 'elevated-highway',
    curve: hwy,
    halfWidth: 8,
    ground: false,
    level: 0,
  },
  ...shibuyaSideRoads.map(({ id, curve, halfWidth }) => ({
    id: `shibuya-${id}`,
    kind: 'shibuya-side' as const,
    curve,
    halfWidth,
    ground: true,
    level: 0,
  })),
];

// ── Keep-clear zones (rectangles) — the ramp/scaffold stunt corridor; the city
//    grid must not place buildings/props here. ──
interface Rect { x0: number; x1: number; z0: number; z1: number }
export const KEEP_CLEAR: Rect[] = [
  { x0: 224, x1: 320, z0: -272, z1: -50 }, // ramps + scaffold deck + scaffold building
  BRIDGE_CORRIDOR, // shoreline, elevated finale, and moon sightline
];
export function keepClear(x: number, z: number): boolean {
  if (shibuyaPlazaContains(x, z)) return true;
  for (const r of KEEP_CLEAR) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  return false;
}

function rectangleClearance(x: number, z: number, rect: Rect): number {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(
    x - rect.x0,
    rect.x1 - x,
    z - rect.z0,
    rect.z1 - z,
  );
}

/** Signed clearance from a circular footprint to all protected ground shapes. */
export function protectedFootprintClearance(
  x: number,
  z: number,
  radius: number,
): number {
  return Math.min(
    shibuyaPlazaClearance(x, z),
    ...KEEP_CLEAR.map((rect) => rectangleClearance(x, z, rect)),
  ) - radius;
}

export function keepClearFootprint(x: number, z: number, radius: number): boolean {
  return protectedFootprintClearance(x, z, radius) <= 0;
}

function pointInsideBounds(
  point: { x: number; z: number },
  bounds: OrientedBuildingBounds,
): boolean {
  const delta = {
    x: point.x - bounds.center.x,
    z: point.z - bounds.center.z,
  };
  const xAxis = { x: Math.cos(bounds.rotationY), z: -Math.sin(bounds.rotationY) };
  const zAxis = { x: Math.sin(bounds.rotationY), z: Math.cos(bounds.rotationY) };
  return Math.abs(delta.x * xAxis.x + delta.z * xAxis.z)
    <= projectedFootprintHalfExtent(bounds, xAxis)
    && Math.abs(delta.x * zAxis.x + delta.z * zAxis.z)
      <= projectedFootprintHalfExtent(bounds, zAxis);
}

function polygonBoundsClearance(
  polygon: Array<{ x: number; z: number }>,
  bounds: OrientedBuildingBounds,
  contains: (x: number, z: number) => boolean,
): number {
  const corners = orientedFootprintCorners(bounds);
  const distance = Math.min(...polygon.map((start, index) =>
    segmentFootprintClearance(
      start,
      polygon[(index + 1) % polygon.length],
      bounds,
    )));
  if (distance <= 0) return distance;
  if (contains(bounds.center.x, bounds.center.z)
    || corners.some((corner) => contains(corner.x, corner.z))
    || polygon.some((point) => pointInsideBounds(point, bounds))) {
    return -distance;
  }
  return distance;
}

/** Exact OBB clearance from the plaza polygon and every stunt rectangle. */
export function protectedOrientedFootprintClearance(
  bounds: OrientedBuildingBounds,
): number {
  const plaza = buildShibuyaPlaza().outline.map(({ x, z }) => ({ x, z }));
  const plazaClearance = polygonBoundsClearance(
    plaza,
    bounds,
    shibuyaPlazaContains,
  );
  const rectangleClearances = KEEP_CLEAR.map((rect) => {
    const polygon = [
      { x: rect.x0, z: rect.z0 },
      { x: rect.x1, z: rect.z0 },
      { x: rect.x1, z: rect.z1 },
      { x: rect.x0, z: rect.z1 },
    ];
    return polygonBoundsClearance(
      polygon,
      bounds,
      (x, z) => x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1,
    );
  });
  return Math.min(plazaClearance, ...rectangleClearances);
}

/** Sweep a flat ribbon along an arbitrary curve, frame kept horizontal. */
export interface CurveRibbonOptions {
  offset?: number;
  lift?: number;
  steps?: number;
  vScale?: number;
  clip?: (x: number, z: number) => boolean;
}

export function buildCurveRibbon(
  curve: THREE.Curve<THREE.Vector3>,
  halfWidth: number,
  {
    offset = 0,
    lift = 0,
    steps = 400,
    vScale = 0.06,
    clip,
  }: CurveRibbonOptions = {},
): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  let dist = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).setY(0).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, UP).normalize();
    const nrm = new THREE.Vector3().crossVectors(bin, tan).normalize();
    const c = p.clone().addScaledVector(bin, offset).addScaledVector(UP, lift);
    if (prev) dist += c.distanceTo(prev);
    prev = c;
    const l = c.clone().addScaledVector(bin, halfWidth);
    const r = c.clone().addScaledVector(bin, -halfWidth);
    left.push(l);
    right.push(r);
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
    nor.push(nrm.x, nrm.y, nrm.z, nrm.x, nrm.y, nrm.z);
    const v = dist * vScale;
    uv.push(0, v, 1, v);
  }
  const triangleIsClear = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ): boolean => {
    if (!clip) return true;
    const edge = (start: THREE.Vector3, end: THREE.Vector3): boolean => {
      for (let sample = 0; sample <= 16; sample++) {
        const t = sample / 16;
        if (clip(
          THREE.MathUtils.lerp(start.x, end.x, t),
          THREE.MathUtils.lerp(start.z, end.z, t),
        )) return false;
      }
      return true;
    };
    return !clip((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3)
      && edge(a, b)
      && edge(b, c)
      && edge(c, a);
  };
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    if (triangleIsClear(left[i], left[i + 1], right[i])) {
      idx.push(a, a + 2, a + 1);
    }
    if (triangleIsClear(right[i], left[i + 1], right[i + 1])) {
      idx.push(a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ── Ground-road collision samples (for carving the building grid) ──
interface Sample { x: number; z: number; hw: number }
const groundSamples: Sample[] = [];
for (const r of ROADS) {
  if (!r.ground) continue;
  const n = Math.max(24, Math.floor(r.curve.getLength() / 8));
  for (let i = 0; i <= n; i++) {
    const p = r.curve.getPointAt(i / n);
    groundSamples.push({ x: p.x, z: p.z, hw: r.halfWidth });
  }
}

/** Signed clearance (m) from (x,z) to the nearest GROUND road EDGE. <0 = on a road. */
export function groundRoadClearance(x: number, z: number): number {
  let min = Infinity;
  for (const s of groundSamples) {
    const d = Math.hypot(x - s.x, z - s.z) - s.hw;
    if (d < min) min = d;
  }
  return min;
}

export interface GroundRoadMembership {
  roadId: string;
  roadIndex: number;
  clearance: number;
  u: number;
  endpointCap: boolean;
  withinSidewalkWidth: boolean;
  withinRoadOrSidewalk: boolean;
}

interface GroundRoadPath {
  roadId: string;
  roadIndex: number;
  halfWidth: number;
  points: THREE.Vector3[];
  cumulativeLengths: number[];
  length: number;
}

const groundRoadPaths: GroundRoadPath[] = ROADS.flatMap((road, roadIndex) => {
  if (!road.ground) return [];
  const segmentCount = Math.max(32, Math.ceil(road.curve.getLength() / 2));
  const points = Array.from(
    { length: segmentCount + 1 },
    (_, i) => road.curve.getPointAt(i / segmentCount),
  );
  const cumulativeLengths = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeLengths.push(
      cumulativeLengths[i - 1] + points[i].distanceTo(points[i - 1]),
    );
  }
  return [{
    roadId: road.id,
    roadIndex,
    halfWidth: road.halfWidth,
    points,
    cumulativeLengths,
    length: cumulativeLengths[cumulativeLengths.length - 1],
  }];
});

/** Per-road projected membership without treating open road ends as round caps. */
export function groundRoadMemberships(x: number, z: number): GroundRoadMembership[] {
  return groundRoadPaths.map((path) => {
    let nearestDistanceSq = Infinity;
    let nearestAlong = 0;

    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq === 0
        ? 0
        : THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
      const projectedX = a.x + dx * t;
      const projectedZ = a.z + dz * t;
      const distanceSq = (x - projectedX) ** 2 + (z - projectedZ) ** 2;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestAlong = path.cumulativeLengths[i] + Math.sqrt(lengthSq) * t;
      }
    }

    const clearance = Math.sqrt(nearestDistanceSq) - path.halfWidth;
    const endpointCap = nearestAlong <= 0.05 || path.length - nearestAlong <= 0.05;
    return {
      roadId: path.roadId,
      roadIndex: path.roadIndex,
      clearance,
      u: path.length === 0 ? 0 : nearestAlong / path.length,
      endpointCap,
      withinSidewalkWidth: clearance >= 1 && clearance <= 9,
      withinRoadOrSidewalk: !endpointCap && clearance <= 9,
    };
  });
}

// ── Elevated-road samples (horizontal projection) — used to stop tall buildings
//    from clipping the overhead highway deck. ──
const overheadSamples: Sample[] = [];
for (const r of ROADS) {
  if (r.ground) continue;
  const n = Math.max(24, Math.floor(r.curve.getLength() / 8));
  for (let i = 0; i <= n; i++) {
    const p = r.curve.getPointAt(i / n);
    overheadSamples.push({ x: p.x, z: p.z, hw: r.halfWidth });
  }
}

/** Horizontal clearance (m) from (x,z) to the nearest ELEVATED road edge. */
export function overheadClearance(x: number, z: number): number {
  let min = Infinity;
  for (const s of overheadSamples) {
    const d = Math.hypot(x - s.x, z - s.z) - s.hw;
    if (d < min) min = d;
  }
  return min;
}

interface ElevatedDeckPath {
  road: RoadDef;
  points: THREE.Vector3[];
  sampleCount: number;
  sampleErrorBound: number;
}

const sampledCurvePaths = new WeakMap<
  THREE.Curve<THREE.Vector3>,
  Map<number, { points: THREE.Vector3[]; sampleErrorBound: number }>
>();

/**
 * Conservative finite bound for the sampled polyline: arc-length sampling
 * limits every unsampled curve point to at most one sample interval of travel
 * from an endpoint already on the polyline.
 */
export function sampledCurveErrorBound(
  curve: THREE.Curve<THREE.Vector3>,
  sampleCount: number,
): number {
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error(`sampleCount must be a positive integer, got ${sampleCount}`);
  }
  return curve.getLength() / sampleCount;
}

function sampledCurvePath(
  curve: THREE.Curve<THREE.Vector3>,
  sampleCount: number,
): { points: THREE.Vector3[]; sampleErrorBound: number } {
  let paths = sampledCurvePaths.get(curve);
  if (!paths) {
    paths = new Map();
    sampledCurvePaths.set(curve, paths);
  }
  const existing = paths.get(sampleCount);
  if (existing) return existing;
  const sampled = {
    points: Array.from({ length: sampleCount + 1 }, (_, index) =>
      curve.getPointAt(index / sampleCount)),
    sampleErrorBound: sampledCurveErrorBound(curve, sampleCount),
  };
  paths.set(sampleCount, sampled);
  return sampled;
}

const elevatedDeckPaths: ElevatedDeckPath[] = ROADS
  .filter((road) => !road.ground)
  .map((road) => {
    const sampled = sampledCurvePath(road.curve, ELEVATED_DECK_SAMPLE_COUNT);
    return {
      road,
      ...sampled,
      sampleCount: ELEVATED_DECK_SAMPLE_COUNT,
    };
  });

function elevatedDeckPath(roadId: string): ElevatedDeckPath {
  const path = elevatedDeckPaths.find(({ road }) => road.id === roadId);
  if (!path) throw new Error(`Missing elevated road ${roadId}`);
  return path;
}

export interface ElevatedDeckProfile {
  roadId: string;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  lateralClearance: number;
  deckY: number;
  u: number;
  sampleCount: number;
  sampleErrorBound: number;
}

/** Nearest deterministic sampled frame on an elevated deck's XZ projection. */
export function elevatedDeckProfileAt(
  x: number,
  z: number,
  roadId = ELEVATED_HIGHWAY_ID,
): ElevatedDeckProfile {
  const {
    road,
    points,
    sampleCount,
    sampleErrorBound,
  } = elevatedDeckPath(roadId);
  let nearestDistanceSq = Infinity;
  let nearestU = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0
      ? 0
      : THREE.MathUtils.clamp(
        ((x - start.x) * dx + (z - start.z) * dz) / lengthSq,
        0,
        1,
      );
    const projectedX = start.x + dx * t;
    const projectedZ = start.z + dz * t;
    const distanceSq = (x - projectedX) ** 2 + (z - projectedZ) ** 2;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestU = (index + t) / (points.length - 1);
    }
  }
  let refineStart = Math.max(0, nearestU - 1 / sampleCount);
  let refineEnd = Math.min(1, nearestU + 1 / sampleCount);
  const distanceSqAt = (u: number): number => {
    const point = road.curve.getPointAt(u);
    return (x - point.x) ** 2 + (z - point.z) ** 2;
  };
  for (let iteration = 0; iteration < 16; iteration++) {
    const first = refineStart + (refineEnd - refineStart) / 3;
    const second = refineEnd - (refineEnd - refineStart) / 3;
    if (distanceSqAt(first) <= distanceSqAt(second)) refineEnd = second;
    else refineStart = first;
  }
  nearestU = (refineStart + refineEnd) / 2;
  nearestDistanceSq = distanceSqAt(nearestU);
  const center = road.curve.getPointAt(nearestU);
  const tangent = road.curve.getTangentAt(nearestU).setY(0).normalize();
  const binormal = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  return {
    roadId,
    center,
    tangent,
    binormal,
    lateralClearance: Math.sqrt(nearestDistanceSq) - road.halfWidth,
    deckY: center.y + road.level,
    u: nearestU,
    sampleCount,
    sampleErrorBound,
  };
}

export interface ElevatedDeckBuildingClearance {
  roadId: string;
  sampledHorizontalMargin: number;
  horizontalMargin: number;
  verticalMargin: number;
  nearestU: number;
  sampledUndersideY: number;
  undersideY: number;
  sampleCount: number;
  sampleErrorBound: number;
}

export interface CurveDeckClearanceOptions {
  roadId: string;
  deckHalfWidth: number;
  level?: number;
  undersideOffset?: number;
  sampleCount?: number;
}

/**
 * Signed OBB-to-sampled-curve deck margins. Segment/OBB distance is exact for
 * each polyline chord. The finite 3D `sampleErrorBound` is subtracted from
 * horizontal clearance and sampled underside Y, conservatively covering both
 * lateral and vertical curve deviation between samples.
 */
export function curveDeckBuildingClearance(
  curve: THREE.Curve<THREE.Vector3>,
  bounds: OrientedBuildingBounds,
  {
    roadId,
    deckHalfWidth,
    level = 0,
    undersideOffset = DECK_UNDERSIDE_OFFSET,
    sampleCount = ELEVATED_DECK_SAMPLE_COUNT,
  }: CurveDeckClearanceOptions,
): ElevatedDeckBuildingClearance {
  const { points, sampleErrorBound } = sampledCurvePath(curve, sampleCount);
  let horizontalMargin = Infinity;
  let nearestU = 0;
  let nearestUndersideY = Infinity;
  let undersideY = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const segmentClearance = segmentFootprintClearance(start, end, bounds);
    const margin = segmentClearance - deckHalfWidth;
    if (margin < horizontalMargin) {
      horizontalMargin = margin;
      nearestU = (index + 0.5) / (points.length - 1);
      nearestUndersideY = Math.min(start.y, end.y)
        + level - undersideOffset;
    }
    if (margin <= sampleErrorBound) {
      undersideY = Math.min(
        undersideY,
        start.y + level - undersideOffset,
        end.y + level - undersideOffset,
      );
    }
  }
  if (!Number.isFinite(undersideY)) undersideY = nearestUndersideY;
  const sampledUndersideY = undersideY;
  undersideY -= sampleErrorBound;
  return {
    roadId,
    sampledHorizontalMargin: horizontalMargin,
    horizontalMargin: horizontalMargin - sampleErrorBound,
    verticalMargin: undersideY - bounds.height,
    nearestU,
    sampledUndersideY,
    undersideY,
    sampleCount,
    sampleErrorBound,
  };
}

export function elevatedDeckBuildingClearance(
  bounds: OrientedBuildingBounds,
  roadId = ELEVATED_HIGHWAY_ID,
): ElevatedDeckBuildingClearance {
  const { road, sampleCount } = elevatedDeckPath(roadId);
  return curveDeckBuildingClearance(road.curve, bounds, {
    roadId,
    deckHalfWidth: road.halfWidth + ELEVATED_DECK_HALF_WIDTH_PADDING,
    level: road.level,
    undersideOffset: DECK_UNDERSIDE_OFFSET,
    sampleCount,
  });
}

export function buildingClearsElevatedDeck(
  bounds: OrientedBuildingBounds,
  verticalMargin = BUILDING_DECK_VERTICAL_MARGIN,
): boolean {
  const clearance = elevatedDeckBuildingClearance(bounds);
  return clearance.horizontalMargin > 0
    || clearance.verticalMargin >= verticalMargin;
}

export interface GroundRoadEdgePoint {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  bin: THREE.Vector3;
  hw: number;
  roadId: string;
  roadIndex: number;
  u: number;
}

/** Sample points + frames along ground roads (for placing edge props/buildings). */
export function groundRoadEdgePoints(spacing = 26): GroundRoadEdgePoint[] {
  const out: GroundRoadEdgePoint[] = [];
  for (let roadIndex = 0; roadIndex < ROADS.length; roadIndex++) {
    const r = ROADS[roadIndex];
    if (!r.ground) continue;
    const n = Math.max(8, Math.floor(r.curve.getLength() / spacing));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = r.curve.getPointAt(u);
      const tan = r.curve.getTangentAt(u).setY(0).normalize();
      const bin = new THREE.Vector3().crossVectors(tan, UP).normalize();
      out.push({
        pos: p,
        tan,
        bin,
        hw: r.halfWidth,
        roadId: r.id,
        roadIndex,
        u,
      });
    }
  }
  return out;
}
