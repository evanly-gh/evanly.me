import * as THREE from 'three';
import type {
  CamPose,
  CameraInterpolationMode,
} from '../choreography/cameraRig';
import {
  PRODUCTION_CAMERA_KEYS,
  buildProductionCameraRig,
  productionCameraSectionAt,
  type ProductionCameraSection,
} from '../choreography/productionCameraRig';
import {
  evaluateTypedAntiVoidCoverage,
  type CanyonFiller,
  type TypedAntiVoidMetric,
} from './antiVoidCoverage';
import {
  BUILDING_CATALOG,
  RENDERED_ASSET_CATALOG,
  buildingPlacementBounds,
  renderedPlacementBounds,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import {
  buildCityLayout,
  buildProps,
  buildSkyline,
  buildStreetFurniture,
  type Placement,
  type SkyBox,
  type StreetFurniture,
} from './cityLayout';
import { buildCrowdLayout, type CrowdLayout, type CrowdSpot } from './crowdLayout';
import { buildModelSpatialBuckets } from './instanceBuckets';
import { groundRoadClearance } from './roads';
import { buildSignLayout, type SignPlacement } from './signLayout';
import {
  buildStreetDressingLayout,
  type StreetDressingLayout,
  type StreetDressingSpot,
} from './streetDressing';
export type VisibilityProfile = 'full' | 'cinematic';
export type ProductionShotGroup = ProductionCameraSection;

export const ALWAYS_KEEP_BUILDING_ROLES = Object.freeze([
  'about-hero-backdrop',
  'shibuya-front',
  'shibuya-back',
  'shibuya-corner',
  'stunt-backdrop',
  'research-front',
  'research-back',
] as const);

export const VISIBILITY_MARGIN = Object.freeze({
  ndc: 0.035,
  near: 0.05,
  far: 9_000,
  // Protect the near canyon wall; complete bounds beyond it are culled only
  // when they miss every expanded production frustum.
  routeSafetyBand: 12,
});

export const PRODUCTION_VISIBILITY_VIEWPORT = Object.freeze({
  width: 960,
  height: 540,
});

export const VISIBILITY_ENVELOPE_BIN_COUNT = 3;

const SWEEP_LIMITS = Object.freeze({
  semanticT: 0.0009,
  position: 2,
  viewAngleDegrees: 0.18,
  fovDegrees: 0.18,
});

export interface ProductionCameraSample {
  id: string;
  source: string;
  shotGroup: ProductionShotGroup;
  kind: 'key' | 'interpolation';
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  aspect: number;
  cutAfter: boolean;
  coverageNdcMargin: number;
  coverageWorldExpansion: number;
}

export interface VisibilityRemoval {
  id: string;
  category: VisibilityCategory;
  outsideEveryExpandedFrustum: true;
  safetyProtected: false;
}

export interface VisibilityRetention {
  id: string;
  category: VisibilityCategory;
  reason:
    | 'intersects-final-expanded-frustum'
    | 'safety-protected'
    | 'dependency-protected';
}

export interface ProductionCameraSweep {
  viewport: { width: number; height: number };
  aspect: number;
  samples: ProductionCameraSample[];
  bounds: {
    semanticTErrorLimit: number;
    positionErrorLimit: number;
    viewAngleErrorLimitDegrees: number;
    fovErrorLimitDegrees: number;
    maximumPositionGap: number;
    maximumSemanticTGap: number;
    maximumViewAngleGapDegrees: number;
    maximumFovGapDegrees: number;
    maximumUnsampledNdcError: number;
    worldBoundsExpansion: number;
  };
}

export type VisibilityCategory =
  | 'building'
  | 'prop'
  | 'skyline'
  | 'lamp'
  | 'pole'
  | 'cable'
  | 'crowd'
  | 'street-dressing'
  | 'sign';

export interface VisibilityBudget {
  triangles: number;
  instances: number;
  estimatedDrawObjects: number;
  byCategory: Record<string, {
    triangles: number;
    instances: number;
    estimatedDrawObjects: number;
  }>;
}

export interface VisibilityLayout {
  profile: VisibilityProfile;
  buildings: Placement[];
  buildingSourceIndices: number[];
  canyonFillers: CanyonFiller[];
  props: Placement[];
  skyline: SkyBox[];
  furniture: StreetFurniture;
  crowd: CrowdLayout;
  streetDressing: StreetDressingLayout;
  signs: SignPlacement[];
  content: {
    about: true;
    projects: true;
    research: true;
    finale: true;
  };
  estimatedDrawObjects: number;
}

export interface VisibilityLayouts {
  sweep: ProductionCameraSweep;
  envelope: ProductionCameraSample[];
  full: VisibilityLayout;
  cinematic: VisibilityLayout;
  audit: {
    removed: VisibilityRemoval[];
    retained: VisibilityRetention[];
    antiVoid: TypedAntiVoidMetric[];
    canyonFillers: CanyonFiller[];
    visibilityBroadPhase: VisibilityBroadPhaseStats;
    visibilityCache: VisibilityCacheStats;
  };
}

export interface VisibilityCacheStats {
  key: string;
  size: number;
  limit: number;
  hit: boolean;
  evictions: number;
  conservativeAspect: number;
}

export interface VisibilityBroadPhaseStats {
  denseSampleCount: number;
  authoritativeSampleCount: number;
  authoredSegmentCount: number;
  volumeCount: number;
  candidateCount: number;
  objectVolumeTests: number;
  exactFrustumTests: number;
  precomputedFrustumCount: number;
  satAxisTests: number;
  satTemporaryAllocations: number;
  obbCacheEntries: number;
  obbCacheHits: number;
}

interface Bounds3 {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  rotationY?: number;
}

const CONTENT = Object.freeze({
  about: true,
  projects: true,
  research: true,
  finale: true,
} as const);

interface StaticVisibilitySource {
  buildings: Placement[];
  props: Placement[];
  skyline: SkyBox[];
  furniture: StreetFurniture;
  crowd: CrowdLayout;
  streetDressing: StreetDressingLayout;
  signs: SignPlacement[];
}

let cachedStaticVisibilitySource: StaticVisibilitySource | undefined;
let cachedBuildingsSource: Placement[] | undefined;
let cachedAntiVoidMetrics: TypedAntiVoidMetric[] | undefined;
export const VISIBILITY_LAYOUT_CACHE_LIMIT = 4;
const VISIBILITY_ASPECT_BUCKETS_PER_UNIT = 64;
const visibilityLayoutsCache = new Map<string, VisibilityLayouts>();
let visibilityLayoutCacheEvictions = 0;

const STATIC_FILLER_SAFETY = Object.freeze({
  minimumGroundRoadMargin: 1,
  protectedFootprintMargin: 1,
  shibuyaSightlineMargin: 1,
  researchSightlineMargin: 1,
  aboutSightlineMargin: 1,
  shorelineMargin: 1,
  minimumNeighborGap: 1,
  attachedParentCount: 1,
});

const STATIC_CANYON_FILLERS: CanyonFiller[] = [
  { id: 'cinematic-canyon-filler:0', position: [-100.89986210727133, 0, -198.03961388191254], size: [18, 51.66473842404104, 10], rotationY: -3.016800064462624, sourceProbeIds: ['production-rig:key:about-constant-reveal:probe:0'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:1', position: [-72.00571660516196, 0, -254.89618662953006], size: [70, 57.336, 14], rotationY: -3.1102479055311836, sourceProbeIds: ['production-rig:key:about-constant-reveal:probe:1', 'production-rig:key:about-constant-reveal:probe:0'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:2', position: [-37.49621842241419, 0, -111.23636920033832], size: [6, 34.08989646003663, 4], rotationY: 3.047803574188131, sourceProbeIds: ['production-rig:key:about-constant-reveal:probe:3'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:3', position: [316.719673094181, 0, -192.26870604704786], size: [18, 57.86, 10], rotationY: 2.0565813902033483, sourceProbeIds: ['production-rig:key:projects-1:probe:0'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:4', position: [318.5074895466804, 0, -163.6814419385351], size: [24, 67.202, 12], rotationY: 1.8638178692800127, sourceProbeIds: ['production-rig:key:projects-1:probe:1', 'production-rig:key:projects-3:probe:3'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:5', position: [319.0128234877855, 0, -94.66094669141263], size: [18, 84, 10], rotationY: 1.3482641026434279, sourceProbeIds: ['production-rig:key:projects-1:probe:3'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:6', position: [318.58931318484844, 0, -59.84249860199193], size: [14, 84, 8], rotationY: 1.0847806865040497, sourceProbeIds: ['production-rig:key:projects-1:probe:4'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:7', position: [316.38146982095395, 0, -265.39709783737436], size: [24, 84, 12], rotationY: 2.078335536780666, sourceProbeIds: ['production-rig:key:projects-3:probe:0'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:8', position: [317.6843415034587, 0, -245.5154764447119], size: [10, 84, 6], rotationY: 1.948918924482724, sourceProbeIds: ['production-rig:key:projects-3:probe:1', 'production-rig:key:projects-5:probe:3'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:9', position: [316.38146982095395, 0, -122.60290216262563], size: [30, 84, 14], rotationY: 1.063257116809127, sourceProbeIds: ['production-rig:key:projects-3:probe:4'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:10', position: [317.9483710020386, 0, -337.03518720494134], size: [30, 67.202, 14], rotationY: 1.931620082552508, sourceProbeIds: ['production-rig:key:projects-5:probe:0', 'production-rig:key:projects-5:probe:1'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:11', position: [318.6516241144906, 0, -218.9406516269093], size: [18, 57.336, 10], rotationY: 1.0845499081676044, sourceProbeIds: ['production-rig:key:projects-5:probe:4'], triangles: 12, safety: STATIC_FILLER_SAFETY },
  { id: 'cinematic-canyon-filler:12', position: [265.38260397621286, 0, -570.1787374474948], size: [6, 41.686, 4], rotationY: 2.7649797853389, sourceProbeIds: ['production-rig:key:research-22:probe:0', 'production-rig:key:research-21:probe:1'], triangles: 12, safety: STATIC_FILLER_SAFETY },
];

/**
 * Building placements only (~1s of work). Split out from the full source so the
 * synchronous City mount can render structure (buildings + procedural shells)
 * without also paying for the ~1.5s of street dressing / crowd / props / signs
 * generation up front — those are deferred to idle by the caller.
 */
function buildingsSource(): Placement[] {
  if (!cachedBuildingsSource) cachedBuildingsSource = buildCityLayout();
  return cachedBuildingsSource;
}

function staticVisibilitySource(): StaticVisibilitySource {
  if (cachedStaticVisibilitySource) return cachedStaticVisibilitySource;
  const buildings = buildingsSource();
  cachedStaticVisibilitySource = {
    buildings,
    props: buildProps(),
    skyline: buildSkyline(),
    furniture: buildStreetFurniture(),
    crowd: buildCrowdLayout(),
    streetDressing: buildStreetDressingLayout(),
    signs: buildSignLayout(buildings),
  };
  return cachedStaticVisibilitySource;
}

function staticAntiVoidMetrics(
  buildings: Placement[],
): TypedAntiVoidMetric[] {
  if (cachedAntiVoidMetrics) return cachedAntiVoidMetrics;
  const envelope = boundedVisibilityEnvelope(
    buildAuthoredVisibilitySweep(PRODUCTION_VISIBILITY_VIEWPORT),
  );
  cachedAntiVoidMetrics = evaluateTypedAntiVoidCoverage(
    envelope,
    buildings,
    STATIC_CANYON_FILLERS,
  );
  return cachedAntiVoidMetrics;
}

function visibilityAudit(
  values: Omit<VisibilityLayouts['audit'], 'antiVoid' | 'visibilityCache'>,
  cache: VisibilityCacheStats,
  antiVoid: () => TypedAntiVoidMetric[],
): VisibilityLayouts['audit'] {
  const audit = {
    ...values,
    antiVoid: [] as TypedAntiVoidMetric[],
    visibilityCache: cache,
  };
  Object.defineProperty(audit, 'antiVoid', {
    enumerable: true,
    get: antiVoid,
  });
  return audit;
}

export function resolveVisibilityProfile(search: string): VisibilityProfile {
  const params = new URLSearchParams(search);
  return params.has('fullcity')
    || params.get('profile') === 'full'
    ? 'full'
    : 'cinematic';
}

/**
 * Fast mount layout: buildings only (~1s), every detail sub-layout empty. Lets
 * the City render structure + procedural shells immediately; the caller swaps in
 * {@link buildInitialVisibilityLayoutFull} from idle so the ~1.5s of dressing /
 * crowd / props / signs generation never blocks the first 3D frame.
 */
export function buildInitialVisibilityLayout(): VisibilityLayout {
  const buildings = buildingsSource();
  const base = {
    profile: 'full' as const,
    buildings,
    buildingSourceIndices: buildings.map((_, index) => index),
    canyonFillers: [],
    props: [],
    skyline: [],
    furniture: { lamps: [], poles: [], cables: [] },
    crowd: { humans: [], robots: [] },
    streetDressing: { manholes: [], cans: [], cones: [] },
    signs: [],
    content: CONTENT,
  };
  return {
    ...base,
    estimatedDrawObjects: drawEstimate(base),
  };
}

/** Full mount layout (buildings + all detail sub-layouts). Runs the ~1.5s of
 * sub-layout generation; call from idle after first paint, not at mount. */
export function buildInitialVisibilityLayoutFull(): VisibilityLayout {
  const source = staticVisibilitySource();
  const buildings = source.buildings;
  const base = {
    profile: 'full' as const,
    buildings,
    buildingSourceIndices: buildings.map((_, index) => index),
    canyonFillers: [],
    props: source.props,
    skyline: source.skyline,
    furniture: source.furniture,
    crowd: source.crowd,
    streetDressing: source.streetDressing,
    signs: source.signs,
    content: CONTENT,
  };
  return {
    ...base,
    estimatedDrawObjects: drawEstimate(base),
  };
}

function poseSample(
  id: string,
  source: string,
  shotGroup: ProductionShotGroup,
  kind: ProductionCameraSample['kind'],
  t: number,
  pose: {
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  },
  aspect: number,
  cutAfter = false,
  coverageNdcMargin = 0,
  coverageWorldExpansion = 0,
): ProductionCameraSample {
  return {
    id,
    source,
    shotGroup,
    kind,
    t,
    position: pose.position.toArray() as [number, number, number],
    target: pose.target.toArray() as [number, number, number],
    fov: pose.fov,
    aspect,
    cutAfter,
    coverageNdcMargin,
    coverageWorldExpansion,
  };
}

interface SweepRig {
  getKeyframes: () => readonly {
    t: number;
    id?: string;
    mode?: CameraInterpolationMode;
  }[];
  sample: (t: number) => CamPose;
}

function viewDirection(pose: CamPose): THREE.Vector3 {
  return pose.target.clone().sub(pose.position).normalize();
}

function poseGap(first: CamPose, second: CamPose) {
  return {
    position: first.position.distanceTo(second.position),
    viewAngleDegrees: THREE.MathUtils.radToDeg(
      viewDirection(first).angleTo(viewDirection(second)),
    ),
    fovDegrees: Math.abs(first.fov - second.fov),
  };
}

function adaptiveSegmentDivisions(
  rig: SweepRig,
  startT: number,
  endT: number,
): number {
  let divisions = Math.max(
    2,
    Math.ceil((endT - startT) / SWEEP_LIMITS.semanticT),
  );
  for (let iteration = 0; iteration < 20; iteration += 1) {
    let withinLimits = true;
    let previous = rig.sample(startT);
    for (let index = 1; index <= divisions; index += 1) {
      const t = THREE.MathUtils.lerp(startT, endT, index / divisions);
      const current = rig.sample(t);
      const gap = poseGap(previous, current);
      if (
        gap.position > SWEEP_LIMITS.position
        || gap.viewAngleDegrees > SWEEP_LIMITS.viewAngleDegrees
        || gap.fovDegrees > SWEEP_LIMITS.fovDegrees
      ) {
        withinLimits = false;
        break;
      }
      previous = current;
    }
    if (withinLimits) return divisions;
    divisions *= 2;
  }
  throw new Error(`Camera sweep failed to converge for ${startT}..${endT}`);
}

function sampleRig(
  source: string,
  rig: SweepRig,
  aspect: number,
): ProductionCameraSample[] {
  const keys = rig.getKeyframes();
  const samples: ProductionCameraSample[] = [];
  keys.forEach((key, keyIndex) => {
    samples.push(poseSample(
      `${source}:key:${keyIndex}`,
      source,
      productionCameraSectionAt(key.t),
      'key',
      key.t,
      rig.sample(key.t),
      aspect,
      key.mode === 'cut',
    ));
    samples[samples.length - 1].id =
      `${source}:key:${key.id ?? keyIndex}`;
    const next = keys[keyIndex + 1];
    if (!next) return;
    if (key.mode === 'cut') return;
    const divisions = adaptiveSegmentDivisions(rig, key.t, next.t);
    for (let division = 1; division < divisions; division += 1) {
      const fraction = division / divisions;
      const t = THREE.MathUtils.lerp(key.t, next.t, fraction);
      samples.push(poseSample(
        `${source}:segment:${keyIndex}:${division}`,
        source,
        productionCameraSectionAt(t),
        'interpolation',
        t,
        rig.sample(t),
        aspect,
      ));
    }
  });
  return samples;
}

export function buildProductionCameraSweep(
  viewport: { width: number; height: number } = PRODUCTION_VISIBILITY_VIEWPORT,
): ProductionCameraSweep {
  const aspect = viewport.width / viewport.height;
  const runtimeRig = buildProductionCameraRig();
  const samples = sampleRig(
    'production-rig',
    {
      getKeyframes: () => PRODUCTION_CAMERA_KEYS,
      sample: (t) => runtimeRig.sample(t),
    },
    aspect,
  );
  let maximumPositionGap = 0;
  let maximumSemanticTGap = 0;
  let maximumViewAngleGapDegrees = 0;
  let maximumFovGapDegrees = 0;
  let minimumFov = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    minimumFov = Math.min(minimumFov, sample.fov);
    if (index === 0) return;
    const previous = samples[index - 1];
    if (previous.cutAfter) return;
    maximumSemanticTGap = Math.max(
      maximumSemanticTGap,
      sample.t - previous.t,
    );
    const gap = poseGap(
      {
        position: new THREE.Vector3(...previous.position),
        target: new THREE.Vector3(...previous.target),
        fov: previous.fov,
      },
      {
        position: new THREE.Vector3(...sample.position),
        target: new THREE.Vector3(...sample.target),
        fov: sample.fov,
      },
    );
    maximumPositionGap = Math.max(maximumPositionGap, gap.position);
    maximumViewAngleGapDegrees = Math.max(
      maximumViewAngleGapDegrees,
      gap.viewAngleDegrees,
    );
    maximumFovGapDegrees = Math.max(maximumFovGapDegrees, gap.fovDegrees);
  });
  const maximumUnsampledNdcError = Math.tan(THREE.MathUtils.degToRad(
    maximumViewAngleGapDegrees + maximumFovGapDegrees / 2,
  )) / Math.tan(THREE.MathUtils.degToRad(minimumFov / 2));
  return {
    viewport: { ...viewport },
    aspect,
    samples,
    bounds: {
      semanticTErrorLimit: SWEEP_LIMITS.semanticT,
      positionErrorLimit: SWEEP_LIMITS.position,
      viewAngleErrorLimitDegrees: SWEEP_LIMITS.viewAngleDegrees,
      fovErrorLimitDegrees: SWEEP_LIMITS.fovDegrees,
      maximumPositionGap,
      maximumSemanticTGap,
      maximumViewAngleGapDegrees,
      maximumFovGapDegrees,
      maximumUnsampledNdcError,
      worldBoundsExpansion: maximumPositionGap,
    },
  };
}

function buildAuthoredVisibilitySweep(
  viewport: { width: number; height: number },
): ProductionCameraSweep {
  const aspect = viewport.width / viewport.height;
  const rig = buildProductionCameraRig();
  const samples: ProductionCameraSample[] = [];
  PRODUCTION_CAMERA_KEYS.forEach((cameraKey, keyIndex) => {
    samples.push(poseSample(
      `production-rig:key:${cameraKey.id}`,
      'production-rig',
      productionCameraSectionAt(cameraKey.t),
      'key',
      cameraKey.t,
      rig.sample(cameraKey.t),
      aspect,
      cameraKey.mode === 'cut',
    ));
    const next = PRODUCTION_CAMERA_KEYS[keyIndex + 1];
    if (!next || cameraKey.mode === 'cut') return;
    for (let probe = 1; probe < 5; probe += 1) {
      const t = THREE.MathUtils.lerp(cameraKey.t, next.t, probe / 5);
      samples.push(poseSample(
        `authored-segment:${keyIndex}:${probe}`,
        'production-rig',
        productionCameraSectionAt(t),
        'interpolation',
        t,
        rig.sample(t),
        aspect,
      ));
    }
  });
  samples.sort((first, second) =>
    first.t - second.t || (first.kind === 'key' ? -1 : 1));
  let maximumPositionGap = 0;
  let maximumSemanticTGap = 0;
  let maximumViewAngleGapDegrees = 0;
  let maximumFovGapDegrees = 0;
  let minimumFov = Number.POSITIVE_INFINITY;
  samples.forEach((sample, index) => {
    minimumFov = Math.min(minimumFov, sample.fov);
    if (index === 0) return;
    const previous = samples[index - 1];
    maximumSemanticTGap = Math.max(
      maximumSemanticTGap,
      sample.t - previous.t,
    );
    const gap = poseGap(
      {
        position: new THREE.Vector3(...previous.position),
        target: new THREE.Vector3(...previous.target),
        fov: previous.fov,
      },
      {
        position: new THREE.Vector3(...sample.position),
        target: new THREE.Vector3(...sample.target),
        fov: sample.fov,
      },
    );
    maximumPositionGap = Math.max(maximumPositionGap, gap.position);
    maximumViewAngleGapDegrees = Math.max(
      maximumViewAngleGapDegrees,
      gap.viewAngleDegrees,
    );
    maximumFovGapDegrees = Math.max(maximumFovGapDegrees, gap.fovDegrees);
  });
  const maximumUnsampledNdcError = Math.tan(THREE.MathUtils.degToRad(
    maximumViewAngleGapDegrees + maximumFovGapDegrees / 2,
  )) / Math.tan(THREE.MathUtils.degToRad(minimumFov / 2));
  return {
    viewport: { ...viewport },
    aspect,
    samples,
    bounds: {
      semanticTErrorLimit: 1 / 5000,
      positionErrorLimit: SWEEP_LIMITS.position,
      viewAngleErrorLimitDegrees: SWEEP_LIMITS.viewAngleDegrees,
      fovErrorLimitDegrees: SWEEP_LIMITS.fovDegrees,
      maximumPositionGap,
      maximumSemanticTGap,
      maximumViewAngleGapDegrees,
      maximumFovGapDegrees,
      maximumUnsampledNdcError,
      worldBoundsExpansion: maximumPositionGap,
    },
  };
}

function boundedVisibilityEnvelope(
  sweep: ProductionCameraSweep,
): ProductionCameraSample[] {
  // Clearance keeps its independent 5,001-sample validator. Runtime visibility is
  // bounded to every authored key plus one deterministic midpoint per semantic
  // bin so each object is never tested against thousands of nearly identical
  // frusta. Authored-segment motion expands each sampled world bound.
  const bins = Array.from(
    { length: VISIBILITY_ENVELOPE_BIN_COUNT },
    (): ProductionCameraSample[] => [],
  );
  for (const sample of sweep.samples) {
    const binIndex = Math.min(
      VISIBILITY_ENVELOPE_BIN_COUNT - 1,
      Math.floor(sample.t * VISIBILITY_ENVELOPE_BIN_COUNT),
    );
    bins[binIndex].push(sample);
  }
  const envelope = bins.flatMap((bin, index) => {
    if (bin.length === 0) return [];
    const midpointT = (bin[0].t + bin[bin.length - 1].t) / 2;
    const representative = bin.reduce((nearest, sample) =>
      Math.abs(sample.t - midpointT) < Math.abs(nearest.t - midpointT)
        ? sample
        : nearest);
    return [{
      ...representative,
      id: `visibility-bin:${index}:${representative.id}`,
      coverageNdcMargin: 0,
      coverageWorldExpansion: Math.min(sweep.bounds.worldBoundsExpansion, 2),
    }];
  });
  const keyedSamples = sweep.samples
    .filter(({ kind }) => kind === 'key')
    .map((sample) => ({
      ...sample,
      coverageNdcMargin: 0,
      coverageWorldExpansion: Math.min(sweep.bounds.worldBoundsExpansion, 2),
    }));
  return [...envelope, ...keyedSamples]
    .sort((first, second) => first.t - second.t)
    .filter((sample, index, samples) =>
      index === 0 || sample.id !== samples[index - 1].id);
}

export function buildProductionCameraEnvelope(): ProductionCameraSample[] {
  return boundedVisibilityEnvelope(buildProductionCameraSweep());
}

function boundsFromOriented(bounds: OrientedBuildingBounds): Bounds3 {
  return {
    center: new THREE.Vector3(
      bounds.center.x,
      bounds.height / 2,
      bounds.center.z,
    ),
    halfSize: new THREE.Vector3(
      bounds.halfX,
      bounds.height / 2,
      bounds.halfZ,
    ),
    rotationY: bounds.rotationY,
  };
}

interface SweptVisibilityVolume {
  origin: THREE.Vector3;
  originRadius: number;
  direction: THREE.Vector3;
  sidePlanes: readonly THREE.Vector3[];
}

interface VisibilityBroadPhase {
  volumes: SweptVisibilityVolume[];
  stats: VisibilityBroadPhaseStats;
  visibleDense(bounds: Bounds3): boolean;
  visibleBounded(bounds: Bounds3): boolean;
}

interface PreparedBounds {
  centerX: number;
  centerY: number;
  centerZ: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  cos: number;
  sin: number;
}

const VISIBILITY_BOUNDED_DETAIL_FAR = 38;

function cameraBasis(direction: THREE.Vector3): {
  right: THREE.Vector3;
  up: THREE.Vector3;
} {
  const right = direction.clone()
    .cross(new THREE.Vector3(0, 1, 0))
    .normalize();
  return {
    right,
    up: right.clone().cross(direction).normalize(),
  };
}

function boundsSupportRadius(
  bounds: PreparedBounds,
  directionX: number,
  directionY: number,
  directionZ: number,
  expansion: number,
): number {
  const localX = directionX * bounds.cos - directionZ * bounds.sin;
  const localZ = directionX * bounds.sin + directionZ * bounds.cos;
  return Math.abs(localX) * (bounds.halfX + expansion)
    + Math.abs(directionY) * (bounds.halfY + expansion)
    + Math.abs(localZ) * (bounds.halfZ + expansion);
}

function pyramidSidePlanes(
  direction: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  tangentHorizontal: number,
  tangentVertical: number,
): readonly THREE.Vector3[] {
  return [
    direction.clone().multiplyScalar(tangentHorizontal).add(right),
    direction.clone().multiplyScalar(tangentHorizontal).sub(right),
    direction.clone().multiplyScalar(tangentVertical).add(up),
    direction.clone().multiplyScalar(tangentVertical).sub(up),
  ];
}

function boundsIntersectsPyramid(
  bounds: PreparedBounds,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  sidePlanes: readonly THREE.Vector3[],
  originRadius: number,
  worldExpansion: number,
  far: number = VISIBILITY_MARGIN.far,
): boolean {
  const offsetX = bounds.centerX - origin.x;
  const offsetY = bounds.centerY - origin.y;
  const offsetZ = bounds.centerZ - origin.z;
  const depth = offsetX * direction.x
    + offsetY * direction.y
    + offsetZ * direction.z;
  const depthRadius = boundsSupportRadius(
    bounds,
    direction.x,
    direction.y,
    direction.z,
    worldExpansion,
  ) + originRadius;
  if (depth + depthRadius < VISIBILITY_MARGIN.near) return false;
  if (depth - depthRadius > far) return false;
  for (const plane of sidePlanes) {
    const distance = offsetX * plane.x + offsetY * plane.y + offsetZ * plane.z;
    const support = boundsSupportRadius(
      bounds,
      plane.x,
      plane.y,
      plane.z,
      worldExpansion,
    );
    if (distance + support + originRadius * plane.length() < 0) return false;
  }
  return true;
}

function buildVisibilityBroadPhase(
  viewport: { width: number; height: number },
  worldExpansion: number,
  envelope: readonly ProductionCameraSample[],
  authoredSweep: readonly ProductionCameraSample[],
): VisibilityBroadPhase {
  const aspect = viewport.width / viewport.height;
  const prepareSample = (sample: ProductionCameraSample) => {
    const direction = new THREE.Vector3(...sample.target)
      .sub(new THREE.Vector3(...sample.position))
      .normalize();
    const basis = cameraBasis(direction);
    const tangentVertical = Math.tan(THREE.MathUtils.degToRad(sample.fov) / 2)
      * (1 + VISIBILITY_MARGIN.ndc);
    return {
      position: new THREE.Vector3(...sample.position),
      direction,
      sidePlanes: pyramidSidePlanes(
        direction,
        basis.right,
        basis.up,
        tangentVertical * aspect,
        tangentVertical,
      ),
    };
  };
  const authoredSamples = authoredSweep.map(prepareSample);
  const boundedSamples = envelope.map(prepareSample);
  const volumes = PRODUCTION_CAMERA_KEYS.slice(0, -1).map((cameraKey, index) => {
    const next = PRODUCTION_CAMERA_KEYS[index + 1];
    const segmentSamples = authoredSamples.filter((_, sampleIndex) => {
      const t = authoredSweep[sampleIndex].t;
      return t >= cameraKey.t && t <= next.t;
    });
    const anchor = segmentSamples[0];
    let originRadius = 0;
    let tangentHorizontal = Math.tan(
      THREE.MathUtils.degToRad(
        Math.max(...authoredSweep
          .filter(({ t }) => t >= cameraKey.t && t <= next.t)
          .map(({ fov }) => fov)),
      ) / 2,
    ) * (1 + VISIBILITY_MARGIN.ndc) * aspect;
    let tangentVertical = tangentHorizontal / aspect;
    for (const sample of segmentSamples) {
      originRadius = Math.max(
        originRadius,
        anchor.position.distanceTo(sample.position),
      );
      const directionError = anchor.direction.angleTo(sample.direction);
      const angularPadding = Math.tan(directionError);
      tangentHorizontal = Math.max(
        tangentHorizontal,
        tangentHorizontal + angularPadding,
      );
      tangentVertical = Math.max(
        tangentVertical,
        tangentVertical + angularPadding,
      );
    }
    return {
      origin: anchor.position.clone(),
      originRadius,
      direction: anchor.direction.clone(),
      sidePlanes: pyramidSidePlanes(
        anchor.direction,
        cameraBasis(anchor.direction).right,
        cameraBasis(anchor.direction).up,
        tangentHorizontal,
        tangentVertical,
      ),
    };
  });
  const stats: VisibilityBroadPhaseStats = {
    denseSampleCount: authoredSweep.length,
    authoritativeSampleCount: 5001,
    authoredSegmentCount: PRODUCTION_CAMERA_KEYS.length - 1,
    volumeCount: volumes.length,
    candidateCount: 0,
    objectVolumeTests: 0,
    exactFrustumTests: 0,
    precomputedFrustumCount: authoredSweep.length,
    satAxisTests: 0,
    satTemporaryAllocations: 0,
    obbCacheEntries: 0,
    obbCacheHits: 0,
  };
  const preparedBounds = new WeakMap<Bounds3, PreparedBounds>();
  const prepareBounds = (bounds: Bounds3): PreparedBounds => {
    const cached = preparedBounds.get(bounds);
    if (cached) {
      stats.obbCacheHits += 1;
      return cached;
    }
    const rotation = bounds.rotationY ?? 0;
    const prepared: PreparedBounds = {
      centerX: bounds.center.x,
      centerY: bounds.center.y,
      centerZ: bounds.center.z,
      halfX: bounds.halfSize.x,
      halfY: bounds.halfSize.y,
      halfZ: bounds.halfSize.z,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
    };
    preparedBounds.set(bounds, prepared);
    stats.obbCacheEntries += 1;
    return prepared;
  };
  return {
    volumes,
    stats,
    visibleDense(bounds: Bounds3): boolean {
      stats.candidateCount += 1;
      const prepared = prepareBounds(bounds);
      for (const volume of volumes) {
        stats.objectVolumeTests += 1;
        if (!boundsIntersectsPyramid(
          prepared,
          volume.origin,
          volume.direction,
          volume.sidePlanes,
          volume.originRadius,
          0,
        )) continue;
        return true;
      }
      // Analytic segment volumes are deliberately conservative. A miss cannot
      // prove a static building absent from every runtime frame, so retain it.
      return true;
    },
    visibleBounded(bounds: Bounds3): boolean {
      stats.candidateCount += 1;
      const prepared = prepareBounds(bounds);
      for (const sample of boundedSamples) {
        stats.objectVolumeTests += 1;
        if (boundsIntersectsPyramid(
          prepared,
          sample.position,
          sample.direction,
          sample.sidePlanes,
          0,
          Math.min(worldExpansion, 2),
          VISIBILITY_BOUNDED_DETAIL_FAR,
        )) return true;
      }
      return false;
    },
  };
}

function pointBounds(
  x: number,
  y: number,
  z: number,
  radius: number,
  height = radius * 2,
): Bounds3 {
  return {
    center: new THREE.Vector3(x, y + height / 2, z),
    halfSize: new THREE.Vector3(radius, height / 2, radius),
  };
}

function outsideRouteSafetyBand(x: number, z: number, radius = 0): boolean {
  return groundRoadClearance(x, z) - radius > VISIBILITY_MARGIN.routeSafetyBand;
}

function essentialBuilding(placement: Placement): boolean {
  return ALWAYS_KEEP_BUILDING_ROLES.includes(
    placement.layoutRole as typeof ALWAYS_KEEP_BUILDING_ROLES[number],
  );
}

function removal(
  id: string,
  category: VisibilityCategory,
): VisibilityRemoval {
  return {
    id,
    category,
    outsideEveryExpandedFrustum: true,
    safetyProtected: false,
  };
}

function retention(
  id: string,
  category: VisibilityCategory,
  reason: VisibilityRetention['reason'],
): VisibilityRetention {
  return { id, category, reason };
}

function signParentIndex(sign: SignPlacement): number {
  return sign.mode === 'facade'
    ? sign.parentIndex
    : Number(sign.emitter.parentId.replace('building-', ''));
}

function signBounds(sign: SignPlacement): Bounds3 {
  const extraHeight = sign.mode === 'hologram'
    ? sign.beam.height + sign.emitter.height
    : 0;
  return pointBounds(
    sign.position[0],
    sign.position[1] - sign.height / 2 - extraHeight,
    sign.position[2],
    sign.width / 2,
    sign.height + extraHeight,
  );
}

function crowdBounds(spot: CrowdSpot): Bounds3 {
  return pointBounds(spot.x, 0, spot.z, 0.8, 2);
}

function dressingBounds(spot: StreetDressingSpot): Bounds3 {
  return pointBounds(spot.x, 0, spot.z, spot.radius, 1.2);
}

function cableBounds(
  cable: StreetFurniture['cables'][number],
): Bounds3 {
  const min = new THREE.Vector3(
    Math.min(cable.a.x, cable.b.x),
    Math.min(cable.a.y, cable.b.y) - 2.2,
    Math.min(cable.a.z, cable.b.z),
  );
  const max = new THREE.Vector3(
    Math.max(cable.a.x, cable.b.x),
    Math.max(cable.a.y, cable.b.y),
    Math.max(cable.a.z, cable.b.z),
  );
  return {
    center: min.clone().add(max).multiplyScalar(0.5),
    halfSize: max.clone().sub(min).multiplyScalar(0.5)
      .addScalar(0.1),
  };
}

function poleKey(
  position: { x: number; z: number },
  roadIndex: number,
): string {
  return `${position.x}:${position.z}:${roadIndex}`;
}

function filterFurniture(
  full: StreetFurniture,
  broadPhase: VisibilityBroadPhase,
  removed: VisibilityRemoval[],
): StreetFurniture {
  const lamps = full.lamps.filter((lamp, index) => {
    const visible = broadPhase.visibleBounded(
      pointBounds(lamp.pos.x, 0, lamp.pos.z, 1.8, 9.5),
    );
    if (!visible) {
      removed.push(removal(`lamp:${index}`, 'lamp'));
      return false;
    }
    return true;
  });
  const retainedPoleKeys = new Set<string>();
  const visibleCables = full.cables.filter((cable, index) => {
    const visible = broadPhase.visibleBounded(cableBounds(cable));
    if (!visible) removed.push(removal(`cable:${index}`, 'cable'));
    return visible;
  });
  for (const cable of visibleCables) {
    retainedPoleKeys.add(poleKey(cable.a, cable.aRoadIndex));
    retainedPoleKeys.add(poleKey(cable.b, cable.bRoadIndex));
  }
  const poles = full.poles.filter((pole, index) => {
    const key = poleKey(pole.pos, pole.roadIndex);
    const visible = broadPhase.visibleBounded(
      pointBounds(pole.pos.x, 0, pole.pos.z, 0.5, 13),
    );
    if (!visible && !retainedPoleKeys.has(key)) {
      removed.push(removal(`pole:${index}`, 'pole'));
      return false;
    }
    retainedPoleKeys.add(key);
    return true;
  });
  const cables = visibleCables.filter((cable, index) => {
    const retained = retainedPoleKeys.has(poleKey(cable.a, cable.aRoadIndex))
      && retainedPoleKeys.has(poleKey(cable.b, cable.bRoadIndex));
    if (!retained) removed.push(removal(`cable:${index}`, 'cable'));
    return retained;
  });
  return { lamps, poles, cables };
}

function categoryBudget(
  triangles: number,
  instances: number,
  estimatedDrawObjects: number,
): VisibilityBudget['byCategory'][string] {
  return { triangles, instances, estimatedDrawObjects };
}

function uniqueFiles(placements: readonly Placement[]): number {
  return new Set(placements.map(({ file }) => file)).size;
}

function humanDrawObjects(humans: CrowdLayout['humans']): number {
  return buildModelSpatialBuckets(humans.map((human) => ({
    file: human.file,
    position: [human.x, 0, human.z] as [number, number, number],
  }))).reduce((sum, bucket) =>
    sum + (RENDERED_ASSET_CATALOG.get(bucket.file)?.drawPrimitives ?? 1), 0);
}

function robotDrawObjects(robots: CrowdLayout['robots']): number {
  return robots.reduce((sum, robot) =>
    sum + (RENDERED_ASSET_CATALOG.get(robot.file)?.drawPrimitives ?? 1), 0);
}

function drawEstimate(layout: Omit<VisibilityLayout, 'estimatedDrawObjects'>): number {
  return uniqueFiles(layout.buildings)
    + uniqueFiles(layout.props)
    + Math.min(2, layout.skyline.length)
    + (layout.furniture.lamps.length > 0 ? 2 : 0)
    + (layout.furniture.poles.length > 0 ? 1 : 0)
    + (layout.furniture.cables.length > 0 ? 1 : 0)
    + humanDrawObjects(layout.crowd.humans)
    + robotDrawObjects(layout.crowd.robots)
    + layout.streetDressing.manholes.length
    + layout.streetDressing.cans.length
    + layout.streetDressing.cones.length
    + (layout.signs.length > 0 ? 16 : 0)
    + (layout.canyonFillers.length > 0 ? 1 : 0);
}

export function estimateVisibilityBudget(
  layout: VisibilityLayout,
): VisibilityBudget {
  const buildingTriangles = layout.buildings.reduce((sum, placement) =>
    sum + (BUILDING_CATALOG.get(placement.file)?.triangles ?? 0), 0);
  const propTriangles = layout.props.reduce((sum, placement) =>
    sum + (RENDERED_ASSET_CATALOG.get(placement.file)?.triangles ?? 0), 0);
  const humanTriangles = layout.crowd.humans.reduce((sum, human) =>
    sum + (RENDERED_ASSET_CATALOG.get(human.file)?.triangles ?? 4_000), 0);
  const robotTriangles = layout.crowd.robots.reduce((sum, robot) =>
    sum + (RENDERED_ASSET_CATALOG.get(robot.file)?.triangles ?? 1_500), 0);
  const byCategory = {
    buildings: categoryBudget(
      buildingTriangles,
      layout.buildings.length,
      uniqueFiles(layout.buildings),
    ),
    props: categoryBudget(
      propTriangles,
      layout.props.length,
      uniqueFiles(layout.props),
    ),
    skyline: categoryBudget(
      layout.skyline.length * 12,
      layout.skyline.length,
      Math.min(2, layout.skyline.length),
    ),
    furniture: categoryBudget(
      layout.furniture.lamps.length * 36
        + layout.furniture.poles.length * 24
        + layout.furniture.cables.length * 80,
      layout.furniture.lamps.length
        + layout.furniture.poles.length
        + layout.furniture.cables.length,
      (layout.furniture.lamps.length > 0 ? 2 : 0)
        + (layout.furniture.poles.length > 0 ? 1 : 0)
        + (layout.furniture.cables.length > 0 ? 1 : 0),
    ),
    crowd: categoryBudget(
      humanTriangles + robotTriangles,
      layout.crowd.humans.length + layout.crowd.robots.length,
      humanDrawObjects(layout.crowd.humans)
        + robotDrawObjects(layout.crowd.robots),
    ),
    streetDressing: categoryBudget(
      layout.streetDressing.manholes.length * 30
        + layout.streetDressing.cans.length * 40
        + layout.streetDressing.cones.length * 16,
      layout.streetDressing.manholes.length
        + layout.streetDressing.cans.length
        + layout.streetDressing.cones.length,
      layout.streetDressing.manholes.length
        + layout.streetDressing.cans.length
        + layout.streetDressing.cones.length,
    ),
    signs: categoryBudget(
      layout.signs.reduce((sum, sign) =>
        sum + (sign.mode === 'facade' ? 26 : 162), 0),
      layout.signs.length,
      layout.signs.length > 0 ? 16 : 0,
    ),
    canyonFillers: categoryBudget(
      layout.canyonFillers.reduce((sum, filler) =>
        sum + filler.triangles, 0),
      layout.canyonFillers.length,
      layout.canyonFillers.length > 0 ? 1 : 0,
    ),
  };
  return {
    triangles: Object.values(byCategory).reduce((sum, value) =>
      sum + value.triangles, 0),
    instances: Object.values(byCategory).reduce((sum, value) =>
      sum + value.instances, 0),
    estimatedDrawObjects: Object.values(byCategory).reduce((sum, value) =>
      sum + value.estimatedDrawObjects, 0),
    byCategory,
  };
}

export function buildVisibilityLayouts(
  viewport: { width: number; height: number } = PRODUCTION_VISIBILITY_VIEWPORT,
): VisibilityLayouts {
  const aspect = viewport.width / viewport.height;
  const conservativeAspect = Math.ceil(
    aspect * VISIBILITY_ASPECT_BUCKETS_PER_UNIT,
  ) / VISIBILITY_ASPECT_BUCKETS_PER_UNIT;
  const cacheKey = conservativeAspect.toFixed(6);
  const cached = visibilityLayoutsCache.get(cacheKey);
  if (cached) {
    visibilityLayoutsCache.delete(cacheKey);
    visibilityLayoutsCache.set(cacheKey, cached);
    return {
      ...cached,
      sweep: {
        ...cached.sweep,
        viewport: { ...viewport },
        aspect,
      },
      audit: visibilityAudit(
        {
          removed: cached.audit.removed,
          retained: cached.audit.retained,
          canyonFillers: cached.audit.canyonFillers,
          visibilityBroadPhase: cached.audit.visibilityBroadPhase,
        },
        {
          key: cacheKey,
          size: visibilityLayoutsCache.size,
          limit: VISIBILITY_LAYOUT_CACHE_LIMIT,
          hit: true,
          evictions: visibilityLayoutCacheEvictions,
          conservativeAspect,
        },
        () => cached.audit.antiVoid,
      ),
    };
  }
  const geometryViewport = { width: conservativeAspect, height: 1 };
  const geometrySweep = buildAuthoredVisibilitySweep(geometryViewport);
  const sweep: ProductionCameraSweep = {
    ...geometrySweep,
    viewport: { ...viewport },
    aspect,
  };
  const envelope = boundedVisibilityEnvelope(geometrySweep);
  const broadPhase = buildVisibilityBroadPhase(
    geometryViewport,
    geometrySweep.bounds.worldBoundsExpansion,
    envelope,
    geometrySweep.samples,
  );
  const source = staticVisibilitySource();
  const fullBuildings = source.buildings;
  const fullProps = source.props;
  const fullSkyline = source.skyline;
  const fullFurniture = source.furniture;
  const fullCrowd = source.crowd;
  const fullStreetDressing = source.streetDressing;
  const fullSigns = source.signs;
  const removed: VisibilityRemoval[] = [];
  const retainedBuildingIndices = new Set<number>();
  const candidates = fullBuildings.map((placement, index) => {
    const bounds = buildingPlacementBounds(placement);
    const bounds3 = boundsFromOriented(bounds);
    const essential = essentialBuilding(placement);
    const routeOutside = outsideRouteSafetyBand(
      bounds.center.x,
      bounds.center.z,
      bounds.radius,
    );
    return {
      placement,
      index,
      bounds3,
      essential,
      routeOutside,
    };
  });
  for (const candidate of candidates) {
    if (!candidate.essential && candidate.routeOutside) continue;
    retainedBuildingIndices.add(candidate.index);
  }
  candidates
    .filter(({ essential, routeOutside }) => !essential && routeOutside)
    .forEach(({ index, bounds3 }) => {
    const visible = broadPhase.visibleDense(bounds3);
    if (visible) {
      retainedBuildingIndices.add(index);
    } else {
      removed.push(removal(`building:${index}`, 'building'));
    }
  });

  const signs = fullSigns.filter((sign) => {
    const bounds = signBounds(sign);
    const visible = broadPhase.visibleBounded(bounds);
    if (!visible) {
      removed.push(removal(`sign:${sign.id}`, 'sign'));
      return false;
    }
    retainedBuildingIndices.add(signParentIndex(sign));
    return true;
  });

  const buildings = fullBuildings.filter((_, index) =>
    retainedBuildingIndices.has(index));
  // Anti-void probes are authored once at production aspect. Buildings are
  // conservatively retained, so the static result is shared by every viewport.
  const canyonFillers = STATIC_CANYON_FILLERS;
  const props = fullProps.filter((placement, index) => {
    const bounds = renderedPlacementBounds(placement);
    const visible = broadPhase.visibleBounded(boundsFromOriented(bounds));
    if (!visible) {
      removed.push(removal(`prop:${index}`, 'prop'));
      return false;
    }
    return true;
  });
  const skyline = fullSkyline.filter((box, index) => {
    const bounds: Bounds3 = {
      center: new THREE.Vector3(box.center.x, box.height / 2, box.center.z),
      halfSize: new THREE.Vector3(box.width / 2, box.height / 2, box.depth / 2),
      rotationY: box.rotationY,
    };
    const visible = broadPhase.visibleBounded(bounds);
    if (!visible) {
      removed.push(removal(`skyline:${index}`, 'skyline'));
      return false;
    }
    return true;
  });
  const furniture = filterFurniture(
    fullFurniture,
    broadPhase,
    removed,
  );
  const humans = fullCrowd.humans.filter((spot, index) => {
    const visible = broadPhase.visibleBounded(crowdBounds(spot));
    if (!visible) {
      removed.push(removal(`crowd:human:${index}`, 'crowd'));
      return false;
    }
    return true;
  });
  const robots = fullCrowd.robots.filter((spot, index) => {
    const visible = broadPhase.visibleBounded(crowdBounds(spot));
    if (!visible) {
      removed.push(removal(`crowd:robot:${index}`, 'crowd'));
      return false;
    }
    return true;
  });
  const filterDressing = (
    spots: StreetDressingSpot[],
    kind: string,
  ): StreetDressingSpot[] => spots.filter((spot, index) => {
    const visible = broadPhase.visibleBounded(dressingBounds(spot));
    if (!visible) {
      removed.push(removal(`street-dressing:${kind}:${index}`, 'street-dressing'));
      return false;
    }
    return true;
  });
  const streetDressing = {
    manholes: filterDressing(fullStreetDressing.manholes, 'manhole'),
    cans: filterDressing(fullStreetDressing.cans, 'can'),
    cones: filterDressing(fullStreetDressing.cones, 'cone'),
  };

  const fullBase = {
    profile: 'full' as const,
    buildings: fullBuildings,
    buildingSourceIndices: fullBuildings.map((_, index) => index),
    canyonFillers,
    props: fullProps,
    skyline: fullSkyline,
    furniture: fullFurniture,
    crowd: fullCrowd,
    streetDressing: fullStreetDressing,
    signs: fullSigns,
    content: CONTENT,
  };
  const cinematicBase = {
    profile: 'cinematic' as const,
    buildings,
    buildingSourceIndices: [...retainedBuildingIndices].sort((a, b) => a - b),
    canyonFillers,
    props,
    skyline,
    furniture,
    crowd: { humans, robots },
    streetDressing,
    signs,
    content: CONTENT,
  };
  const full: VisibilityLayout = {
    ...fullBase,
    estimatedDrawObjects: drawEstimate(fullBase),
  };
  const cinematic: VisibilityLayout = {
    ...cinematicBase,
    estimatedDrawObjects: drawEstimate(cinematicBase),
  };
  const auditedRemoved = removed.filter((entry) =>
    entry.category !== 'building'
    || !retainedBuildingIndices.has(
      Number(entry.id.replace('building:', '')),
    ));
  const retained: VisibilityRetention[] = [];
  cinematic.buildingSourceIndices.forEach((sourceIndex) => {
    const candidate = candidates[sourceIndex];
    const visible = broadPhase.visibleDense(candidate.bounds3);
    retained.push(retention(
      `building:${sourceIndex}`,
      'building',
      visible
        ? 'intersects-final-expanded-frustum'
        : candidate.essential || !candidate.routeOutside
          ? 'safety-protected'
          : 'dependency-protected',
    ));
  });
  props.forEach((placement) => retained.push(retention(
    `prop:${fullProps.indexOf(placement)}`,
    'prop',
    'intersects-final-expanded-frustum',
  )));
  skyline.forEach((box) => retained.push(retention(
    `skyline:${fullSkyline.indexOf(box)}`,
    'skyline',
    'intersects-final-expanded-frustum',
  )));
  furniture.lamps.forEach((lamp) => retained.push(retention(
    `lamp:${fullFurniture.lamps.indexOf(lamp)}`,
    'lamp',
    'intersects-final-expanded-frustum',
  )));
  furniture.poles.forEach((pole) => {
    const bounds = pointBounds(pole.pos.x, 0, pole.pos.z, 0.5, 13);
    retained.push(retention(
      `pole:${fullFurniture.poles.indexOf(pole)}`,
      'pole',
      broadPhase.visibleBounded(bounds)
        ? 'intersects-final-expanded-frustum'
        : 'dependency-protected',
    ));
  });
  furniture.cables.forEach((cable) => retained.push(retention(
    `cable:${fullFurniture.cables.indexOf(cable)}`,
    'cable',
    'intersects-final-expanded-frustum',
  )));
  humans.forEach((spot) => retained.push(retention(
    `crowd:human:${fullCrowd.humans.indexOf(spot)}`,
    'crowd',
    'intersects-final-expanded-frustum',
  )));
  robots.forEach((spot) => retained.push(retention(
    `crowd:robot:${fullCrowd.robots.indexOf(spot)}`,
    'crowd',
    'intersects-final-expanded-frustum',
  )));
  for (const [kind, retainedSpots, fullSpots] of [
    ['manhole', streetDressing.manholes, fullStreetDressing.manholes],
    ['can', streetDressing.cans, fullStreetDressing.cans],
    ['cone', streetDressing.cones, fullStreetDressing.cones],
  ] as const) {
    retainedSpots.forEach((spot) => retained.push(retention(
      `street-dressing:${kind}:${fullSpots.indexOf(spot)}`,
      'street-dressing',
      'intersects-final-expanded-frustum',
    )));
  }
  signs.forEach((sign) => retained.push(retention(
    `sign:${sign.id}`,
    'sign',
    'intersects-final-expanded-frustum',
  )));
  const layouts: VisibilityLayouts = {
    sweep,
    envelope,
    full,
    cinematic,
    audit: visibilityAudit(
      {
        removed: auditedRemoved,
        retained,
        canyonFillers,
        visibilityBroadPhase: { ...broadPhase.stats },
      },
      {
        key: cacheKey,
        size: 0,
        limit: VISIBILITY_LAYOUT_CACHE_LIMIT,
        hit: false,
        evictions: visibilityLayoutCacheEvictions,
        conservativeAspect,
      },
      () => staticAntiVoidMetrics(fullBuildings),
    ),
  };
  if (visibilityLayoutsCache.size >= VISIBILITY_LAYOUT_CACHE_LIMIT) {
    const oldest = visibilityLayoutsCache.keys().next().value;
    if (oldest !== undefined) {
      visibilityLayoutsCache.delete(oldest);
      visibilityLayoutCacheEvictions += 1;
    }
  }
  visibilityLayoutsCache.set(cacheKey, layouts);
  return {
    ...layouts,
    audit: visibilityAudit(
      {
        removed: layouts.audit.removed,
        retained: layouts.audit.retained,
        canyonFillers: layouts.audit.canyonFillers,
        visibilityBroadPhase: layouts.audit.visibilityBroadPhase,
      },
      {
        ...layouts.audit.visibilityCache,
        size: visibilityLayoutsCache.size,
        evictions: visibilityLayoutCacheEvictions,
      },
      () => layouts.audit.antiVoid,
    ),
  };
}
