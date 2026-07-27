import * as THREE from 'three';
import { BikePath } from '../choreography/bikePath';
import {
  buildingPlacementBounds,
  renderedPlacementBounds,
  type OrientedBuildingBounds,
} from './buildingCatalog';
import {
  buildCityLayout,
  buildProps,
  buildStreetFurniture,
  type Cable,
  type Lamp,
  type Placement,
  type Pole,
  type StreetFurniture,
} from './cityLayout';
import { buildCrowdLayout, type CrowdLayout } from './crowdLayout';
import {
  RESEARCH_CAMERA_TIMES,
  activeResearchPanelIds,
  buildResearchCameraRig,
} from './researchCamera';
import { RESEARCH_PANELS, type ResearchPanel } from './researchContent';
import {
  buildResearchSightCorridors,
  type ResearchSightCorridor,
} from './researchSightlines';
import {
  buildStreetDressingLayout,
  type StreetDressingLayout,
} from './streetDressing';
import {
  buildSignLayout,
  type SignPlacement,
} from './signLayout';

export const RESEARCH_OCCLUSION_CATEGORIES = [
  'building',
  'prop',
  'lamp',
  'lamp-head',
  'pole',
  'cable',
  'manhole',
  'can',
  'cone',
  'human',
  'robot',
  'facade-sign',
  'hologram-sign',
] as const;

export type ResearchOcclusionCategory =
  typeof RESEARCH_OCCLUSION_CATEGORIES[number];

export interface ResearchSceneOcclusion {
  category: ResearchOcclusionCategory;
  subjectId: string;
  occluderId: string;
}

export interface ResearchOcclusionInputs {
  buildings: Placement[];
  props: Placement[];
  furniture: StreetFurniture;
  dressing: StreetDressingLayout;
  crowd: CrowdLayout;
  signs: SignPlacement[];
}

interface ResearchSubject {
  id: string;
  parentId?: string;
  points: THREE.Vector3[];
  panel?: ResearchPanel;
}

function panelPoints(panel: ResearchPanel): THREE.Vector3[] {
  const halfWidth = panel.width / 2;
  const halfHeight = panel.height / 2;
  const cos = Math.cos(panel.rotationY);
  const sin = Math.sin(panel.rotationY);
  return [
    new THREE.Vector3(...panel.position),
    ...([-1, 1] as const).flatMap((horizontal) =>
      ([-1, 1] as const).map((vertical) => new THREE.Vector3(
        panel.position[0] + cos * horizontal * halfWidth,
        panel.position[1] + vertical * halfHeight,
        panel.position[2] - sin * horizontal * halfWidth,
      ))),
  ];
}

function researchSubjects(semanticT: number): ResearchSubject[] {
  const pose = buildResearchCameraRig().sample(semanticT);
  const activeIds = new Set(activeResearchPanelIds(semanticT));
  return [
    {
      id: 'projected-bike',
      points: [new BikePath().state(semanticT).pos],
    },
    ...RESEARCH_PANELS
      .filter(({ id }) => activeIds.has(id))
      .map((panel) => ({
        id: panel.id,
        parentId: panel.parentId,
        points: panelPoints(panel),
        panel,
      })),
    ...(semanticT === RESEARCH_CAMERA_TIMES.end
      ? [{ id: 'handoff-view', points: [pose.target] }]
      : []),
  ];
}

function segmentIntersectsOrientedBounds(
  start: THREE.Vector3,
  end: THREE.Vector3,
  bounds: OrientedBuildingBounds,
): boolean {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  const local = (point: THREE.Vector3): THREE.Vector3 => {
    const x = point.x - bounds.center.x;
    const z = point.z - bounds.center.z;
    return new THREE.Vector3(
      x * cos - z * sin,
      point.y,
      x * sin + z * cos,
    );
  };
  return segmentIntersectsAabb(
    local(start),
    local(end),
    new THREE.Vector3(0, bounds.height / 2, 0),
    new THREE.Vector3(bounds.halfX, bounds.height / 2, bounds.halfZ),
  );
}

function segmentIntersectsAabb(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  halfSize: THREE.Vector3,
): boolean {
  const origin = start.clone().sub(center);
  const delta = end.clone().sub(start);
  let minimum = 0;
  let maximum = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const low = -halfSize[axis];
    const high = halfSize[axis];
    if (Math.abs(delta[axis]) < 1e-12) {
      if (origin[axis] < low || origin[axis] > high) return false;
      continue;
    }
    const first = (low - origin[axis]) / delta[axis];
    const second = (high - origin[axis]) / delta[axis];
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return maximum > 1e-4 && minimum < 1 - 1e-4;
}

function pointSegmentDistance3d(
  point: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): number {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();
  const t = lengthSq === 0
    ? 0
    : THREE.MathUtils.clamp(
      point.clone().sub(start).dot(delta) / lengthSq,
      0,
      1,
    );
  return point.distanceTo(start.clone().addScaledVector(delta, t));
}

function cableSamples(cable: Cable): THREE.Vector3[] {
  const midpoint = cable.a.clone().add(cable.b).multiplyScalar(0.5);
  midpoint.y -= 2.2;
  const curve = new THREE.CatmullRomCurve3([cable.a, midpoint, cable.b]);
  return Array.from({ length: 33 }, (_, index) =>
    curve.getPoint(index / 32));
}

function lampHead(lamp: Lamp): THREE.Vector3 {
  return new THREE.Vector3(
    lamp.pos.x + Math.sin(lamp.rotationY) * 1.5,
    9,
    lamp.pos.z + Math.cos(lamp.rotationY) * 1.5,
  );
}

function defaultInputs(): ResearchOcclusionInputs {
  return {
    buildings: buildCityLayout(),
    props: buildProps(),
    furniture: buildStreetFurniture(),
    dressing: buildStreetDressingLayout(),
    crowd: buildCrowdLayout(),
    signs: buildSignLayout(),
  };
}

function panelAxes(rotationY: number): {
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
} {
  return {
    normal: new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY)),
    tangent: new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY)),
  };
}

function segmentIntersectsScreen(
  start: THREE.Vector3,
  end: THREE.Vector3,
  sign: Pick<SignPlacement, 'position' | 'rotationY' | 'width' | 'height'>,
): boolean {
  const center = new THREE.Vector3(...sign.position);
  const { normal, tangent } = panelAxes(sign.rotationY);
  const direction = end.clone().sub(start);
  const denominator = normal.dot(direction);
  if (Math.abs(denominator) < 1e-9) return false;
  const t = normal.dot(center.clone().sub(start)) / denominator;
  if (t <= 1e-4 || t >= 1 - 1e-4) return false;
  const intersection = start.clone().addScaledVector(direction, t);
  const delta = intersection.sub(center);
  return Math.abs(delta.dot(tangent)) <= sign.width / 2
    && Math.abs(delta.y) <= sign.height / 2;
}

function screensOverlap(
  first: Pick<SignPlacement, 'position' | 'rotationY' | 'width' | 'height'>,
  second: ResearchPanel,
): boolean {
  const firstCenter = new THREE.Vector3(...first.position);
  const secondCenter = new THREE.Vector3(...second.position);
  const firstAxes = panelAxes(first.rotationY);
  const secondAxes = panelAxes(second.rotationY);
  if (Math.abs(firstAxes.normal.dot(secondAxes.normal)) < 0.98) return false;
  const delta = secondCenter.sub(firstCenter);
  return Math.abs(delta.dot(firstAxes.normal)) <= 0.5
    && Math.abs(delta.dot(firstAxes.tangent))
      < first.width / 2 + second.width / 2
    && Math.abs(delta.y) < first.height / 2 + second.height / 2;
}

export function measureResearchSceneOcclusions(
  semanticT: number,
  inputs: ResearchOcclusionInputs = defaultInputs(),
): ResearchSceneOcclusion[] {
  const camera = buildResearchCameraRig().sample(semanticT).position;
  const subjects = researchSubjects(semanticT);
  const occlusions: ResearchSceneOcclusion[] = [];
  const record = (
    category: ResearchOcclusionCategory,
    subject: ResearchSubject,
    occluderId: string,
    intersects: (point: THREE.Vector3) => boolean,
  ): void => {
    if (subject.points.some(intersects)) {
      occlusions.push({ category, subjectId: subject.id, occluderId });
    }
  };

  for (const subject of subjects) {
    inputs.buildings.forEach((placement, index) => {
      if (placement.id === subject.parentId) return;
      record(
        'building',
        subject,
        placement.id ?? `building-${index}`,
        (point) => segmentIntersectsOrientedBounds(
          camera,
          point,
          buildingPlacementBounds(placement),
        ),
      );
    });
    inputs.props.forEach((placement, index) => {
      record('prop', subject, `prop-${index}`, (point) =>
        segmentIntersectsOrientedBounds(
          camera,
          point,
          renderedPlacementBounds(placement),
        ));
    });
    inputs.furniture.lamps.forEach((lamp, index) => {
      record('lamp', subject, `lamp-${index}`, (point) =>
        segmentIntersectsAabb(
          camera,
          point,
          new THREE.Vector3(lamp.pos.x, 4.5, lamp.pos.z),
          new THREE.Vector3(0.3, 4.5, 0.3),
        ));
      record('lamp-head', subject, `lamp-head-${index}`, (point) =>
        segmentIntersectsAabb(
          camera,
          point,
          lampHead(lamp),
          new THREE.Vector3(0.4, 0.2, 0.3),
        ));
    });
    inputs.furniture.poles.forEach((pole: Pole, index) => {
      record('pole', subject, `pole-${index}`, (point) =>
        segmentIntersectsAabb(
          camera,
          point,
          new THREE.Vector3(pole.pos.x, 6.5, pole.pos.z),
          new THREE.Vector3(0.36, 6.5, 0.36),
        ));
    });
    inputs.furniture.cables.forEach((cable, index) => {
      const samples = cableSamples(cable);
      record('cable', subject, `cable-${index}`, (point) =>
        samples.some((sample) =>
          pointSegmentDistance3d(sample, camera, point) <= 0.16));
    });
    for (const kind of ['manholes', 'cans', 'cones'] as const) {
      inputs.dressing[kind].forEach((spot, index) => {
        const category = spot.kind as 'manhole' | 'can' | 'cone';
        const height = category === 'manhole' ? 0.08 : category === 'can' ? 1.2 : 1;
        record(category, subject, `${category}-${index}`, (point) =>
          segmentIntersectsAabb(
            camera,
            point,
            new THREE.Vector3(spot.x, height / 2, spot.z),
            new THREE.Vector3(spot.radius, height / 2, spot.radius),
          ));
      });
    }
    inputs.crowd.humans.forEach((spot, index) => {
      record('human', subject, `human-${index}`, (point) =>
        segmentIntersectsAabb(
          camera,
          point,
          new THREE.Vector3(spot.x, 0.9, spot.z),
          new THREE.Vector3(0.4, 0.9, 0.4),
        ));
    });
    inputs.crowd.robots.forEach((spot, index) => {
      record('robot', subject, `robot-${index}`, (point) =>
        segmentIntersectsAabb(
          camera,
          point,
          new THREE.Vector3(spot.x, 0.75, spot.z),
          new THREE.Vector3(0.55, 0.75, 0.55),
        ));
    });
    inputs.signs.forEach((sign) => {
      const directOverlap = subject.panel
        ? screensOverlap(sign, subject.panel)
        : false;
      if (sign.mode === 'facade') {
        if (
          directOverlap
          || subject.points.some((point) =>
            segmentIntersectsScreen(camera, point, sign))
        ) {
          occlusions.push({
            category: 'facade-sign',
            subjectId: subject.id,
            occluderId: sign.id,
          });
        }
        return;
      }
      const emitterCenter = new THREE.Vector3(...sign.emitter.position);
      const beamCenter = new THREE.Vector3(...sign.beam.position);
      if (
        directOverlap
        || subject.points.some((point) =>
          segmentIntersectsScreen(camera, point, sign)
          || segmentIntersectsAabb(
            camera,
            point,
            emitterCenter,
            new THREE.Vector3(
              sign.emitter.radius,
              sign.emitter.height / 2,
              sign.emitter.radius,
            ),
          )
          || segmentIntersectsAabb(
            camera,
            point,
            beamCenter,
            new THREE.Vector3(
              sign.beam.radius,
              sign.beam.height / 2,
              sign.beam.radius,
            ),
          ))
      ) {
        occlusions.push({
          category: 'hologram-sign',
          subjectId: subject.id,
          occluderId: sign.id,
        });
      }
    });
  }
  return occlusions;
}

export interface ResearchOcclusionReport {
  semanticT: number;
  corridors: ResearchSightCorridor[];
  categoryCounts: Record<ResearchOcclusionCategory, number>;
  occlusions: ResearchSceneOcclusion[];
}

export function buildResearchOcclusionReport(
  semanticT: number,
): ResearchOcclusionReport {
  const occlusions = measureResearchSceneOcclusions(semanticT);
  const categoryCounts = Object.fromEntries(
    RESEARCH_OCCLUSION_CATEGORIES.map((category) => [
      category,
      occlusions.filter((occlusion) => occlusion.category === category).length,
    ]),
  ) as Record<ResearchOcclusionCategory, number>;
  return {
    semanticT,
    corridors: buildResearchSightCorridors()
      .filter((corridor) => corridor.semanticT === semanticT),
    categoryCounts,
    occlusions,
  };
}

export { buildResearchSightCorridors };
