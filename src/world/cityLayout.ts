import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import {
  buildingClearsElevatedDeck,
  elevatedDeckBuildingClearance,
  groundRoadClearance,
  groundRoadEdgePoints,
  groundRoadMemberships,
  keepClear,
  keepClearFootprint,
  protectedOrientedFootprintClearance,
  ROADS,
} from './roads';
import {
  buildShibuyaApproaches,
  buildShibuyaSightCorridors,
  shibuyaPlazaClearance,
  type ApproachId,
} from './intersections';
import {
  BUILDING_CATALOG,
  buildingPlacementBounds,
  orientedFootprintPerimeterPoints,
  orientedFootprintsOverlap,
  pointOrientedFootprintClearance,
  projectedFootprintHalfExtent,
  renderedPlacementBounds,
  segmentFootprintClearance,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import { buildHighwayPillarLayout } from './highwayLayout';
import { WATER_BASIN } from './bridgeLayout';

/**
 * City placement. A dense grid fills the WHOLE map with building blocks; the
 * road network is CARVED out (a lot is only used if its clearance exceeds the
 * building footprint) so roads read as canyons and nothing lands on a street.
 * Buildings are GPU-instanced (see InstancedPieces) so density is cheap.
 */
const P = 'KB3D_NEC_';
// Pools grouped by TRIANGLE COST (instancing saves draw calls but not vertex
// work). Heavy hero towers are used sparingly as landmarks; the bulk is light.
const HERO = [`${P}BldgLG_C_Main`, `${P}BldgLG_A_BuildingC`, `${P}BldgLG_B_Main`]; // ~120–270k tris
const TALL = [`${P}BldgLG_A_Main`, `${P}BldgMD_C_Main`];                            // ~90–150k
const MID = [`${P}BldgMD_A_Main`, `${P}BldgMD_B_Main`, `${P}BldgLG_A_BuildingA`, `${P}BldgLG_A_BuildingB`, `${P}BldgLG_A_BuildingD`, `${P}BldgMD_C_BuildingA`]; // ~15–35k
const SMALL = [`${P}BldgSM_A_Main`, `${P}BldgSM_B_Main`, `${P}BldgSM_C_Main`];      // ~3–25k
const LOW_BASE = [`${P}BldgLG_C_Base`, `${P}BldgMD_A_Base`];
const EDGE = [
  `${P}BldgSM_C_AC`, `${P}BldgSM_C_Boxes`, `${P}BldgSM_C_CratesA`,
  `${P}BldgSM_C_CratesB`, `${P}BldgSM_C_Pipes`,
];
const SHOP = [
  `${P}BldgSM_B_Cart`, `${P}BldgSM_B_Bbq`, `${P}BldgSM_B_Umbrella`, `${P}BldgSM_B_FridgeA`,
  `${P}BldgSM_B_FridgeB`, `${P}BldgSM_C_Shelf`, `${P}BldgSM_C_Stool`, `${P}BldgSM_B_Computers`,
  `${P}BldgSM_C_NeonSignA`, `${P}BldgSM_C_NeonSignB`, `${P}BldgSM_C_NeonSignC`, `${P}BldgSM_C_Fan`,
];
const DECOR = [`${P}BldgLG_A_Tree`]; // trees only — the banner assets read badly, so drop them
const SHIBUYA_FRONT = [`${P}BldgMD_C_Main`];
const SHIBUYA_BACK = [`${P}BldgLG_C_Main`, `${P}BldgLG_B_Main`];
export const SERVICE_FILES = [
  'props/quat_ac.glb',
  'props/quat_ac_stacked.glb',
  'props/quat_antenna_1.glb',
  'props/quat_antenna_2.glb',
  'props/quat_sign_1.glb',
  'props/quat_sign_3.glb',
] as const;

export interface Placement {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
  foot?: number;
  outDir?: [number, number];
  centerOffset?: [number, number];
  roadId?: string;
  roadIndex?: number;
  layoutRole?: 'shibuya-front' | 'shibuya-back' | 'shibuya-corner' | 'low-base';
  shibuyaApproach?: ApproachId;
  shibuyaSide?: -1 | 1;
  shibuyaDistance?: number;
  shibuyaAlleyApplicable?: boolean;
}

export type DeckSafePlacementResolution<T> =
  | { outcome: 'primary' | 'fallback'; placement: T }
  | { outcome: 'rejected' };

/** Resolve one primary and at most one fallback through the same safety rule. */
export function resolveDeckSafePlacement<T>(
  primary: T,
  fallback: () => T | undefined,
  isSafe: (placement: T) => boolean,
): DeckSafePlacementResolution<T> {
  if (isSafe(primary)) return { outcome: 'primary', placement: primary };
  const fallbackPlacement = fallback();
  if (fallbackPlacement && isSafe(fallbackPlacement)) {
    return { outcome: 'fallback', placement: fallbackPlacement };
  }
  return { outcome: 'rejected' };
}

/** Rendered building centre after InstancedPieces applies the footprint offset. */
export function placementCenter(p: Placement): { x: number; z: number } {
  if (BUILDING_CATALOG.has(p.file)) return buildingPlacementBounds(p).center;
  const foot = p.foot ?? 0;
  return {
    x: p.position[0] + (p.centerOffset?.[0] ?? (p.outDir?.[0] ?? 0) * foot),
    z: p.position[2] + (p.centerOffset?.[1] ?? (p.outDir?.[1] ?? 0) * foot),
  };
}

const g = (n: string) => `neocity/${n}.glb`;

const WATER_BOUNDS: OrientedBuildingBounds = {
  file: 'water-basin',
  center: {
    x: (WATER_BASIN.x0 + WATER_BASIN.x1) / 2,
    z: (WATER_BASIN.z0 + WATER_BASIN.z1) / 2,
  },
  rotationY: 0,
  scale: 1,
  radius: Math.hypot(
    WATER_BASIN.x1 - WATER_BASIN.x0,
    WATER_BASIN.z1 - WATER_BASIN.z0,
  ) / 2,
  halfX: (WATER_BASIN.x1 - WATER_BASIN.x0) / 2,
  halfZ: (WATER_BASIN.z1 - WATER_BASIN.z0) / 2,
  height: 0,
};

export function clearsOpenWater(bounds: OrientedBuildingBounds): boolean {
  return !orientedFootprintsOverlap(bounds, WATER_BOUNDS, 1e-6);
}

// Road cross-section (from City.tsx / roads.ts): the driving deck is ±hw, then a
// wide sidewalk (half-width 4.5, offset hw+4.5) → outer sidewalk edge at hw+9.
const SIDEWALK = 9;     // sidewalk outer edge, measured from the road centre-line
const GAP = 1;          // buildings hug the sidewalk (small clear gap)
const ALLEY = 3;        // narrow alley between the front wall and the back towers
const FOOT_A = 16;      // front-row footprint radius (medium/tall rises)
const FOOT_B = 28;      // back-row footprint radius (tall towers / heroes)

/**
 * Buildings line every road in TWO tight rows per side, forming a continuous
 * canyon WALL that towers over the street (so billboards can be projected on
 * the faces). Each placement stores an ANCHOR at the sidewalk edge + an outward
 * direction; InstancedPieces pushes the building out by its real footprint so
 * its near face lands exactly on the sidewalk edge (scaling down only oversized
 * pieces). A worst-case clearance test guarantees NOTHING overlaps a road.
 */
export function buildCityLayout(seed = 20260720): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];

  const anchorA = SIDEWALK + GAP;                  // front wall hugs the sidewalk (hw+10)
  const anchorB = anchorA + 2 * FOOT_A + ALLEY;    // back towers behind a narrow alley
  const shibuyaSightCorridors = buildShibuyaSightCorridors();

  const isProtectedPlacement = (placement: Placement): boolean =>
    placement.layoutRole === 'shibuya-front'
    || placement.layoutRole === 'shibuya-back'
    || placement.layoutRole === 'shibuya-corner'
    || placement.layoutRole === 'low-base';

  const clearsEveryGroundRoad = (x: number, z: number, radius: number): boolean =>
    shibuyaPlazaClearance(x, z) >= radius + 1
    && groundRoadMemberships(x, z)
      .every((membership) => membership.clearance >= radius + SIDEWALK + 1);

  const overlaps = (
    candidate: OrientedBuildingBounds,
    protectedOnly = false,
  ): boolean => out.some((existing) => {
    if (protectedOnly && !isProtectedPlacement(existing)) return false;
    const bounds = buildingPlacementBounds(existing);
    return orientedFootprintsOverlap(candidate, bounds, 2);
  });

  const place = (
    base: THREE.Vector3, bin: THREE.Vector3, tan: THREE.Vector3,
    side: number, hw: number, anchor: number, pool: string[], foot: number,
  ): void => {
    const jit = rng.range(-2, 2);
    const ax = base.x + bin.x * side * (hw + anchor) + tan.x * jit;
    const az = base.z + bin.z * side * (hw + anchor) + tan.z * jit;
    const ox = bin.x * side, oz = bin.z * side; // outward (away from road)
    let effPool = pool, effFoot = foot;
    let name = rng.pick(effPool);
    const rotationY = Math.atan2(-ox, -oz) + rng.range(-0.02, 0.02);
    const makePlacement = (): Placement => ({
      file: g(name),
      position: [ax, 0, az],
      rotationY,
      foot: effFoot,
      outDir: [ox, oz],
    });
    const makeCandidate = (): { placement: Placement; bounds: OrientedBuildingBounds } => {
      const placement = makePlacement();
      return { placement, bounds: buildingPlacementBounds(placement) };
    };
    const resolved = resolveDeckSafePlacement(
      makeCandidate(),
      () => {
        effPool = SMALL;
        effFoot = Math.min(foot, 11);
        name = rng.pick(effPool);
        return makeCandidate();
      },
      ({ bounds }) => buildingClearsElevatedDeck(bounds),
    );
    if (resolved.outcome === 'rejected') return;
    const { placement, bounds } = resolved.placement;
    if (!clearsOpenWater(bounds)) return;
    // Safety uses each exact projected road membership. The sampled nearest-road
    // approximation remains useful for district selection only.
    if (keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius)) return;
    if (!clearsEveryGroundRoad(bounds.center.x, bounds.center.z, bounds.radius)) return;
    if (overlaps(bounds, true)) return;
    out.push(placement);
  };

  const isShibuyaWallSample = (
    roadId: string,
    point: THREE.Vector3,
  ): boolean => ['main-route', 'shibuya-north', 'shibuya-east'].includes(roadId)
    && shibuyaPlazaClearance(point.x, point.z) <= 160;

  // front wall — dense (≈every 18 m → buildings touch into a continuous wall)
  for (const e of groundRoadEdgePoints(18)) {
    const far = e.pos.z < -560;
    if (isShibuyaWallSample(e.roadId, e.pos)) continue;
    for (const side of [1, -1] as const) {
      if (rng.chance(far ? 0.4 : 0.02)) continue;
      place(e.pos, e.bin, e.tan, side, e.hw, anchorA, rng.chance(0.35) ? TALL : MID, FOOT_A);
    }
  }

  // Shibuya walls use arc-length samples from the four production approach
  // roads. Their facade anchors stay fixed at the outer sidewalk edge while
  // full-size footprint caps create regular-scale front and back canyon rows.
  const approachRoadId: Record<ApproachId, string> = {
    west: 'main-route',
    north: 'shibuya-north',
    east: 'shibuya-east',
    south: 'main-route',
  };
  const nearestCurveU = (
    curve: THREE.Curve<THREE.Vector3>,
    target: THREE.Vector3,
  ): number => {
    let bestU = 0;
    let bestDistanceSq = Infinity;
    for (let i = 0; i <= 4096; i++) {
      const u = i / 4096;
      const point = curve.getPointAt(u);
      const distanceSq = (point.x - target.x) ** 2 + (point.z - target.z) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestU = u;
      }
    }
    return bestU;
  };
  const approachById = new Map(buildShibuyaApproaches().map((approach) => [
    approach.id,
    approach,
  ]));
  interface ShibuyaCandidate {
    placement: Placement;
    bounds: OrientedBuildingBounds;
    base: THREE.Vector3;
    bin: THREE.Vector3;
    tan: THREE.Vector3;
    side: -1 | 1;
    halfWidth: number;
  }
  const placeShibuya = (
    base: THREE.Vector3,
    bin: THREE.Vector3,
    tan: THREE.Vector3,
    side: -1 | 1,
    halfWidth: number,
    anchor: number,
    model: string,
    foot: number,
    role: 'shibuya-front' | 'shibuya-back',
    approach: ApproachId,
    roadId: string,
    roadIndex: number,
    distance: number,
    alleyApplicable: boolean,
  ): ShibuyaCandidate | undefined => {
    const outward = { x: bin.x * side, z: bin.z * side };
    const position: [number, number, number] = [
      base.x + outward.x * (halfWidth + anchor),
      0,
      base.z + outward.z * (halfWidth + anchor),
    ];
    const rotationY = Math.atan2(-outward.x, -outward.z);
    const anchored: Placement = {
      file: g(model),
      position,
      rotationY,
      foot,
      outDir: [outward.x, outward.z],
      centerOffset: [0, 0],
      layoutRole: role,
      shibuyaApproach: approach,
      shibuyaSide: side,
      shibuyaDistance: distance,
      shibuyaAlleyApplicable: alleyApplicable,
      roadId,
      roadIndex,
    };
    const anchorBounds = buildingPlacementBounds(anchored);
    const radialExtent = projectedFootprintHalfExtent(anchorBounds, outward);
    const placement: Placement = {
      ...anchored,
      centerOffset: [
        outward.x * radialExtent,
        outward.z * radialExtent,
      ],
    };
    const bounds = buildingPlacementBounds(placement);
    const perimeter = orientedFootprintPerimeterPoints(bounds, 8);
    if (!clearsOpenWater(bounds)) return undefined;
    if (keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius)) {
      return undefined;
    }
    if (protectedOrientedFootprintClearance(bounds) < 1) return undefined;
    if (perimeter.some((point) =>
      groundRoadMemberships(point.x, point.z)
        .some((membership) => membership.clearance < 10 - 1e-6))) return undefined;
    if (!buildingClearsElevatedDeck(bounds)) return undefined;
    if (shibuyaSightCorridors.some((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        <= corridor.halfWidth)) return undefined;
    const conflicts = out.filter((existing) =>
      orientedFootprintsOverlap(bounds, buildingPlacementBounds(existing), 2));
    if (conflicts.length > 0) {
      const mayReplaceOrdinarySouthWall = approach === 'south'
        && distance >= 240
        && conflicts.every((existing) => !isProtectedPlacement(existing));
      if (!mayReplaceOrdinarySouthWall) return undefined;
      for (const conflict of conflicts) out.splice(out.indexOf(conflict), 1);
    }
    out.push(placement);
    return { placement, bounds, base, bin, tan, side, halfWidth };
  };

  const frontCandidates: ShibuyaCandidate[] = [];
  const approachOrder = ['west', 'south', 'north', 'east'] as const;
  for (const approachId of approachOrder) {
    const approach = approachById.get(approachId)!;
    const roadId = approachRoadId[approach.id];
    const roadIndex = ROADS.findIndex((candidate) => candidate.id === roadId);
    if (roadIndex < 0) throw new Error(`Missing Shibuya approach road ${roadId}`);
    const road = ROADS[roadIndex];
    const boundaryU = nearestCurveU(road.curve, approach.center);
    const probe = 0.25 / road.curve.getLength();
    const plus = road.curve.getPointAt(Math.min(1, boundaryU + probe));
    const minus = road.curve.getPointAt(Math.max(0, boundaryU - probe));
    const outwardSign = shibuyaPlazaClearance(plus.x, plus.z)
      > shibuyaPlazaClearance(minus.x, minus.z) ? 1 : -1;
    const distances = approach.id === 'north' || approach.id === 'east'
      ? [41, 78]
      : approach.id === 'south'
        ? [16, 53, 90, 127, 275]
        : [16, 53, 90, 127];

    for (let distanceIndex = 0; distanceIndex < distances.length; distanceIndex++) {
      const distance = distances[distanceIndex];
      const u = boundaryU + outwardSign * distance / road.curve.getLength();
      if (u <= 0.001 || u >= 0.999) continue;
      const base = road.curve.getPointAt(u);
      const tan = road.curve.getTangentAt(u).setY(0).normalize();
      const bin = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0))
        .normalize();
      for (const side of [1, -1] as const) {
        const model = approachId === 'south'
          ? `${P}BldgLG_A_BuildingA`
          : SHIBUYA_FRONT[
            (approachOrder.indexOf(approachId) + distanceIndex + (side < 0 ? 1 : 0))
              % SHIBUYA_FRONT.length
          ];
        const candidate = placeShibuya(
          base,
          bin,
          tan,
          side,
          road.halfWidth,
          anchorA,
          model,
          approachId === 'south' ? 14 : 18,
          'shibuya-front',
          approach.id,
          roadId,
          roadIndex,
          distance,
          false,
        );
        if (candidate) frontCandidates.push(candidate);
      }
    }
  }

  frontCandidates.forEach((front, index) => {
    const placement = front.placement;
    const outward = { x: placement.outDir![0], z: placement.outDir![1] };
    const frontRadialExtent = projectedFootprintHalfExtent(front.bounds, outward);
    const backAnchor = anchorA + 2 * frontRadialExtent + ALLEY;
    placeShibuya(
      front.base,
      front.bin,
      front.tan,
      front.side,
      front.halfWidth,
      backAnchor,
      SHIBUYA_BACK[index % SHIBUYA_BACK.length],
      22,
      'shibuya-back',
      placement.shibuyaApproach!,
      placement.roadId!,
      placement.roadIndex!,
      placement.shibuyaDistance!,
      true,
    );
  });

  // Retained standalone south hero from the Task 2 exact placement pipeline.
  const southApproach = approachById.get('south')!;
  const southRoadId = approachRoadId.south;
  const southRoadIndex = ROADS.findIndex((candidate) => candidate.id === southRoadId);
  if (southRoadIndex < 0) throw new Error(`Missing Shibuya approach road ${southRoadId}`);
  const southRoad = ROADS[southRoadIndex];
  const southBoundaryU = nearestCurveU(southRoad.curve, southApproach.center);
  const southProbe = 0.25 / southRoad.curve.getLength();
  const southPlus = southRoad.curve.getPointAt(Math.min(1, southBoundaryU + southProbe));
  const southMinus = southRoad.curve.getPointAt(Math.max(0, southBoundaryU - southProbe));
  const southOutwardSign = shibuyaPlazaClearance(southPlus.x, southPlus.z)
    > shibuyaPlazaClearance(southMinus.x, southMinus.z) ? 1 : -1;
  const southDistance = 120;
  const southU = southBoundaryU
    + southOutwardSign * southDistance / southRoad.curve.getLength();
  const southBase = southRoad.curve.getPointAt(southU);
  const southTan = southRoad.curve.getTangentAt(southU).setY(0).normalize();
  const southBin = new THREE.Vector3()
    .crossVectors(southTan, new THREE.Vector3(0, 1, 0))
    .normalize();
  placeShibuya(
    southBase,
    southBin,
    southTan,
    -1,
    southRoad.halfWidth,
    anchorB,
    `${P}BldgLG_B_Main`,
    22,
    'shibuya-back',
    'south',
    southRoadId,
    southRoadIndex,
    southDistance,
    false,
  );

  // Art-directed south-corner frontage uses the exact production south
  // approach frame. These regular-scale buildings close the visual enclosure
  // without narrowing the road or crossing sight corridors.
  const placeShibuyaCornerAt = (
    center: THREE.Vector3,
    model: string,
    foot: number,
    side: -1 | 1,
    approach: ApproachId,
    distance: number,
  ): void => {
    const radial = new THREE.Vector3(center.x - 240, 0, center.z).normalize();
    const placement: Placement = {
      file: g(model),
      position: [center.x, 0, center.z],
      rotationY: Math.atan2(-radial.x, -radial.z),
      foot,
      outDir: [radial.x, radial.z],
      centerOffset: [0, 0],
      layoutRole: 'shibuya-corner',
      shibuyaApproach: approach,
      shibuyaSide: side,
      shibuyaDistance: distance,
      shibuyaAlleyApplicable: false,
      roadId: southRoadId,
      roadIndex: southRoadIndex,
    };
    const bounds = buildingPlacementBounds(placement);
    const perimeter = orientedFootprintPerimeterPoints(bounds, 8);
    if (!clearsOpenWater(bounds)) return;
    if (protectedOrientedFootprintClearance(bounds) < 1) return;
    if (perimeter.some((point) => groundRoadMemberships(point.x, point.z)
      .some(({ clearance }) => clearance < 10 - 1e-6))) return;
    if (!buildingClearsElevatedDeck(bounds)) return;
    if (shibuyaSightCorridors.some((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        <= corridor.halfWidth)) return;
    const conflicts = out.filter((existing) =>
      orientedFootprintsOverlap(bounds, buildingPlacementBounds(existing), 2));
    if (conflicts.some(isProtectedPlacement)) return;
    for (const conflict of conflicts) out.splice(out.indexOf(conflict), 1);
    out.push(placement);
  };
  const placeShibuyaCorner = (
    forward: number,
    lateral: number,
    model: string,
    foot: number,
    side: -1 | 1,
  ): void => {
    const center = southApproach.center.clone()
      .addScaledVector(southApproach.tangent, forward)
      .addScaledVector(southApproach.binormal, lateral);
    placeShibuyaCornerAt(center, model, foot, side, 'south', forward);
  };
  placeShibuyaCorner(29.386, -49.296, `${P}BldgMD_C_Main`, 18, 1);
  placeShibuyaCorner(4.718, -45.252, `${P}BldgMD_C_Main`, 18, 1);
  placeShibuyaCorner(12.772, 34.494, `${P}BldgLG_A_BuildingA`, 14, -1);
  placeShibuyaCornerAt(
    new THREE.Vector3(200, 0, 40),
    `${P}BldgLG_A_Main`,
    18,
    1,
    'north',
    56.569,
  );
  placeShibuyaCornerAt(
    new THREE.Vector3(325, 0, 80),
    `${P}BldgLG_A_BuildingB`,
    18,
    -1,
    'east',
    116.726,
  );
  placeShibuyaCornerAt(
    new THREE.Vector3(195, 0, -90),
    `${P}BldgLG_A_BuildingB`,
    18,
    1,
    'west',
    100.623,
  );

  // The former Shibuya candidate pass consumed two draws (asset and rotation)
  // for 60 production-road candidates. Preserve the ordinary-city RNG stream
  // while Shibuya selection is now deterministic and geometry-driven.
  for (let draw = 0; draw < 120; draw++) rng();

  // back towers — sparser big buildings peeking over the front wall
  for (const e of groundRoadEdgePoints(34)) {
    const far = e.pos.z < -560;
    if (isShibuyaWallSample(e.roadId, e.pos)) continue;
    for (const side of [1, -1] as const) {
      if (rng.chance(far ? 0.55 : 0.14)) continue;
      place(e.pos, e.bin, e.tan, side, e.hw, anchorB, rng.chance(0.4) ? HERO : TALL, FOOT_B);
    }
  }

  // ── Back-fill district: dense blocks behind the walls, with alley gaps, so the
  //    surrounding area reads as a real city rather than a thin strip. ──
  const FILL_FOOT = 18;
  const cell = 42;
  const CARD = [0, Math.PI / 2];
  for (let x = -400; x <= 400; x += cell) {
    for (let z = -720; z <= 150; z += cell) {
      const jx = x + rng.range(-6, 6), jz = z + rng.range(-6, 6);
      const c = groundRoadClearance(jx, jz);
      if (c < 84) continue;                 // handled by the two road-facing rows
      if (c > 230) continue;                // beyond the district → skyline territory
      if (keepClear(jx, jz)) continue;
      if (rng.chance(0)) continue;          // geometry filters retain alleys / courtyards
      let pool = rng.chance(0.12)
        ? LOW_BASE
        : rng.chance(0.1) ? HERO : rng.chance(0.4) ? TALL : rng.chance(0.55) ? MID : SMALL;
      let fillFoot = pool === LOW_BASE ? 11 : FILL_FOOT;
      let file = g(rng.pick(pool));
      let placement: Placement = {
        file,
        position: [jx, 0, jz],
        rotationY: rng.pick(CARD) + rng.range(-0.05, 0.05),
        foot: fillFoot,
        ...(pool === LOW_BASE ? { layoutRole: 'low-base' as const } : {}),
      };
      let bounds = buildingPlacementBounds(placement);
      if (!buildingClearsElevatedDeck(bounds)) {
        pool = SMALL;
        fillFoot = 11;
        file = g(rng.pick(pool));
        placement = {
          ...placement,
          file,
          foot: fillFoot,
          layoutRole: undefined,
        };
        bounds = buildingPlacementBounds(placement);
      }
      if (!buildingClearsElevatedDeck(bounds)) continue;
      if (!clearsOpenWater(bounds)) continue;
      if (keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius)) continue;
      if (!clearsEveryGroundRoad(bounds.center.x, bounds.center.z, bounds.radius)) continue;
      const lowBase = pool === LOW_BASE;
      // A podium must clear all earlier placements; ordinary backfill only
      // avoids protected placements so the existing dense district remains.
      if (overlaps(bounds, !lowBase)) continue;
      out.push(placement);
    }
  }

  // Refill only the supported landward shoreline shoulders outside the
  // protected bridge corridor. No ordinary massing is allowed past z=-600.
  const ordinaryCount = (): number => out.filter(({ layoutRole }) =>
    !layoutRole?.startsWith('shibuya-')).length;
  const shorelineFiles = [...SMALL, ...MID];
  let shorelineIndex = 0;
  for (let z = -570; z <= -350 && ordinaryCount() < 280; z += 20) {
    for (let x = -500; x <= 500 && ordinaryCount() < 280; x += 20) {
      const file = g(shorelineFiles[shorelineIndex % shorelineFiles.length]);
      const placement: Placement = {
        file,
        position: [x, 0, z],
        rotationY: shorelineIndex % 2 === 0 ? 0 : Math.PI / 2,
        foot: 10,
      };
      shorelineIndex++;
      const bounds = buildingPlacementBounds(placement);
      if (!clearsOpenWater(bounds)) continue;
      if (keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius)) continue;
      if (protectedOrientedFootprintClearance(bounds) < 1) continue;
      if (!clearsEveryGroundRoad(bounds.center.x, bounds.center.z, bounds.radius)) continue;
      if (!buildingClearsElevatedDeck(bounds)) continue;
      if (overlaps(bounds)) continue;
      out.push(placement);
    }
  }
  return out;
}

/** Street props + shop stalls + trees beyond the complete sidewalk footprint. */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const sightCorridors = buildShibuyaSightCorridors();
  const isSafe = (placement: Placement): boolean => {
    const bounds = renderedPlacementBounds(placement);
    const memberships = groundRoadMemberships(bounds.center.x, bounds.center.z);
    const source = memberships.find(({ roadIndex }) =>
      roadIndex === placement.roadIndex);
    return source !== undefined
      && !source.endpointCap
      && memberships.every(({ clearance }) =>
        clearance >= bounds.radius + SIDEWALK)
      && shibuyaPlazaClearance(bounds.center.x, bounds.center.z) > bounds.radius
      && protectedOrientedFootprintClearance(bounds) > 0
      && clearsOpenWater(bounds)
      && sightCorridors.every((corridor) =>
        segmentFootprintClearance(corridor.start, corridor.end, bounds)
          > corridor.halfWidth);
  };
  // require ≥ 3 m clearance so a prop's footprint never spills onto the driving lane
  const push = (
    file: string,
    x: number,
    z: number,
    rot: number,
    roadIndex: number,
    outward: [number, number],
  ): Placement | undefined => {
    for (let shift = 0; shift <= 40; shift += 1) {
      const placement: Placement = {
        file,
        position: [
          x + outward[0] * shift,
          0,
          z + outward[1] * shift,
        ],
        rotationY: rot,
        roadIndex,
      };
      if (!isSafe(placement)) continue;
      out.push(placement);
      return placement;
    }
    return undefined;
  };
  // small props / shop stalls sit on the OUTER half of the sidewalk (hw+5.5)
  for (const e of groundRoadEdgePoints(22)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.6)) continue;
      const rot = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      if (rng.chance(0.3)) {
        const n = 2 + rng.int(0, 1);
        for (let i = 0; i < n; i++) {
          const p = e.pos.clone()
            .addScaledVector(e.bin, side * (e.hw + 5.5))
            .addScaledVector(e.tan, (i - 1) * 2.4);
          push(
            g(rng.pick(SHOP)),
            p.x,
            p.z,
            rot + rng.range(-0.2, 0.2),
            e.roadIndex,
            [e.bin.x * side, e.bin.z * side],
          );
        }
      } else {
        const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 6));
        push(
          g(rng.pick(EDGE)),
          p.x,
          p.z,
          rot,
          e.roadIndex,
          [e.bin.x * side, e.bin.z * side],
        );
      }
    }
  }
  // trees / banners set BACK past the sidewalk (planting strip by the buildings),
  // so nothing overhangs the street
  for (const e of groundRoadEdgePoints(34)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.65)) continue;
      const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 10.5 + rng.range(0, 2)));
      push(
        g(rng.pick(DECOR)),
        p.x,
        p.z,
        rng.range(0, Math.PI * 2),
        e.roadIndex,
        [e.bin.x * side, e.bin.z * side],
      );
    }
  }
  // Sparse service hardware belongs in the facade planting strip, past the
  // sidewalk edge. Per-road membership rejects crossings rather than relying
  // on a nearest-road approximation.
  let serviceIndex = rng.int(0, SERVICE_FILES.length - 1);
  for (const e of groundRoadEdgePoints(48)) {
    for (const side of [1, -1] as const) {
      if (out.filter((p) => SERVICE_FILES.includes(p.file as typeof SERVICE_FILES[number])).length >= 12) return out;
      const offset = e.hw + rng.range(11.5, 14);
      const p = e.pos.clone().addScaledVector(e.bin, side * offset);
      const memberships = groundRoadMemberships(p.x, p.z);
      const source = memberships.find((membership) => membership.roadIndex === e.roadIndex);
      if (
        !source
        || source.endpointCap
        || source.clearance < 11.5
        || source.clearance > 14
        || keepClear(p.x, p.z)
        || groundRoadClearance(p.x, p.z) < 10
        || memberships.some((membership) => membership.withinRoadOrSidewalk)
      ) continue;
      const nearbyService = out.some((placed) =>
        SERVICE_FILES.includes(placed.file as typeof SERVICE_FILES[number])
        && Math.hypot(placed.position[0] - p.x, placed.position[2] - p.z) < 18,
      );
      if (nearbyService) continue;
      const placed = push(
        SERVICE_FILES[serviceIndex],
        p.x,
        p.z,
        Math.atan2(-e.bin.x * side, -e.bin.z * side),
        e.roadIndex,
        [e.bin.x * side, e.bin.z * side],
      );
      if (!placed) continue;
      serviceIndex = (serviceIndex + 1) % SERVICE_FILES.length;
    }
  }
  return out;
}

// ── Street furniture: lamp posts + powerline poles/cables (procedural) ──
export interface Lamp { pos: THREE.Vector3; rotationY: number; roadIndex: number }
export interface Pole { pos: THREE.Vector3; roadIndex: number }
export interface Cable {
  a: THREE.Vector3;
  b: THREE.Vector3;
  aRoadIndex: number;
  bRoadIndex: number;
}
export interface StreetFurniture { lamps: Lamp[]; poles: Pole[]; cables: Cable[] }

export function buildStreetFurniture(seed = 5150): StreetFurniture {
  const rng = makeRng(seed);
  const lamps: Lamp[] = [];
  const poles: Pole[] = [];
  const cables: Cable[] = [];
  const edges = groundRoadEdgePoints(22);
  let prevPoleTop: { pos: THREE.Vector3; roadIndex: number } | null = null;
  const isExactRoadSafe = (pos: THREE.Vector3, roadIndex: number): boolean => {
    if (keepClear(pos.x, pos.z)) return false;
    const memberships = groundRoadMemberships(pos.x, pos.z);
    const source = memberships.find((membership) => membership.roadIndex === roadIndex);
    return source !== undefined
      && !source.endpointCap
      && source.clearance >= 1
      && memberships.every((membership) =>
        membership.roadIndex === roadIndex || !membership.withinRoadOrSidewalk);
  };
  edges.forEach((e, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const off = e.hw + 4.5; // mid-sidewalk, well off the driving lane
    const base = e.pos.clone().addScaledVector(e.bin, side * off);
    // lamp facing the road — skip if this spot lands on a crossing road (an
    // intersection sidewalk point can otherwise sit in the middle of a street)
    if (groundRoadClearance(base.x, base.z) >= 1 && isExactRoadSafe(base, e.roadIndex)) {
      lamps.push({
        pos: base.clone(),
        rotationY: Math.atan2(-e.bin.x * side, -e.bin.z * side),
        roadIndex: e.roadIndex,
      });
    }
    // powerline poles on the opposite side, cables strung between consecutive ones
    if (i % 2 === 0) {
      const pbase = e.pos.clone().addScaledVector(e.bin, -side * (e.hw + 8));
      if (groundRoadClearance(pbase.x, pbase.z) >= 1
        && isExactRoadSafe(pbase, e.roadIndex)) {
        poles.push({ pos: pbase.clone(), roadIndex: e.roadIndex });
        const top = pbase.clone().setY(13);
        if (prevPoleTop && top.distanceTo(prevPoleTop.pos) < 90) {
          const segmentCount = Math.ceil(top.distanceTo(prevPoleTop.pos));
          const crossesKeepClear = Array.from(
            { length: segmentCount + 1 },
            (_, sample) => sample / segmentCount,
          ).some((t) => keepClear(
            THREE.MathUtils.lerp(prevPoleTop!.pos.x, top.x, t),
            THREE.MathUtils.lerp(prevPoleTop!.pos.z, top.z, t),
          ));
          if (!crossesKeepClear) {
            cables.push({
              a: prevPoleTop.pos.clone(),
              b: top.clone(),
              aRoadIndex: prevPoleTop.roadIndex,
              bRoadIndex: e.roadIndex,
            });
          }
        }
        prevPoleTop = { pos: top, roadIndex: e.roadIndex };
      }
    }
    void rng;
  });
  return { lamps, poles, cables };
}

/** Cheap far-field skyline: instanced boxes ringing the play area for depth. */
export interface SkyBox {
  matrix: THREE.Matrix4;
  emissive: boolean;
  center: { x: number; z: number };
  width: number;
  depth: number;
  height: number;
  rotationY: number;
}

export function skylineBoxBounds(box: SkyBox): OrientedBuildingBounds {
  return {
    file: 'procedural-skyline-box',
    center: box.center,
    rotationY: box.rotationY,
    scale: 1,
    radius: Math.hypot(box.width, box.depth) / 2,
    halfX: box.width / 2,
    halfZ: box.depth / 2,
    height: box.height,
  };
}

export const SKYLINE_TARGET_COUNT = 150;
/** Deterministic hard stop; production currently accepts within ~150 attempts. */
export const SKYLINE_ATTEMPT_BUDGET = 1000;

export interface SkylineGenerationOptions {
  targetCount?: number;
  attemptBudget?: number;
}

export function buildSkylineWithSafety(
  seed: number,
  isSafe: (bounds: OrientedBuildingBounds, box: SkyBox) => boolean,
  {
    targetCount = SKYLINE_TARGET_COUNT,
    attemptBudget = SKYLINE_ATTEMPT_BUDGET,
  }: SkylineGenerationOptions = {},
): SkyBox[] {
  const rng = makeRng(seed);
  const boxes: SkyBox[] = [];
  const cx = -40, cz = -260;
  for (let attempt = 0; boxes.length < targetCount && attempt < attemptBudget; attempt++) {
    const ang = rng.range(0, Math.PI * 2);
    const rad = rng.range(620, 1300);
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad * 1.1;
    const w = rng.range(22, 52);
    const d = rng.range(22, 52);
    const h = rng.range(70, 300);
    const rotationY = rng.range(0, Math.PI);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, h / 2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
      new THREE.Vector3(w, h, d)
    );
    const box: SkyBox = {
      matrix: m,
      emissive: rng.chance(0.28),
      center: { x, z },
      width: w,
      depth: d,
      height: h,
      rotationY,
    };
    const bounds = skylineBoxBounds(box);
    if (!isSafe(bounds, box)) continue;
    boxes.push(box);
  }
  if (boxes.length !== targetCount) {
    throw new Error(
      `Unable to generate ${targetCount} safe skyline boxes after ${attemptBudget} attempts `
      + `(accepted ${boxes.length}, seed ${seed})`,
    );
  }
  return boxes;
}

export function buildSkyline(seed = 4242): SkyBox[] {
  const buildings = buildCityLayout().map(buildingPlacementBounds);
  const pillars = buildHighwayPillarLayout(buildings);
  return buildSkylineWithSafety(seed, (bounds) => {
    const deck = elevatedDeckBuildingClearance(bounds);
    return clearsOpenWater(bounds)
      && (deck.horizontalMargin > 0 || deck.verticalMargin >= 4)
      && protectedOrientedFootprintClearance(bounds) > 0
      && pillars.every((pillar) =>
        pointOrientedFootprintClearance(pillar, bounds) > pillar.radius);
  });
}
