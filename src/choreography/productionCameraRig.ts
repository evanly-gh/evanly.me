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
  // Screen-right shoulder offset. A pure behind-the-bike chase (lateral 0) frames
  // the trail edge-on, so it reads as a flat line you can't parse. A positive value
  // slides the camera to the rider's right (camera screen-right = forward × up) so
  // the ribbon is seen at an angle and its shape/depth reads. Only the camera moves,
  // not the target, so the aim stays on the bike — an over-the-shoulder angle.
  lateral = 0,
): ProductionCamKey {
  const route = sampleRoute(t);
  const forward = route.tangent.clone().setY(0).normalize();
  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();
  const position = route.pos.clone()
    .addScaledVector(forward, -distance)
    .addScaledVector(right, lateral)
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

// Where the finale rise takes over from the keyed camera. From here on there is NO
// keyed bridge-pan sweep and NO back-then-forward dolly — the camera simply cranes
// UP and forward into the moon in one continuous motion, moon locked in frame.
// Held at 0.885 (not 0.85/0.87) so the keyed lead-in has the whole ramp climb to
// swing the aim from the research side-view around to the straight-on moon look
// GRADUALLY (see the eased research-bridge swing keys) instead of snapping. Paired
// with LIFT_SEMANTIC_WEIGHT in scrollRemap, which gives this same t-window heavy
// scroll dwell so the swing reads as a slow sweep under the finger, not a snap.
const FINALE_RISE_START_T = 0.885;
const FINALE_RISE_END_T = 1;

// Anchor sits right where the ramp/research camera already is as the bike rolls onto
// the ramp (~(224, 2, −724), the research-end chase pose) — NOT parked ~170m back at
// Z −555 like before, which teleported the camera backward the instant the bike hit
// the ramp ("launches the camera back"). From here the crane holds its ground plane
// position and just rises: Y 9 → 112, with Z drifting only a few metres, so the finale
// reads purely as "crane straight up" while the bike rides away toward the moon.
const FINALE_RISE_START = new THREE.Vector3(226, 9, -718);
const FINALE_RISE_END = new THREE.Vector3(238, 112, -712);

function rawFinaleCameraPoseAt(t: number): CamKey {
  const fraction = THREE.MathUtils.clamp(
    (t - FINALE_RISE_START_T) / (FINALE_RISE_END_T - FINALE_RISE_START_T),
    0,
    1,
  );
  const eased = fraction * fraction * (3 - 2 * fraction);
  const position = FINALE_RISE_START.clone().lerp(FINALE_RISE_END, eased);
  const target = MOON_POS.clone();
  return {
    t,
    position,
    target,
    fov: THREE.MathUtils.lerp(50, 44, eased),
    mode: 'dolly',
  };
}

// The anchor already matches the keyed pose at the handoff, so no cross-fade blend
// is needed — the raw rise IS the continuous move.
function finaleCameraPoseAt(t: number): CamKey {
  return rawFinaleCameraPoseAt(t);
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
    // Chase sits off the rider's RIGHT shoulder (lateral ~11) rather than dead
    // astern, so the tron ribbon behind the bike is seen at an angle and reads as a
    // ribbon with depth instead of a single flat line. The offset tapers back to
    // centre across the two About-approach keys below so there's no lateral pop as
    // the ride hands off to the fixed About hero shot.
    chaseKey('intro-start', 0, 34, 16, 50, 'smooth', 'intro', 11),
    chaseKey('intro-crane-descent', 0.045, 32, 13, 46, 'smooth', 'intro', 12),
    chaseKey('intro-follow-acquire', 0.09, 30, 11, 42, 'smooth', 'intro', 12),
    chaseKey('intro-handoff', 0.115, 28, 10, 38, 'smooth', 'intro', 11),
    // About reveal: a LOW, near-ground hero shot on the cross-street axis looking
    // UP at the towering About sign + flanking buildings, with the bike crossing
    // the lower frame. Trail the bike in low first (kept framed), then settle into
    // the upward hold (camera y≈7 at x=-60 looking up-south at the sign at z=-74).
    // Held at height 10 (matching intro-handoff and the trail) — the old height 12
    // here was a local bump that read as an awkward elevation spike right as the
    // ride entered the About beat, then dropped into the Y≈7-9 hold.
    chaseKey('intro-about-approach', 0.128, 26, 10, 42, 'smooth', 'about', 7),
    chaseKey('intro-about-trail', 0.15, 22, 10, 46, 'smooth', 'about', 3),
    // Flattened reveal: camera holds a near-constant height (~9) and looks only
    // gently UP at the sign (target Y≈19, not 26-28) so the beat no longer cranes
    // drastically up-then-down. Position Y stays ~9-10 across the whole About beat.
    key('about-rise', 'about', 0.166, [-60, 10, 80], [-60, 24, -74], 54, 'smooth'),
    key('about-lock-in', 'about', 0.184, [-60, 9, 74], [-60, 23, -74], 54, 'hold'),
    key('about-hold-center', 'about', 0.202, [-60, 9, 74], [-60, 23, -74], 54, 'hold'),
    key('about-hold-exit', 'about', 0.216, [-60, 9, 76], [-60, 22, -74], 52, 'smooth'),
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
    // Linger on the side of the street after the second-jump landing: hold the
    // hero side-cam a few beats longer so the rest of the jump / roll-out reads
    // before the camera swings in behind the bike. Same side framing as the
    // landing key, held static while the bike rolls through the lower frame — the
    // chase used to snap in behind at t=0.65, cutting the jump payoff short.
    key(
      'projects-land-hold-1',
      'descend',
      0.65,
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
    key(
      'projects-land-hold-2',
      'descend',
      0.66,
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
    key(
      'projects-land-hold-3',
      'descend',
      0.668,
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
    // Now swing in behind the bike and CHASE it down its own path (behind it, on
    // the same x=285 service-alley line it lands on, then following it as it
    // merges to x=240). The swing + descent is compressed into the remaining
    // descend window so it still hands off to the canyon dolly at t=0.712, but it
    // starts later now that the side hold runs to ~0.668. Paired with the extra
    // descend scroll dwell (scrollRemap DESCEND_SEMANTIC_INTERVAL) so the whole
    // move still plays as a deliberate sweep, not a whip.
    chaseKey('projects-research-1', 0.674, 19, 12, 54, 'smooth', 'descend'),
    chaseKey('projects-research-2', 0.682, 21, 11, 56, 'smooth', 'descend'),
    chaseKey('projects-research-3', 0.689, 23, 10, 58, 'smooth', 'descend'),
    chaseKey('projects-research-4', 0.695, 25, 10, 60, 'smooth', 'descend'),
    // Keep chasing the bike THROUGH the landing merge onto the main road (it
    // reaches x=240 at t=0.70) before revealing the canyon, then ease the chase
    // down + wide into the low up-the-canyon framing and hand off to the canyon
    // dolly (research-21) from a pose that's already low + behind.
    chaseKey('projects-research-5', 0.7, 23, 9, 58, 'smooth', 'descend'),
    chaseKey('projects-research-6', 0.704, 21, 8, 59, 'smooth', 'descend'),
    chaseKey('projects-research-7', 0.707, 20, 7, 60, 'smooth', 'descend'),
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
    // Ramp lead-in. The camera holds the research SIDE view through t=0.84 (the last
    // research key), then swings its aim around to the straight-on moon look in ONE
    // eased 'smooth' segment spanning the whole ramp climb (0.842 → FINALE_RISE_START_T
    // 0.885). smoothstep eases the aim OUT of the static side hold and back INTO a
    // standstill exactly as the moon-locked finale override takes over, and scrollRemap's
    // LIFT_SEMANTIC_WEIGHT gives this window heavy finger dwell — together they turn the
    // old sudden side→forward snap into a slow, readable sweep.
    key(
      'research-bridge-buffer',
      'lift',
      0.842,
      researchEndSource.position.toArray(),
      researchEndSource.target.toArray(),
      researchEndSource.fov,
      'smooth',
    ),
    // Position + aim MUST equal the finale override at t = FINALE_RISE_START_T so
    // super.sample() and the override meet with no jump: FINALE_RISE_START looking at
    // the moon. This is the end of the eased swing and the start of the crane rise.
    key(
      'research-bridge-pan-1',
      'lift',
      FINALE_RISE_START_T,
      FINALE_RISE_START.toArray(),
      MOON_POS.toArray(),
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
      if (t < FINALE_RISE_START_T) return super.sample(t);
      return finaleCameraPoseAt(
        THREE.MathUtils.clamp(t, FINALE_RISE_START_T, 1),
      );
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
