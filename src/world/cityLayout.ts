import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import {
  buildingClearsElevatedDeck,
  elevatedDeckBuildingClearance,
  type GroundRoadEdgePoint,
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
import {
  ABOUT_HERO_BACKDROP_ID,
  ABOUT_HERO_BACKDROP_PLACEMENT,
  ABOUT_PLAZA_PLACEMENTS,
  aboutSightlineFootprintMargin,
  aboutSightlinePointMargin,
} from './aboutReveal';
import { STUNT_BACKDROP } from './stuntLayout';
import { RESEARCH_WALLS } from './researchLayout';
import {
  researchCorridorPointClearance,
  researchCorridorSegmentClearance,
} from './researchSightlines';

/**
 * City placement. A dense grid fills the WHOLE map with building blocks; the
 * road network is CARVED out (a lot is only used if its clearance exceeds the
 * building footprint) so roads read as canyons and nothing lands on a street.
 * Buildings are GPU-instanced (see InstancedPieces) so density is cheap.
 */
const P = 'KB3D_NEC_';
// Pools grouped by TRIANGLE COST (instancing saves draw calls but not vertex
// work). Heavy hero towers are used sparingly as landmarks; the bulk is light.
// Approved-only palette: the heavy LG_C_Main / MD_C_Main / LG_A_BuildingC /
// MD_A_Main are removed scene-wide and replaced by height-matched allowed pieces
// (LG_C_Main→LG_B_Main, MD_C_Main→MD_B_Main, BuildingC/MD_A_Main→LG_A_BuildingD).
const HERO = [`${P}BldgLG_B_Main`];                                                 // tall landmark
const TALL = [`${P}BldgLG_A_Main`, `${P}BldgMD_B_Main`];                            // ~57–67m
const MID = [`${P}BldgMD_B_Main`, `${P}BldgLG_A_BuildingA`, `${P}BldgLG_A_BuildingB`, `${P}BldgLG_A_BuildingD`, `${P}BldgMD_C_BuildingA`]; // ~15–73m
const SMALL = [`${P}BldgSM_A_Main`, `${P}BldgSM_B_Main`, `${P}BldgSM_C_Main`];      // ~3–25k
const LOW_BASE = [`${P}BldgLG_C_Base`, `${P}BldgMD_A_Base`, `${P}BldgLG_A_Base`, `${P}BldgMD_C_Base`];
const EDGE = [
  `${P}BldgSM_C_AC`, `${P}BldgSM_C_Boxes`, `${P}BldgSM_C_CratesA`,
  `${P}BldgSM_C_CratesB`, `${P}BldgSM_C_Pipes`, `${P}BldgSM_A_ConcreteBarrier`,
];
const SHOP = [
  `${P}BldgSM_B_Cart`, `${P}BldgSM_B_Bbq`, `${P}BldgSM_B_Umbrella`, `${P}BldgSM_B_FridgeA`,
  `${P}BldgSM_B_FridgeB`, `${P}BldgSM_C_Shelf`, `${P}BldgSM_C_Stool`, `${P}BldgSM_B_Computers`,
  `${P}BldgSM_C_NeonSignA`, `${P}BldgSM_C_NeonSignB`, `${P}BldgSM_C_NeonSignC`, `${P}BldgSM_C_Fan`,
];
// Tall, narrow (~0.5–6m footprint) lit spires — thin enough to plant like a
// tree in the back planting strip without ever threatening sidewalk clearance.
const SPIRE = [
  `${P}BldgLG_B_AntennaA`, `${P}BldgLG_C_AntennaA`, `${P}BldgLG_C_AntennaB`,
  `${P}BldgLG_C_AntennaC`, `${P}BldgLG_C_AntennaD`, `${P}BldgMD_A_AntennaA`,
  `${P}BldgMD_C_AntennaA`,
];
const DECOR = [`${P}BldgLG_A_Tree`, ...SPIRE]; // trees + antenna spires — the banner assets read badly, so drop them
const SHIBUYA_FRONT = [`${P}BldgMD_B_Main`];
const SHIBUYA_BACK = [`${P}BldgLG_B_Main`];
export const SERVICE_FILES = [
  'props/quat_ac.glb',
  'props/quat_ac_stacked.glb',
  'props/quat_antenna_1.glb',
  'props/quat_antenna_2.glb',
  'props/quat_sign_1.glb',
  'props/quat_sign_3.glb',
] as const;

export interface Placement {
  id?: string;
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
  foot?: number;
  outDir?: [number, number];
  centerOffset?: [number, number];
  roadId?: string;
  roadIndex?: number;
  layoutRole?:
    | 'shibuya-front'
    | 'shibuya-back'
    | 'shibuya-corner'
    | 'low-base'
    | 'stunt-backdrop'
    | 'research-front'
    | 'research-back'
    | 'about-plaza'
    | typeof ABOUT_HERO_BACKDROP_ID;
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
// The layout is a pure function of `seed` (seeded RNG + deterministic placement
// with an O(n²) footprint-overlap pass). It is called from several main-thread
// sites during first load (buildInitialVisibilityLayout, Pillars, sign/stunt/
// research paths), each of which used to recompute the entire ~1s city from
// scratch. Memoize by seed so every consumer shares one result. Consumers only
// read placements (or `.map()` them); the returned reference is already shared
// this way by visibilityProfile's cachedBuildingsSource, so this changes nothing
// but the redundant recomputation.
const cityLayoutCache = new Map<number, Placement[]>();

export function buildCityLayout(seed = 20260720): Placement[] {
  const cached = cityLayoutCache.get(seed);
  if (cached) return cached;
  const result = computeCityLayout(seed);
  cityLayoutCache.set(seed, result);
  return result;
}

function computeCityLayout(seed: number): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [
    { ...ABOUT_HERO_BACKDROP_PLACEMENT },
    ...ABOUT_PLAZA_PLACEMENTS.map((placement) => ({ ...placement })),
    ...STUNT_BACKDROP.map((placement) => ({ ...placement })),
    ...RESEARCH_WALLS.map((placement) => ({ ...placement })),
  ];

  const anchorA = SIDEWALK + GAP;                  // front wall hugs the sidewalk (hw+10)
  const anchorB = anchorA + 2 * FOOT_A + ALLEY;    // back towers behind a narrow alley
  const shibuyaSightCorridors = buildShibuyaSightCorridors();

  const isProtectedPlacement = (placement: Placement): boolean =>
    placement.layoutRole === 'shibuya-front'
    || placement.layoutRole === 'shibuya-back'
    || placement.layoutRole === 'shibuya-corner'
    || placement.layoutRole === 'low-base'
    || placement.layoutRole === 'stunt-backdrop'
    || placement.layoutRole === 'research-front'
    || placement.layoutRole === 'research-back'
    || placement.layoutRole === 'about-plaza'
    || placement.layoutRole === ABOUT_HERO_BACKDROP_ID;

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
  ): boolean => {
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
    if (resolved.outcome === 'rejected') return false;
    const { placement, bounds } = resolved.placement;
    if (!clearsOpenWater(bounds)) return false;
    if (aboutSightlineFootprintMargin(bounds) <= 0) return false;
    // Safety uses each exact projected road membership. The sampled nearest-road
    // approximation remains useful for district selection only.
    if (keepClearFootprint(bounds.center.x, bounds.center.z, bounds.radius)) return false;
    if (!clearsEveryGroundRoad(bounds.center.x, bounds.center.z, bounds.radius)) return false;
    if (overlaps(bounds, true)) return false;
    out.push(placement);
    return true;
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
    if (aboutSightlineFootprintMargin(bounds) <= 0) return undefined;
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
        ? [16, 34, 53, 90, 127, 275]
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
    if (aboutSightlineFootprintMargin(bounds) <= 0) return;
    if (shibuyaSightCorridors.some((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        <= corridor.halfWidth)) return;
    const conflicts = out.filter((existing) =>
      orientedFootprintsOverlap(bounds, buildingPlacementBounds(existing), 2));
    if (conflicts.some(isProtectedPlacement)) return;
    for (const conflict of conflicts) out.splice(out.indexOf(conflict), 1);
    out.push(placement);
  };
  // Keep the approved south frontage fixed in world space while the bike and
  // road centerlines ease through the plaza independently of facade placement.
  placeShibuyaCornerAt(
    new THREE.Vector3(181, 0, -67),
    `${P}BldgMD_B_Main`,
    18,
    1,
    'south',
    29.386,
  );
  placeShibuyaCornerAt(
    new THREE.Vector3(184.796, 0, -42.114),
    `${P}BldgMD_B_Main`,
    18,
    1,
    'south',
    4.5,
  );
  placeShibuyaCornerAt(
    new THREE.Vector3(340, 0, -45),
    `${P}BldgLG_A_BuildingA`,
    14,
    -1,
    'east',
    109.659,
  );
  placeShibuyaCornerAt(
    new THREE.Vector3(220, 0, 140),
    `${P}BldgLG_A_BuildingA`,
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
    new THREE.Vector3(145, 0, 90),
    `${P}BldgLG_A_BuildingB`,
    18,
    1,
    'west',
    145.344,
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
      if (aboutSightlineFootprintMargin(bounds) <= 0) continue;
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
    !layoutRole?.startsWith('shibuya-')
    && layoutRole !== 'stunt-backdrop'
    && !layoutRole?.startsWith('research-')).length;
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
      if (aboutSightlineFootprintMargin(bounds) <= 0) continue;
      if (overlaps(bounds)) continue;
      out.push(placement);
    }
  }

  // Targeted infill: the sparse per-sample skip roll in the front-wall pass
  // above can (rarely) leave a visible gap in the wall. Force a retry at each
  // reported gap by snapping to the nearest dense road-edge sample and
  // re-running the exact same safety pipeline as the ordinary front wall.
  const GAP_FILL_TARGETS: Array<{ x: number; z: number }> = [
    { x: -202.08, z: 26.14 },
    { x: -104.45, z: -20.48 },
    { x: 45.74, z: 24.8 },
    // (188.89, 14.67) removed: it force-planted a lone BldgLG_A on the north
    // frontage of the Shibuya approach — a strip the isShibuyaWallSample skip
    // otherwise clears — where its oversized mesh overhung the sidewalk.
    { x: 348.63, z: -3.46 },
    { x: 241.54, z: 108.43 },
  ];
  const denseEdgePoints = groundRoadEdgePoints(6);
  for (const target of GAP_FILL_TARGETS) {
    let nearest: GroundRoadEdgePoint | undefined;
    let bestDistSq = Infinity;
    for (const e of denseEdgePoints) {
      const dx = e.pos.x - target.x;
      const dz = e.pos.z - target.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        nearest = e;
      }
    }
    if (!nearest) continue;
    const side: 1 | -1 = (nearest.bin.x * (target.x - nearest.pos.x)
      + nearest.bin.z * (target.z - nearest.pos.z)) >= 0 ? 1 : -1;
    // Try progressively smaller footprints/pools so a tight curve or a
    // neighboring landmark's larger footprint doesn't leave the gap empty.
    // On a sharp curve the sidewalk-hugging anchor alone isn't enough road
    // clearance even for a small footprint, so also step the anchor back in
    // small increments — still snapped to this gap, still gated by the same
    // safety pipeline, just standing a little further off the road.
    const tiers: Array<{ pool: string[]; foot: number }> = [
      { pool: rng.chance(0.35) ? TALL : MID, foot: FOOT_A },
      { pool: SMALL, foot: 11 },
      { pool: EDGE, foot: 3 },
    ];
    outer: for (const tier of tiers) {
      for (const anchorPush of [0, 3, 6, 9, 12, 15]) {
        if (place(nearest.pos, nearest.bin, nearest.tan, side, nearest.hw, anchorA + anchorPush, tier.pool, tier.foot)) {
          break outer;
        }
      }
    }
  }

  return out;
}

/** Street props + shop stalls + trees beyond the complete sidewalk footprint. */
export function buildProps(seed = 8891): Placement[] {
  const rng = makeRng(seed);
  const out: Placement[] = [];
  const sightCorridors = buildShibuyaSightCorridors();
  const aboutParentBounds = buildingPlacementBounds(ABOUT_HERO_BACKDROP_PLACEMENT);
  const isSafe = (placement: Placement, minClearance = SIDEWALK): boolean => {
    const bounds = renderedPlacementBounds(placement);
    const memberships = groundRoadMemberships(bounds.center.x, bounds.center.z);
    const source = memberships.find(({ roadIndex }) =>
      roadIndex === placement.roadIndex);
    return source !== undefined
      && !source.endpointCap
      && memberships.every(({ clearance }) =>
        clearance >= bounds.radius + minClearance)
      && shibuyaPlazaClearance(bounds.center.x, bounds.center.z) > bounds.radius
      && protectedOrientedFootprintClearance(bounds) > 0
      && clearsOpenWater(bounds)
      && researchCorridorPointClearance(bounds.center, bounds.radius) > 0
      && aboutSightlineFootprintMargin(bounds) > 0
      && !orientedFootprintsOverlap(bounds, aboutParentBounds, 1)
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
    maxShift = 40,
    minClearance = SIDEWALK,
  ): Placement | undefined => {
    for (let shift = 0; shift <= maxShift; shift += 1) {
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
      if (!isSafe(placement, minClearance)) continue;
      out.push(placement);
      return placement;
    }
    return undefined;
  };
  // small props / shop stalls sit on the OUTER half of the sidewalk (hw+5.5)
  for (const e of groundRoadEdgePoints(22)) {
    for (const side of [1, -1] as const) {
      if (rng.chance(0.45)) continue;
      const rot = Math.atan2(e.bin.x * side, e.bin.z * side) + rng.range(-0.3, 0.3);
      if (rng.chance(0.4)) {
        const n = 2 + rng.int(0, 2);
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
  // ── Intro runway dressing: the western opening straight (x ≲ -150) reads as a
  //    bare dark road flanked by empty sidewalks in the very first shots. Pack
  //    BOTH sidewalks, curb-to-facade, with a lit, lived-in market street:
  //    glowing stalls + neon signs right at the curb, crates behind them, and
  //    trees/spires in the planting strip. Uses its own RNG substream so the
  //    rest of the city's arrangement is unchanged. Runs BEFORE the service
  //    loop's early return so it always executes. ──
  const introRng = makeRng(seed ^ 0x1c7a0);
  const NEON = SHOP.filter((f) => f.includes('NeonSign'));
  for (const e of groundRoadEdgePoints(5)) {
    if (e.roadId !== 'main-route' || e.pos.x > -150 || e.pos.x < -565) continue;
    for (const side of [1, -1] as const) {
      const outward: [number, number] = [e.bin.x * side, e.bin.z * side];
      const facing = Math.atan2(e.bin.x * side, e.bin.z * side);

      // Curb line: glowing stalls / neon carts that line the neon road. A 3 m
      // clearance floor (the driving-lane safety margin) lets these sit on the
      // inner sidewalk, right beside the glowing lanes, instead of being shoved
      // back against the facades like the ≥9 m default props.
      // Curb line always carries something so no stretch of sidewalk reads bare:
      // mostly rows of glowing market stalls, otherwise a neon sign right at the
      // kerb.
      const curbRoll = introRng();
      if (curbRoll < 0.68) {
        const n = 2 + introRng.int(0, 2);
        for (let i = 0; i < n; i++) {
          const p = e.pos.clone()
            .addScaledVector(e.bin, side * (e.hw + 2))
            .addScaledVector(e.tan, (i - 1) * 2.1);
          push(
            g(introRng.pick(SHOP)),
            p.x,
            p.z,
            facing + introRng.range(-0.25, 0.25),
            e.roadIndex,
            outward,
            12,
            3,
          );
        }
      } else {
        const p = e.pos.clone().addScaledVector(e.bin, side * (e.hw + 2));
        push(
          g(introRng.pick(NEON)),
          p.x,
          p.z,
          facing + introRng.range(-0.15, 0.15),
          e.roadIndex,
          outward,
          12,
          3,
        );
      }

      // Facade billboards: tall lit neon signs stood against the buildings behind
      // the planting strip, filling the upper canyon wall with signage.
      if (introRng.chance(0.5)) {
        const p = e.pos.clone()
          .addScaledVector(e.bin, side * (e.hw + 9))
          .addScaledVector(e.tan, introRng.range(-2, 2));
        push(
          g(introRng.pick(NEON)),
          p.x,
          p.z,
          facing + introRng.range(-0.2, 0.2),
          e.roadIndex,
          outward,
          12,
          8,
        );
      }

      // Mid sidewalk: crates / AC / barriers so the walkway itself isn't bare.
      if (introRng.chance(0.7)) {
        const p = e.pos.clone()
          .addScaledVector(e.bin, side * (e.hw + 5))
          .addScaledVector(e.tan, introRng.range(-1.5, 1.5));
        push(
          g(introRng.pick(EDGE)),
          p.x,
          p.z,
          facing + introRng.range(-0.3, 0.3),
          e.roadIndex,
          outward,
          12,
          5,
        );
      }

      // Planting strip: trees / antenna spires against the facades.
      if (introRng.chance(0.7)) {
        const p = e.pos.clone()
          .addScaledVector(e.bin, side * (e.hw + 10.5 + introRng.range(0, 2)));
        push(
          g(introRng.pick(DECOR)),
          p.x,
          p.z,
          introRng.range(0, Math.PI * 2),
          e.roadIndex,
          outward,
        );
      }
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
      const serviceStrips = memberships.filter((membership) =>
        !membership.endpointCap
        && membership.clearance >= 11.5
        && membership.clearance <= 14);
      if (
        !source
        || source.endpointCap
        || source.clearance < 11.5
        || source.clearance > 14
        || serviceStrips.length !== 1
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
        0,
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
    if (aboutSightlinePointMargin(pos, 0.5) <= 0) return false;
    if (researchCorridorPointClearance(pos, 0.5) <= 0) return false;
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
    const lampHead = base.clone().add(new THREE.Vector3(
      Math.sin(Math.atan2(-e.bin.x * side, -e.bin.z * side)) * 1.5,
      0,
      Math.cos(Math.atan2(-e.bin.x * side, -e.bin.z * side)) * 1.5,
    ));
    if (
      groundRoadClearance(base.x, base.z) >= 1
      && isExactRoadSafe(base, e.roadIndex)
      && researchCorridorPointClearance(lampHead, 0.5) > 0
    ) {
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
          ).some((t) => {
            const point = {
              x: THREE.MathUtils.lerp(prevPoleTop!.pos.x, top.x, t),
              z: THREE.MathUtils.lerp(prevPoleTop!.pos.z, top.z, t),
            };
            return keepClear(point.x, point.z)
              || aboutSightlinePointMargin(point, 0.1) <= 0;
          });
          if (!crossesKeepClear) {
            if (researchCorridorSegmentClearance(
              prevPoleTop.pos,
              top,
              0.15,
            ) <= 0) {
              prevPoleTop = { pos: top, roadIndex: e.roadIndex };
              return;
            }
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
