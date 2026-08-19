import * as THREE from 'three';
import {
  RESEARCH_CAMERA_KEYS,
} from '../world/researchCamera';
import { STUNT_CAMERA_KEYS } from '../world/stuntCamera';
import { STUNT_CAMERA_SIDE, STUNT_CENTER_X } from '../world/stuntGeometry';
import { MOON_POS, sampleRoute } from '../world/route';
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

// Default chase framing. LOOK_AHEAD pushes the target well down the street (so
// the camera points out into the city, not down at the tarmac) and TARGET_LIFT
// raises it toward the rider's body — together these flatten the pitch to a
// gentle downward angle instead of the old ~35° top-down. Pitch worked out to
// atan((height - TARGET_LIFT) / (distance + LOOK_AHEAD)).
const CHASE_LOOK_AHEAD = 26;
const CHASE_TARGET_LIFT = 4.5;

function chaseKey(
  id: string,
  t: number,
  distance: number,
  height: number,
  fov: number,
  mode: CamKey['mode'] = 'smooth',
  section: ProductionCameraSection = 'intro',
): ProductionCamKey {
  const route = sampleRoute(t);
  const forward = route.tangent.clone().setY(0).normalize();
  const position = route.pos.clone()
    .addScaledVector(forward, -distance)
    .setY(route.pos.y + height);
  const target = route.pos.clone()
    .addScaledVector(forward, CHASE_LOOK_AHEAD)
    .setY(route.pos.y + CHASE_TARGET_LIFT);
  return key(
    id,
    section,
    t,
    position.toArray(),
    target.toArray(),
    fov,
    mode,
  );
}

const FINALE_START_T = 0.89;
const FINALE_HANDOFF_END_T = 0.891;

function rawFinaleCameraPoseAt(t: number): CamKey {
  const fraction = THREE.MathUtils.clamp((t - 0.89) / 0.11, 0, 1);
  const eased = fraction * fraction * (3 - 2 * fraction);
  // The finale holds on the moon the whole way out — the camera pulls back along
  // the bridge but keeps the moon locked in frame (no tilt-up). The outro banner
  // fades in over this held moon shot.
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
    // Default chase: behind the bike, low + gentle, pointing down the street to
    // capture the city (not the tarmac). Distances/heights converge to a steady
    // ~28-back / 10-up follow so the opening settles into the persistent look.
    chaseKey('intro-start', 0, 34, 16, 50),
    chaseKey('intro-crane-descent', 0.045, 32, 13, 46),
    chaseKey('intro-follow-acquire', 0.09, 30, 11, 42),
    chaseKey('intro-handoff', 0.115, 28, 10, 38),
    // About reveal: a LOW, near-ground hero shot on the cross-street axis looking
    // UP at the towering About sign + flanking buildings, with the bike crossing
    // the lower frame. Trail the bike in low first (kept framed), then settle into
    // the upward hold (camera y≈7 at x=-60 looking up-south at the sign at z=-74).
    // Held at height 10 (matching intro-handoff and the trail) — the old height 12
    // here was a local bump that read as an awkward elevation spike right as the
    // ride entered the About beat, then dropped into the Y≈7-9 hold.
    chaseKey('intro-about-approach', 0.128, 26, 10, 42, 'smooth', 'about'),
    chaseKey('intro-about-trail', 0.15, 22, 10, 46, 'smooth', 'about'),
    // Flattened reveal: camera holds a near-constant height (~9) and looks only
    // gently UP at the sign (target Y≈19, not 26-28) so the beat no longer cranes
    // drastically up-then-down. Position Y stays ~9-10 across the whole About beat.
    key('about-rise', 'about', 0.166, [-60, 10, 68], [-60, 20, -74], 54, 'smooth'),
    key('about-lock-in', 'about', 0.184, [-60, 9, 62], [-60, 19, -74], 54, 'hold'),
    key('about-hold-center', 'about', 0.202, [-60, 9, 62], [-60, 19, -74], 54, 'hold'),
    key('about-hold-exit', 'about', 0.216, [-60, 9, 64], [-60, 18, -74], 52, 'smooth'),
    // Bridge the locked dead-end shot into the eastbound Shibuya road-follow.
    // Drop out of the up-tilted hold and settle straight into a LOW behind-the-
    // bike chase (chaseKey trails the route tangent), so instead of a parked
    // top-down station looking down at the bike, the camera sits low and flat
    // pointing DOWN THE ROAD — the crossing and its scramble read ahead in frame.
    chaseKey('about-shibuya-bridge-1', 0.226, 22, 10, 50, 'smooth', 'about'),
    chaseKey('about-shibuya-bridge-2', 0.238, 24, 10, 50, 'smooth', 'about'),
    // Keep trailing the bike east along the boulevard, low + flat, so it stays
    // framed the whole way and the crossing details open up down the street.
    chaseKey('about-shibuya-follow-1', 0.25, 25, 10, 50, 'smooth', 'about'),
    chaseKey('about-shibuya-follow-2', 0.262, 26, 9, 52, 'smooth', 'about'),
    chaseKey('about-shibuya-follow-3', 0.273, 26, 9, 52, 'smooth', 'about'),
    // Chase the bike THROUGH the Shibuya scramble instead of parking at the
    // corner pivot: the camera trails it around the turn (chaseKey follows
    // sampleRoute's tangent), so the subject is tracked the whole crossing and
    // the camera stays in the road corridor (no facade clipping).
    // Lower + flatter (height ~9 vs 15) so it's not top-down — reveals the
    // crossing, the scramble crosswalks and the flanking city, not just the bike.
    chaseKey('shibuya-chase-1', 0.284, 27, 10, 54, 'smooth', 'shibuya'),
    chaseKey('shibuya-chase-2', 0.302, 26, 9, 54, 'smooth', 'shibuya'),
    chaseKey('shibuya-chase-3', 0.32, 26, 9, 52, 'smooth', 'shibuya'),
    chaseKey('shibuya-chase-4', 0.338, 27, 10, 50, 'smooth', 'shibuya'),
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
    // Descent transition: CHASE the bike down its own path (behind it, on the
    // same x=285 service-alley line it lands on, then following it as it merges
    // to x=240). Trailing on the bike's side keeps a clear line of sight — the
    // old dolly crossed to x=240 while the bike was airborne over x=285, letting
    // an east-side building block the view.
    // Tight, aggressive follow (shorter distance than the intro chase) so the
    // swing from the side hero-cam to behind-the-bike keeps the rider dead-centre
    // and never lets a fast scroll lose it. Paired with the extra descend scroll
    // dwell (scrollRemap DESCEND_SEMANTIC_INTERVAL) so this plays as a slow sweep.
    chaseKey('projects-research-1', 0.65, 19, 12, 54, 'smooth', 'descend'),
    chaseKey('projects-research-2', 0.663, 21, 11, 56, 'smooth', 'descend'),
    chaseKey('projects-research-3', 0.676, 23, 10, 58, 'smooth', 'descend'),
    chaseKey('projects-research-4', 0.688, 25, 10, 60, 'smooth', 'descend'),
    // Keep chasing the bike THROUGH the landing merge onto the main road (it
    // reaches x=240 at t=0.70) before revealing the canyon. Previously the camera
    // whip-cut to the x=240 research-entry at t=0.69 while the bike was still
    // airborne over x=285 — a ~45m lateral jump the eye read as a hard cut. Now it
    // trails the rider down the merge diagonal so the swing to the canyon axis is
    // a continuation, not a jump.
    chaseKey('projects-research-5', 0.694, 23, 9, 58, 'smooth', 'descend'),
    chaseKey('projects-research-6', 0.7, 21, 8, 59, 'smooth', 'descend'),
    // Keep TRAILING the bike as it enters the canyon mouth, then ease the chase
    // down + wide into the low up-the-canyon framing. The old absolute
    // research-entry frames leaped the camera ~30m down-canyon (ahead of the
    // rider) in a blink and whipped the FOV 54→66 across three fast cuts — that
    // "rushing ahead / rapid angle switch" right after the second-jump landing.
    // Now the camera stays behind the bike the whole descent, only lowering and
    // widening gently, and hands off to the canyon dolly (research-21) from a
    // pose that's already low + behind — one continuous move, not three cuts.
    chaseKey('projects-research-7', 0.705, 20, 7, 60, 'smooth', 'descend'),
    chaseKey('research-entry', 0.709, 18, 5, 61, 'smooth', 'research'),
    chaseKey('research-entry-align', 0.711, 16, 4, 62, 'smooth', 'research'),
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
  if (t < 0.703) return 'descend';
  if (t < 0.84) return 'research';
  if (t < 0.89) return 'lift';
  if (t < 1) return 'bridge';
  return 'finale';
}
