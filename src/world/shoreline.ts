import * as THREE from 'three';
import {
  CITY_GROUND_BOUNDS,
  WATER_BASIN,
  WATER_LEVEL,
} from './bridgeLayout';

export const SHORELINE_CONFIG = {
  x0: WATER_BASIN.x0,
  x1: WATER_BASIN.x1,
  baseZ: -740,
  bridgeX: 240,
  sampleSpacing: 8,
  smoothWavelength: 96,
  jaggedWavelength: 72,
  detailWavelength: 43,
  smoothAmplitude: 7.8,
  jaggedAmplitude: 3.2,
  detailAmplitude: 1.2,
  groundY: CITY_GROUND_BOUNDS.y,
  waterY: WATER_LEVEL,
  cityZ: CITY_GROUND_BOUNDS.z1,
  horizonZ: WATER_BASIN.z0,
  retainingBottomY: WATER_LEVEL,
} as const;

export interface ShorelinePoint {
  x: number;
  z: number;
}

export interface ShorelineGeometry {
  ground: THREE.BufferGeometry;
  water: THREE.BufferGeometry;
  retaining: THREE.BufferGeometry;
  groundSeam: number[];
  waterSeam: number[];
  retainingSeam: number[];
}

function triangleWave(radians: number): number {
  return (2 / Math.PI) * Math.asin(Math.sin(radians));
}

export function shorelineOffsetAt(x: number): number {
  const distance = x - SHORELINE_CONFIG.bridgeX;
  const bridgeDryNotch = -18
    * (1 - Math.cos((distance * Math.PI * 2) / 96))
    * 0.5
    * Math.exp(-((distance / 75) ** 4));
  return THREE.MathUtils.clamp(
    SHORELINE_CONFIG.smoothAmplitude
      * Math.sin((distance * Math.PI * 2) / SHORELINE_CONFIG.smoothWavelength)
    + SHORELINE_CONFIG.jaggedAmplitude
      * triangleWave(
        (distance * Math.PI * 2) / SHORELINE_CONFIG.jaggedWavelength,
      )
    + SHORELINE_CONFIG.detailAmplitude
      * Math.sin((distance * Math.PI * 2) / SHORELINE_CONFIG.detailWavelength)
    + bridgeDryNotch,
    -13.5,
    13.5,
  );
}

export function buildShorelineProfile(): ShorelinePoint[] {
  const span = SHORELINE_CONFIG.x1 - SHORELINE_CONFIG.x0;
  const steps = Math.ceil(span / SHORELINE_CONFIG.sampleSpacing);
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const x = index === steps
      ? SHORELINE_CONFIG.x1
      : SHORELINE_CONFIG.x0 + index * SHORELINE_CONFIG.sampleSpacing;
    return {
      x,
      z: SHORELINE_CONFIG.baseZ + shorelineOffsetAt(x),
    };
  });
  const bridgeIndex = points.findIndex(
    ({ x }) => Math.abs(x - SHORELINE_CONFIG.bridgeX) < 1e-8,
  );
  if (bridgeIndex < 0) {
    points.push({
      x: SHORELINE_CONFIG.bridgeX,
      z: SHORELINE_CONFIG.baseZ,
    });
    points.sort((a, b) => a.x - b.x);
  } else {
    points[bridgeIndex] = {
      x: SHORELINE_CONFIG.bridgeX,
      z: SHORELINE_CONFIG.baseZ,
    };
  }
  return points;
}

export function shorelineZAt(
  x: number,
  profile = buildShorelineProfile(),
): number {
  if (x <= profile[0].x) return profile[0].z;
  if (x >= profile[profile.length - 1].x) return profile.at(-1)!.z;
  let low = 0;
  let high = profile.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (profile[middle].x <= x) low = middle;
    else high = middle;
  }
  const left = profile[low];
  const right = profile[high];
  return THREE.MathUtils.lerp(
    left.z,
    right.z,
    (x - left.x) / (right.x - left.x),
  );
}

export function shorelinePointClearance(
  x: number,
  z: number,
  profile = buildShorelineProfile(),
): number {
  if (x < SHORELINE_CONFIG.x0 || x > SHORELINE_CONFIG.x1) return Infinity;
  return z - shorelineZAt(x, profile);
}

export function shorelineCircleClearance(
  x: number,
  z: number,
  radius: number,
  profile = buildShorelineProfile(),
): number {
  let minimum = Infinity;
  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2;
    const sampleX = x + Math.cos(angle) * radius;
    const sampleZ = z + Math.sin(angle) * radius;
    minimum = Math.min(
      minimum,
      shorelinePointClearance(sampleX, sampleZ, profile),
    );
  }
  return minimum;
}

function makeGeometry(
  positions: number[],
  uvs: number[],
  indices: number[],
  horizontal: boolean,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.surface = horizontal ? 'horizontal' : 'vertical';
  return geometry;
}

export function buildShorelineGeometry(
  profile = buildShorelineProfile(),
): ShorelineGeometry {
  const groundPositions: number[] = [];
  const waterPositions: number[] = [];
  const retainingPositions: number[] = [];
  const groundUvs: number[] = [];
  const waterUvs: number[] = [];
  const retainingUvs: number[] = [];
  const groundIndices: number[] = [];
  const waterIndices: number[] = [];
  const retainingIndices: number[] = [];
  const groundSeam: number[] = [];
  const waterSeam: number[] = [];
  const retainingSeam: number[] = [];
  const span = SHORELINE_CONFIG.x1 - SHORELINE_CONFIG.x0;

  profile.forEach(({ x, z }, index) => {
    const u = (x - SHORELINE_CONFIG.x0) / span;
    groundSeam.push(index * 2);
    waterSeam.push(index * 2);
    retainingSeam.push(index * 2);
    groundPositions.push(
      x, SHORELINE_CONFIG.groundY, z,
      x, SHORELINE_CONFIG.groundY, SHORELINE_CONFIG.cityZ,
    );
    waterPositions.push(
      x, SHORELINE_CONFIG.groundY, z,
      x, SHORELINE_CONFIG.waterY, SHORELINE_CONFIG.horizonZ,
    );
    retainingPositions.push(
      x, SHORELINE_CONFIG.groundY, z,
      x, SHORELINE_CONFIG.retainingBottomY, z,
    );
    groundUvs.push(u, 0, u, 1);
    waterUvs.push(u, 0, u, 1);
    retainingUvs.push(u, 1, u, 0);
  });

  for (let index = 0; index < profile.length - 1; index += 1) {
    const seam = index * 2;
    const far = seam + 1;
    const nextSeam = seam + 2;
    const nextFar = seam + 3;
    groundIndices.push(seam, far, nextSeam, nextSeam, far, nextFar);
    waterIndices.push(seam, nextSeam, far, nextSeam, nextFar, far);
    retainingIndices.push(seam, far, nextSeam, nextSeam, far, nextFar);
  }

  const appendGroundWing = (
    outerX: number,
    shorelinePoint: ShorelinePoint,
  ) => {
    const base = groundPositions.length / 3;
    const outerU = outerX < SHORELINE_CONFIG.x0 ? 0 : 1;
    const seamU = outerX < SHORELINE_CONFIG.x0 ? 1 : 0;
    groundPositions.push(
      outerX, SHORELINE_CONFIG.groundY, SHORELINE_CONFIG.baseZ,
      shorelinePoint.x, SHORELINE_CONFIG.groundY, shorelinePoint.z,
      outerX, SHORELINE_CONFIG.groundY, SHORELINE_CONFIG.cityZ,
      shorelinePoint.x, SHORELINE_CONFIG.groundY, SHORELINE_CONFIG.cityZ,
    );
    groundUvs.push(outerU, 0, seamU, 0, outerU, 1, seamU, 1);
    if (outerX < shorelinePoint.x) {
      groundIndices.push(
        base, base + 2, base + 1,
        base + 1, base + 2, base + 3,
      );
    } else {
      groundIndices.push(
        base, base + 1, base + 2,
        base + 1, base + 3, base + 2,
      );
    }
  };
  appendGroundWing(CITY_GROUND_BOUNDS.x0, profile[0]);
  appendGroundWing(CITY_GROUND_BOUNDS.x1, profile.at(-1)!);

  const ground = makeGeometry(
    groundPositions,
    groundUvs,
    groundIndices,
    true,
  );
  ground.userData.boundaryVertexCount = profile.length;
  return {
    ground,
    water: makeGeometry(
      waterPositions,
      waterUvs,
      waterIndices,
      true,
    ),
    retaining: makeGeometry(
      retainingPositions,
      retainingUvs,
      retainingIndices,
      false,
    ),
    groundSeam,
    waterSeam,
    retainingSeam,
  };
}
