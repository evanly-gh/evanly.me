import * as THREE from 'three';
import { buildProjectsTrafficCurve, roadFrame, sampleRoute } from './route';

const UP = new THREE.Vector3(0, 1, 0);
const PLAZA_X = 240;
const PLAZA_Z = 0;
const PLAZA_HALF_EXTENT = 28;
const PLAZA_SURFACE_Y = 0.04;
const MARKING_Y = 0.08;
const STRIPE_PITCH = 2.4;
// Zebra bars: continental stripes that run parallel to traffic (and to the
// street edge + tactile pads), arrayed across the full street width. Made WIDER
// (longer bars) but NOT thicker (bar cross-thickness stays slim).
const STRIPE_LENGTH = 7.5; // travel-direction length of each bar — the "wide" axis
const STRIPE_WIDTH = 0.72; // across-street thickness of each bar (slim, not thick)
const DIAGONAL_STRIPE_LENGTH = 10; // the scramble diagonal's bars are wider than the rest
const CROSSWALK_DEPTH = STRIPE_LENGTH; // band depth == bar length
const CROSSWALK_EDGE_GAP = 0.5; // clearance between the plaza edge and the band
// The visible boulevard (main-route road) curves through the plaza's SW corner,
// so the west/south crossings are aligned to it — not the axis-aligned plaza
// edges — and pads are held well off its roadway (onto the sidewalk).
const BOULEVARD_HALF_WIDTH = 11;
const PAD_ROAD_CLEARANCE = 4; // metres a pad must sit past the boulevard edge (mid-sidewalk)
// The west/south crossings are set back down their leg (away from the plaza
// mouth) so both ends land on real, un-clipped sidewalk rather than reading as
// stranded in the intersection.
const APPROACH_SETBACK = 7;
const SIDEWALK_TOP_Y = 0.45;
const INDICATOR_HEIGHT = 0.08;
const INDICATOR_LENGTH = 3.2;
const INDICATOR_WIDTH = 1.15;
const INDICATOR_MARGIN = 0.1;
const PLAZA_CHAMFER = 6;
const h = PLAZA_HALF_EXTENT;
const c = PLAZA_CHAMFER;
const PLAZA_OUTLINE = [
  { x: PLAZA_X - h + c, z: PLAZA_Z - h },
  { x: PLAZA_X + h - c, z: PLAZA_Z - h },
  { x: PLAZA_X + h, z: PLAZA_Z - h + c },
  { x: PLAZA_X + h, z: PLAZA_Z + h - c },
  { x: PLAZA_X + h - c, z: PLAZA_Z + h },
  { x: PLAZA_X - h + c, z: PLAZA_Z + h },
  { x: PLAZA_X - h, z: PLAZA_Z + h - c },
  { x: PLAZA_X - h, z: PLAZA_Z - h + c },
] as const;

export type ApproachId = 'west' | 'north' | 'east' | 'south';
export type CrossingKind = 'approach' | 'diagonal' | 'straight';

export interface PlazaSurface {
  center: THREE.Vector3;
  halfExtent: number;
  thickness: number;
  surfaceY: number;
  roadSurfaceY: number;
  outline: THREE.Vector3[];
}

export interface ApproachFrame {
  id: ApproachId;
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  halfWidth: number;
}

export interface SideRoadLeg {
  id: 'north' | 'east';
  curve: THREE.Curve<THREE.Vector3>;
  halfWidth: number;
}

export interface CrossingStripe {
  center: THREE.Vector3;
  longAxis: THREE.Vector3;
  length: number;
  width: number;
}

export interface CrossingPlacement {
  id: string;
  kind: CrossingKind;
  center: THREE.Vector3;
  streetTangent: THREE.Vector3;
  spacingAxis: THREE.Vector3;
  stripes: CrossingStripe[];
  endpointIndicatorIds: string[];
}

export interface SidewalkIndicator {
  id: string;
  center: THREE.Vector3;
  longAxis: THREE.Vector3;
  length: number;
  width: number;
  height: number;
  tactile: true;
  illuminated: true;
}

export interface ShibuyaIntersection {
  plaza: PlazaSurface;
  approaches: ApproachFrame[];
  sideRoads: SideRoadLeg[];
  bikeRoute: { entry: 'west'; exit: 'south' };
  crossings: CrossingPlacement[];
  indicators: SidewalkIndicator[];
}

export interface ShibuyaSightCorridor {
  id: string;
  kind: 'approach' | 'diagonal';
  start: { x: number; z: number };
  end: { x: number; z: number };
  halfWidth: number;
}

export interface AboutCuldesac {
  center: THREE.Vector3;
  roadRadius: number;
  sidewalkOuterRadius: number;
  surfaceY: number;
}

export function buildAboutCuldesac(): AboutCuldesac {
  // Dead-end bulb south of the boulevard, capping the widened cross street
  // (roads.ts: the `cross` curve now ends near (-60, 0, -44)). Pushed well back
  // from the main road so the street reads as a proper approach; the About
  // billboard building sits immediately behind it (facade z≈-62), so the bulb
  // turnaround reads as the culdesac the camera stares into from the terminus.
  return {
    center: new THREE.Vector3(-60, 0.03, -53),
    roadRadius: 11,
    sidewalkOuterRadius: 14,
    surfaceY: 0.03,
  };
}

function pointSegmentDistance(
  x: number,
  z: number,
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0
    ? 0
    : THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function shibuyaPlazaClearance(x: number, z: number): number {
  const outline = PLAZA_OUTLINE;
  let minimum = Infinity;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[j];
    const b = outline[i];
    minimum = Math.min(minimum, pointSegmentDistance(x, z, a, b));
    if (((a.z > z) !== (b.z > z))
      && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  if (minimum <= 1e-9) return 0;
  return inside ? -minimum : minimum;
}

export function shibuyaPlazaContains(x: number, z: number): boolean {
  return shibuyaPlazaClearance(x, z) <= 0;
}

export function buildShibuyaPlaza(): PlazaSurface {
  const center = new THREE.Vector3(PLAZA_X, PLAZA_SURFACE_Y - 0.06, PLAZA_Z);
  return {
    center,
    halfExtent: h,
    thickness: 0.12,
    surfaceY: PLAZA_SURFACE_Y,
    roadSurfaceY: 0,
    outline: PLAZA_OUTLINE.map(({ x, z }) =>
      new THREE.Vector3(x, PLAZA_SURFACE_Y, z)),
  };
}

function makeAxisFrame(
  id: ApproachId,
  center: THREE.Vector3,
  tangent: THREE.Vector3,
  halfWidth: number,
): ApproachFrame {
  const streetTangent = tangent.clone().setY(0).normalize();
  return {
    id,
    center: center.clone().setY(MARKING_Y),
    tangent: streetTangent,
    binormal: new THREE.Vector3().crossVectors(streetTangent, UP).normalize(),
    halfWidth,
  };
}

function frameFromCurve(
  id: ApproachId,
  curve: THREE.Curve<THREE.Vector3>,
  u: number,
  halfWidth: number,
): ApproachFrame {
  const streetTangent = curve.getTangentAt(u).setY(0).normalize();
  return {
    id,
    center: curve.getPointAt(u).setY(MARKING_Y),
    tangent: streetTangent,
    binormal: new THREE.Vector3().crossVectors(streetTangent, UP).normalize(),
    halfWidth,
  };
}

/** Parameters where a curve crosses the plaza outline (enter/leave transitions). */
function curvePlazaBoundaries(
  curve: THREE.Curve<THREE.Vector3>,
): { u: number; point: THREE.Vector3 }[] {
  const out: { u: number; point: THREE.Vector3 }[] = [];
  const steps = 4096;
  let previousInside = shibuyaPlazaContains(
    curve.getPointAt(0).x,
    curve.getPointAt(0).z,
  );
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const point = curve.getPointAt(u);
    const inside = shibuyaPlazaContains(point.x, point.z);
    if (inside !== previousInside) {
      let low = (i - 1) / steps;
      let high = u;
      for (let iteration = 0; iteration < 40; iteration++) {
        const middle = (low + high) / 2;
        const middlePoint = curve.getPointAt(middle);
        if (shibuyaPlazaContains(middlePoint.x, middlePoint.z) === previousInside) {
          low = middle;
        } else {
          high = middle;
        }
      }
      const boundaryU = (low + high) / 2;
      out.push({ u: boundaryU, point: curve.getPointAt(boundaryU) });
    }
    previousInside = inside;
  }
  return out;
}

export function buildShibuyaApproaches(
  sideRoads = buildShibuyaSideRoads(),
): ApproachFrame[] {
  const northRoad = sideRoads.find(({ id }) => id === 'north');
  const eastRoad = sideRoads.find(({ id }) => id === 'east');
  if (!northRoad || !eastRoad) throw new Error('Missing Shibuya side-road leg');
  // West + south share the ONE boulevard that curves through the plaza's SW
  // corner. Deriving those two frames from the real road (its plaza boundary
  // crossings + local tangent) keeps each band square to the actual roadway, so
  // the tactile pads land on the boulevard's true sidewalks rather than in the
  // middle of the turning street. North + east are straight side roads and stay
  // axis-aligned.
  const traffic = buildProjectsTrafficCurve();
  const boundaries = curvePlazaBoundaries(traffic);
  if (boundaries.length < 2) {
    throw new Error(`Expected >=2 boulevard plaza boundaries, got ${boundaries.length}`);
  }
  const west = boundaries.reduce((best, f) => (f.point.x < best.point.x ? f : best));
  const south = boundaries.reduce((best, f) => (f.point.z < best.point.z ? f : best));
  return [
    frameFromCurve('west', traffic, west.u, BOULEVARD_HALF_WIDTH),
    makeAxisFrame('north', new THREE.Vector3(PLAZA_X, 0, PLAZA_Z + h), new THREE.Vector3(0, 0, 1), northRoad.halfWidth),
    makeAxisFrame('east', new THREE.Vector3(PLAZA_X + h, 0, PLAZA_Z), new THREE.Vector3(1, 0, 0), eastRoad.halfWidth),
    frameFromCurve('south', traffic, south.u, BOULEVARD_HALF_WIDTH),
  ];
}

/** Distance from (x,z) to the boulevard roadway edge (<0 == on the road). */
const TRAFFIC_CENTERLINE = (() => {
  const curve = buildProjectsTrafficCurve();
  const steps = 400;
  return Array.from({ length: steps + 1 }, (_, i) => curve.getPointAt(i / steps));
})();
function boulevardClearance(x: number, z: number): number {
  let min = Infinity;
  for (const p of TRAFFIC_CENTERLINE) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < min) min = d;
  }
  return min - BOULEVARD_HALF_WIDTH;
}

/** Band centre (nudged just off the plaza, along the road) + outward normal for
 * an approach — shared by the zebra band and its two tactile pads. */
function approachBand(approach: ApproachFrame): {
  outward: THREE.Vector3;
  bandCenter: THREE.Vector3;
} {
  const fwd = approach.tangent.clone().setY(0).normalize();
  const aheadX = approach.center.x + fwd.x;
  const aheadZ = approach.center.z + fwd.z;
  const aheadDist = Math.hypot(aheadX - PLAZA_X, aheadZ - PLAZA_Z);
  const centerDist = Math.hypot(approach.center.x - PLAZA_X, approach.center.z - PLAZA_Z);
  const outward = aheadDist >= centerDist ? fwd : fwd.clone().negate();
  // Boulevard legs (west/south) hug the plaza's SW corner, so set their bands
  // further back down the leg to reach un-clipped sidewalk on both ends.
  const setback = approach.id === 'west' || approach.id === 'south'
    ? APPROACH_SETBACK
    : 0;
  const bandCenter = approach.center.clone()
    .addScaledVector(outward, CROSSWALK_DEPTH / 2 + CROSSWALK_EDGE_GAP + setback)
    .setY(MARKING_Y);
  return { outward, bandCenter };
}

export function buildShibuyaSideRoads(): SideRoadLeg[] {
  const northStart = new THREE.Vector3(PLAZA_X, 0, PLAZA_Z + PLAZA_HALF_EXTENT);
  const eastStart = new THREE.Vector3(PLAZA_X + PLAZA_HALF_EXTENT, 0, PLAZA_Z);
  return [
    {
      id: 'north',
      curve: new THREE.LineCurve3(
        northStart,
        new THREE.Vector3(PLAZA_X, 0, PLAZA_Z + 110),
      ),
      halfWidth: 9,
    },
    {
      id: 'east',
      curve: new THREE.LineCurve3(
        eastStart,
        new THREE.Vector3(PLAZA_X + 110, 0, PLAZA_Z),
      ),
      halfWidth: 9,
    },
  ];
}

export function buildCrossingStripes(
  center: THREE.Vector3,
  streetTangent: THREE.Vector3,
  spacingAxis: THREE.Vector3,
  span: number,
  stripeWidth = STRIPE_WIDTH,
  stripeLength = STRIPE_LENGTH,
): CrossingStripe[] {
  const tangent = streetTangent.clone().setY(0).normalize();
  const spacing = spacingAxis.clone().setY(0).normalize();
  const count = Math.max(5, Math.floor(span / STRIPE_PITCH) + 1);
  const firstOffset = -((count - 1) * STRIPE_PITCH) / 2;
  return Array.from({ length: count }, (_, index) => ({
    center: center.clone()
      .setY(MARKING_Y)
      .addScaledVector(spacing, firstOffset + index * STRIPE_PITCH),
    longAxis: tangent.clone(),
    length: stripeLength,
    width: stripeWidth,
  }));
}

export function buildSidewalkIndicators(
  approaches: ApproachFrame[],
): SidewalkIndicator[] {
  return approaches.flatMap((approach) => {
    const { bandCenter } = approachBand(approach);
    return ([-1, 1] as const).map((side) => {
      const sideName = side < 0 ? 'left' : 'right';
      // Sit each tactile pad squarely at the band's end, just outside the road
      // edge, long axis parallel to the bars and the street edge.
      let lateralOffset = side * (
        approach.halfWidth + 1 + INDICATOR_WIDTH / 2 + INDICATOR_MARGIN
      );
      const at = (offset: number) => bandCenter.clone()
        .addScaledVector(approach.binormal, offset);
      // Safety net for the curving boulevard legs: never leave a pad sitting in
      // (or right at the lip of) the roadway — push it further out along the
      // crossing axis until it clears the boulevard well onto the sidewalk.
      for (let i = 0; i < 48; i++) {
        const probe = at(lateralOffset);
        if (boulevardClearance(probe.x, probe.z) >= PAD_ROAD_CLEARANCE) break;
        lateralOffset += side * 0.3;
      }
      const center = at(lateralOffset)
        .setY(SIDEWALK_TOP_Y + INDICATOR_HEIGHT / 2);
      return {
        id: `${approach.id}-${sideName}`,
        center,
        longAxis: approach.tangent.clone(),
        length: INDICATOR_LENGTH,
        width: INDICATOR_WIDTH,
        height: INDICATOR_HEIGHT,
        tactile: true as const,
        illuminated: true as const,
      };
    });
  });
}

function buildApproachCrossing(approach: ApproachFrame): CrossingPlacement {
  const { bandCenter } = approachBand(approach);
  return {
    id: `${approach.id}-approach`,
    kind: 'approach',
    center: bandCenter.clone(),
    streetTangent: approach.tangent.clone(),
    spacingAxis: approach.binormal.clone(),
    stripes: buildCrossingStripes(
      bandCenter,
      approach.tangent,
      approach.binormal,
      approach.halfWidth * 2,
    ),
    endpointIndicatorIds: [`${approach.id}-left`, `${approach.id}-right`],
  };
}

/** One diagonal scramble crossing from the SE plaza corner to the NW corner,
 * with wider (longer) bars than the straight approach bands. Both corners sit
 * clear of the boulevard, which only clips the SW. */
function buildDiagonalCrossing(): {
  crossing: CrossingPlacement;
  indicators: SidewalkIndicator[];
} {
  // Chamfer-corner midpoints of the octagon (SE ↔ NW).
  const start = new THREE.Vector3(PLAZA_X + h - c / 2, 0, PLAZA_Z - h + c / 2);
  const end = new THREE.Vector3(PLAZA_X - h + c / 2, 0, PLAZA_Z + h - c / 2);
  const spacingAxis = end.clone().sub(start).setY(0).normalize();
  const streetTangent = new THREE.Vector3().crossVectors(spacingAxis, UP).normalize();
  const center = start.clone().add(end).multiplyScalar(0.5).setY(MARKING_Y);
  const span = start.distanceTo(end);
  const indicators: SidewalkIndicator[] = ([
    ['diagonal-se', start],
    ['diagonal-nw', end],
  ] as const).map(([id, corner]) => ({
    id,
    center: corner.clone().setY(SIDEWALK_TOP_Y + INDICATOR_HEIGHT / 2),
    longAxis: streetTangent.clone(),
    length: INDICATOR_LENGTH,
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    tactile: true as const,
    illuminated: true as const,
  }));
  return {
    crossing: {
      id: 'diagonal-se-nw',
      kind: 'diagonal',
      center: center.clone(),
      streetTangent,
      spacingAxis,
      stripes: buildCrossingStripes(
        center,
        streetTangent,
        spacingAxis,
        span,
        STRIPE_WIDTH,
        DIAGONAL_STRIPE_LENGTH,
      ),
      endpointIndicatorIds: ['diagonal-se', 'diagonal-nw'],
    },
    indicators,
  };
}

export function buildShibuyaIntersection(): ShibuyaIntersection {
  const sideRoads = buildShibuyaSideRoads();
  const approaches = buildShibuyaApproaches(sideRoads);
  const diagonal = buildDiagonalCrossing();
  const indicators = [
    ...buildSidewalkIndicators(approaches),
    ...diagonal.indicators,
  ];
  // Four straight approach bands (west/south aligned to the curving boulevard,
  // north/east to their side roads) plus one bold SW→NE scramble diagonal.
  return {
    plaza: buildShibuyaPlaza(),
    approaches,
    sideRoads,
    bikeRoute: { entry: 'west', exit: 'south' },
    crossings: [...approaches.map(buildApproachCrossing), diagonal.crossing],
    indicators,
  };
}

/** Crossing-endpoint sight capsules used by building visibility checks. */
export function buildShibuyaSightCorridors(): ShibuyaSightCorridor[] {
  const intersection = buildShibuyaIntersection();
  const indicators = new Map(intersection.indicators.map((item) => [item.id, item]));
  return intersection.crossings.map((crossing) => {
    const [startId, endId] = crossing.endpointIndicatorIds;
    const start = indicators.get(startId);
    const end = indicators.get(endId);
    if (!start || !end || crossing.kind === 'straight') {
      throw new Error(`Missing Shibuya sight-corridor endpoint for ${crossing.id}`);
    }
    return {
      id: crossing.id,
      kind: crossing.kind,
      start: { x: start.center.x, z: start.center.z },
      end: { x: end.center.x, z: end.center.z },
      halfWidth: crossing.kind === 'approach' ? 2 : 1.5,
    };
  });
}

function semanticTAtStraightX(x: number): number {
  let low = 0.12;
  let high = 0.28;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (sampleRoute(middle).pos.x < x) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function buildStraightRoadCrossings(): {
  crossings: CrossingPlacement[];
  indicators: SidewalkIndicator[];
} {
  const crossings: CrossingPlacement[] = [];
  const indicators: SidewalkIndicator[] = [];

  // x=-60 is a real 4-way with the cross street; it gets its own builder
  // (buildCrossStreetCrossings) with crosswalks on all four legs.
  for (const x of [-170, 120]) {
    const frame = roadFrame(semanticTAtStraightX(x));
    const center = frame.pos.clone().setY(MARKING_Y);
    const tangent = frame.tangent.clone().setY(0).normalize();
    const spacingAxis = frame.binormal.clone().setY(0).normalize();
    const id = `boulevard-${x}`;
    const endpointIndicatorIds = ([-1, 1] as const).map((side) => {
      const indicatorId = `${id}-${side < 0 ? 'left' : 'right'}`;
      indicators.push({
        id: indicatorId,
        center: center.clone()
          .setY(SIDEWALK_TOP_Y + INDICATOR_HEIGHT / 2)
          .addScaledVector(spacingAxis, side * 12.4),
        longAxis: tangent.clone(),
        length: 3.2,
        width: 1.15,
        height: INDICATOR_HEIGHT,
        tactile: true,
        illuminated: true,
      });
      return indicatorId;
    });
    crossings.push({
      id,
      kind: 'straight',
      center: center.clone(),
      streetTangent: tangent,
      spacingAxis,
      stripes: buildCrossingStripes(center, tangent, spacingAxis, 22),
      endpointIndicatorIds,
    });
  }

  return { crossings, indicators };
}

// ── The boulevard × cross-street 4-way (at x = -60) ──
// A proper intersection reads as a zebra crosswalk on each of the four legs,
// set just outside the conflict box (no diagonal scramble), with a tactile pad
// at each corner. The main boulevard runs along ±x (halfWidth 11); the cross
// street runs along ±z (halfWidth 7); they meet at (-60, 0).
const CROSS_STREET_X = -60;
const CROSS_STREET_HALF_WIDTH = 11;
const MAIN_BOULEVARD_HALF_WIDTH = 11;
const CROSSWALK_STRIPE_DEPTH = 4.6; // stripe length used by buildCrossingStripes
const CROSSWALK_SETBACK_GAP = 0.6; // clearance between the box edge and the band

export function buildCrossStreetCrossings(): {
  crossings: CrossingPlacement[];
  indicators: SidewalkIndicator[];
} {
  const mainFrame = roadFrame(semanticTAtStraightX(CROSS_STREET_X));
  const mainTangent = mainFrame.tangent.clone().setY(0).normalize(); // ≈ +x
  const mainAcross = mainFrame.binormal.clone().setY(0).normalize(); // ≈ +z
  // The cross street is (near-)axis-aligned along z; use a clean rectilinear
  // frame so the 4-way reads as a square rather than a skewed parallelogram.
  const crossTangent = new THREE.Vector3(0, 0, 1);
  const crossAcross = new THREE.Vector3(1, 0, 0);
  const center = new THREE.Vector3(mainFrame.pos.x, MARKING_Y, 0);

  // Each band sits just past the far road's edge, outside the conflict box.
  const mainBandOffset = CROSS_STREET_HALF_WIDTH
    + CROSSWALK_SETBACK_GAP + CROSSWALK_STRIPE_DEPTH / 2;
  const crossBandOffset = MAIN_BOULEVARD_HALF_WIDTH
    + CROSSWALK_SETBACK_GAP + CROSSWALK_STRIPE_DEPTH / 2;

  const crossings: CrossingPlacement[] = [];

  // West / East legs cross the boulevard (stripes span its full width).
  for (const side of [-1, 1] as const) {
    const legName = side < 0 ? 'west' : 'east';
    const bandCenter = center.clone()
      .addScaledVector(mainTangent, side * mainBandOffset);
    crossings.push({
      id: `xstreet-${legName}`,
      kind: 'straight',
      center: bandCenter.clone(),
      streetTangent: mainTangent.clone(),
      spacingAxis: mainAcross.clone(),
      stripes: buildCrossingStripes(
        bandCenter,
        mainTangent,
        mainAcross,
        MAIN_BOULEVARD_HALF_WIDTH * 2,
      ),
      endpointIndicatorIds: [],
    });
  }

  // North / South legs cross the side street (stripes span its full width).
  for (const side of [-1, 1] as const) {
    const legName = side < 0 ? 'south' : 'north';
    const bandCenter = center.clone()
      .addScaledVector(crossTangent, side * crossBandOffset);
    crossings.push({
      id: `xstreet-${legName}`,
      kind: 'straight',
      center: bandCenter.clone(),
      streetTangent: crossTangent.clone(),
      spacingAxis: crossAcross.clone(),
      stripes: buildCrossingStripes(
        bandCenter,
        crossTangent,
        crossAcross,
        CROSS_STREET_HALF_WIDTH * 2,
      ),
      endpointIndicatorIds: [],
    });
  }

  // A tactile pad at each of the four corners, just off both roadways.
  const cornerInset = 1.6;
  const indicators: SidewalkIndicator[] = [];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const cornerName = `${sz < 0 ? 's' : 'n'}${sx < 0 ? 'w' : 'e'}`;
      indicators.push({
        id: `xstreet-corner-${cornerName}`,
        center: new THREE.Vector3(
          center.x + sx * (CROSS_STREET_HALF_WIDTH + cornerInset),
          SIDEWALK_TOP_Y + INDICATOR_HEIGHT / 2,
          sz * (MAIN_BOULEVARD_HALF_WIDTH + cornerInset),
        ),
        longAxis: mainTangent.clone(),
        length: 2.4,
        width: 2,
        height: INDICATOR_HEIGHT,
        tactile: true,
        illuminated: true,
      });
    }
  }

  return { crossings, indicators };
}

// ── Junction infrastructure clips for the boulevard × cross-street 4-way ──
// The two roadway decks are allowed to overlap (that IS the paved junction),
// but each road's sidewalks / curbs / edge-lines must be kept out of the other
// road's roadway so nothing reads as "sidewalk overlapping the road". The
// boulevard is the through-road: its edge + centre lines run continuous across
// the junction; only its raised sidewalk + curb are notched out of the cross
// street's mouth. The cross street terminates at the boulevard: all of its
// infrastructure (edge, centre, sidewalk, curb) stops at the boulevard's edge.
// The pedestrian crossing is carried entirely by the four zebra crosswalk bands.
const CROSS_JUNCTION_MARGIN = 0.6;
// Outer reach of a road's raised sidewalk beyond its own edge: the walk ribbon
// is centred at (halfWidth + 4.5) with half-width 4.5, so it extends 9m past the
// road edge. Used to size the notch depth along the crossing road.
const SIDEWALK_OUTER_REACH = 9;

/** True where the boulevard's own sidewalk/curb would sit inside the cross
 * street's mouth — clipped so the side-street opening stays clear. */
export function boulevardWalkClipAtCrossStreet(x: number, z: number): boolean {
  return Math.abs(x - CROSS_STREET_X)
      <= CROSS_STREET_HALF_WIDTH + CROSS_JUNCTION_MARGIN
    && Math.abs(z) <= MAIN_BOULEVARD_HALF_WIDTH + SIDEWALK_OUTER_REACH;
}

/** True where the cross street's markings/sidewalk/curb would overlap the
 * boulevard roadway — clipped so the main road reads clean and continuous. */
export function crossStreetInfraClipAtBoulevard(x: number, z: number): boolean {
  return Math.abs(z) <= MAIN_BOULEVARD_HALF_WIDTH + CROSS_JUNCTION_MARGIN
    && Math.abs(x - CROSS_STREET_X)
      <= CROSS_STREET_HALF_WIDTH + SIDEWALK_OUTER_REACH;
}

export const SHIBUYA_STRIPE_PITCH = STRIPE_PITCH;
