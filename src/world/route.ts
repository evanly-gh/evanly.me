import * as THREE from 'three';
import { sampleRideSurface } from '../choreography/rideSurface';
import {
  PROJECTS_MAIN_ROAD,
  STUNT_CENTER_X,
  STUNT_RAMP1,
  STUNT_RAMP2,
} from './stuntGeometry';
import { STUNT_ROUTE } from './stuntLayout';
import { rampProfileSlope } from './setpieces';

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
  [-420,  0,     0],   // introStart — pushed west for a longer intro runway
  [-240,  0,     0],   // aboutStart
  [ 160,  0,     0],   // aboutEnd
  [ 232,  0,     0],   // straight-entry support for the explicit Shibuya turn
  // The stunt occupies a protected side corridor while the main road
  // remains visually clear. Its flat scaffold span is sampled explicitly.
  [...STUNT_ROUTE.ramp1Base.position],
  [...STUNT_ROUTE.ramp1Lip.position],
  [...STUNT_ROUTE.flip1Apex.position],
  [...STUNT_ROUTE.scaffoldLanding.position],
  [...STUNT_ROUTE.ramp2Base.position],
  [...STUNT_ROUTE.ramp2Lip.position],
  [...STUNT_ROUTE.flip2Apex.position],
  [...STUNT_ROUTE.descentTop.position],
  [...STUNT_ROUTE.groundResume.position],
  [ PROJECTS_MAIN_ROAD.centerX,  0,  -470],   // researchMid
  [ PROJECTS_MAIN_ROAD.centerX,  0,  -600],   // researchEnd
  [ PROJECTS_MAIN_ROAD.centerX,  8,  -640],   // bridgeStart
  [ PROJECTS_MAIN_ROAD.centerX, 16, -1600],   // bridgeEnd
];

export const SHIBUYA_TURN_START_T = 0.28;
export const SHIBUYA_TURN_END_T = 0.36;

const SHIBUYA_TURN_CONTROL_POINTS = [
  new THREE.Vector3(160, 0, 0),
  new THREE.Vector3(181, 0, 0),
  new THREE.Vector3(202, 0, 0),
  new THREE.Vector3(STUNT_CENTER_X, 0, -26),
  new THREE.Vector3(STUNT_CENTER_X, 0, -47),
  new THREE.Vector3(STUNT_CENTER_X, 0, STUNT_RAMP1.baseZ),
] as const;

// De Casteljau needs a mutable working copy of the control points. Cloning the
// array every call churned ~6 Vector3 per sample — and the Shibuya turn samples
// the curve several times per frame. Reuse module-level scratch instead. The two
// buffers are distinct so sampleBezierTangent (which fills DERIV then calls
// sampleBezier, which fills WORK) never clobbers its own input.
const BEZIER_WORK: THREE.Vector3[] = Array.from(
  { length: SHIBUYA_TURN_CONTROL_POINTS.length },
  () => new THREE.Vector3(),
);
const BEZIER_DERIV: THREE.Vector3[] = Array.from(
  { length: SHIBUYA_TURN_CONTROL_POINTS.length - 1 },
  () => new THREE.Vector3(),
);

function sampleBezier(
  controlPoints: readonly THREE.Vector3[],
  t: number,
  optionalTarget: THREE.Vector3,
): THREE.Vector3 {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const count = controlPoints.length;
  for (let index = 0; index < count; index += 1) {
    BEZIER_WORK[index].copy(controlPoints[index]);
  }
  for (let level = 1; level < count; level += 1) {
    for (let index = 0; index < count - level; index += 1) {
      BEZIER_WORK[index].lerp(BEZIER_WORK[index + 1], clamped);
    }
  }
  return optionalTarget.copy(BEZIER_WORK[0]);
}

function sampleBezierTangent(
  controlPoints: readonly THREE.Vector3[],
  t: number,
  optionalTarget: THREE.Vector3,
): THREE.Vector3 {
  const degree = controlPoints.length - 1;
  for (let index = 0; index < degree; index += 1) {
    BEZIER_DERIV[index]
      .copy(controlPoints[index + 1])
      .sub(controlPoints[index])
      .multiplyScalar(degree);
  }
  // BEZIER_DERIV is sized to exactly `degree` for the only curve in play, so its
  // length already matches the derivative control count sampleBezier expects.
  return sampleBezier(BEZIER_DERIV, t, optionalTarget).normalize();
}

class DeterministicBezierCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly controlPoints: readonly THREE.Vector3[]) {
    super();
  }

  override getPoint(
    t: number,
    optionalTarget = new THREE.Vector3(),
  ): THREE.Vector3 {
    return sampleBezier(this.controlPoints, t, optionalTarget);
  }

  override getTangent(
    t: number,
    optionalTarget = new THREE.Vector3(),
  ): THREE.Vector3 {
    return sampleBezierTangent(this.controlPoints, t, optionalTarget);
  }
}

/** One deterministic centerline source for Shibuya route and road geometry. */
export const SHIBUYA_TURN_CURVE: THREE.Curve<THREE.Vector3> =
  new DeterministicBezierCurve(SHIBUYA_TURN_CONTROL_POINTS);

function shibuyaTurnFraction(t: number): number {
  return (t - SHIBUYA_TURN_START_T)
    / (SHIBUYA_TURN_END_T - SHIBUYA_TURN_START_T);
}

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
    if (this.flatten) {
      return sampleGroundPoint(semanticT, optionalTarget);
    }
    return sampleSemanticPoint(semanticT, optionalTarget);
  }

  override getTangent(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const semanticT = THREE.MathUtils.lerp(this.startT, this.endT, t);
    if (this.flatten) {
      return sampleGroundTangent(semanticT, optionalTarget);
    }
    sampleSemanticTangent(semanticT, optionalTarget);
    return optionalTarget.normalize();
  }
}

export const GROUND_ROUTE_END_T = 0.84;

/**
 * Ground projection of the complete bike centerline through Shibuya, the
 * x=264 stunt corridor, and its smooth return to PROJECTS_MAIN_ROAD.
 * No ground asphalt is generated beneath the elevated finale.
 */
export function buildGroundRouteCurve(): THREE.Curve<THREE.Vector3> {
  return new RouteSegmentCurve(0, GROUND_ROUTE_END_T, true);
}

/** Ground projection of a semantic sub-range, used by the service alley. */
export function buildGroundRouteSegmentCurve(
  startT: number,
  endT: number,
): THREE.Curve<THREE.Vector3> {
  if (startT < 0 || endT > GROUND_ROUTE_END_T || startT >= endT) {
    throw new Error(`Invalid ground route segment ${startT}..${endT}`);
  }
  return new RouteSegmentCurve(startT, endT, true);
}

/**
 * The public traffic street continues south from Shibuya on x=240 while the
 * bike branches east into the separately rendered service alley.
 */
export function buildProjectsTrafficCurve(): THREE.Curve<THREE.Vector3> {
  const approach = new THREE.CatmullRomCurve3([
    // Runs west of the bike's introStart (x=-420) so the opening chase camera,
    // parked ~40 m behind the rider, sees an unbroken street under and ahead of
    // it instead of the asphalt/neon ending at a hard edge in the foreground.
    new THREE.Vector3(-560, 0, 0),
    new THREE.Vector3(-420, 0, 0),
    new THREE.Vector3(-240, 0, 0),
    new THREE.Vector3(160, 0, 0),
    new THREE.Vector3(210, 0, -8),
    new THREE.Vector3(235, 0, -42),
    new THREE.Vector3(PROJECTS_MAIN_ROAD.centerX, 0, -68),
  ], false, 'centripetal', 0.5);
  return new class extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }

    override getPoint(
      t: number,
      optionalTarget = new THREE.Vector3(),
    ): THREE.Vector3 {
      if (t <= 0.5) {
        return optionalTarget.copy(approach.getPointAt(t * 2));
      }
      return optionalTarget.set(
        PROJECTS_MAIN_ROAD.centerX,
        0,
        THREE.MathUtils.lerp(-68, -600, (t - 0.5) * 2),
      );
    }
  }();
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
//   introStart=0, aboutStart=1, aboutEnd=2, straight support=3,
//   ramp1Base=4, ramp1Lip=5, flip1Apex=6, scaffoldDeck=7,
//   scaffoldEnd=8, ramp2Lip=9, flip2Apex=10, descendTop=11,
//   roadResume=12, researchMid=13, researchEnd=14, bridgeStart=15,
//   bridgeEnd=16.
const SEMANTIC_WAYPOINTS: Array<{ t: number; index: number }> = [
  { t: 0.000, index: 0 },   // introStart
  { t: 0.120, index: 1 },   // aboutStart
  { t: 0.280, index: 2 },   // aboutEnd
  { t: STUNT_ROUTE.ramp1Base.t, index: 4 },
  { t: STUNT_ROUTE.ramp1Lip.t, index: 5 },
  { t: STUNT_ROUTE.flip1Apex.t, index: 6 },
  { t: STUNT_ROUTE.scaffoldLanding.t, index: 7 },
  { t: STUNT_ROUTE.ramp2Base.t, index: 8 },
  { t: STUNT_ROUTE.ramp2Lip.t, index: 9 },
  { t: STUNT_ROUTE.flip2Apex.t, index: 10 },
  { t: STUNT_ROUTE.descentTop.t, index: 11 },
  { t: STUNT_ROUTE.groundResume.t, index: 12 },
  { t: 0.760, index: 13 },  // researchMid
  { t: 0.840, index: 14 },  // researchEnd
  { t: 0.890, index: 15 },  // bridgeStart
  { t: 1.000, index: 16 },  // bridgeEnd
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

function smoothMergeFraction(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * clamped
    * (clamped * (clamped * 6 - 15) + 10);
}

function smoothMergeDerivative(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return 30 * clamped * clamped
    * (1 - clamped) * (1 - clamped);
}

type StuntArcLandmark = {
  t: number;
  position: readonly [number, number, number];
};

// dy/dz launch slope at a ramp lip. Negative because the corridor rides toward
// −Z. This is the ACTUAL ramp surface slope at the exit (rampProfileSlope at
// fraction 1), so the airborne parabola leaves tangent to the ramp — it keeps
// travelling at the same angle the bike climbed, with no flat spot at takeoff.
function stuntKnotSlope(landmark: StuntArcLandmark): number {
  if (landmark.t === STUNT_ROUTE.ramp1Lip.t) {
    return -rampProfileSlope(1, STUNT_RAMP1.run, STUNT_RAMP1.rise);
  }
  if (landmark.t === STUNT_ROUTE.ramp2Lip.t) {
    return -rampProfileSlope(1, STUNT_RAMP2.run, STUNT_RAMP2.rise);
  }
  return 0;
}


// ──────────────────────────────────────────────────────────────────────────────
// Ballistic jump arc
//
// Each ramp jump is a single projectile parabola from the ramp lip (takeoff) to
// the surface it lands on. The earlier implementation split the airborne phase
// at a fixed apex knot and fit a quintic to each half, forcing zero slope AND
// zero curvature at the apex — which flattened the top of the arc, so the bike
// "hung" at peak height for a beat before dropping. A parabola has constant
// downward curvature the whole way (no plateau), is launched at exactly the ramp
// exit slope so the takeoff stays smooth, and puts its apex at the natural
// mid-point of the flight.
// ──────────────────────────────────────────────────────────────────────────────
function jumpParabolaCoeffs(
  lip: StuntArcLandmark,
  landing: StuntArcLandmark,
): { b: number; a: number } {
  const b = stuntKnotSlope(lip); // dy/dz at the lip == ramp exit slope
  const deltaZ = landing.position[2] - lip.position[2];
  const a =
    (landing.position[1] - lip.position[1] - b * deltaZ) / (deltaZ * deltaZ);
  return { b, a };
}

function sampleJumpArc(
  t: number,
  lip: StuntArcLandmark,
  landing: StuntArcLandmark,
  optionalTarget: THREE.Vector3,
): THREE.Vector3 {
  const fraction = THREE.MathUtils.clamp(
    (t - lip.t) / (landing.t - lip.t),
    0,
    1,
  );
  const z = THREE.MathUtils.lerp(lip.position[2], landing.position[2], fraction);
  const { b, a } = jumpParabolaCoeffs(lip, landing);
  const dz = z - lip.position[2];
  return optionalTarget.set(
    STUNT_CENTER_X,
    lip.position[1] + b * dz + a * dz * dz,
    z,
  );
}

function sampleJumpArcTangent(
  t: number,
  lip: StuntArcLandmark,
  landing: StuntArcLandmark,
  optionalTarget: THREE.Vector3,
): THREE.Vector3 {
  const fraction = THREE.MathUtils.clamp(
    (t - lip.t) / (landing.t - lip.t),
    0,
    1,
  );
  const deltaZ = landing.position[2] - lip.position[2];
  const z = lip.position[2] + deltaZ * fraction;
  const { b, a } = jumpParabolaCoeffs(lip, landing);
  const dyDz = b + 2 * a * (z - lip.position[2]);
  return optionalTarget.set(0, dyDz * deltaZ, deltaZ).normalize();
}

function sampleSemanticTrajectoryPoint(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  if (t >= 0.12 && t < SHIBUYA_TURN_START_T) {
    const fraction = (t - 0.12) / (SHIBUYA_TURN_START_T - 0.12);
    return optionalTarget.set(
      THREE.MathUtils.lerp(-240, 160, fraction),
      0,
      0,
    );
  }
  if (t >= SHIBUYA_TURN_START_T && t <= SHIBUYA_TURN_END_T) {
    return SHIBUYA_TURN_CURVE.getPoint(
      shibuyaTurnFraction(t),
      optionalTarget,
    );
  }
  if (t >= STUNT_ROUTE.ramp1Base.t && t <= STUNT_ROUTE.ramp1Lip.t) {
    const fraction = (t - STUNT_ROUTE.ramp1Base.t)
      / (STUNT_ROUTE.ramp1Lip.t - STUNT_ROUTE.ramp1Base.t);
    return optionalTarget.set(
      STUNT_CENTER_X,
      sampleRideSurface(t).bikeRootY ?? STUNT_ROUTE.ramp1Base.position[1],
      THREE.MathUtils.lerp(
        STUNT_ROUTE.ramp1Base.position[2],
        STUNT_ROUTE.ramp1Lip.position[2],
        fraction,
      ),
    );
  }
  // Jump 1: one parabola from the ramp lip to the scaffold-deck landing.
  if (t > STUNT_ROUTE.ramp1Lip.t && t <= STUNT_ROUTE.scaffoldLanding.t) {
    return sampleJumpArc(
      t,
      STUNT_ROUTE.ramp1Lip,
      STUNT_ROUTE.scaffoldLanding,
      optionalTarget,
    );
  }
  if (t >= STUNT_ROUTE.groundResume.t && t <= 0.7) {
    const fraction = (t - STUNT_ROUTE.groundResume.t)
      / (0.7 - STUNT_ROUTE.groundResume.t);
    return optionalTarget.set(
      THREE.MathUtils.lerp(
        STUNT_CENTER_X,
        PROJECTS_MAIN_ROAD.centerX,
        smoothMergeFraction(fraction),
      ),
      0,
      THREE.MathUtils.lerp(STUNT_ROUTE.groundResume.position[2], -375, fraction),
    );
  }
  if (t >= 0.7 && t <= GROUND_ROUTE_END_T) {
    const fraction = (t - 0.7) / (GROUND_ROUTE_END_T - 0.7);
    return optionalTarget.set(
      PROJECTS_MAIN_ROAD.centerX,
      0,
      THREE.MathUtils.lerp(-375, -600, fraction),
    );
  }
  if (
    t >= STUNT_ROUTE.scaffoldLanding.t
    && t <= STUNT_ROUTE.ramp2Base.t
  ) {
    const fraction = (
      t - STUNT_ROUTE.scaffoldLanding.t
    ) / (
      STUNT_ROUTE.ramp2Base.t - STUNT_ROUTE.scaffoldLanding.t
    );
    return optionalTarget
      .fromArray(STUNT_ROUTE.scaffoldLanding.position)
      .lerp(new THREE.Vector3(...STUNT_ROUTE.ramp2Base.position), fraction);
  }
  if (t > STUNT_ROUTE.ramp2Base.t && t <= STUNT_ROUTE.ramp2Lip.t) {
    const fraction = (t - STUNT_ROUTE.ramp2Base.t)
      / (STUNT_ROUTE.ramp2Lip.t - STUNT_ROUTE.ramp2Base.t);
    return optionalTarget.set(
      STUNT_CENTER_X,
      sampleRideSurface(t).bikeRootY ?? STUNT_ROUTE.ramp2Base.position[1],
      THREE.MathUtils.lerp(
        STUNT_ROUTE.ramp2Base.position[2],
        STUNT_ROUTE.ramp2Lip.position[2],
        fraction,
      ),
    );
  }
  // Jump 2: the bike is airborne the whole way from the ramp lip down to the
  // ground (both 'aerial-2' and 'descent' phases are non-rideable; descentTop is
  // only a shaping knot, not a landing). One parabola carries it from takeoff to
  // the ground touchdown at groundResume.
  if (t > STUNT_ROUTE.ramp2Lip.t && t < STUNT_ROUTE.groundResume.t) {
    return sampleJumpArc(
      t,
      STUNT_ROUTE.ramp2Lip,
      STUNT_ROUTE.groundResume,
      optionalTarget,
    );
  }
  const waypointIndex = semanticWaypointIndex(t);
  if (waypointIndex !== undefined) {
    return curve.getPoint(waypointIndex / _n, optionalTarget);
  }
  optionalTarget.copy(curve.getPointAt(semanticToArc(t)));
  if (t >= STUNT_ROUTE.ramp1Base.t && t <= STUNT_ROUTE.groundResume.t) {
    optionalTarget.x = STUNT_CENTER_X;
  }
  return optionalTarget;
}

function sampleSemanticPoint(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  sampleSemanticTrajectoryPoint(t, optionalTarget);
  if (t >= 0.32 && t <= 0.7) {
    const surface = sampleRideSurface(t);
    if (surface.rideable && surface.bikeRootY !== null) {
      optionalTarget.y = surface.bikeRootY;
    }
  }
  return optionalTarget;
}

function sampleSemanticTangent(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  if (t >= 0.12 && t < SHIBUYA_TURN_START_T) {
    return optionalTarget.set(1, 0, 0);
  }
  if (t >= SHIBUYA_TURN_START_T && t <= SHIBUYA_TURN_END_T) {
    return SHIBUYA_TURN_CURVE.getTangent(
      shibuyaTurnFraction(t),
      optionalTarget,
    );
  }
  if (t >= STUNT_ROUTE.ramp1Base.t && t <= STUNT_ROUTE.ramp1Lip.t) {
    const fraction = (t - STUNT_ROUTE.ramp1Base.t)
      / (STUNT_ROUTE.ramp1Lip.t - STUNT_ROUTE.ramp1Base.t);
    return optionalTarget.set(
      0,
      rampProfileSlope(fraction, STUNT_RAMP1.run, STUNT_RAMP1.rise),
      -1,
    ).normalize();
  }
  if (t > STUNT_ROUTE.ramp1Lip.t && t <= STUNT_ROUTE.scaffoldLanding.t) {
    return sampleJumpArcTangent(
      t,
      STUNT_ROUTE.ramp1Lip,
      STUNT_ROUTE.scaffoldLanding,
      optionalTarget,
    );
  }
  if (t >= STUNT_ROUTE.groundResume.t && t <= 0.7) {
    const fraction = (t - STUNT_ROUTE.groundResume.t)
      / (0.7 - STUNT_ROUTE.groundResume.t);
    return optionalTarget.set(
      (PROJECTS_MAIN_ROAD.centerX - STUNT_CENTER_X)
        * smoothMergeDerivative(fraction),
      0,
      -15,
    ).normalize();
  }
  if (t >= 0.7 && t <= GROUND_ROUTE_END_T) {
    return optionalTarget.set(0, 0, -1);
  }
  if (
    t >= STUNT_ROUTE.scaffoldLanding.t
    && t < STUNT_ROUTE.ramp2Base.t
  ) {
    return optionalTarget.set(0, 0, -1);
  }
  if (t >= STUNT_ROUTE.ramp2Base.t && t <= STUNT_ROUTE.ramp2Lip.t) {
    const fraction = (t - STUNT_ROUTE.ramp2Base.t)
      / (STUNT_ROUTE.ramp2Lip.t - STUNT_ROUTE.ramp2Base.t);
    return optionalTarget.set(
      0,
      rampProfileSlope(fraction, STUNT_RAMP2.run, STUNT_RAMP2.rise),
      -1,
    ).normalize();
  }
  if (t > STUNT_ROUTE.ramp2Lip.t && t < STUNT_ROUTE.groundResume.t) {
    return sampleJumpArcTangent(
      t,
      STUNT_ROUTE.ramp2Lip,
      STUNT_ROUTE.groundResume,
      optionalTarget,
    );
  }
  if (
    t === STUNT_ROUTE.flip1Apex.t
    || t === STUNT_ROUTE.flip2Apex.t
  ) {
    return optionalTarget.set(0, 0, -1);
  }
  const waypointIndex = semanticWaypointIndex(t);
  const tangent = waypointIndex === undefined
    ? curve.getTangentAt(semanticToArc(t))
    : curve.getTangent(waypointIndex / _n);
  if (t >= STUNT_ROUTE.ramp1Base.t && t <= STUNT_ROUTE.groundResume.t) {
    tangent.x = 0;
  }
  return optionalTarget.copy(tangent).normalize();
}

function sampleGroundPoint(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  return sampleSemanticPoint(t, optionalTarget).setY(0);
}

function sampleGroundTangent(
  t: number,
  optionalTarget = new THREE.Vector3(),
): THREE.Vector3 {
  return sampleSemanticTangent(t, optionalTarget).setY(0).normalize();
}

const ROUTE_DISTANCE_SAMPLES = 8192;
const SEMANTIC_ROUTE_DISTANCES = (() => {
  const distances = new Float64Array(ROUTE_DISTANCE_SAMPLES + 1);
  let previous = sampleSemanticPoint(0);
  let cumulative = 0;
  for (let index = 1; index <= ROUTE_DISTANCE_SAMPLES; index += 1) {
    const current = sampleSemanticPoint(index / ROUTE_DISTANCE_SAMPLES);
    cumulative += previous.distanceTo(current);
    distances[index] = cumulative;
    previous = current;
  }
  return distances;
})();

/** Physical metres travelled over the complete semantic route. */
export const SEMANTIC_ROUTE_LENGTH =
  SEMANTIC_ROUTE_DISTANCES[ROUTE_DISTANCE_SAMPLES];

/** Cumulative physical metres travelled at semantic story progress. */
export function routeDistanceAt(semanticT: number): number {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Route distance progress must be finite');
  }
  const scaled =
    THREE.MathUtils.clamp(semanticT, 0, 1) * ROUTE_DISTANCE_SAMPLES;
  const lower = Math.floor(scaled);
  if (lower >= ROUTE_DISTANCE_SAMPLES) return SEMANTIC_ROUTE_LENGTH;
  const fraction = scaled - lower;
  return THREE.MathUtils.lerp(
    SEMANTIC_ROUTE_DISTANCES[lower],
    SEMANTIC_ROUTE_DISTANCES[lower + 1],
    fraction,
  );
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
export function sampleRoute(t: number, target?: RouteSample): RouteSample {
  if (target) {
    sampleSemanticPoint(t, target.pos);
    sampleSemanticTangent(t, target.tangent);
    return target;
  }
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

export function roadFrame(t: number, target?: RoadFrame): RoadFrame {
  const pos = target
    ? sampleSemanticPoint(t, target.pos)
    : sampleSemanticPoint(t);
  const tangent = target
    ? sampleSemanticTangent(t, target.tangent)
    : sampleSemanticTangent(t);
  const binormal = target ? target.binormal : new THREE.Vector3();
  const normal = target ? target.normal : new THREE.Vector3();

  // Guard against degenerate case (tangent ∥ worldUp — never occurs on this path).
  if (Math.abs(tangent.dot(WORLD_UP)) > 0.999) {
    binormal.set(0, 0, 1).cross(tangent).normalize();
  } else {
    binormal.crossVectors(tangent, WORLD_UP).normalize();
  }
  normal.crossVectors(binormal, tangent).normalize();

  return target ?? { pos, tangent, normal, binormal };
}

// ──────────────────────────────────────────────────────────────────────────────
// Zone map  — semantic t-ranges for named story sections
// ──────────────────────────────────────────────────────────────────────────────
export const ZONES: Record<string, [number, number]> = {
  intro:    [0.00, 0.12],
  about:    [0.12, 0.28],
  turn:     [0.28, 0.36],   // Shibuya 90° right turn
  ramp1:    [0.36, 0.46],   // projects-ramp1 (backflip 1, 2 big projects)
  scaffold: [0.46, 0.54],   // scaffold-ride
  ramp2:    [0.54, 0.64],   // projects-ramp2 (backflip 2, 3 small projects)
  descend:  [0.64, 0.69],
  research: [0.69, 0.84],
  lift:     [0.84, 0.89],   // buffer/lift onto bridge
  bridge:   [0.89, 1.00],   // bridge/finale
};

// ──────────────────────────────────────────────────────────────────────────────
// Moon
// ──────────────────────────────────────────────────────────────────────────────
export const MOON_POS: THREE.Vector3 = new THREE.Vector3(240, 330, -3300);
export const MOON_RADIUS: number = 400;
