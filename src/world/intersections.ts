import * as THREE from 'three';
import { buildGroundRouteCurve, roadFrame, sampleRoute } from './route';

const UP = new THREE.Vector3(0, 1, 0);
const PLAZA_X = 240;
const PLAZA_Z = 0;
const PLAZA_HALF_EXTENT = 28;
const PLAZA_SURFACE_Y = 0.04;
const MARKING_Y = 0.08;
const STRIPE_PITCH = 2.4;
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

function plazaBoundaryParameters(curve: THREE.Curve<THREE.Vector3>): number[] {
  const out: number[] = [];
  const steps = 4096;
  let previousU = 0;
  let previousClearance = shibuyaPlazaClearance(
    curve.getPointAt(0).x,
    curve.getPointAt(0).z,
  );
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const point = curve.getPointAt(u);
    const clearance = shibuyaPlazaClearance(point.x, point.z);
    if ((previousClearance > 0 && clearance <= 0)
      || (previousClearance <= 0 && clearance > 0)) {
      let low = previousU;
      let high = u;
      const entering = previousClearance > 0;
      for (let iteration = 0; iteration < 40; iteration++) {
        const middle = (low + high) / 2;
        const middlePoint = curve.getPointAt(middle);
        const middleInside = shibuyaPlazaContains(middlePoint.x, middlePoint.z);
        if (middleInside === entering) high = middle;
        else low = middle;
      }
      out.push((low + high) / 2);
    }
    previousU = u;
    previousClearance = clearance;
  }
  return out;
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

export function buildShibuyaApproaches(
  mainCurve = buildGroundRouteCurve(),
  sideRoads = buildShibuyaSideRoads(),
): ApproachFrame[] {
  const boundaryParameters = plazaBoundaryParameters(mainCurve);
  if (boundaryParameters.length !== 2) {
    throw new Error(`Expected two main-route plaza boundaries, got ${boundaryParameters.length}`);
  }
  const boundaryFrames = boundaryParameters.map((u) => ({
    u,
    point: mainCurve.getPointAt(u),
  }));
  const west = boundaryFrames.reduce((best, frame) =>
    frame.point.x < best.point.x ? frame : best);
  const south = boundaryFrames.reduce((best, frame) =>
    frame.point.z < best.point.z ? frame : best);
  const northRoad = sideRoads.find(({ id }) => id === 'north');
  const eastRoad = sideRoads.find(({ id }) => id === 'east');
  if (!northRoad || !eastRoad) throw new Error('Missing Shibuya side-road leg');

  return [
    frameFromCurve('west', mainCurve, west.u, 11),
    frameFromCurve('north', northRoad.curve, 0, northRoad.halfWidth),
    frameFromCurve('east', eastRoad.curve, 0, eastRoad.halfWidth),
    frameFromCurve('south', mainCurve, south.u, 11),
  ];
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
      halfWidth: 7,
    },
    {
      id: 'east',
      curve: new THREE.LineCurve3(
        eastStart,
        new THREE.Vector3(PLAZA_X + 110, 0, PLAZA_Z),
      ),
      halfWidth: 7,
    },
  ];
}

export function buildCrossingStripes(
  center: THREE.Vector3,
  streetTangent: THREE.Vector3,
  spacingAxis: THREE.Vector3,
  span: number,
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
    length: 4.6,
    width: 0.72,
  }));
}

export function buildSidewalkIndicators(
  approaches: ApproachFrame[],
): SidewalkIndicator[] {
  return approaches.flatMap((approach) =>
    ([-1, 1] as const).map((side) => {
      const sideName = side < 0 ? 'left' : 'right';
      const forwardProbe = approach.center.clone().addScaledVector(approach.tangent, 0.25);
      const backwardProbe = approach.center.clone().addScaledVector(approach.tangent, -0.25);
      const outward = shibuyaPlazaClearance(forwardProbe.x, forwardProbe.z)
        > shibuyaPlazaClearance(backwardProbe.x, backwardProbe.z)
        ? approach.tangent
        : approach.tangent.clone().negate();
      const lateralOffset = side * (
        approach.halfWidth
        + 1
        + INDICATOR_WIDTH / 2
        + INDICATOR_MARGIN
      );
      let outwardOffset = INDICATOR_LENGTH / 2 + INDICATOR_MARGIN;
      let center = approach.center.clone();
      for (let iteration = 0; iteration < 20; iteration++) {
        center = approach.center.clone()
          .addScaledVector(outward, outwardOffset)
          .addScaledVector(approach.binormal, lateralOffset);
        const minimumCornerClearance = Math.min(
          ...([-1, 1] as const).flatMap((along) =>
            ([-1, 1] as const).map((across) => {
              const corner = center.clone()
                .addScaledVector(approach.tangent, along * INDICATOR_LENGTH / 2)
                .addScaledVector(approach.binormal, across * INDICATOR_WIDTH / 2);
              return shibuyaPlazaClearance(corner.x, corner.z);
            })),
        );
        if (minimumCornerClearance >= INDICATOR_MARGIN) break;
        outwardOffset += INDICATOR_MARGIN - minimumCornerClearance;
      }
      return {
        id: `${approach.id}-${sideName}`,
        center: center.setY(SIDEWALK_TOP_Y + INDICATOR_HEIGHT / 2),
        longAxis: approach.tangent.clone(),
        length: INDICATOR_LENGTH,
        width: INDICATOR_WIDTH,
        height: INDICATOR_HEIGHT,
        tactile: true,
        illuminated: true,
      };
    }),
  );
}

function buildApproachCrossing(approach: ApproachFrame): CrossingPlacement {
  return {
    id: `${approach.id}-approach`,
    kind: 'approach',
    center: approach.center.clone(),
    streetTangent: approach.tangent.clone(),
    spacingAxis: approach.binormal.clone(),
    stripes: buildCrossingStripes(
      approach.center,
      approach.tangent,
      approach.binormal,
      approach.halfWidth * 2,
    ),
    endpointIndicatorIds: [`${approach.id}-left`, `${approach.id}-right`],
  };
}

function buildDiagonalCrossing(
  id: string,
  start: SidewalkIndicator,
  end: SidewalkIndicator,
): CrossingPlacement {
  const spacingAxis = end.center.clone().sub(start.center).setY(0);
  const span = spacingAxis.length();
  spacingAxis.normalize();
  const streetTangent = new THREE.Vector3()
    .crossVectors(spacingAxis, UP)
    .normalize();
  const center = start.center.clone().add(end.center).multiplyScalar(0.5).setY(MARKING_Y);
  return {
    id,
    kind: 'diagonal',
    center: center.clone(),
    streetTangent,
    spacingAxis,
    stripes: buildCrossingStripes(
      center,
      streetTangent,
      spacingAxis,
      span,
    ),
    endpointIndicatorIds: [start.id, end.id],
  };
}

export function buildShibuyaIntersection(): ShibuyaIntersection {
  const sideRoads = buildShibuyaSideRoads();
  const approaches = buildShibuyaApproaches(buildGroundRouteCurve(), sideRoads);
  const indicators = buildSidewalkIndicators(approaches);
  const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]));
  const indicator = (id: string): SidewalkIndicator => {
    const value = indicatorById.get(id);
    if (!value) throw new Error(`Missing Shibuya indicator ${id}`);
    return value;
  };
  return {
    plaza: buildShibuyaPlaza(),
    approaches,
    sideRoads,
    bikeRoute: { entry: 'west', exit: 'south' },
    crossings: [
      ...approaches.map(buildApproachCrossing),
      buildDiagonalCrossing(
        'northwest-southeast',
        indicator('north-left'),
        indicator('south-right'),
      ),
      buildDiagonalCrossing(
        'northeast-southwest',
        indicator('north-right'),
        indicator('south-left'),
      ),
    ],
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

  for (const x of [-170, -60, 120]) {
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

export const SHIBUYA_STRIPE_PITCH = STRIPE_PITCH;
