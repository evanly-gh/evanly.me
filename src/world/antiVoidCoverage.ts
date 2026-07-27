import * as THREE from 'three';
import {
  ABOUT_REVEAL_CAMERA,
  aboutSightlineFootprintMargin,
} from './aboutReveal';
import {
  buildingPlacementBounds,
  orientedFootprintGap,
  orientedFootprintPerimeterPoints,
  projectedFootprintHalfExtent,
  segmentFootprintClearance,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import {
  BRIDGE_DECK_HALF_WIDTH,
  WATER_BASIN,
  WATER_LEVEL,
  buildBridgeLayout,
} from './bridgeLayout';
import {
  clearsOpenWater,
  type Placement,
} from './cityLayout';
import {
  buildShibuyaPlaza,
  buildShibuyaSightCorridors,
} from './intersections';
import {
  MOON_POS,
  MOON_RADIUS,
  sampleRoute,
} from './route';
import {
  buildingClearsElevatedDeck,
  groundRoadMemberships,
  protectedOrientedFootprintClearance,
} from './roads';
import {
  buildResearchSightCorridors,
} from './researchSightlines';
import {
  RESEARCH_GATEWAYS,
  RESEARCH_ROUTE,
} from './researchLayout';
import { shorelineCircleClearance } from './shoreline';
import { JUNK, RAMP2, SCAFFOLD } from './setpieces';
import { STUNT_PROJECT_PANELS } from './stuntContent';
import { STUNT_ROUTE } from './stuntLayout';
import type {
  ProductionCameraSample,
  ProductionShotGroup,
} from './visibilityProfile';

export type OpenCoverageSurface = 'bridge' | 'water' | 'moon';
export type BuildingLayerClass = 'front' | 'back';
export type DirectCoverageKind =
  | 'about-content'
  | 'shibuya-route'
  | 'projects-setpiece'
  | 'research-route';

export type AntiVoidExpectation =
  | Readonly<{ kind: 'wall-layers' }>
  | Readonly<{
      kind: 'direct-content';
      direct: DirectCoverageKind;
    }>
  | Readonly<{
      kind: 'route-flanked';
      direct: DirectCoverageKind;
      flankProbeIndices: readonly [number, number];
    }>
  | Readonly<{
      kind: 'intentional-open';
      surfaces: readonly OpenCoverageSurface[];
    }>;

export interface AntiVoidProbeContract {
  id: string;
  index: number;
  ndc: readonly [number, number];
  expectation: AntiVoidExpectation;
}

export interface AntiVoidCameraContract {
  shotId: string;
  shotGroup: ProductionShotGroup;
  probes: readonly AntiVoidProbeContract[];
}

export const ANTI_VOID_PROBE_NDC = Object.freeze([
  Object.freeze([-0.5, -0.2] as const),
  Object.freeze([-0.25, -0.1] as const),
  Object.freeze([0, 0] as const),
  Object.freeze([0.25, -0.1] as const),
  Object.freeze([0.5, -0.2] as const),
]);

const roadCanyon = (
  shotId: string,
  shotGroup: Exclude<ProductionShotGroup, 'finale'>,
  direct: Extract<AntiVoidExpectation, { kind: 'route-flanked' }>['direct'],
  ndcs: ReadonlyArray<readonly [number, number]> = ANTI_VOID_PROBE_NDC,
): AntiVoidCameraContract => Object.freeze({
  shotId,
  shotGroup,
  probes: Object.freeze(ndcs.map((ndc, index) => Object.freeze({
    id: `${shotId}:probe:${index}`,
    index,
    ndc,
    expectation: index === 2
      ? Object.freeze({
          kind: 'route-flanked' as const,
          direct,
          flankProbeIndices: Object.freeze([1, 3] as const),
        })
      : Object.freeze({ kind: 'wall-layers' as const }),
  }))),
});

const aboutHeroCoverage = (): AntiVoidCameraContract => {
  const shotId = 'production-rig:key:about-constant-reveal';
  const ndcs = [
    [-0.6, -0.2],
    [-0.3, -0.1],
    [0, 0],
    [0.3, -0.1],
    [0.6, -0.2],
  ] as const;
  return Object.freeze({
    shotId,
    shotGroup: 'about',
    probes: Object.freeze(ndcs.map((ndc, index) => Object.freeze({
      id: `${shotId}:probe:${index}`,
      index,
      ndc,
      expectation: Object.freeze({
        kind: 'direct-content' as const,
        direct: 'about-content' as const,
      }),
    }))),
  });
};

const finale = (
  shotId: string,
  surfaces: readonly OpenCoverageSurface[],
  ndcs: ReadonlyArray<readonly [number, number]> = ANTI_VOID_PROBE_NDC,
): AntiVoidCameraContract => Object.freeze({
  shotId,
  shotGroup: 'finale',
  probes: Object.freeze(ndcs.map((ndc, index) => Object.freeze({
    id: `${shotId}:probe:${index}`,
    index,
    ndc,
    expectation: Object.freeze({
      kind: 'intentional-open' as const,
      surfaces,
    }),
  }))),
});

const FINALE_OPEN_PROBE_NDC = Object.freeze([
  Object.freeze([-0.5, -0.65] as const),
  Object.freeze([-0.12, 0] as const),
  Object.freeze([0, 0] as const),
  Object.freeze([0.12, 0] as const),
  Object.freeze([0.5, -0.65] as const),
]);

const researchEnd = (): AntiVoidCameraContract => {
  const shotId = 'production-rig:key:research-24';
  const definitions = [
    {
      ndc: [-0.9, -0.8] as const,
      expectation: Object.freeze({
        kind: 'intentional-open' as const,
        surfaces: Object.freeze(['bridge', 'water'] as const),
      }),
    },
    {
      ndc: [-0.7, -0.65] as const,
      expectation: Object.freeze({
        kind: 'intentional-open' as const,
        surfaces: Object.freeze(['bridge', 'water'] as const),
      }),
    },
    {
      ndc: [-0.22, -0.73] as const,
      expectation: Object.freeze({
        kind: 'route-flanked' as const,
        direct: 'research-route' as const,
        flankProbeIndices: Object.freeze([3, 4] as const),
      }),
    },
    {
      ndc: [0.7, -0.2] as const,
      expectation: Object.freeze({ kind: 'wall-layers' as const }),
    },
    {
      ndc: [0.9, -0.2] as const,
      expectation: Object.freeze({ kind: 'wall-layers' as const }),
    },
  ];
  return Object.freeze({
    shotId,
    shotGroup: 'research',
    probes: Object.freeze(definitions.map(({ ndc, expectation }, index) =>
      Object.freeze({
        id: `${shotId}:probe:${index}`,
        index,
        ndc,
        expectation,
      }))),
  });
};

const researchTransition = (): AntiVoidCameraContract => {
  const shotId = 'production-rig:key:research-entry';
  const ndcs = [
    [-0.7, -0.2],
    [-0.4, -0.2],
    [0, 0],
    [0, 0],
    [0, 0],
  ] as const;
  return Object.freeze({
    shotId,
    shotGroup: 'research',
    probes: Object.freeze(ndcs.map((ndc, index) => Object.freeze({
      id: `${shotId}:probe:${index}`,
      index,
      ndc,
      expectation: index < 2
        ? Object.freeze({ kind: 'wall-layers' as const })
        : Object.freeze({
            kind: 'route-flanked' as const,
            direct: 'research-route' as const,
            flankProbeIndices: Object.freeze([0, 1] as const),
          }),
    }))),
  });
};

export const ANTI_VOID_PROBE_CONTRACTS: readonly AntiVoidCameraContract[] =
  Object.freeze([
    aboutHeroCoverage(),
    roadCanyon(
      'production-rig:key:about-to-shibuya',
      'shibuya',
      'shibuya-route',
      [[-0.7, -0.2], [-0.4, -0.1], [0, 0], [0.4, -0.1], [0.4, -0.1]],
    ),
    roadCanyon(
      'production-rig:key:projects-1',
      'projects',
      'projects-setpiece',
      [[-0.7, -0.1], [-0.4, -0.1], [0, 0], [0.3, -0.1], [0.7, 0]],
    ),
    roadCanyon(
      'production-rig:key:projects-3',
      'projects',
      'projects-setpiece',
      [[-0.7, -0.1], [-0.5, -0.1], [0, 0], [0.4, -0.1], [0.7, -0.1]],
    ),
    roadCanyon(
      'production-rig:key:projects-5',
      'projects',
      'projects-setpiece',
      [[-0.5, 0], [-0.5, -0.1], [0, 0], [0.4, -0.1], [0.7, -0.1]],
    ),
    researchTransition(),
    roadCanyon(
      'production-rig:key:research-21',
      'research',
      'research-route',
      [[-0.9, -0.2], [-0.3, -0.2], [0, 0], [0.4, -0.2], [0.7, -0.2]],
    ),
    roadCanyon(
      'production-rig:key:research-22',
      'research',
      'research-route',
      [[-0.2, -0.2], [-0.1, -0.1], [0, 0], [0.4, -0.2], [0.7, -0.2]],
    ),
    researchEnd(),
    finale(
      'production-rig:key:research-to-bridge',
      Object.freeze(['bridge', 'water', 'moon'] as const),
      FINALE_OPEN_PROBE_NDC,
    ),
    finale(
      'production-rig:key:bridge-chase',
      Object.freeze(['bridge', 'water', 'moon'] as const),
      FINALE_OPEN_PROBE_NDC,
    ),
    finale(
      'production-rig:key:bridge-to-finale',
      Object.freeze(['moon', 'water'] as const),
      FINALE_OPEN_PROBE_NDC,
    ),
  ]);

export interface CanyonFiller {
  id: string;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  rotationY: number;
  sourceProbeIds: readonly string[];
  triangles: 12;
  safety: {
    minimumGroundRoadMargin: number;
    protectedFootprintMargin: number;
    shibuyaSightlineMargin: number;
    researchSightlineMargin: number;
    aboutSightlineMargin: number;
    shorelineMargin: number;
    minimumNeighborGap: number;
    attachedParentCount: number;
  };
}

export interface TypedAntiVoidProbe {
  id: string;
  ndc: [number, number];
  expectation: AntiVoidExpectation;
  passed: boolean;
  buildingDepths: number[];
  buildingRoles: string[];
  buildingLayerClasses: BuildingLayerClass[];
  directCoverageHits: Array<{ id: string; depth: number }>;
  flankingMinimumLayers: number | null;
  openCoverageHits: Array<{
    surface: OpenCoverageSurface;
    depth: number;
  }>;
}

export interface TypedAntiVoidMetric {
  shotId: string;
  shotGroup: ProductionShotGroup;
  passed: boolean;
  minimumRequiredLayers: number;
  minimumDepth: number | null;
  maximumDepth: number | null;
  probes: TypedAntiVoidProbe[];
}

interface Bounds3 {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  rotationY: number;
}

interface LayerVolume {
  id: string;
  role: string;
  layerClass: BuildingLayerClass;
  bounds: Bounds3;
}

export interface AntiVoidSemanticVolume {
  id: string;
  kind: DirectCoverageKind;
  bounds: {
    center: [number, number, number];
    halfSize: [number, number, number];
    rotationY: number;
  };
}

export interface OrderedLayerHit {
  id: string;
  role: string;
  layerClass: BuildingLayerClass;
  depth: number;
}

const PROBE_APERTURE = Object.freeze([
  [0, 0],
  [-0.028, 0],
  [0.028, 0],
  [0, -0.028],
  [0, 0.028],
] as const);

const SHIBUYA_SIGHT_CORRIDORS = buildShibuyaSightCorridors();
const RESEARCH_SIGHT_CORRIDORS = buildResearchSightCorridors();

function cameraFor(sample: ProductionCameraSample): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    sample.fov,
    sample.aspect,
    0.05,
    9_000,
  );
  camera.position.set(...sample.position);
  camera.lookAt(...sample.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function rayFor(
  camera: THREE.PerspectiveCamera,
  ndc: readonly [number, number],
  offset: readonly [number, number] = [0, 0],
): THREE.Ray {
  const direction = new THREE.Vector3(
    ndc[0] + offset[0],
    ndc[1] + offset[1],
    0.5,
  ).unproject(camera).sub(camera.position).normalize();
  return new THREE.Ray(camera.position.clone(), direction);
}

function boundsFromBuilding(bounds: OrientedBuildingBounds): Bounds3 {
  return {
    center: new THREE.Vector3(bounds.center.x, bounds.height / 2, bounds.center.z),
    halfSize: new THREE.Vector3(bounds.halfX, bounds.height / 2, bounds.halfZ),
    rotationY: bounds.rotationY,
  };
}

export function canyonFillerBounds(filler: CanyonFiller): OrientedBuildingBounds {
  return {
    file: 'cinematic-canyon-filler',
    center: { x: filler.position[0], z: filler.position[2] },
    rotationY: filler.rotationY,
    scale: 1,
    radius: Math.hypot(filler.size[0], filler.size[2]) / 2,
    halfX: filler.size[0] / 2,
    halfZ: filler.size[2] / 2,
    height: filler.size[1],
  };
}

function fillerBounds3(filler: CanyonFiller): Bounds3 {
  return boundsFromBuilding(canyonFillerBounds(filler));
}

export function classifyBuildingLayer(
  placement: Placement,
): BuildingLayerClass | null {
  switch (placement.layoutRole) {
    case 'shibuya-front':
    case 'shibuya-corner':
    case 'research-front':
    case 'stunt-backdrop':
    case 'about-hero-backdrop':
      return 'front';
    case 'shibuya-back':
    case 'research-back':
      return 'back';
    default:
      break;
  }
  if (!placement.outDir) return null;
  const bounds = buildingPlacementBounds(placement);
  const outward = { x: placement.outDir[0], z: placement.outDir[1] };
  const facadeClearance = Math.min(...groundRoadMemberships(
    bounds.center.x,
    bounds.center.z,
  ).map(({ clearance }) =>
    clearance - projectedFootprintHalfExtent(bounds, outward)));
  return facadeClearance <= 24 ? 'front' : 'back';
}

function rayBoundsDepth(ray: THREE.Ray, bounds: Bounds3): number | null {
  const inverse = new THREE.Matrix4().makeRotationY(-bounds.rotationY)
    .multiply(new THREE.Matrix4().makeTranslation(
      -bounds.center.x,
      -bounds.center.y,
      -bounds.center.z,
    ));
  const localOrigin = ray.origin.clone().applyMatrix4(inverse);
  const localDirection = ray.direction.clone().transformDirection(inverse);
  const hit = new THREE.Ray(localOrigin, localDirection).intersectBox(
    new THREE.Box3(bounds.halfSize.clone().negate(), bounds.halfSize),
    new THREE.Vector3(),
  );
  return hit ? hit.distanceTo(localOrigin) : null;
}

function layerVolumes(
  buildings: readonly Placement[],
  fillers: readonly CanyonFiller[],
): LayerVolume[] {
  return [
    ...buildings.flatMap((placement, index): LayerVolume[] => {
      const layerClass = classifyBuildingLayer(placement);
      return layerClass ? [{
        id: placement.id ?? `building:${index}`,
        role: placement.layoutRole
          ?? `ordinary-road-${layerClass}`,
        layerClass,
        bounds: boundsFromBuilding(buildingPlacementBounds(placement)),
      }] : [];
    }),
    ...fillers.map((filler): LayerVolume => ({
      id: filler.id,
      role: 'cinematic-canyon-filler',
      layerClass: 'back',
      bounds: fillerBounds3(filler),
    })),
  ];
}

function probeLayerHits(
  camera: THREE.PerspectiveCamera,
  ndc: readonly [number, number],
  volumes: readonly LayerVolume[],
): OrderedLayerHit[] {
  const byId = new Map<string, OrderedLayerHit>();
  for (const offset of PROBE_APERTURE) {
    const ray = rayFor(camera, ndc, offset);
    for (const volume of volumes) {
      const depth = rayBoundsDepth(ray, volume.bounds);
      if (depth === null) continue;
      const previous = byId.get(volume.id);
      if (!previous || depth < previous.depth) {
        byId.set(volume.id, {
          id: volume.id,
          role: volume.role,
          layerClass: volume.layerClass,
          depth,
        });
      }
    }
  }
  return [...byId.values()].sort((first, second) =>
    first.depth - second.depth || first.id.localeCompare(second.id));
}

export function selectOrderedLayerPair(
  hits: readonly OrderedLayerHit[],
): { front: OrderedLayerHit; back: OrderedLayerHit } | null {
  const front = hits.find(({ layerClass }) => layerClass === 'front');
  if (!front) return null;
  const back = hits.find(({ layerClass, depth, id }) =>
    layerClass === 'back' && depth > front.depth + 1e-6 && id !== front.id);
  return back ? { front, back } : null;
}

export function measureBuildingProbeDepths(
  sample: ProductionCameraSample,
  buildings: readonly Placement[],
  ndcs: ReadonlyArray<readonly [number, number]>,
): number[][] {
  const camera = cameraFor(sample);
  const volumes = layerVolumes(buildings, []);
  return ndcs.map((ndc) =>
    probeLayerHits(camera, ndc, volumes).map(({ depth }) => depth));
}

export function measureBuildingProbeLayers(
  sample: ProductionCameraSample,
  buildings: readonly Placement[],
  ndcs: ReadonlyArray<readonly [number, number]>,
): OrderedLayerHit[][] {
  const camera = cameraFor(sample);
  const volumes = layerVolumes(buildings, []);
  return ndcs.map((ndc) => probeLayerHits(camera, ndc, volumes));
}

function fillerSafety(
  bounds: OrientedBuildingBounds,
  neighbors: readonly OrientedBuildingBounds[],
): CanyonFiller['safety'] {
  const perimeter = orientedFootprintPerimeterPoints(bounds, 8);
  const minimumGroundRoadMargin = Math.min(...perimeter.flatMap((point) =>
    groundRoadMemberships(point.x, point.z).map(({ clearance }) =>
      clearance - 10)));
  const ordinaryProtectedMargin =
    protectedOrientedFootprintClearance(bounds) - 1;
  const projectBackdropMargin = (
    bounds.center.z + bounds.halfZ <= -55
    && bounds.center.z - bounds.halfZ >= -360
  ) ? bounds.center.x - bounds.halfX - 300 : -Infinity;
  const protectedFootprintMargin = Math.max(
    ordinaryProtectedMargin,
    projectBackdropMargin,
  );
  const shibuyaSightlineMargin = Math.min(
    ...SHIBUYA_SIGHT_CORRIDORS.map((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        - corridor.halfWidth),
  );
  const researchSightlineMargin = Math.min(
    ...RESEARCH_SIGHT_CORRIDORS.map((corridor) =>
      segmentFootprintClearance(corridor.start, corridor.end, bounds)
        - corridor.halfWidth),
  );
  const aboutSightlineMargin = aboutSightlineFootprintMargin(bounds);
  const shorelineMargin = shorelineCircleClearance(
    bounds.center.x,
    bounds.center.z,
    bounds.radius,
  );
  const neighborGaps = neighbors.map((neighbor) =>
    orientedFootprintGap(bounds, neighbor));
  const attachedParentCount = neighborGaps.filter((gap) => gap <= 1e-6).length;
  const separatedGaps = neighborGaps.filter((gap) => gap > 1e-6);
  const minimumNeighborGap = separatedGaps.length > 0
    ? Math.min(...separatedGaps)
    : Infinity;
  return {
    minimumGroundRoadMargin,
    protectedFootprintMargin,
    shibuyaSightlineMargin,
    researchSightlineMargin,
    aboutSightlineMargin,
    shorelineMargin,
    minimumNeighborGap,
    attachedParentCount,
  };
}

function fillerIsSafe(
  safety: CanyonFiller['safety'],
  bounds: OrientedBuildingBounds,
): boolean {
  return Object.values(safety).every(Number.isFinite)
    && safety.minimumGroundRoadMargin > 0
    && safety.protectedFootprintMargin > 0
    && safety.shibuyaSightlineMargin > 0
    && safety.researchSightlineMargin > 0
    && safety.aboutSightlineMargin > 0
    && safety.shorelineMargin > 0
    && safety.minimumNeighborGap >= 1
    && safety.minimumNeighborGap <= 40
    && safety.attachedParentCount <= 1
    && clearsOpenWater(bounds)
    && buildingClearsElevatedDeck(bounds);
}

function candidateForProbe(
  id: string,
  sourceProbeId: string,
  camera: THREE.PerspectiveCamera,
  ndc: readonly [number, number],
  frontDepth: number,
  neighbors: readonly OrientedBuildingBounds[],
  existingFillers: readonly CanyonFiller[],
): CanyonFiller | null {
  const centerRay = rayFor(camera, ndc);
  const horizontalRight = new THREE.Vector3()
    .crossVectors(centerRay.direction, new THREE.Vector3(0, 1, 0))
    .setY(0)
    .normalize();
  let bestDiagnostic: {
    score: number;
    position: CanyonFiller['position'];
    safety: CanyonFiller['safety'];
  } | undefined;
  const depthOffsets = Array.from({ length: 141 }, (_, index) => 20 + index * 2);
  const lateralOffsets = Array.from({ length: 21 }, (_, index) => {
    const magnitude = Math.ceil(index / 2) * 4;
    return index === 0 ? 0 : (index % 2 === 0 ? magnitude : -magnitude);
  });
  for (const extraDepth of depthOffsets) {
    for (const lateral of lateralOffsets) {
      const point = centerRay.at(
        Math.max(frontDepth + extraDepth, 20),
        new THREE.Vector3(),
      ).addScaledVector(horizontalRight, lateral);
      for (const [width, depth] of [
        [70, 14],
        [50, 14],
        [40, 14],
        [30, 14],
        [24, 12],
        [18, 10],
        [14, 8],
        [10, 6],
        [8, 5],
        [6, 4],
      ] as const) {
        const nearestHeight = neighbors.reduce((nearest, neighbor) => {
          const distance = Math.hypot(
            neighbor.center.x - point.x,
            neighbor.center.z - point.z,
          );
          return distance < nearest.distance
            ? { distance, height: neighbor.height }
            : nearest;
        }, { distance: Infinity, height: 42 });
        const height = THREE.MathUtils.clamp(
          Math.max(point.y + 8, nearestHeight.height),
          32,
          84,
        );
        const rotationY = Math.atan2(
          centerRay.direction.x,
          centerRay.direction.z,
        );
        const draft: CanyonFiller = {
          id,
          position: [point.x, 0, point.z],
          size: [width, height, depth],
          rotationY,
          sourceProbeIds: [sourceProbeId],
          triangles: 12,
          safety: {
            minimumGroundRoadMargin: 0,
            protectedFootprintMargin: 0,
            shibuyaSightlineMargin: 0,
            researchSightlineMargin: 0,
            aboutSightlineMargin: 0,
            shorelineMargin: 0,
            minimumNeighborGap: 0,
            attachedParentCount: 0,
          },
        };
        const bounds = canyonFillerBounds(draft);
        if (
          probeLayerHits(camera, ndc, layerVolumes([], [draft])).length === 0
          || existingFillers.some((filler) =>
            orientedFootprintGap(bounds, canyonFillerBounds(filler)) < 1)
        ) {
          continue;
        }
        const safety = fillerSafety(bounds, neighbors);
        const score = Math.min(...Object.values(safety));
        if (!bestDiagnostic || score > bestDiagnostic.score) {
          bestDiagnostic = { score, position: draft.position, safety };
        }
        if (!fillerIsSafe(safety, bounds)) continue;
        return { ...draft, safety };
      }
    }
  }
  throw new Error(
    `No safe canyon filler candidate for ${sourceProbeId}: `
    + JSON.stringify(bestDiagnostic),
  );
}

export function buildCanyonFillers(
  envelope: readonly ProductionCameraSample[],
  buildings: readonly Placement[],
): CanyonFiller[] {
  const samples = new Map(envelope.map((sample) => [sample.id, sample]));
  const fillers: CanyonFiller[] = [];
  const baseNeighbors = buildings.map((placement) =>
    buildingPlacementBounds(placement));
  for (const contract of ANTI_VOID_PROBE_CONTRACTS) {
    if (contract.shotGroup === 'finale') continue;
    const sample = samples.get(contract.shotId);
    if (!sample) throw new Error(`Missing anti-void camera ${contract.shotId}`);
    const camera = cameraFor(sample);
    for (const probe of contract.probes) {
      if (probe.expectation.kind !== 'wall-layers') continue;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const hits = probeLayerHits(
          camera,
          probe.ndc,
          layerVolumes(buildings, fillers),
        );
        if (selectOrderedLayerPair(hits)) break;
        const front = hits.find(({ layerClass }) => layerClass === 'front');
        if (!front) {
          // No front wall anchors this probe at the current camera aspect.
          // Skip it rather than crashing the whole scene: a missing back-layer
          // filler is a minor cosmetic gap, a thrown error blanks the site.
          break;
        }
        const candidate = candidateForProbe(
          `cinematic-canyon-filler:${fillers.length}`,
          probe.id,
          camera,
          probe.ndc,
          front.depth + attempt * 20,
          [
            ...baseNeighbors,
            ...fillers.map(canyonFillerBounds),
          ],
          fillers,
        );
        if (!candidate) {
          // Could not place a safe filler for this probe; skip instead of
          // crashing the render.
          break;
        }
        const closingProbeIds = ANTI_VOID_PROBE_CONTRACTS.flatMap(
          (cameraContract) => {
            if (cameraContract.shotGroup === 'finale') return [];
            const cameraSample = samples.get(cameraContract.shotId);
            if (!cameraSample) return [];
            const probeCamera = cameraFor(cameraSample);
            return cameraContract.probes.flatMap((candidateProbe) => {
              if (candidateProbe.expectation.kind !== 'wall-layers') return [];
              const depth = probeLayerHits(
                probeCamera,
                candidateProbe.ndc,
                layerVolumes([], [candidate]),
              );
              return depth.length > 0 ? [candidateProbe.id] : [];
            });
          },
        );
        fillers.push({
          ...candidate,
          sourceProbeIds: Object.freeze([...new Set([
            ...candidate.sourceProbeIds,
            ...closingProbeIds,
          ])]),
        });
      }
    }
  }
  return fillers;
}

const semanticVolume = (
  id: string,
  kind: DirectCoverageKind,
  center: readonly [number, number, number],
  halfSize: readonly [number, number, number],
  rotationY = 0,
): AntiVoidSemanticVolume => ({
  id,
  kind,
  bounds: {
    center: [...center],
    halfSize: [...halfSize],
    rotationY,
  },
});

export function buildAntiVoidSemanticVolumes(): AntiVoidSemanticVolume[] {
  const plaza = buildShibuyaPlaza();
  const plazaXs = plaza.outline.map(({ x }) => x);
  const plazaZs = plaza.outline.map(({ z }) => z);
  const projectPanels = STUNT_PROJECT_PANELS.map((panel) => semanticVolume(
    panel.id,
    'projects-setpiece',
    panel.position,
    [panel.width / 2, panel.height / 2, 1.5],
    panel.rotationY,
  ));
  const researchRoad = Array.from({ length: 13 }, (_, index) => {
    const point = sampleRoute(
      THREE.MathUtils.lerp(
        RESEARCH_ROUTE.startT,
        RESEARCH_ROUTE.endT,
        index / 12,
      ),
    ).pos;
    return semanticVolume(
      `research-route:${index}`,
      'research-route',
      [point.x, 14, point.z],
      [18, 16, 18],
    );
  });
  const researchGateways = RESEARCH_GATEWAYS.map((gateway) => semanticVolume(
    gateway.id,
    'research-route',
    gateway.center,
    [gateway.clearWidth / 2 + 2, gateway.undersideY / 2 + 2, 4],
  ));
  return [
    semanticVolume(
      'about-hero-screen-volume',
      'about-content',
      [
        ABOUT_REVEAL_CAMERA.target[0],
        16,
        ABOUT_REVEAL_CAMERA.target[2],
      ],
      [24, 16, 2],
    ),
    semanticVolume(
      'shibuya-plaza-route-volume',
      'shibuya-route',
      [
        (Math.min(...plazaXs) + Math.max(...plazaXs)) / 2,
        10,
        (Math.min(...plazaZs) + Math.max(...plazaZs)) / 2,
      ],
      [
        (Math.max(...plazaXs) - Math.min(...plazaXs)) / 2,
        12,
        (Math.max(...plazaZs) - Math.min(...plazaZs)) / 2,
      ],
    ),
    semanticVolume(
      'projects-scaffold-volume',
      'projects-setpiece',
      [SCAFFOLD.deckCenter[0], 14, SCAFFOLD.deckCenter[2]],
      [SCAFFOLD.deckWidth / 2 + 3, 16, SCAFFOLD.deckLen / 2],
    ),
    semanticVolume(
      'projects-ramp-1-volume',
      'projects-setpiece',
      [
        JUNK.base[0],
        JUNK.rise / 2 + 12,
        JUNK.base[2] - JUNK.run / 2,
      ],
      [JUNK.width / 2 + 5, JUNK.rise / 2 + 14, JUNK.run / 2 + 8],
    ),
    semanticVolume(
      'projects-ramp-2-volume',
      'projects-setpiece',
      [
        RAMP2.base[0],
        RAMP2.base[1] + RAMP2.rise / 2 + 10,
        RAMP2.base[2] - RAMP2.run / 2,
      ],
      [RAMP2.width / 2 + 5, RAMP2.rise / 2 + 12, RAMP2.run / 2 + 8],
    ),
    semanticVolume(
      'projects-flip-1-flight-volume',
      'projects-setpiece',
      STUNT_ROUTE.flip1Apex.position,
      [8, 16, 20],
    ),
    semanticVolume(
      'projects-flip-2-flight-volume',
      'projects-setpiece',
      [
        STUNT_ROUTE.flip2Apex.position[0],
        STUNT_ROUTE.flip2Apex.position[1] - 10,
        STUNT_ROUTE.flip2Apex.position[2],
      ],
      [8, 18, 20],
    ),
    ...projectPanels,
    ...researchRoad,
    ...researchGateways,
  ];
}

function semanticBounds3(volume: AntiVoidSemanticVolume): Bounds3 {
  return {
    center: new THREE.Vector3(...volume.bounds.center),
    halfSize: new THREE.Vector3(...volume.bounds.halfSize),
    rotationY: volume.bounds.rotationY,
  };
}

function directSemanticHits(
  camera: THREE.PerspectiveCamera,
  probe: AntiVoidProbeContract,
  kind: DirectCoverageKind,
  volumes: readonly AntiVoidSemanticVolume[],
): Array<{ id: string; depth: number }> {
  const hits = new Map<string, number>();
  for (const offset of PROBE_APERTURE) {
    const ray = rayFor(camera, probe.ndc, offset);
    for (const volume of volumes) {
      if (volume.kind !== kind) continue;
      const depth = rayBoundsDepth(ray, semanticBounds3(volume));
      if (depth === null) continue;
      const previous = hits.get(volume.id);
      if (previous === undefined || depth < previous) hits.set(volume.id, depth);
    }
  }
  return [...hits].map(([id, depth]) => ({ id, depth }))
    .sort((first, second) => first.depth - second.depth);
}

function waterHit(ray: THREE.Ray): number | null {
  if (ray.direction.y >= -1e-9) return null;
  const depth = (WATER_LEVEL - ray.origin.y) / ray.direction.y;
  if (depth <= 0) return null;
  const point = ray.at(depth, new THREE.Vector3());
  return point.x >= WATER_BASIN.x0
    && point.x <= WATER_BASIN.x1
    && point.z >= WATER_BASIN.z0
    && point.z <= WATER_BASIN.z1
    ? depth
    : null;
}

function moonHit(ray: THREE.Ray): number | null {
  const hit = ray.intersectSphere(
    new THREE.Sphere(MOON_POS, MOON_RADIUS),
    new THREE.Vector3(),
  );
  return hit ? hit.distanceTo(ray.origin) : null;
}

const BRIDGE_SEGMENTS = (() => {
  const bridge = buildBridgeLayout();
  const curves = [bridge.curve, bridge.horizon.curve];
  return curves.flatMap((curve) =>
    Array.from({ length: 160 }, (_, index) => [
      curve.getPointAt(index / 160),
      curve.getPointAt((index + 1) / 160),
    ] as const));
})();

function bridgeHit(ray: THREE.Ray): number | null {
  let nearest = Infinity;
  for (const [start, end] of BRIDGE_SEGMENTS) {
    const rayPoint = new THREE.Vector3();
    const segmentPoint = new THREE.Vector3();
    const distanceSq = ray.distanceSqToSegment(
      start,
      end,
      rayPoint,
      segmentPoint,
    );
    const depth = rayPoint.clone().sub(ray.origin).dot(ray.direction);
    if (
      depth > 0
      && distanceSq <= (BRIDGE_DECK_HALF_WIDTH + 1.5) ** 2
    ) {
      nearest = Math.min(nearest, depth);
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function openCoverageHits(
  camera: THREE.PerspectiveCamera,
  probe: AntiVoidProbeContract,
): TypedAntiVoidProbe['openCoverageHits'] {
  const hits = new Map<OpenCoverageSurface, number>();
  for (const offset of PROBE_APERTURE) {
    const ray = rayFor(camera, probe.ndc, offset);
    for (const [surface, depth] of [
      ['bridge', bridgeHit(ray)],
      ['water', waterHit(ray)],
      ['moon', moonHit(ray)],
    ] as const) {
      if (depth === null) continue;
      const previous = hits.get(surface);
      if (previous === undefined || depth < previous) hits.set(surface, depth);
    }
  }
  return [...hits].map(([surface, depth]) => ({ surface, depth }))
    .sort((first, second) => first.depth - second.depth);
}

export function evaluateTypedAntiVoidCoverage(
  envelope: readonly ProductionCameraSample[],
  buildings: readonly Placement[],
  fillers: readonly CanyonFiller[],
  semanticVolumes: readonly AntiVoidSemanticVolume[] =
    buildAntiVoidSemanticVolumes(),
): TypedAntiVoidMetric[] {
  const samples = new Map(envelope.map((sample) => [sample.id, sample]));
  const volumes = layerVolumes(buildings, fillers);
  return ANTI_VOID_PROBE_CONTRACTS.map((contract) => {
    const sample = samples.get(contract.shotId);
    if (!sample) throw new Error(`Missing anti-void camera ${contract.shotId}`);
    const camera = cameraFor(sample);
    const layerHits = contract.probes.map((probe) =>
      probeLayerHits(camera, probe.ndc, volumes));
    const probes = contract.probes.map((probe, index): TypedAntiVoidProbe => {
      const expectation = probe.expectation;
      const hits = layerHits[index];
      const pair = selectOrderedLayerPair(hits);
      if (expectation.kind === 'wall-layers') {
        return {
          id: probe.id,
          ndc: [...probe.ndc],
          expectation,
          passed: pair !== null,
          buildingDepths: pair ? [pair.front.depth, pair.back.depth] : [],
          buildingRoles: pair ? [pair.front.role, pair.back.role] : [],
          buildingLayerClasses: pair
            ? [pair.front.layerClass, pair.back.layerClass]
            : [],
          directCoverageHits: [],
          flankingMinimumLayers: null,
          openCoverageHits: [],
        };
      }
      if (expectation.kind === 'direct-content') {
        const directCoverageHits = directSemanticHits(
          camera,
          probe,
          expectation.direct,
          semanticVolumes,
        );
        return {
          id: probe.id,
          ndc: [...probe.ndc],
          expectation,
          passed: directCoverageHits.length > 0,
          buildingDepths: pair ? [pair.front.depth, pair.back.depth] : [],
          buildingRoles: pair ? [pair.front.role, pair.back.role] : [],
          buildingLayerClasses: pair
            ? [pair.front.layerClass, pair.back.layerClass]
            : [],
          directCoverageHits,
          flankingMinimumLayers: null,
          openCoverageHits: [],
        };
      }
      if (expectation.kind === 'route-flanked') {
        const flankingMinimumLayers = Math.min(
          ...expectation.flankProbeIndices.map(
            (probeIndex) =>
              selectOrderedLayerPair(layerHits[probeIndex]) ? 2 : 0,
          ),
        );
        const directCoverageHits = directSemanticHits(
          camera,
          probe,
          expectation.direct,
          semanticVolumes,
        );
        return {
          id: probe.id,
          ndc: [...probe.ndc],
          expectation,
          passed: directCoverageHits.length > 0 && flankingMinimumLayers >= 2,
          buildingDepths: pair ? [pair.front.depth, pair.back.depth] : [],
          buildingRoles: pair ? [pair.front.role, pair.back.role] : [],
          buildingLayerClasses: pair
            ? [pair.front.layerClass, pair.back.layerClass]
            : [],
          directCoverageHits,
          flankingMinimumLayers,
          openCoverageHits: [],
        };
      }
      const allOpenHits = openCoverageHits(camera, probe);
      const allowedHits = allOpenHits.filter(({ surface }) =>
        expectation.surfaces.includes(surface));
      return {
        id: probe.id,
        ndc: [...probe.ndc],
        expectation,
        passed: allowedHits.length > 0,
        buildingDepths: [],
        buildingRoles: [],
        buildingLayerClasses: [],
        directCoverageHits: [],
        flankingMinimumLayers: null,
        openCoverageHits: allowedHits,
      };
    });
    const depths = probes.flatMap(({ buildingDepths, openCoverageHits }) => [
      ...buildingDepths,
      ...openCoverageHits.map(({ depth }) => depth),
    ]);
    return {
      shotId: contract.shotId,
      shotGroup: contract.shotGroup,
      passed: probes.every(({ passed }) => passed),
      minimumRequiredLayers: Math.min(...probes.map((probe) =>
        probe.expectation.kind === 'wall-layers'
          ? probe.buildingDepths.length
          : probe.expectation.kind === 'direct-content'
            ? probe.directCoverageHits.length
            : probe.expectation.kind === 'route-flanked'
              ? probe.flankingMinimumLayers ?? 0
              : probe.openCoverageHits.length)),
      minimumDepth: depths.length > 0 ? Math.min(...depths) : null,
      maximumDepth: depths.length > 0 ? Math.max(...depths) : null,
      probes,
    };
  });
}
