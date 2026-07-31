import * as THREE from 'three';
import {
  RESEARCH_CAMERA_KEYS,
} from '../world/researchCamera';
import { STUNT_CAMERA_KEYS } from '../world/stuntCamera';
import { STUNT_CAMERA_SIDE, STUNT_CENTER_X } from '../world/stuntGeometry';
import { MOON_POS, sampleRoute } from '../world/route';
import { ABOUT_REVEAL_CAMERA } from '../world/aboutReveal';
import { CameraRig, type CamKey, type CamPose } from './cameraRig';

export type ProductionCameraSection =
  | 'intro'
  | 'about'
  | 'shibuya'
  | 'projects'
  | 'descend'
  | 'research'
  | 'lift'
  | 'bridge'
  | 'finale';

export interface ProductionCamKey extends CamKey {
  id: string;
  section: ProductionCameraSection;
}

export const PRODUCTION_CAMERA_TRANSITIONS = Object.freeze([
  'intro-to-about',
  'about-to-shibuya',
  'shibuya-to-projects',
  'projects-to-research',
  'research-to-bridge',
  'bridge-to-finale',
] as const);

function key(
  id: string,
  section: ProductionCameraSection,
  t: number,
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
  mode: CamKey['mode'] = 'dolly',
): ProductionCamKey {
  return Object.freeze({
    id,
    section,
    t,
    position: new THREE.Vector3(...position),
    target: new THREE.Vector3(...target),
    fov,
    mode,
  });
}

function copiedKey(
  source: CamKey,
  id: string,
  section: ProductionCameraSection,
): ProductionCamKey {
  return key(
    id,
    section,
    source.t,
    source.position.toArray(),
    source.target.toArray(),
    source.fov,
    source.mode,
  );
}

function projectKey(
  source: CamKey,
  id: string,
  mode = source.mode,
): ProductionCamKey {
  return key(
    id,
    'projects',
    source.t,
    [STUNT_CAMERA_SIDE.productionX, source.position.y, source.position.z],
    [STUNT_CENTER_X, source.target.y, source.target.z],
    source.fov,
    mode,
  );
}

function chaseKey(
  id: string,
  t: number,
  distance: number,
  height: number,
  fov: number,
  mode: CamKey['mode'] = 'dolly',
): ProductionCamKey {
  const route = sampleRoute(t);
  const forward = route.tangent.clone().setY(0).normalize();
  const position = route.pos.clone()
    .addScaledVector(forward, -distance)
    .setY(route.pos.y + height);
  const target = route.pos.clone()
    .addScaledVector(forward, 8)
    .setY(route.pos.y + 2);
  return key(
    id,
    'intro',
    t,
    position.toArray(),
    target.toArray(),
    fov,
    mode,
  );
}

/**
 * Locked-off camera at a fixed station whose target follows the bike
 * (sampleRoute(t)), so the subject stays framed as it moves — a tracking pan
 * from a parked camera rather than a moving dolly.
 */
function trackKey(
  id: string,
  section: ProductionCameraSection,
  t: number,
  position: readonly [number, number, number],
  fov: number,
  mode: CamKey['mode'] = 'smooth',
  targetLift = 1.6,
): ProductionCamKey {
  const route = sampleRoute(t);
  return key(
    id,
    section,
    t,
    position,
    [route.pos.x, route.pos.y + targetLift, route.pos.z],
    fov,
    mode,
  );
}

const FINALE_START_T = 0.89;
const FINALE_HANDOFF_END_T = 0.891;

function rawFinaleCameraPoseAt(t: number): CamKey {
  const fraction = THREE.MathUtils.clamp((t - 0.89) / 0.11, 0, 1);
  const eased = fraction * fraction * (3 - 2 * fraction);
  const route = sampleRoute(t);
  const forward = route.tangent.clone().setY(0).normalize();
  const position = route.pos.clone()
    .addScaledVector(forward, -THREE.MathUtils.lerp(160, 240, fraction))
    .setY(30);
  const target = MOON_POS.clone();
  return {
    t,
    position,
    target,
    fov: THREE.MathUtils.lerp(50, 46, eased),
    mode: 'dolly',
  };
}

function finaleCameraPoseAt(t: number): CamKey {
  const pose = rawFinaleCameraPoseAt(t);
  if (t <= FINALE_START_T || t >= FINALE_HANDOFF_END_T) return pose;
  const start = rawFinaleCameraPoseAt(FINALE_START_T);
  const fraction = (t - FINALE_START_T)
    / (FINALE_HANDOFF_END_T - FINALE_START_T);
  const eased = fraction * fraction * (3 - 2 * fraction);
  return {
    ...pose,
    position: start.position.clone().lerp(pose.position, eased),
    target: start.target.clone().lerp(pose.target, eased),
    fov: THREE.MathUtils.lerp(start.fov, pose.fov, eased),
  };
}

function finaleChaseKey(
  id: string,
  section: ProductionCameraSection,
  t: number,
  mode: CamKey['mode'] = 'dolly',
): ProductionCamKey {
  const pose = finaleCameraPoseAt(t);
  return key(
    id,
    section,
    t,
    pose.position.toArray(),
    pose.target.toArray(),
    pose.fov,
    mode,
  );
}

const projectsLandingSource = STUNT_CAMERA_KEYS.find(({ t }) => t === 0.64);
if (!projectsLandingSource) {
  throw new Error('Projects camera requires a second-jump landing key');
}
const researchEndSource = RESEARCH_CAMERA_KEYS.find(({ t }) => t === 0.84);
if (!researchEndSource) {
  throw new Error('Production camera requires a Research end key');
}

export const PRODUCTION_CAMERA_KEYS: readonly ProductionCamKey[] =
  Object.freeze([
    chaseKey('intro-start', 0, 38, 34, 52),
    chaseKey('intro-crane-descent', 0.04, 32, 28, 48),
    chaseKey('intro-follow-acquire', 0.08, 24, 18, 42),
    // Crane (not cut) from the intro chase into the locked dead-end billboard.
    // The About station sits far north/high at the cross-street terminus, so the
    // bridge lifts UP over the boulevard, swings north/east along the OPEN
    // intersection + cross-street corridor (never through the flanking canyon
    // walls), and settles onto the locked station facing the sign — the target
    // eases from the rider to the poster across the move.
    chaseKey('intro-handoff', 0.12, 18, 10, 34, 'smooth'),
    key('intro-about-crane-1', 'about', 0.128, [-180, 30, 6], [-110, 6, 0], 38, 'smooth'),
    key('intro-about-crane-2', 'about', 0.136, [-80, 40, 22], [-60, 22, -34], 40, 'smooth'),
    key('intro-about-crane-3', 'about', 0.144, [-62, 33, 66], [-60, 28, -55], 42, 'smooth'),
    // Locked-off dead-end About beat. A stationary camera parked at the cross
    // street's north terminus, staring straight south (90° to the boulevard,
    // pitch≈0) at the big About billboard capping the dead-end across the
    // intersection. The rider drives east along z=0 and crosses the lower frame
    // left→right as the user scrolls — the camera never moves. Pose is the
    // load-time-solved ABOUT_REVEAL_CAMERA (see aboutReveal.ts). The single
    // 'smooth' segment from intro-handoff (t=0.12) eases the camera into this
    // station; every hold key is identical, so the shot is dead still through the
    // crossing (bike passes x=-60 around t≈0.192).
    key('about-lock-in', 'about', 0.15, ABOUT_REVEAL_CAMERA.position, ABOUT_REVEAL_CAMERA.target, ABOUT_REVEAL_CAMERA.fov, 'hold'),
    key('about-hold-cross-enter', 'about', 0.172, ABOUT_REVEAL_CAMERA.position, ABOUT_REVEAL_CAMERA.target, ABOUT_REVEAL_CAMERA.fov, 'hold'),
    key('about-hold-cross-center', 'about', 0.192, ABOUT_REVEAL_CAMERA.position, ABOUT_REVEAL_CAMERA.target, ABOUT_REVEAL_CAMERA.fov, 'hold'),
    key('about-hold-cross-exit', 'about', 0.206, ABOUT_REVEAL_CAMERA.position, ABOUT_REVEAL_CAMERA.target, ABOUT_REVEAL_CAMERA.fov, 'hold'),
    key('about-hold-settle', 'about', 0.216, ABOUT_REVEAL_CAMERA.position, ABOUT_REVEAL_CAMERA.target, ABOUT_REVEAL_CAMERA.fov, 'smooth'),
    // Bridge the locked dead-end shot into the eastbound Shibuya road-follow.
    // Stay over the CLEAR corridors: descend down the cross-street axis (x=-60),
    // then out over the boulevard, keeping the bike framed (target follows
    // sampleRoute) so the swing east never buries the camera in a facade.
    trackKey('about-shibuya-bridge-1', 'about', 0.226, [-60, 25, 42], 48, 'smooth'),
    trackKey('about-shibuya-bridge-2', 'about', 0.238, [18, 23, 8], 50, 'smooth'),
    // Trail the bike east along the boulevard (camera BEHIND it, target follows
    // sampleRoute) so it stays framed the whole way instead of the camera racing
    // ahead and losing it, then arc up to the elevated Shibuya station.
    trackKey('about-shibuya-follow-1', 'about', 0.25, [55, 22, 8], 48),
    trackKey('about-shibuya-follow-2', 'about', 0.262, [90, 26, 4], 50),
    trackKey('about-shibuya-follow-3', 'about', 0.273, [128, 30, -14], 52),
    // Locked-off Shibuya crossing: the camera parks at one elevated station and
    // tracks the bike (target follows sampleRoute) as it carves the scramble,
    // keeping it framed the whole turn instead of a moving dolly.
    trackKey('about-to-shibuya', 'shibuya', 0.28, [224, 34, -78], 54),
    trackKey('shibuya-track-1', 'shibuya', 0.305, [224, 34, -78], 54),
    trackKey('shibuya-track-2', 'shibuya', 0.33, [224, 34, -78], 52),
    key(
      'shibuya-projects-align',
      'shibuya',
      0.35,
      [STUNT_CAMERA_SIDE.productionX, 28, -106],
      [STUNT_CENTER_X, 20, -106],
      42,
      'smooth',
    ),
    key(
      'shibuya-to-projects',
      'projects',
      STUNT_CAMERA_KEYS[0].t,
      [STUNT_CAMERA_SIDE.productionX, 28, -105],
      [STUNT_CENTER_X, 21, -105],
      42,
      'smooth',
    ),
    ...STUNT_CAMERA_KEYS.slice(1)
      .filter(({ t }) => t <= 0.64)
      .map((source, index) => projectKey(source, `projects-${index + 1}`)),
    key(
      'projects-to-research',
      'descend',
      0.641,
      [
        STUNT_CAMERA_SIDE.productionX,
        projectsLandingSource.position.y,
        projectsLandingSource.position.z,
      ],
      [
        STUNT_CENTER_X,
        projectsLandingSource.target.y,
        projectsLandingSource.target.z,
      ],
      projectsLandingSource.fov,
      'smooth',
    ),
    // Descent transition: dolly down beside the bike while always keeping it
    // framed (target follows sampleRoute), so it never leaves the shot and the
    // hand-off from the jumps to the research strip stays continuous.
    trackKey('projects-research-overpass', 'descend', 0.645, [214, 25, -282], 50),
    trackKey('projects-research-building-orbit', 'descend', 0.65, [220, 18, -312], 52),
    trackKey('projects-research-road-center', 'descend', 0.66, [230, 11, -344], 54),
    trackKey('projects-research-descent', 'descend', 0.678, [237, 6, -372], 58),
    key(
      'research-entry',
      'research',
      0.69,
      [240, 3, -378],
      [240, 12, -420],
      62,
      'smooth',
    ),
    key(
      'research-entry-follow',
      'research',
      0.702,
      [238, 2, -394],
      [240, 13, -430],
      64,
      'smooth',
    ),
    key(
      'research-entry-align',
      'research',
      0.708,
      [228, 1.7, -404],
      [242, 14, -438],
      66,
      'smooth',
    ),
    ...RESEARCH_CAMERA_KEYS
      .filter(({ t }) => t >= 0.712)
      .map((source, index) =>
        copiedKey(
            source,
            source.t === 0.712
              ? 'research-21'
              : source.t === 0.76
                ? 'research-22'
                : source.t === 0.775
                  ? 'research-23'
                  : `research-${index + 1}`,
            'research',
          )),
    key(
      'research-bridge-buffer',
      'lift',
      0.842,
      researchEndSource.position.toArray(),
      researchEndSource.target.toArray(),
      researchEndSource.fov,
      'dolly',
    ),
    key(
      'research-bridge-pan-1',
      'lift',
      0.85,
      [228, 8, -555],
      [268, 28, -635],
      50,
      'dolly',
    ),
    key(
      'research-bridge-pan-2',
      'lift',
      0.865,
      [232, 16, -530],
      [252, 46, -650],
      50,
      'dolly',
    ),
    key(
      'research-bridge-pan-3',
      'lift',
      0.88,
      [237, 25, -500],
      [240, 65, -900],
      50,
      'dolly',
    ),
    finaleChaseKey(
      'research-bridge-settle',
      'lift',
      0.889,
      'smooth',
    ),
    finaleChaseKey(
      'research-to-bridge',
      'lift',
      0.89,
    ),
    finaleChaseKey(
      'bridge-approach',
      'bridge',
      0.925,
    ),
    finaleChaseKey(
      'bridge-chase',
      'bridge',
      0.96,
    ),
    finaleChaseKey(
      'finale-ride-away',
      'bridge',
      0.98,
    ),
    finaleChaseKey(
      'bridge-to-finale',
      'finale',
      1,
    ),
  ]);

export function buildProductionCameraRig(): CameraRig {
  return new class extends CameraRig {
    override sample(t: number): CamPose {
      if (t < 0.89) return super.sample(t);
      return finaleCameraPoseAt(THREE.MathUtils.clamp(t, 0.89, 1));
    }
  }(PRODUCTION_CAMERA_KEYS);
}

export function measureCameraRoll(camera: THREE.Camera): number {
  const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
  const actualUp = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 1)
    .normalize();
  const levelUp = new THREE.Vector3(0, 1, 0)
    .addScaledVector(forward, -forward.y)
    .normalize();
  return Math.atan2(
    new THREE.Vector3().crossVectors(levelUp, actualUp).dot(forward),
    levelUp.dot(actualUp),
  );
}

export function productionCameraSectionAt(
  semanticT: number,
): ProductionCameraSection {
  if (!Number.isFinite(semanticT)) {
    throw new Error('Production camera progress must be finite');
  }
  const t = THREE.MathUtils.clamp(semanticT, 0, 1);
  if (t < 0.12) return 'intro';
  if (t < 0.28) return 'about';
  if (t < 0.36) return 'shibuya';
  if (t < 0.64) return 'projects';
  if (t < 0.69) return 'descend';
  if (t < 0.84) return 'research';
  if (t < 0.89) return 'lift';
  if (t < 1) return 'bridge';
  return 'finale';
}
