import { RESUME } from '../content/resume';
import { MOON_POS } from './route';

export type ContentAnchorKind =
  | 'about'
  | 'project-main'
  | 'project-small'
  | 'research'
  | 'finale';

export type ResumeAnchorRef =
  | { readonly section: 'about' }
  | {
      readonly section: 'projectsMain' | 'projectsSmall' | 'research';
      readonly index: number;
    };

export type WorldPoint = readonly [number, number, number];

export interface ContentAnchor {
  readonly id: string;
  readonly kind: ContentAnchorKind;
  readonly title: string;
  readonly semanticT: number;
  readonly position: WorldPoint;
  readonly cameraTargetHint: WorldPoint;
  readonly resumeRef?: ResumeAnchorRef;
}

const FIRST_FLIP_TARGET: WorldPoint = [252, 21, -128];
const SECOND_FLIP_TARGET: WorldPoint = [252, 23, -288];

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  Object.freeze(value);
  return value;
}

export const CONTENT_ANCHORS: readonly ContentAnchor[] = deepFreeze([
  {
    id: 'about-hero',
    kind: 'about',
    title: RESUME.name,
    semanticT: 0.275,
    position: [155, 14, 21],
    cameraTargetHint: [155, 14, 21],
    resumeRef: { section: 'about' },
  },
  {
    id: 'project-main-ttt-e2e',
    kind: 'project-main',
    title: RESUME.projectsMain[0].title,
    semanticT: 0.41,
    position: [270, 28, -114],
    cameraTargetHint: FIRST_FLIP_TARGET,
    resumeRef: { section: 'projectsMain', index: 0 },
  },
  {
    id: 'project-main-remember-me',
    kind: 'project-main',
    title: RESUME.projectsMain[1].title,
    semanticT: 0.41,
    position: [270, 28, -142],
    cameraTargetHint: FIRST_FLIP_TARGET,
    resumeRef: { section: 'projectsMain', index: 1 },
  },
  {
    id: 'project-small-mandarin',
    kind: 'project-small',
    title: RESUME.projectsSmall[0].title,
    semanticT: 0.57,
    position: [270, 31, -270],
    cameraTargetHint: SECOND_FLIP_TARGET,
    resumeRef: { section: 'projectsSmall', index: 0 },
  },
  {
    id: 'project-small-bellevue-hackathon',
    kind: 'project-small',
    title: RESUME.projectsSmall[1].title,
    semanticT: 0.57,
    position: [270, 35, -288],
    cameraTargetHint: SECOND_FLIP_TARGET,
    resumeRef: { section: 'projectsSmall', index: 1 },
  },
  {
    id: 'project-small-dubhacks',
    kind: 'project-small',
    title: RESUME.projectsSmall[2].title,
    semanticT: 0.57,
    position: [270, 31, -306],
    cameraTargetHint: SECOND_FLIP_TARGET,
    resumeRef: { section: 'projectsSmall', index: 2 },
  },
  {
    id: 'research-mobile-intelligence-lab',
    kind: 'research',
    title: RESUME.research[0].title,
    semanticT: 0.72,
    position: [240, 28, -410],
    cameraTargetHint: [240, 68, -410],
    resumeRef: { section: 'research', index: 0 },
  },
  {
    id: 'research-llm-hardware-benchmarking',
    kind: 'research',
    title: RESUME.research[1].title,
    semanticT: 0.79,
    position: [240, 28, -525],
    cameraTargetHint: [240, 76, -525],
    resumeRef: { section: 'research', index: 1 },
  },
  {
    id: 'finale-moon',
    kind: 'finale',
    title: 'Finale Moon',
    semanticT: 1,
    position: [MOON_POS.x, MOON_POS.y, MOON_POS.z],
    cameraTargetHint: [MOON_POS.x, MOON_POS.y, MOON_POS.z],
  },
]);

export function contentAnchorById(id: string): ContentAnchor | undefined {
  return CONTENT_ANCHORS.find((anchor) => anchor.id === id);
}
