import * as THREE from 'three';
import type { Placement } from './cityLayout';
import {
  buildingPlacementBounds,
  orientedFootprintCorners,
} from './buildingCatalog';
import { roadFacingFacade } from './signLayout';
import type { InspectionPreset } from './inspectionPresets';
import {
  buildShibuyaSightCorridors,
  type ApproachId,
} from './intersections';
import {
  groundRoadMemberships,
  protectedFootprintClearance,
} from './roads';

interface ProjectedRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  approach?: ApproachId;
}

export interface ShibuyaWallFramingMetrics {
  wallCount: number;
  visibleWalls: number;
  projectedCoverage: number;
  horizontalCoverage: number;
  maximumHorizontalAngularGapDeg: number;
  visibleByApproach: Record<ApproachId, number>;
}

export interface ShibuyaFacadePanel {
  position: [number, number, number];
  rotationY: number;
  width: number;
  height: number;
  surfaceOffset: number;
  parentIndex: number;
  parentFile: string;
  parentKey: string;
  parentRole: string;
  normal: [number, number];
  tangent: [number, number];
  corners: Array<{ x: number; y: number; z: number }>;
}

function pointSegmentDistance(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
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

export function buildShibuyaFacadePanels(
  placements: Placement[],
): ShibuyaFacadePanel[] {
  const plaza = { x: 240, z: 0 };
  return placements.flatMap((placement, parentIndex) => {
    const bounds = buildingPlacementBounds(placement);
    if (
      !placement.outDir
      || Math.hypot(bounds.center.x - plaza.x, bounds.center.z - plaza.z) > 180
    ) {
      return [];
    }
    const face = roadFacingFacade(bounds, placement.outDir);
    const surfaceOffset = 0.08;
    const safeBottom = 3;
    const safeTop = bounds.height * 0.9;
    const height = Math.min(bounds.height * 0.5, safeTop - safeBottom);
    if (height <= 16) return [];
    const center: [number, number, number] = [
      bounds.center.x + face.normal[0] * (face.normalHalfExtent + surfaceOffset),
      (safeBottom + safeTop) / 2,
      bounds.center.z + face.normal[1] * (face.normalHalfExtent + surfaceOffset),
    ];
    const corridors = buildShibuyaSightCorridors();
    for (const widthFactor of [0.64, 0.56, 0.48, 0.4]) {
      const width = (face.tangentHalfExtent * 2 - 1.2) * widthFactor;
      const corners = [-1, 1].flatMap((horizontal) => [-1, 1].map((vertical) => ({
        x: center[0] + face.tangent[0] * horizontal * width / 2,
        y: center[1] + vertical * height / 2,
        z: center[2] + face.tangent[1] * horizontal * width / 2,
      })));
      const safe = corners.every((corner) =>
        groundRoadMemberships(corner.x, corner.z)
          .every(({ withinRoadOrSidewalk }) => !withinRoadOrSidewalk)
        && protectedFootprintClearance(corner.x, corner.z, 0) > 0
        && corridors.every((corridor) =>
          pointSegmentDistance(corner, corridor.start, corridor.end)
            > corridor.halfWidth));
      if (!safe) continue;
      return [{
        position: center,
        rotationY: face.rotationY,
        width,
        height,
        surfaceOffset,
        parentIndex,
        parentFile: placement.file,
        parentKey: `${parentIndex}:${placement.file}`,
        parentRole: placement.layoutRole ?? 'shibuya-wall',
        normal: face.normal,
        tangent: face.tangent,
        corners,
      }];
    }
    return [];
  });
}

function projectedWallRect(
  placement: Placement,
  camera: THREE.PerspectiveCamera,
): ProjectedRect | undefined {
  const bounds = buildingPlacementBounds(placement);
  const corners = orientedFootprintCorners(bounds);
  const projected = corners.flatMap(({ x, z }) => [0, bounds.height].map((y) => {
    const world = new THREE.Vector3(x, y, z);
    const cameraSpace = world.clone().applyMatrix4(camera.matrixWorldInverse);
    if (cameraSpace.z >= -camera.near) return undefined;
    return world.project(camera);
  })).filter((point): point is THREE.Vector3 => Boolean(point));
  if (projected.length === 0) return undefined;
  const x0 = Math.max(-1, Math.min(...projected.map(({ x }) => x)));
  const x1 = Math.min(1, Math.max(...projected.map(({ x }) => x)));
  const y0 = Math.max(-1, Math.min(...projected.map(({ y }) => y)));
  const y1 = Math.min(1, Math.max(...projected.map(({ y }) => y)));
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x0, x1, y0, y1, approach: placement.shibuyaApproach };
}

function unionLength(intervals: Array<[number, number]>): number {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .sort(([a], [b]) => a - b);
  if (sorted.length === 0) return 0;
  let total = 0;
  let [start, end] = sorted[0];
  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else {
      total += end - start;
      [start, end] = [nextStart, nextEnd];
    }
  }
  return total + end - start;
}

function unionArea(rects: ProjectedRect[]): number {
  const edges = [...new Set(rects.flatMap(({ x0, x1 }) => [x0, x1]))]
    .sort((a, b) => a - b);
  let area = 0;
  for (let index = 1; index < edges.length; index++) {
    const start = edges[index - 1];
    const end = edges[index];
    const midpoint = (start + end) / 2;
    area += (end - start) * unionLength(rects
      .filter(({ x0, x1 }) => x0 <= midpoint && x1 >= midpoint)
      .map(({ y0, y1 }) => [y0, y1]));
  }
  return area;
}

export function measureShibuyaWallFraming(
  placements: Placement[],
  preset: InspectionPreset,
  aspect: number,
): ShibuyaWallFramingMetrics {
  const camera = new THREE.PerspectiveCamera(preset.fov, aspect, 1, 8000);
  camera.position.set(...preset.position);
  camera.lookAt(...preset.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const rects = placements.flatMap((placement) => {
    const rect = projectedWallRect(placement, camera);
    return rect ? [rect] : [];
  });
  const halfHorizontalFov = Math.atan(
    Math.tan(THREE.MathUtils.degToRad(preset.fov) / 2) * aspect,
  );
  const toAngle = (ndcX: number) => Math.atan(ndcX * Math.tan(halfHorizontalFov));
  const angleIntervals = rects.map(({ x0, x1 }) =>
    [toAngle(x0), toAngle(x1)] as [number, number]);
  const merged = angleIntervals
    .sort(([a], [b]) => a - b)
    .reduce<Array<[number, number]>>((result, interval) => {
      const previous = result.at(-1);
      if (previous && interval[0] <= previous[1]) {
        previous[1] = Math.max(previous[1], interval[1]);
      } else result.push([...interval]);
      return result;
    }, []);
  const gaps: number[] = [];
  let cursor = -halfHorizontalFov;
  for (const [start, end] of merged) {
    gaps.push(Math.max(0, start - cursor));
    cursor = Math.max(cursor, end);
  }
  gaps.push(Math.max(0, halfHorizontalFov - cursor));
  const visibleByApproach: Record<ApproachId, number> = {
    west: 0,
    north: 0,
    east: 0,
    south: 0,
  };
  for (const { approach } of rects) {
    if (approach) visibleByApproach[approach] += 1;
  }
  return {
    wallCount: placements.length,
    visibleWalls: rects.length,
    projectedCoverage: unionArea(rects) / 4,
    horizontalCoverage: unionLength(angleIntervals) / (halfHorizontalFov * 2),
    maximumHorizontalAngularGapDeg: THREE.MathUtils.radToDeg(Math.max(...gaps)),
    visibleByApproach,
  };
}
