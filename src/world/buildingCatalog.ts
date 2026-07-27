import manifest from '../../public/models/neocity/manifest.json';
import propManifest from '../../public/models/props/manifest.json';

export interface BuildingMetrics {
  name: string;
  file: string;
  size: { x: number; y: number; z: number };
  sourceRadius: number;
  triangles: number;
  drawPrimitives: number;
  category?: string;
}

export interface BuildingPlacementLike {
  file: string;
  position: [number, number, number];
  rotationY: number;
  scale?: number;
  foot?: number;
  outDir?: [number, number];
  centerOffset?: [number, number];
}

export interface RenderScaleOptions {
  scale?: number;
  foot?: number;
  targetHeight?: number;
}

export interface OrientedBuildingBounds {
  file: string;
  center: { x: number; z: number };
  rotationY: number;
  scale: number;
  radius: number;
  halfX: number;
  halfZ: number;
  height: number;
}

interface Point2 {
  x: number;
  z: number;
}

export const BUILDING_CATALOG = new Map<string, BuildingMetrics>(
  manifest.map((entry) => {
    const [x, y, z] = entry.bbox;
    return [entry.file, {
      name: entry.name,
      file: entry.file,
      size: { x, y, z },
      sourceRadius: 0.5 * Math.hypot(x, z) || 1,
      triangles: entry.tris,
      drawPrimitives: 1,
      category: entry.category,
    }];
  }),
);

const PROP_TRIANGLE_ESTIMATES: Readonly<Record<string, number>> = Object.freeze({
  'props/robot_companion.glb': 1_200,
  'props/robot_recon.glb': 1_600,
  'props/robot_storage.glb': 1_400,
});

export const PROP_CATALOG = new Map<string, BuildingMetrics>(
  propManifest.map((entry) => {
    const [x, y, z] = entry.bbox;
    const artifact = entry as typeof entry & {
      triangles?: number;
      primitives?: number;
    };
    return [entry.file, {
      name: entry.name,
      file: entry.file,
      size: { x, y, z },
      sourceRadius: 0.5 * Math.hypot(x, z) || 1,
      triangles: artifact.triangles
        ?? PROP_TRIANGLE_ESTIMATES[entry.file]
        ?? 2_000,
      drawPrimitives: artifact.primitives ?? 1,
      category: 'prop',
    }];
  }),
);

export const RENDERED_ASSET_CATALOG = new Map<string, BuildingMetrics>([
  ...BUILDING_CATALOG,
  ...PROP_CATALOG,
]);

export function getBuildingMetrics(file: string): BuildingMetrics {
  const metrics = BUILDING_CATALOG.get(file);
  if (!metrics) throw new Error(`Missing NeoCity building metrics for ${file}`);
  return metrics;
}

export function getRenderedAssetMetrics(file: string): BuildingMetrics {
  const metrics = RENDERED_ASSET_CATALOG.get(file);
  if (!metrics) throw new Error(`Missing rendered asset metrics for ${file}`);
  return metrics;
}

export function calculateRenderedScale(
  metrics: Pick<BuildingMetrics, 'size' | 'sourceRadius'>,
  {
    scale = 1,
    foot,
    targetHeight,
  }: RenderScaleOptions = {},
): number {
  const base = scale * (
    targetHeight === undefined ? 1 : targetHeight / (metrics.size.y || 1)
  );
  return foot === undefined ? base : Math.min(base, foot / metrics.sourceRadius);
}

function placementBounds(
  placement: BuildingPlacementLike,
  metrics: BuildingMetrics,
): OrientedBuildingBounds {
  const scale = calculateRenderedScale(metrics, placement);
  const radius = metrics.sourceRadius * scale;
  return {
    file: placement.file,
    center: {
      x: placement.position[0] + (
        placement.centerOffset?.[0] ?? (placement.outDir?.[0] ?? 0) * radius
      ),
      z: placement.position[2] + (
        placement.centerOffset?.[1] ?? (placement.outDir?.[1] ?? 0) * radius
      ),
    },
    rotationY: placement.rotationY,
    scale,
    radius,
    halfX: metrics.size.x * scale / 2,
    halfZ: metrics.size.z * scale / 2,
    height: metrics.size.y * scale,
  };
}

export function buildingPlacementBounds(
  placement: BuildingPlacementLike,
): OrientedBuildingBounds {
  return placementBounds(placement, getBuildingMetrics(placement.file));
}

export function renderedPlacementBounds(
  placement: BuildingPlacementLike,
): OrientedBuildingBounds {
  return placementBounds(placement, getRenderedAssetMetrics(placement.file));
}

export function projectedFootprintHalfExtent(
  bounds: OrientedBuildingBounds,
  axis: { x: number; z: number },
): number {
  const length = Math.hypot(axis.x, axis.z) || 1;
  const ax = axis.x / length;
  const az = axis.z / length;
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  const localX = { x: cos, z: -sin };
  const localZ = { x: sin, z: cos };
  return Math.abs(ax * localX.x + az * localX.z) * bounds.halfX
    + Math.abs(ax * localZ.x + az * localZ.z) * bounds.halfZ;
}

function footprintAxes(bounds: OrientedBuildingBounds): [Point2, Point2] {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return [
    { x: cos, z: -sin },
    { x: sin, z: cos },
  ];
}

export function orientedFootprintsOverlap(
  first: OrientedBuildingBounds,
  second: OrientedBuildingBounds,
  margin = 0,
): boolean {
  const delta = {
    x: second.center.x - first.center.x,
    z: second.center.z - first.center.z,
  };
  return [...footprintAxes(first), ...footprintAxes(second)].every((axis) =>
    Math.abs(delta.x * axis.x + delta.z * axis.z)
      < projectedFootprintHalfExtent(first, axis)
        + projectedFootprintHalfExtent(second, axis)
        + margin);
}

export function orientedFootprintGap(
  first: OrientedBuildingBounds,
  second: OrientedBuildingBounds,
): number {
  const firstCorners = orientedFootprintCorners(first);
  const secondCorners = orientedFootprintCorners(second);
  return Math.min(
    ...firstCorners.map((start, index) =>
      segmentFootprintClearance(
        start,
        firstCorners[(index + 1) % firstCorners.length],
        second,
      )),
    ...secondCorners.map((start, index) =>
      segmentFootprintClearance(
        start,
        secondCorners[(index + 1) % secondCorners.length],
        first,
      )),
  );
}

export function orientedFootprintCorners(
  bounds: OrientedBuildingBounds,
): [Point2, Point2, Point2, Point2] {
  const [xAxis, zAxis] = footprintAxes(bounds);
  return [
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
  ].map(({ x, z }) => ({
    x: bounds.center.x + xAxis.x * x * bounds.halfX + zAxis.x * z * bounds.halfZ,
    z: bounds.center.z + xAxis.z * x * bounds.halfX + zAxis.z * z * bounds.halfZ,
  })) as [Point2, Point2, Point2, Point2];
}

/** Signed XZ distance from a point to a rendered building OBB. */
export function pointOrientedFootprintClearance(
  point: Point2,
  bounds: OrientedBuildingBounds,
): number {
  const [xAxis, zAxis] = footprintAxes(bounds);
  const deltaX = point.x - bounds.center.x;
  const deltaZ = point.z - bounds.center.z;
  const localX = Math.abs(deltaX * xAxis.x + deltaZ * xAxis.z) - bounds.halfX;
  const localZ = Math.abs(deltaX * zAxis.x + deltaZ * zAxis.z) - bounds.halfZ;
  const outsideX = Math.max(localX, 0);
  const outsideZ = Math.max(localZ, 0);
  return outsideX > 0 || outsideZ > 0
    ? Math.hypot(outsideX, outsideZ)
    : Math.max(localX, localZ);
}

export function orientedFootprintPerimeterPoints(
  bounds: OrientedBuildingBounds,
  samplesPerEdge = 4,
): Point2[] {
  const corners = orientedFootprintCorners(bounds);
  return corners.flatMap((start, index) => {
    const end = corners[(index + 1) % corners.length];
    return Array.from({ length: samplesPerEdge }, (_, sample) => {
      const t = sample / samplesPerEdge;
      return {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      };
    });
  });
}

function pointSegmentDistance(point: Point2, start: Point2, end: Point2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0
    ? 0
    : Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq));
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  const onSegment = (start: Point2, end: Point2, point: Point2): boolean =>
    point.x >= Math.min(start.x, end.x) - 1e-9
    && point.x <= Math.max(start.x, end.x) + 1e-9
    && point.z >= Math.min(start.z, end.z) - 1e-9
    && point.z <= Math.max(start.z, end.z) + 1e-9;
  return (Math.abs(abC) <= 1e-9 && onSegment(a, b, c))
    || (Math.abs(abD) <= 1e-9 && onSegment(a, b, d))
    || (Math.abs(cdA) <= 1e-9 && onSegment(c, d, a))
    || (Math.abs(cdB) <= 1e-9 && onSegment(c, d, b));
}

function segmentSegmentDistance(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

export function segmentFootprintClearance(
  start: Point2,
  end: Point2,
  bounds: OrientedBuildingBounds,
): number {
  const [xAxis, zAxis] = footprintAxes(bounds);
  const toLocal = (point: Point2): Point2 => {
    const dx = point.x - bounds.center.x;
    const dz = point.z - bounds.center.z;
    return {
      x: dx * xAxis.x + dz * xAxis.z,
      z: dx * zAxis.x + dz * zAxis.z,
    };
  };
  const localStart = toLocal(start);
  const localEnd = toLocal(end);
  const pointClearance = (point: Point2): number => {
    const dx = Math.abs(point.x) - bounds.halfX;
    const dz = Math.abs(point.z) - bounds.halfZ;
    const outsideX = Math.max(dx, 0);
    const outsideZ = Math.max(dz, 0);
    return outsideX > 0 || outsideZ > 0
      ? Math.hypot(outsideX, outsideZ)
      : Math.max(dx, dz);
  };
  const startClearance = pointClearance(localStart);
  const endClearance = pointClearance(localEnd);

  // An OBB is convex, so two contained endpoints imply the complete segment is
  // contained. Preserve a negative signed value rather than measuring only to
  // the perimeter and accidentally reporting separation.
  if (startClearance <= 0 && endClearance <= 0) {
    return Math.max(startClearance, endClearance);
  }
  if (startClearance <= 0 || endClearance <= 0) return 0;

  // Closed segment/AABB slab intersection catches crossings and tangencies
  // before edge-distance fallback.
  let tMin = 0;
  let tMax = 1;
  const delta = {
    x: localEnd.x - localStart.x,
    z: localEnd.z - localStart.z,
  };
  for (const axis of ['x', 'z'] as const) {
    const halfExtent = axis === 'x' ? bounds.halfX : bounds.halfZ;
    if (Math.abs(delta[axis]) <= 1e-12) {
      if (localStart[axis] < -halfExtent || localStart[axis] > halfExtent) {
        tMin = 1;
        tMax = 0;
        break;
      }
      continue;
    }
    const inverse = 1 / delta[axis];
    const entry = (-halfExtent - localStart[axis]) * inverse;
    const exit = (halfExtent - localStart[axis]) * inverse;
    tMin = Math.max(tMin, Math.min(entry, exit));
    tMax = Math.min(tMax, Math.max(entry, exit));
    if (tMin > tMax) break;
  }
  if (tMin <= tMax) return 0;

  const corners: [Point2, Point2, Point2, Point2] = [
    { x: -bounds.halfX, z: -bounds.halfZ },
    { x: bounds.halfX, z: -bounds.halfZ },
    { x: bounds.halfX, z: bounds.halfZ },
    { x: -bounds.halfX, z: bounds.halfZ },
  ];
  return Math.min(...corners.map((corner, index) =>
    segmentSegmentDistance(
      localStart,
      localEnd,
      corner,
      corners[(index + 1) % corners.length],
    )));
}
