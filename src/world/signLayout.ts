import {
  buildingPlacementBounds,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import { buildCityLayout, type Placement } from './cityLayout';
import {
  groundRoadClearance,
  groundRoadMemberships,
  keepClear,
  protectedFootprintClearance,
} from './roads';
import { buildShibuyaSightCorridors } from './intersections';
import { bridgeCorridorFootprintClearance } from './bridgeLayout';

export const FACADE_SCREEN_OFFSET = 0.12;
export const FACADE_SIGN_TARGET = 120;

type Vec2 = [number, number];
type Vec3 = [number, number, number];

export interface FacadeGeometry {
  planeCenter: Vec3;
  normal: Vec2;
  tangent: Vec2;
  normalHalfExtent: number;
  renderedWidth: number;
  renderedHeight: number;
  horizontalMargin: number;
  safeBottom: number;
  safeTop: number;
  band: number;
  bandBottom: number;
  bandTop: number;
  screenOffset: number;
}

interface SignBase {
  id: string;
  position: Vec3;
  rotationY: number;
  width: number;
  height: number;
  textureIndex: number;
}

export interface FacadeSignPlacement extends SignBase {
  mode: 'facade';
  parentId: string;
  parentKey: string;
  parentIndex: number;
  parentFile: string;
  facade: FacadeGeometry;
}

export type HologramZone = 'shibuya' | 'bridge-shoulder';

export interface HologramSignPlacement extends SignBase {
  mode: 'hologram';
  anchorId: HologramAnchorId;
  zone: HologramZone;
  emitter: {
    kind: 'roof';
    position: Vec3;
    radius: number;
    height: number;
    parentId: string;
  };
  beam: {
    position: Vec3;
    radius: number;
    height: number;
  };
}

export type SignPlacement = FacadeSignPlacement | HologramSignPlacement;

export interface HologramComponentFootprint {
  component: 'emitter' | 'beam' | 'panel';
  position: Vec3;
  radius: number;
}

export interface HologramFootprintSafety extends HologramComponentFootprint {
  roadMargin: number;
  protectedMargin: number;
  bridgeMargin: number;
  sightlineMargin: number;
}

interface FacadeFace {
  normal: Vec2;
  tangent: Vec2;
  normalHalfExtent: number;
  tangentHalfExtent: number;
  rotationY: number;
}

interface FacadeCandidate {
  parent: Placement;
  parentIndex: number;
  bounds: OrientedBuildingBounds;
  face: FacadeFace;
  planeCenter: Vec3;
}

interface ShibuyaAnchorSpec {
  id: string;
  zone: 'shibuya';
  approach: NonNullable<Placement['shibuyaApproach']>;
  side: -1 | 1;
  distance: number;
}

interface BridgeAnchorSpec {
  id: string;
  zone: 'bridge-shoulder';
  target: Vec2;
}

const SHIBUYA_ANCHORS = [
  { id: 'shibuya-west-low', zone: 'shibuya', approach: 'west', side: 1, distance: 16 },
  { id: 'shibuya-west-mid', zone: 'shibuya', approach: 'west', side: 1, distance: 53 },
  { id: 'shibuya-west-high', zone: 'shibuya', approach: 'west', side: 1, distance: 90 },
  { id: 'shibuya-north-left-low', zone: 'shibuya', approach: 'north', side: -1, distance: 41 },
  { id: 'shibuya-north-left-high', zone: 'shibuya', approach: 'north', side: -1, distance: 78 },
  { id: 'shibuya-north-right', zone: 'shibuya', approach: 'north', side: 1, distance: 41 },
  { id: 'shibuya-east-left-low', zone: 'shibuya', approach: 'east', side: -1, distance: 41 },
  { id: 'shibuya-east-left-high', zone: 'shibuya', approach: 'east', side: -1, distance: 78 },
  { id: 'shibuya-east-right', zone: 'shibuya', approach: 'east', side: 1, distance: 41 },
  { id: 'shibuya-south-left', zone: 'shibuya', approach: 'south', side: 1, distance: 16 },
  { id: 'shibuya-south-right-mid', zone: 'shibuya', approach: 'south', side: -1, distance: 53 },
  { id: 'shibuya-south-right-high', zone: 'shibuya', approach: 'south', side: -1, distance: 90 },
] as const satisfies readonly ShibuyaAnchorSpec[];

const BRIDGE_ANCHORS = [
  { id: 'bridge-west-approach', zone: 'bridge-shoulder', target: [105, -575] },
  { id: 'bridge-east-approach', zone: 'bridge-shoulder', target: [375, -575] },
  { id: 'bridge-west-horizon', zone: 'bridge-shoulder', target: [85, -690] },
  { id: 'bridge-east-horizon', zone: 'bridge-shoulder', target: [395, -690] },
] as const satisfies readonly BridgeAnchorSpec[];

const HOLOGRAM_ANCHORS = [...SHIBUYA_ANCHORS, ...BRIDGE_ANCHORS] as const;
export type HologramAnchorId = typeof HOLOGRAM_ANCHORS[number]['id'];
export const HOLOGRAM_ANCHOR_IDS = HOLOGRAM_ANCHORS.map(({ id }) => id);

function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * Select the road-facing face from the rendered building OBB. The result uses
 * the same local axes and exact centre offset as InstancedPieces.
 */
export function roadFacingFacade(
  bounds: OrientedBuildingBounds,
  outDir: Vec2,
): FacadeFace {
  const xAxis: Vec2 = [Math.cos(bounds.rotationY), -Math.sin(bounds.rotationY)];
  const zAxis: Vec2 = [Math.sin(bounds.rotationY), Math.cos(bounds.rotationY)];
  const roadward: Vec2 = [-outDir[0], -outDir[1]];
  const faces: FacadeFace[] = [
    {
      normal: xAxis,
      tangent: [-xAxis[1], xAxis[0]],
      normalHalfExtent: bounds.halfX,
      tangentHalfExtent: bounds.halfZ,
      rotationY: bounds.rotationY + Math.PI / 2,
    },
    {
      normal: [-xAxis[0], -xAxis[1]],
      tangent: [xAxis[1], -xAxis[0]],
      normalHalfExtent: bounds.halfX,
      tangentHalfExtent: bounds.halfZ,
      rotationY: bounds.rotationY - Math.PI / 2,
    },
    {
      normal: zAxis,
      tangent: xAxis,
      normalHalfExtent: bounds.halfZ,
      tangentHalfExtent: bounds.halfX,
      rotationY: bounds.rotationY,
    },
    {
      normal: [-zAxis[0], -zAxis[1]],
      tangent: [-xAxis[0], -xAxis[1]],
      normalHalfExtent: bounds.halfZ,
      tangentHalfExtent: bounds.halfX,
      rotationY: bounds.rotationY + Math.PI,
    },
  ];
  return faces.reduce((best, face) =>
    dot(face.normal, roadward) > dot(best.normal, roadward) ? face : best);
}

function facadeCandidate(
  parent: Placement,
  parentIndex: number,
): FacadeCandidate | undefined {
  if (!parent.outDir) return undefined;
  const bounds = buildingPlacementBounds(parent);
  const face = roadFacingFacade(bounds, parent.outDir);
  if (dot(face.normal, [-parent.outDir[0], -parent.outDir[1]]) < 0.98) return undefined;
  const planeCenter: Vec3 = [
    bounds.center.x + face.normal[0] * face.normalHalfExtent,
    0,
    bounds.center.z + face.normal[1] * face.normalHalfExtent,
  ];
  const screenX = planeCenter[0] + face.normal[0] * FACADE_SCREEN_OFFSET;
  const screenZ = planeCenter[2] + face.normal[1] * FACADE_SCREEN_OFFSET;
  const source = groundRoadMemberships(planeCenter[0], planeCenter[2])
    .filter(({ endpointCap }) => !endpointCap)
    .sort((a, b) => a.clearance - b.clearance)[0];
  // Ordinary front-row anchors use a circular footprint cap. Narrow OBB faces
  // can therefore sit farther behind the 10 m anchor than the cap itself, but
  // remain well ahead of the back-row anchor at roughly 45 m.
  if (!source || source.clearance < 9.5 || source.clearance > 35) return undefined;
  if (screenZ < -560 || bounds.height < 14 || face.tangentHalfExtent * 2 < 5.2) {
    return undefined;
  }
  if (groundRoadMemberships(screenX, screenZ).some(({ withinRoadOrSidewalk }) =>
    withinRoadOrSidewalk)) return undefined;
  if (keepClear(screenX, screenZ)) return undefined;
  return { parent, parentIndex, bounds, face, planeCenter };
}

function makeFacadeSign(
  candidate: FacadeCandidate,
  band: number,
): FacadeSignPlacement | undefined {
  const { parent, parentIndex, bounds, face, planeCenter } = candidate;
  const renderedWidth = face.tangentHalfExtent * 2;
  const horizontalMargin = 0.6;
  const width = Math.min(renderedWidth - horizontalMargin * 2, 14);
  const safeBottom = Math.max(3, bounds.height * 0.1);
  const safeTop = bounds.height * 0.88;
  const safeHeight = safeTop - safeBottom;
  const height = Math.min(8, Math.max(3.5, width * 0.46), safeHeight * 0.28);
  const centerFraction = band === 0 ? 0.34 : 0.68;
  const centerY = safeBottom + safeHeight * centerFraction;
  const bandBottom = centerY - height / 2;
  const bandTop = centerY + height / 2;
  if (bandBottom < safeBottom || bandTop > safeTop) return undefined;
  const position: Vec3 = [
    planeCenter[0] + face.normal[0] * FACADE_SCREEN_OFFSET,
    centerY,
    planeCenter[2] + face.normal[1] * FACADE_SCREEN_OFFSET,
  ];
  if (protectedFootprintClearance(position[0], position[2], width / 2) <= 0) {
    return undefined;
  }
  return {
    id: `facade-${parentIndex}-${band}`,
    mode: 'facade',
    parentId: `building-${parentIndex}`,
    parentKey: `${parentIndex}:${parent.file}`,
    parentIndex,
    parentFile: parent.file,
    position,
    rotationY: face.rotationY,
    width,
    height,
    textureIndex: (parentIndex * 3 + band) % 8,
    facade: {
      planeCenter,
      normal: face.normal,
      tangent: face.tangent,
      normalHalfExtent: face.normalHalfExtent,
      renderedWidth,
      renderedHeight: bounds.height,
      horizontalMargin,
      safeBottom,
      safeTop,
      band,
      bandBottom,
      bandTop,
      screenOffset: FACADE_SCREEN_OFFSET,
    },
  };
}

function evenlySelect<T>(items: T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, index) =>
    items[Math.floor(index * items.length / count)]);
}

function buildFacadeSigns(layout: Placement[]): FacadeSignPlacement[] {
  const candidates = layout.flatMap((parent, parentIndex) => {
    const candidate = facadeCandidate(parent, parentIndex);
    return candidate ? [candidate] : [];
  });
  const primaryCandidates = evenlySelect(candidates, FACADE_SIGN_TARGET);
  const signs = primaryCandidates.flatMap((candidate) => {
    const sign = makeFacadeSign(candidate, 0);
    return sign ? [sign] : [];
  });
  if (signs.length >= FACADE_SIGN_TARGET) return signs.slice(0, FACADE_SIGN_TARGET);

  const usedParents = new Set(signs.map(({ parentIndex }) => parentIndex));
  for (const candidate of candidates) {
    if (signs.length >= FACADE_SIGN_TARGET) break;
    if (usedParents.has(candidate.parentIndex)) continue;
    const sign = makeFacadeSign(candidate, 0);
    if (!sign) continue;
    signs.push(sign);
    usedParents.add(candidate.parentIndex);
  }
  for (const candidate of candidates) {
    if (signs.length >= FACADE_SIGN_TARGET) break;
    if (!usedParents.has(candidate.parentIndex)) continue;
    const sign = makeFacadeSign(candidate, 1);
    if (sign) signs.push(sign);
  }
  return signs;
}

function chooseUniqueParent(
  layout: Placement[],
  used: Set<number>,
  predicate: (placement: Placement, bounds: OrientedBuildingBounds) => boolean,
  target?: Vec2,
): { index: number; bounds: OrientedBuildingBounds } {
  const candidates = layout.flatMap((placement, index) => {
    if (used.has(index)) return [];
    const bounds = buildingPlacementBounds(placement);
    if (!predicate(placement, bounds)) return [];
    const score = target
      ? Math.hypot(bounds.center.x - target[0], bounds.center.z - target[1])
      : 0;
    return [{ index, bounds, score }];
  }).sort((a, b) => a.score - b.score || a.index - b.index);
  const selected = candidates[0];
  if (!selected) throw new Error('Missing curated hologram parent');
  used.add(selected.index);
  return selected;
}

function hologramFromParent(
  spec: typeof HOLOGRAM_ANCHORS[number],
  parentIndex: number,
  bounds: OrientedBuildingBounds,
  target: Vec2,
  textureIndex: number,
): HologramSignPlacement {
  const emitterHeight = 0.35;
  const emitterY = bounds.height + emitterHeight / 2;
  const beamHeight = spec.zone === 'shibuya' ? 5.5 : 7;
  const width = spec.zone === 'shibuya' ? 7.5 : 9;
  const height = spec.zone === 'shibuya' ? 5 : 6;
  const panelBottom = emitterY + emitterHeight / 2 + beamHeight + 0.35;
  const centerY = panelBottom + height / 2;
  return {
    id: `hologram-${spec.id}`,
    mode: 'hologram',
    anchorId: spec.id,
    zone: spec.zone,
    position: [bounds.center.x, centerY, bounds.center.z],
    rotationY: Math.atan2(target[0] - bounds.center.x, target[1] - bounds.center.z),
    width,
    height,
    textureIndex,
    emitter: {
      kind: 'roof',
      position: [bounds.center.x, emitterY, bounds.center.z],
      radius: 1.15,
      height: emitterHeight,
      parentId: `building-${parentIndex}`,
    },
    beam: {
      position: [
        bounds.center.x,
        emitterY + emitterHeight / 2 + beamHeight / 2,
        bounds.center.z,
      ],
      radius: width * 0.32,
      height: beamHeight,
    },
  };
}

export function hologramComponentFootprints(
  sign: HologramSignPlacement,
): HologramComponentFootprint[] {
  return [
    {
      component: 'emitter',
      position: sign.emitter.position,
      radius: sign.emitter.radius * 1.14,
    },
    {
      component: 'beam',
      position: sign.beam.position,
      radius: sign.beam.radius,
    },
    {
      component: 'panel',
      position: sign.position,
      radius: sign.width / 2,
    },
  ];
}

function pointSegmentClearance(
  point: Vec3,
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start.x) * dx + (point[2] - start.z) * dz) / lengthSq));
  return Math.hypot(
    point[0] - (start.x + dx * t),
    point[2] - (start.z + dz * t),
  );
}

export function measureHologramFootprintSafety(
  sign: HologramSignPlacement,
): HologramFootprintSafety[] {
  const sightlines = buildShibuyaSightCorridors();
  return hologramComponentFootprints(sign).map((footprint) => {
    const [x, , z] = footprint.position;
    const openRoadMargins = groundRoadMemberships(x, z)
      .filter(({ endpointCap }) => !endpointCap)
      .map(({ clearance }) => clearance - 9 - footprint.radius);
    const roadMargin = openRoadMargins.length > 0
      ? Math.min(...openRoadMargins)
      : groundRoadClearance(x, z) - 9 - footprint.radius;
    return {
      ...footprint,
      roadMargin,
      protectedMargin: protectedFootprintClearance(x, z, footprint.radius),
      bridgeMargin: bridgeCorridorFootprintClearance(x, z, footprint.radius),
      sightlineMargin: Math.min(...sightlines.map((corridor) =>
        pointSegmentClearance(footprint.position, corridor.start, corridor.end)
          - corridor.halfWidth
          - footprint.radius)),
    };
  });
}

function assertHologramFootprintSafety(sign: HologramSignPlacement): void {
  const unsafe = measureHologramFootprintSafety(sign).find((safety) =>
    safety.roadMargin <= 0
    || safety.protectedMargin <= 0
    || safety.bridgeMargin <= 0
    || safety.sightlineMargin <= 0);
  if (unsafe) {
    throw new Error(
      `Unsafe ${sign.id} ${unsafe.component} footprint: `
      + JSON.stringify(unsafe),
    );
  }
}

function buildHolograms(layout: Placement[]): HologramSignPlacement[] {
  const used = new Set<number>();
  const signs: HologramSignPlacement[] = [];
  for (const spec of SHIBUYA_ANCHORS) {
    const candidates = layout.flatMap((placement, index) => {
      if (used.has(index)
        || (placement.layoutRole !== 'shibuya-front'
          && placement.layoutRole !== 'shibuya-back')) return [];
      return [{
        index,
        bounds: buildingPlacementBounds(placement),
        score: Math.abs((placement.shibuyaDistance ?? Infinity) - spec.distance)
          + (placement.shibuyaApproach === spec.approach ? 0 : 1000)
          + (placement.shibuyaSide === spec.side ? 0 : 100),
      }];
    }).sort((a, b) => a.score - b.score || a.index - b.index);
    const parent = candidates[0];
    if (!parent) throw new Error(`Missing curated hologram parent for ${spec.id}`);
    used.add(parent.index);
    const sign = hologramFromParent(spec, parent.index, parent.bounds, [240, 0], signs.length);
    assertHologramFootprintSafety(sign);
    signs.push(sign);
  }
  for (const spec of BRIDGE_ANCHORS) {
    const parent = chooseUniqueParent(
      layout,
      used,
      (_placement, bounds) =>
        bounds.center.z <= -540
        && bounds.center.z >= -760
        && !keepClear(bounds.center.x, bounds.center.z),
      spec.target,
    );
    const sign = hologramFromParent(spec, parent.index, parent.bounds, [240, -600], signs.length);
    assertHologramFootprintSafety(sign);
    signs.push(sign);
  }
  return signs;
}

export function buildSignLayout(
  layout: Placement[] = buildCityLayout(),
): SignPlacement[] {
  return [...buildFacadeSigns(layout), ...buildHolograms(layout)];
}
