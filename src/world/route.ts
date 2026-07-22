import * as THREE from 'three';

// ──────────────────────────────────────────────────────────────────────────────
// Waypoints  (1 unit = 1 metre, ground plane at y = 0)
// The route runs +X through the intro/about sections, turns right (−Z) at
// Shibuya, then runs −Z through the ramps/scaffold/research/bridge sections.
// Heights encode the ramp, scaffold deck, and bridge elevation.
//
// Ported verbatim from cybersite/src/world/route.ts (handoff: "port the LOGIC";
// the waypoint coordinates encode the route Evan approved).
// ──────────────────────────────────────────────────────────────────────────────
const WAYPOINTS: [number, number, number][] = [
  [-320,  0,     0],   // introStart
  [-240,  0,     0],   // aboutStart
  [ 160,  0,     0],   // aboutEnd
  [ 232,  0,     0],   // shape: straight Shibuya entry
  [ 239.75, 0,   0],   // shape: suppress northward Catmull-Rom overshoot
  [ 240,  0,     0],   // shibuya (turn apex)
  [ 240,  0, -0.25],   // shape: tight south-facing turn exit
  [ 242,  0,   -16],   // shape: blend toward the stunt approach
  // stunt veers to the +X (right) side of the road so ramps/scaffold sit off
  // to one side; the bike drifts back to centre at roadResume.
  [ 250,  0,   -70],   // ramp1Base
  [ 250, 11,   -95],   // ramp1Lip
  [ 250, 20,  -120],   // flip1Apex (airborne peak)
  [ 250, 13,  -160],   // scaffoldDeck
  [ 250, 13,  -210],   // scaffoldEnd
  [ 250, 22,  -235],   // ramp2Lip
  [ 250, 30,  -260],   // flip2Apex (airborne peak)
  [ 250, 12,  -300],   // descendTop
  [ 240,  0,  -340],   // roadResume
  [ 240,  0,  -470],   // researchMid
  [ 240,  0,  -600],   // researchEnd
  [ 240,  8,  -640],   // bridgeStart
  [ 240, 16, -1600],   // bridgeEnd
];

// ──────────────────────────────────────────────────────────────────────────────
// Curve (centripetal Catmull-Rom)
// ──────────────────────────────────────────────────────────────────────────────
const curve = new THREE.CatmullRomCurve3(
  WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,         // not closed
  'centripetal', // avoids cusps at sharp turns
  0.5            // default alpha
);

class RouteSegmentCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly startT: number,
    private readonly endT: number,
    private readonly flatten: boolean,
  ) {
    super();
  }

  override getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const semanticT = THREE.MathUtils.lerp(this.startT, this.endT, t);
    sampleSemanticPoint(semanticT, optionalTarget);
    return this.flatten ? optionalTarget.setY(0) : optionalTarget;
  }

  override getTangent(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const semanticT = THREE.MathUtils.lerp(this.startT, this.endT, t);
    sampleSemanticTangent(semanticT, optionalTarget);
    if (this.flatten) optionalTarget.setY(0);
    return optionalTarget.normalize();
  }
}

export const GROUND_ROUTE_END_T = 0.84;

/**
 * Direct horizontal projection of the bike route through the shoreline split.
 * No ground asphalt is generated beneath the elevated finale.
 */
export function buildGroundRouteCurve(): THREE.Curve<THREE.Vector3> {
  return new RouteSegmentCurve(0, GROUND_ROUTE_END_T, true);
}

/**
 * Direct semantic sub-curve of the bike route. Geometry follows the original
 * unflattened route points and tangents without fitting another spline.
 */
export function buildRouteSegmentCurve(
  startT: number,
  endT: number,
): THREE.Curve<THREE.Vector3> {
  if (startT < 0 || endT > 1 || startT >= endT) {
    throw new Error(`Invalid route segment ${startT}..${endT}`);
  }
  return new RouteSegmentCurve(startT, endT, false);
}

// Pre-compute arc length (builds internal LUT for getPointAt / getTangentAt).
export const ROUTE_LENGTH: number = curve.getLength();

// ──────────────────────────────────────────────────────────────────────────────
// Semantic-t  →  arc-length-t  remap
//
// Zone boundary t-values (e.g. t=0.84 for researchEnd) are "semantic" positions
// along the story arc. Pure arc-length parameterisation distributes t
// proportionally to physical distance, which doesn't match those semantic values
// (the long bridge segment would dominate). The remap converts semantic t to
// arc-length t before sampling the curve, so the arc-length geometry within each
// zone is still used correctly.
// ──────────────────────────────────────────────────────────────────────────────

/** Build a cumulative chord-length table at N uniform raw-parameter samples. */
function buildArcTable(n: number): { u: number; s: number }[] {
  const table: { u: number; s: number }[] = [{ u: 0, s: 0 }];
  let prev = curve.getPoint(0);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const pt = curve.getPoint(u);
    total += prev.distanceTo(pt);
    table.push({ u, s: total });
    prev = pt;
  }
  return table;
}

/** Interpolate arc-length fraction for a given raw parameter u ∈ [0,1]. */
function arcFractionAt(u: number, table: { u: number; s: number }[]): number {
  const total = table[table.length - 1].s;
  if (total === 0) return 0;
  for (let i = 1; i < table.length; i++) {
    if (u <= table[i].u) {
      const t0 = table[i - 1], t1 = table[i];
      const alpha = (u - t0.u) / (t1.u - t0.u);
      return (t0.s + alpha * (t1.s - t0.s)) / total;
    }
  }
  return 1;
}

// Compute arc-length fractions for each waypoint index at module load.
const _arcTable = buildArcTable(2000);
const _n = WAYPOINTS.length - 1; // number of intervals

function _arcAt(idx: number): number {
  return arcFractionAt(idx / _n, _arcTable);
}

// Waypoint indices used as remap anchors:
//   introStart=0, aboutStart=1, aboutEnd=2, Shibuya shape points=3..4,
//   shibuya=5, exit shape points=6..7, ramp1Base=8, ramp1Lip=9,
//   flip1Apex=10, scaffoldDeck=11, scaffoldEnd=12, ramp2Lip=13,
//   flip2Apex=14, descendTop=15, roadResume=16, researchMid=17,
//   researchEnd=18, bridgeStart=19, bridgeEnd=20.
const SEMANTIC_WAYPOINTS: Array<{ t: number; index: number }> = [
  { t: 0.000, index: 0 },   // introStart
  { t: 0.120, index: 1 },   // aboutStart
  { t: 0.280, index: 2 },   // aboutEnd
  { t: 0.320, index: 5 },   // shibuya
  { t: 0.360, index: 8 },   // ramp1Base
  { t: 0.410, index: 10 },  // flip1Apex (ramp1Lip idx=9 has no semantic-t anchor)
  { t: 0.460, index: 11 },  // scaffoldDeck
  { t: 0.520, index: 12 },  // scaffoldEnd
  { t: 0.545, index: 13 },  // ramp2Lip
  { t: 0.570, index: 14 },  // flip2Apex
  { t: 0.620, index: 15 },  // descendTop
  { t: 0.680, index: 16 },  // roadResume
  { t: 0.760, index: 17 },  // researchMid
  { t: 0.840, index: 18 },  // researchEnd
  { t: 0.890, index: 19 },  // bridgeStart
  { t: 1.000, index: 20 },  // bridgeEnd
];

const T_REMAP: [number, number][] = (() => {
  const table: [number, number][] = SEMANTIC_WAYPOINTS.map(({ t, index }) => [
    t,
    _arcAt(index),
  ]);
  // Guarantee monotonicity of the arc-length column.
  for (let i = 1; i < table.length; i++) {
    if (table[i][1] <= table[i - 1][1]) {
      throw new Error(
        `T_REMAP arc-length column is not monotonically increasing at index ${i}: ` +
        `${table[i - 1][1]} → ${table[i][1]}`
      );
    }
  }
  return table;
})();

/** Map semantic t ∈ [0,1] → arc-length t ∈ [0,1] via piecewise linear interp. */
function semanticToArc(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  for (let i = 1; i < T_REMAP.length; i++) {
    const [s0, a0] = T_REMAP[i - 1];
    const [s1, a1] = T_REMAP[i];
    if (t <= s1) {
      const alpha = (t - s0) / (s1 - s0);
      return a0 + alpha * (a1 - a0);
    }
  }
  return 1;
}

function semanticWaypointIndex(t: number): number | undefined {
  return SEMANTIC_WAYPOINTS.find((anchor) =>
    Math.abs(anchor.t - t) <= Number.EPSILON * 8)?.index;
}

function sampleSemanticPoint(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  const waypointIndex = semanticWaypointIndex(t);
  if (waypointIndex !== undefined) {
    return curve.getPoint(waypointIndex / _n, optionalTarget);
  }
  return optionalTarget.copy(curve.getPointAt(semanticToArc(t)));
}

function sampleSemanticTangent(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  const waypointIndex = semanticWaypointIndex(t);
  const tangent = waypointIndex === undefined
    ? curve.getTangentAt(semanticToArc(t))
    : curve.getTangent(waypointIndex / _n);
  return optionalTarget.copy(tangent).normalize();
}

// ──────────────────────────────────────────────────────────────────────────────
// Public interfaces
// ──────────────────────────────────────────────────────────────────────────────
export interface RouteSample {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
}

export interface RoadFrame {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}

// ──────────────────────────────────────────────────────────────────────────────
// sampleRoute — pure, deterministic.  t ∈ [0,1] is semantic story progress.
// ──────────────────────────────────────────────────────────────────────────────
export function sampleRoute(t: number): RouteSample {
  const pos = sampleSemanticPoint(t);
  const tangent = sampleSemanticTangent(t);
  return { pos, tangent };
}

// ──────────────────────────────────────────────────────────────────────────────
// roadFrame — orthonormal Frenet-like frame with horizontal binormal.
// binormal = tangent × worldUp  (left/right road axis, always horizontal).
// normal   = binormal × tangent (up-ish, perpendicular to travel).
// ──────────────────────────────────────────────────────────────────────────────
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function roadFrame(t: number): RoadFrame {
  const pos = sampleSemanticPoint(t);
  const tangent = sampleSemanticTangent(t);

  // Guard against degenerate case (tangent ∥ worldUp — never occurs on this path).
  let binormal: THREE.Vector3;
  if (Math.abs(tangent.dot(WORLD_UP)) > 0.999) {
    binormal = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
  } else {
    binormal = new THREE.Vector3().crossVectors(tangent, WORLD_UP).normalize();
  }

  const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

  return { pos, tangent, normal, binormal };
}

// ──────────────────────────────────────────────────────────────────────────────
// Zone map  — semantic t-ranges for named story sections
// ──────────────────────────────────────────────────────────────────────────────
export const ZONES: Record<string, [number, number]> = {
  intro:    [0.00, 0.12],
  about:    [0.12, 0.28],
  turn:     [0.28, 0.36],   // Shibuya 90° right turn
  ramp1:    [0.36, 0.46],   // projects-ramp1 (backflip 1, 2 big projects)
  scaffold: [0.46, 0.52],   // scaffold-ride
  ramp2:    [0.52, 0.62],   // projects-ramp2 (backflip 2, 3 small projects)
  descend:  [0.62, 0.68],
  research: [0.68, 0.84],
  lift:     [0.84, 0.89],   // buffer/lift onto bridge
  bridge:   [0.89, 1.00],   // bridge/finale
};

// ──────────────────────────────────────────────────────────────────────────────
// Moon
// ──────────────────────────────────────────────────────────────────────────────
export const MOON_POS: THREE.Vector3 = new THREE.Vector3(240, 330, -3300);
export const MOON_RADIUS: number = 400;
