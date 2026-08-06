import * as THREE from 'three';
import { makeRng } from '../assets/rng';
import {
  buildingClearsElevatedDeck,
  elevatedDeckBuildingClearance,
  groundRoadClearance,
  groundRoadEdgePoints,
  groundRoadMemberships,
  keepClear,
  protectedOrientedFootprintClearance,
  ROADS,
} from './roads';
import {
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
import { STUNT_BACKDROP, STUNT_BACKDROP_ROW2 } from './stuntLayout';
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
// The roadside building pools (FRONT_POOL / BACK_POOL) are defined below, once
// the `g()` path helper exists. The prop pools (EDGE / SHOP / SPIRE / DECOR)
// remain here for buildProps().
const EDGE = [
  `${P}BldgSM_C_Boxes`, `${P}BldgSM_C_CratesA`,
  `${P}BldgSM_C_CratesB`, `${P}BldgSM_C_Pipes`, `${P}BldgSM_A_ConcreteBarrier`,
];
const SHOP = [
  `${P}BldgSM_B_Cart`, `${P}BldgSM_B_Umbrella`, `${P}BldgSM_B_FridgeA`,
  `${P}BldgSM_B_FridgeB`,
  `${P}BldgSM_C_NeonSignA`, `${P}BldgSM_C_NeonSignB`,
];
// Tall, narrow (~0.5–6m footprint) lit spires — thin enough to plant like a
// tree in the back planting strip without ever threatening sidewalk clearance.
const SPIRE = [
  `${P}BldgLG_B_AntennaA`, `${P}BldgLG_C_AntennaA`, `${P}BldgLG_C_AntennaB`,
  `${P}BldgLG_C_AntennaC`, `${P}BldgLG_C_AntennaD`, `${P}BldgMD_A_AntennaA`,
  `${P}BldgMD_C_AntennaA`,
];
const DECOR = [`${P}BldgLG_A_Tree`, ...SPIRE]; // trees + antenna spires — the banner assets read badly, so drop them
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
    | 'restaurant'
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

// Legacy sidewalk width retained only for buildProps() clearance math.
const SIDEWALK = 9;

const UP = new THREE.Vector3(0, 1, 0);

// ── Two-row roadside packer geometry ──
// The visible sidewalk mesh (City.tsx Roads) is narrowed to a 2.5m half-width →
// 5m outer reach. Buildings hug that new edge: the FRONT near-face sits at
// hw + SIDEWALK_WIDTH + FRONT_GAP; the BACK row is anchored just behind whatever
// front building sits ahead of it (adaptive), so the two rows stay tight.
const SIDEWALK_WIDTH = 5;   // narrowed sidewalk outer reach past the road edge
const FRONT_GAP = 1;        // planting gap between sidewalk edge and front facade
const FRONT_ANCHOR = SIDEWALK_WIDTH + FRONT_GAP;      // front near-face, from road edge
const ROW_ALLEY = 2;        // gap between a front far-face and the back near-face
const BACK_FALLBACK_ANCHOR = FRONT_ANCHOR + 16;       // back near-face where no front piece sits ahead
const BACK_PHASE = 10;      // arc-length offset so back seams miss front seams
const SEAM = 0.6;           // clear gap between neighbouring facades in a row
const MIN_STEP = 4;         // slide distance when a spot rejects every candidate
const ROAD_CLEARANCE_MIN = SIDEWALK_WIDTH; // keep every facade off the sidewalk/road
const PLAZA_MARGIN = 3;     // keep facades this far off the plaza / keep-clear shapes
const OVERLAP_MARGIN = 0.5; // min gap enforced between any two building footprints
const ROW_ATTEMPTS = 8;     // candidate picks tried per cursor position
const RECENT_FAMILY_WINDOW = 2; // no repeat of a building family within N neighbours

// ── Approved building pools for the two-row roadside packer ──
// Both rows mix short/medium/tall (heights noted); FRONT biases shorter, BACK
// biases taller so line 2 rises above line 1 while still varying. Chopped height
// variants (neocity-variants) add mid heights the base kit lacks. Anti-repetition
// keys on `familyOf(file)` (base model, ignoring the _H height suffix) so neither
// the same piece nor a re-heighted sibling ever lands within RECENT_FAMILY_WINDOW.
interface PoolPiece { file: string; scale?: number; weight: number }
const MONOGON_SCALE = 2.6;
const mono = (n: string): string => `monogon/${n}.glb`;
const vnt = (n: string): string => `neocity-variants/${n}.glb`;

/** Base model identity, ignoring pack folder and the chopped `_H<height>` suffix. */
const familyOf = (file: string): string =>
  file.replace(/^.*\//, '').replace(/\.glb$/, '')
    .replace(/^KB3D_NEC_Bldg/, '').replace(/_H\d+$/, '');

const FRONT_POOL: PoolPiece[] = [
  { file: g(`${P}BldgMD_A_Main`), weight: 3 },                       // 13m
  { file: g(`${P}BldgLG_A_BuildingD`), weight: 3 },                  // 20m
  { file: g(`${P}BldgLG_A_BuildingC`), weight: 2 },                  // 24m
  { file: mono('Building_06'), scale: MONOGON_SCALE, weight: 3 },    // ~33m
  { file: vnt(`${P}BldgLG_A_Main_H34`), weight: 3 },                 // 34m variant
  { file: vnt(`${P}BldgMD_C_Main_H36`), weight: 3 },                 // 36m variant
  { file: g(`${P}BldgLG_A_BuildingA`), weight: 3 },                  // 42m
  { file: g(`${P}BldgMD_B_Main`), weight: 2 },                       // 57m
  { file: g(`${P}BldgMD_C_Main`), weight: 2 },                       // 58m
  { file: g(`${P}BldgLG_A_Main`), weight: 2 },                       // 67m
  { file: vnt(`${P}BldgLG_C_Main_H100`), weight: 1 },                // 100m (occasional)
  { file: mono('Building_3'), scale: MONOGON_SCALE, weight: 1 },     // ~42m spire
  // NOTE: BuildingB (#4) and its _H47 variant are deliberately kept OUT of the
  // front row — their footprint rotates so the faces don't align to the street.
];
const BACK_POOL: PoolPiece[] = [
  { file: g(`${P}BldgLG_A_BuildingD`), weight: 1 },                  // 20m (some short)
  { file: mono('Building_06'), scale: MONOGON_SCALE, weight: 1 },    // ~33m
  { file: vnt(`${P}BldgLG_A_Main_H34`), weight: 1 },                 // 34m variant
  { file: vnt(`${P}BldgMD_C_Main_H36`), weight: 2 },                 // 36m variant
  { file: g(`${P}BldgLG_A_BuildingA`), weight: 2 },                  // 42m
  { file: vnt(`${P}BldgLG_A_BuildingB_H47`), weight: 2 },            // 47m variant
  { file: g(`${P}BldgMD_B_Main`), weight: 3 },                       // 57m
  { file: g(`${P}BldgMD_C_Main`), weight: 3 },                       // 58m
  { file: g(`${P}BldgLG_A_Main`), weight: 3 },                       // 67m
  { file: g(`${P}BldgLG_A_BuildingB`), weight: 3 },                  // 73m
  { file: vnt(`${P}BldgLG_C_Main_H100`), weight: 3 },                // 100m variant
  { file: vnt(`${P}BldgLG_B_Main_H124`), weight: 3 },                // 124m variant
  { file: g(`${P}BldgLG_C_Main`), weight: 2 },                       // 143m hero
  { file: g(`${P}BldgLG_B_Main`), weight: 2 },                       // 201m hero
  { file: mono('Building_3'), scale: MONOGON_SCALE, weight: 1 },     // ~42m spire (accent)
];

// Restaurant (structures pack) that fills the NE corner of the Shibuya crossing.
// Its plaza-facing frontage is kept building-free (see restaurantFrontageBlocks)
// so it reads as the corner building rather than being hidden behind a row.
const RESTAURANT_FILE = 'structures/Resteraunt.glb';
// Smaller than city-scale so it tucks snugly into the crossing corner (raw
// 60×50×66 → ~42×35×46). Axis-aligned so its base sides run parallel to the two
// streets; 180° so the detailed storefront (corner glass window + neon signage)
// faces the plaza/intersection rather than the plain back wall.
const RESTAURANT_SCALE = 0.7;
const RESTAURANT_ROT = Math.PI;
// Placed so its plaza-facing (SW) corner sits right on the NE corner of the
// crossing, just clear of both sidewalks (PLAZA_MARGIN). center = corner + halves.
const RESTAURANT_POS = new THREE.Vector3(292, 0, 54);
const RESTAURANT_FRONTAGE_OFFSET = 22; // disc centre, toward the plaza
const RESTAURANT_FRONTAGE_RADIUS = 26; // packer buildings inside this disc are skipped

// ── Stunt visibility corridor ──
// The hero "projects" camera sits west of the main road (x≈209) and looks east at
// the ramp/scaffold on the x≈285 service alley. Buildings the packer places in the
// open slot between the main road's east edge and the stunt keep-clear (x≈255-276)
// would stand directly in that sightline, so cap their height well under the ~13m
// scaffold deck. Outside this box there is no height cap.
const STUNT_LOW_ZONE = { x0: 251, x1: 285, z0: -320, z1: -50 };
const STUNT_LOW_MAX_HEIGHT = 12;
const stuntHeightCap = (x: number, z: number): number =>
  x >= STUNT_LOW_ZONE.x0 && x <= STUNT_LOW_ZONE.x1
    && z >= STUNT_LOW_ZONE.z0 && z <= STUNT_LOW_ZONE.z1
    ? STUNT_LOW_MAX_HEIGHT
    : Infinity;

/**
 * Buildings line every ground road in TWO edge-to-edge rows per side, forming a
 * continuous canyon WALL. An arc-length packer walks each road, placing each
 * building flush against the (narrowed) sidewalk with its wider face parallel to
 * the street, advancing the cursor by the piece's real footprint so nothing
 * overlaps and no gaps open. The FRONT row is small/medium; the BACK row is
 * medium/tall, phase-shifted to cover the seams in the front row. Every
 * candidate is validated against roads, the plaza, keep-clear zones, the
 * elevated monorail, water, curated sightlines, and already-placed buildings.
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
    ...STUNT_BACKDROP_ROW2.map((placement) => ({ ...placement })),
    ...RESEARCH_WALLS.map((placement) => ({ ...placement })),
  ];

  const shibuyaSightCorridors = buildShibuyaSightCorridors();

  // ── Shared candidate validation ──
  const overlapsAny = (candidate: OrientedBuildingBounds): boolean =>
    out.some((existing) =>
      BUILDING_CATALOG.has(existing.file)
      && orientedFootprintsOverlap(
        candidate,
        buildingPlacementBounds(existing),
        OVERLAP_MARGIN,
      ));

  // Every footprint corner must clear every ground road (and its sidewalk) so no
  // building lands on a street/sidewalk — including crossing roads at corners.
  const clearsGroundRoads = (bounds: OrientedBuildingBounds): boolean =>
    orientedFootprintPerimeterPoints(bounds, 2).every((point) =>
      groundRoadMemberships(point.x, point.z).every(({ clearance }) =>
        clearance >= ROAD_CLEARANCE_MIN - 1e-6));

  // protectedOrientedFootprintClearance is the exact OBB clearance to the plaza
  // and every keep-clear rectangle. Requiring a PLAZA_MARGIN keeps facades from
  // creeping into the open crossing while still lining the approach roads.
  const candidateValid = (bounds: OrientedBuildingBounds): boolean =>
    clearsOpenWater(bounds)
    && protectedOrientedFootprintClearance(bounds) >= PLAZA_MARGIN
    && buildingClearsElevatedDeck(bounds)
    && aboutSightlineFootprintMargin(bounds) > 0
    && researchCorridorPointClearance(bounds.center, bounds.radius) > 0
    && shibuyaSightCorridors.every((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        > corridor.halfWidth)
    && clearsGroundRoads(bounds)
    && !overlapsAny(bounds);

  // Weighted pick that avoids any building family placed within the recent window
  // (so neither a repeat nor a re-heighted sibling lands next to its own kind).
  const pickPiece = (pool: PoolPiece[], recentFamilies: string[]): PoolPiece => {
    const choices = pool.filter((piece) => !recentFamilies.includes(familyOf(piece.file)));
    const list = choices.length > 0 ? choices : pool;
    const total = list.reduce((sum, piece) => sum + piece.weight, 0);
    let roll = rng.range(0, total);
    for (const piece of list) {
      roll -= piece.weight;
      if (roll <= 0) return piece;
    }
    return list[list.length - 1];
  };

  // Anchor a piece flush to the sidewalk edge, wider face parallel to the road.
  const buildRowPlacement = (
    base: THREE.Vector3,
    tan: THREE.Vector3,
    bin: THREE.Vector3,
    side: number,
    halfWidth: number,
    anchor: number,
    roadIndex: number,
    piece: PoolPiece,
  ): {
    placement: Placement;
    bounds: OrientedBuildingBounds;
    tangentialHalf: number;
    radialHalf: number;
  } | null => {
    const metrics = BUILDING_CATALOG.get(piece.file);
    if (!metrics) return null;
    const ox = bin.x * side;
    const oz = bin.z * side;
    // Face the road; rotate 90° when the depth axis is the wider one so the broad
    // face (not the narrow end) lines the street.
    const swap = metrics.size.z > metrics.size.x;
    const rotationY = Math.atan2(-ox, -oz) + (swap ? Math.PI / 2 : 0);
    const position: [number, number, number] = [
      base.x + ox * (halfWidth + anchor),
      0,
      base.z + oz * (halfWidth + anchor),
    ];
    const probe: Placement = {
      file: piece.file,
      position,
      rotationY,
      scale: piece.scale,
      outDir: [ox, oz],
      centerOffset: [0, 0],
    };
    // Push the centre out by the real half-depth so the near face lands exactly on
    // the anchor line (flush, parallel facades).
    const radialHalf = projectedFootprintHalfExtent(
      buildingPlacementBounds(probe),
      { x: ox, z: oz },
    );
    const placement: Placement = {
      ...probe,
      centerOffset: [ox * radialHalf, oz * radialHalf],
      roadIndex,
    };
    const bounds = buildingPlacementBounds(placement);
    const tangentialHalf = projectedFootprintHalfExtent(bounds, {
      x: tan.x,
      z: tan.z,
    });
    return { placement, bounds, tangentialHalf, radialHalf };
  };

  // ── Restaurant: fills the NE corner of the Shibuya crossing ──
  let restaurantFrontage: { x: number; z: number } | null = null;
  if (BUILDING_CATALOG.has(RESTAURANT_FILE)) {
    const toPlaza = new THREE.Vector3(
      240 - RESTAURANT_POS.x,
      0,
      -RESTAURANT_POS.z,
    ).normalize();
    const restaurant: Placement = {
      file: RESTAURANT_FILE,
      position: [RESTAURANT_POS.x, 0, RESTAURANT_POS.z],
      rotationY: RESTAURANT_ROT,
      scale: RESTAURANT_SCALE,
      outDir: [-toPlaza.x, -toPlaza.z],
      centerOffset: [0, 0],
      layoutRole: 'restaurant',
    };
    if (candidateValid(buildingPlacementBounds(restaurant))) {
      out.push(restaurant);
      // Keep a disc between the restaurant and the plaza building-free so nothing
      // blocks it head-on (buildings to the sides are still allowed).
      restaurantFrontage = {
        x: RESTAURANT_POS.x + toPlaza.x * RESTAURANT_FRONTAGE_OFFSET,
        z: RESTAURANT_POS.z + toPlaza.z * RESTAURANT_FRONTAGE_OFFSET,
      };
    }
  }
  const restaurantFrontageBlocks = (bounds: OrientedBuildingBounds): boolean =>
    restaurantFrontage !== null
    && Math.hypot(
      bounds.center.x - restaurantFrontage.x,
      bounds.center.z - restaurantFrontage.z,
    ) < RESTAURANT_FRONTAGE_RADIUS;

  // Pack one row along one side of one road, advancing by each placed footprint.
  // `anchorFor` gives the near-face distance (from road edge) at each cursor; the
  // back row uses it to sit just behind whatever front building is ahead of it.
  interface FrontRecord { distance: number; radialFar: number }
  const packRow = (
    road: (typeof ROADS)[number],
    roadIndex: number,
    side: 1 | -1,
    pool: PoolPiece[],
    phase: number,
    anchorFor: (distance: number) => number,
    record: FrontRecord[] | null,
  ): void => {
    const length = road.curve.getLength();
    let distance = phase;
    const recent: string[] = [];
    let guard = 0;
    while (distance < length && guard < 20000) {
      guard++;
      const u = distance / length;
      const base = road.curve.getPointAt(u);
      const tan = road.curve.getTangentAt(u).setY(0).normalize();
      const bin = new THREE.Vector3().crossVectors(tan, UP).normalize();
      const anchor = anchorFor(distance);
      let advance = MIN_STEP;
      for (let attempt = 0; attempt < ROW_ATTEMPTS; attempt++) {
        const piece = pickPiece(pool, recent);
        const made = buildRowPlacement(
          base, tan, bin, side, road.halfWidth, anchor, roadIndex, piece,
        );
        if (made && candidateValid(made.bounds)
          && !restaurantFrontageBlocks(made.bounds)
          && made.bounds.height
            <= stuntHeightCap(made.bounds.center.x, made.bounds.center.z)) {
          out.push(made.placement);
          recent.push(familyOf(piece.file));
          if (recent.length > RECENT_FAMILY_WINDOW) recent.shift();
          advance = 2 * made.tangentialHalf + SEAM;
          if (record) record.push({ distance, radialFar: anchor + 2 * made.radialHalf });
          break;
        }
      }
      distance += advance;
    }
  };

  // ── Two rows along every ground road (ordinary streets + Shibuya legs) ──
  // The back row is anchored adaptively just behind the nearest front building so
  // line 2 hugs line 1 (no wide alley) while its phase offset covers front seams.
  const BACK_MATCH_WINDOW = 12;
  for (let roadIndex = 0; roadIndex < ROADS.length; roadIndex++) {
    const road = ROADS[roadIndex];
    if (!road.ground) continue;
    for (const side of [1, -1] as const) {
      const fronts: FrontRecord[] = [];
      packRow(road, roadIndex, side, FRONT_POOL, 0, () => FRONT_ANCHOR, fronts);
      const backAnchorFor = (distance: number): number => {
        let maxFar = -Infinity;
        for (const front of fronts) {
          if (Math.abs(front.distance - distance) <= BACK_MATCH_WINDOW) {
            maxFar = Math.max(maxFar, front.radialFar);
          }
        }
        return maxFar > -Infinity ? maxFar + ROW_ALLEY : BACK_FALLBACK_ANCHOR;
      };
      packRow(road, roadIndex, side, BACK_POOL, BACK_PHASE, backAnchorFor, null);
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
