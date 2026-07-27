import * as THREE from 'three';

export interface BikeFramingBeat {
  id: string;
  semanticT: number;
  minimumPixelWidth: number;
  minimumPixelHeight: number;
  minimumEdgeMarginNdc: number;
}

export const BIKE_FRAMING_BEATS: readonly BikeFramingBeat[] = Object.freeze([
  Object.freeze({
    id: 'about',
    semanticT: 0.192,
    minimumPixelWidth: 56,
    minimumPixelHeight: 27,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'projects-flip-1',
    semanticT: 0.41,
    minimumPixelWidth: 40,
    minimumPixelHeight: 20,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'projects-scaffold',
    semanticT: 0.5,
    minimumPixelWidth: 38,
    minimumPixelHeight: 18,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'projects-flip-2',
    semanticT: 0.59,
    minimumPixelWidth: 40,
    minimumPixelHeight: 20,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'research-midpoint',
    semanticT: 0.76,
    minimumPixelWidth: 55,
    minimumPixelHeight: 32,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'research-end',
    semanticT: 0.84,
    minimumPixelWidth: 55,
    minimumPixelHeight: 32,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'bridge',
    semanticT: 0.89,
    minimumPixelWidth: 4,
    minimumPixelHeight: 11,
    minimumEdgeMarginNdc: 0.1,
  }),
  Object.freeze({
    id: 'finale',
    semanticT: 1,
    minimumPixelWidth: 3,
    minimumPixelHeight: 7,
    minimumEdgeMarginNdc: 0.1,
  }),
]);

export interface BikeFramingMeasurement {
  worldBounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  worldSphere: {
    center: [number, number, number];
    radius: number;
  };
  worldCorners: Array<[number, number, number]>;
  projectedCorners: Array<[number, number, number]>;
  projectedRectangle: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  pixelWidth: number;
  pixelHeight: number;
  pixelArea: number;
  minimumEdgeMarginNdc: number;
  clipped: boolean;
  visibleFraction: number;
}

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  return ([-1, 1] as const).flatMap((xSign) =>
    ([-1, 1] as const).flatMap((ySign) =>
      ([-1, 1] as const).map((zSign) => new THREE.Vector3(
        xSign < 0 ? box.min.x : box.max.x,
        ySign < 0 ? box.min.y : box.max.y,
        zSign < 0 ? box.min.z : box.max.z,
      ))));
}

export function measureBikeFraming(
  bike: THREE.Object3D,
  camera: THREE.Camera,
  viewport: { width: number; height: number },
): BikeFramingMeasurement {
  bike.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(bike, true);
  if (bounds.isEmpty()) {
    throw new Error('Mounted bike bounds are empty');
  }
  const world = boxCorners(bounds);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const projected = world.map((corner) => corner.clone().project(camera));
  const xs = projected.map(({ x }) => x);
  const ys = projected.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const fullWidth = Math.max(0, maxX - minX);
  const fullHeight = Math.max(0, maxY - minY);
  const visibleWidth = Math.max(0, Math.min(1, maxX) - Math.max(-1, minX));
  const visibleHeight = Math.max(0, Math.min(1, maxY) - Math.max(-1, minY));
  const depthsVisible = projected.every(({ z }) => z >= -1 && z <= 1);
  const visibleFraction = depthsVisible && fullWidth > 0 && fullHeight > 0
    ? THREE.MathUtils.clamp(
        (visibleWidth * visibleHeight) / (fullWidth * fullHeight),
        0,
        1,
      )
    : 0;
  const minimumEdgeMarginNdc = Math.min(
    minX + 1,
    1 - maxX,
    minY + 1,
    1 - maxY,
  );
  return {
    worldBounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    },
    worldSphere: {
      center: sphere.center.toArray(),
      radius: sphere.radius,
    },
    worldCorners: world.map((corner) => corner.toArray()),
    projectedCorners: projected.map((corner) => corner.toArray()),
    projectedRectangle: {
      minX,
      maxX,
      minY,
      maxY,
      width: fullWidth,
      height: fullHeight,
    },
    pixelWidth: fullWidth / 2 * viewport.width,
    pixelHeight: fullHeight / 2 * viewport.height,
    pixelArea:
      fullWidth / 2 * viewport.width
      * (fullHeight / 2 * viewport.height),
    minimumEdgeMarginNdc,
    clipped: minimumEdgeMarginNdc < 0 || !depthsVisible,
    visibleFraction,
  };
}
