import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildProductionCameraRig,
  measureCameraRoll,
  productionCameraSectionAt,
} from '../../choreography/productionCameraRig';
import {
  ProgressDirector,
  type ProgressAdapter,
} from '../../choreography/progressDirector';
import type { ProgressStore } from '../../choreography/progressStore';
import type {
  BikeRiderHandle,
  MountedBikeSnapshot,
} from './BikeRider';
import {
  measureBikeFraming,
  type BikeFramingMeasurement,
} from './bikeFraming';
import { rawForSemantic } from '../../choreography/scrollRemap';
import { BikePath, wheelRotationForDistance } from '../../choreography/bikePath';
import {
  INTRO_BIKE_LEAN_ANGLE,
  INTRO_BIKE_LEAN_CROUCH,
  INTRO_BIKE_LEAN_POS,
  INTRO_BIKE_LEAN_YAW,
  INTRO_CAM_FOV,
  INTRO_CAM_POS,
  INTRO_CAM_TARGET,
  INTRO_DRIVE_DURATION,
  introDrivePosition,
  introDriveYaw,
  introEase,
  type IntroPhase,
} from '../../choreography/introSequence';
import { buildCityLayout } from '../../world/cityLayout';
import { buildingPlacementBounds } from '../../world/buildingCatalog';
import {
  measureMountedSceneSubjects,
  type MountedSceneSubjectMeasurement,
} from '../../choreography/productionSubjects';
import {
  faceOnPose,
  getPosterZoomState,
  setPosterZoomStatus,
  type PosterZoomStatus,
} from '../../choreography/posterZoom';

const ADAPTER_ORDER = ['bike', 'camera', 'content', 'fx'] as const;
const FRAME_SAMPLE_LIMIT = 600;
// Second-stage damp rate for the bike *and* its trail (they share one smoothed
// progress so the ribbon stays glued to the bike). Sits between the old bike
// rate (6.5 — too laggy under the finger) and the trail's old no-second-stage
// snappiness: ~0.09 s settle, snappier than the camera's 6.5 so the bike leads
// the frame slightly instead of dragging behind the scroll.
const BIKE_SMOOTH_RATE = 11;
// The research canyon is a "snap on the bike" tracking shot. The side camera
// already dollies at a fixed offset from the bike, so the bike is geometrically
// pinned in frame — the only thing that lets it drift is the scroll-damping lag
// (smoothRaw@3.6 → bike@11 → camera@6.5). Inside this range we ramp all three
// damp stages up toward near-1:1 so the bike, and the camera locked to it, move
// strictly with the scroll with no perceptible delay. Feathered at the edges so
// entering/leaving the canyon eases from damped to locked instead of popping.
const RESEARCH_LOCK_START = 0.716;
const RESEARCH_LOCK_END = 0.83;
const RESEARCH_LOCK_FEATHER = 0.01;
const RESEARCH_LOCK_RAW_RATE = 26;
const RESEARCH_LOCK_BIKE_RATE = 45;
const RESEARCH_LOCK_CAM_RATE = 45;

function researchLockAmount(semanticT: number): number {
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const smooth = (value: number) => {
    const c = clamp01(value);
    return c * c * (3 - 2 * c);
  };
  const enter = smooth((semanticT - RESEARCH_LOCK_START) / RESEARCH_LOCK_FEATHER);
  const exit = smooth((RESEARCH_LOCK_END - semanticT) / RESEARCH_LOCK_FEATHER);
  return Math.min(enter, exit);
}
// Mouse look-around peek (radians) layered on top of the scripted camera each
// frame, for a game-like interactive feel.
const PARALLAX_YAW = 0.05;
const PARALLAX_PITCH = 0.035;

export interface ScrollInspectionSnapshot {
  raw: number;
  semanticT: number;
  updateCount: number;
  adapterOrder: readonly string[];
  activeSection: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    roll: number;
    positionError: number;
    targetError: number;
    fovError: number;
  };
  bike?: MountedBikeSnapshot & {
    ndc: [number, number, number];
    inFrame: boolean;
    framing: BikeFramingMeasurement;
    positionError: number;
    quaternionError: number;
    poseError: number;
  };
  canvas: { width: number; height: number };
  scroll: {
    y: number;
    maximum: number;
    sentinelHeight: number;
    pinned: boolean;
    shot: boolean;
    reducedMotion: boolean;
  };
  performance: {
    samples: number;
    meanMs: number;
    p95Ms: number;
    minimumMs: number;
    maximumMs: number;
  };
  trails?: {
    ribbonVisible: boolean;
    ribbonTriangles: number;
    ribbonSampleCount: number;
    echoVisible: boolean;
    echoCount: number;
    positionBufferId: number;
    instanceMatrixId: number;
    instanceColorId: number;
    instanceAlphaId: number;
    minimumEchoAlpha: number;
    maximumEchoAlpha: number;
    finaleOpacity: number;
    echoColors: Array<[number, number, number]>;
    echoAlphas: number[];
  };
}

declare global {
  interface Window {
    __EVANLY_SCROLL__?: {
      version: 1;
      snapshot(): ScrollInspectionSnapshot;
      rawForSemantic(semanticT: number): number;
      measureSubjects(subjectIds: readonly string[]): MountedSceneSubjectMeasurement;
      setTrailsEnabledForMeasurement(enabled: boolean): void;
    };
  }
}

function frameMetrics(samples: readonly number[]) {
  if (samples.length === 0) {
    return {
      samples: 0,
      meanMs: 0,
      p95Ms: 0,
      minimumMs: 0,
      maximumMs: 0,
    };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: samples.length,
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
    minimumMs: sorted[0],
    maximumMs: sorted.at(-1) as number,
  };
}

export function ProductionDirector({
  store,
  bikeRef,
  inspect,
  introPhase = 'live',
  onIntroComplete,
}: {
  store: ProgressStore;
  bikeRef: RefObject<BikeRiderHandle | null>;
  inspect: boolean;
  introPhase?: IntroPhase;
  onIntroComplete?: () => void;
}) {
  const { camera, scene, size } = useThree();
  // Live-read the intro state inside useFrame without re-creating the loop.
  const introPhaseRef = useRef<IntroPhase>(introPhase);
  introPhaseRef.current = introPhase;
  const onIntroCompleteRef = useRef(onIntroComplete);
  onIntroCompleteRef.current = onIntroComplete;
  const driveStartRef = useRef(0);
  const prevPhaseRef = useRef<IntroPhase>('live');
  const introDoneRef = useRef(false);
  const introYawQuat = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      INTRO_BIKE_LEAN_YAW,
    ),
    [],
  );
  const introScratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      parkedQuat: new THREE.Quaternion(),
      headingQuat: new THREE.Quaternion(),
      yUp: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );
  // Normalised pointer (−1..1) → eased, for the camera look-around peek.
  const mouseTargetRef = useRef({ x: 0, y: 0 });
  const mouseEasedRef = useRef({ x: 0, y: 0 });
  const rig = useMemo(buildProductionCameraRig, []);
  const semanticRef = useRef(0);
  const updateCountRef = useRef(0);
  const cameraTargetRef = useRef(new THREE.Vector3());
  // Scroll-driven target pose; the camera critically-damps toward it each frame.
  const desiredPosRef = useRef(new THREE.Vector3());
  const desiredTargetRef = useRef(new THREE.Vector3());
  const desiredFovRef = useRef(50);
  const camInitedRef = useRef(false);
  const lastVersionRef = useRef(-1);
  // Smoothed scroll progress: eased toward the store's raw each frame so discrete
  // wheel ticks become continuous glides (bike + scene stop reading as chunky).
  const smoothRawRef = useRef(0);
  const progressInitedRef = useRef(false);
  const lastAppliedRawRef = useRef(-1);
  // Second-stage smoothing for the bike. The camera critically-damps its pose
  // toward the scroll-driven target every frame; the bike used to consume the
  // (single-stage-smoothed) progress one-to-one, so it read choppier than the
  // view. Damp the bike's *progress* the same way so both glide together.
  const bikeTargetSemanticRef = useRef(0);
  const bikeSmoothSemanticRef = useRef(0);
  const bikeInitedRef = useRef(false);
  const frameSamplesRef = useRef<number[]>([]);
  const bikePath = useMemo(() => new BikePath(), []);
  // Poster click-to-zoom: from = the ride pose the zoom opened from (returned to
  // on close); to = the face-on pose; outFrom = pose captured when close begins.
  const zoomFromRef = useRef({
    position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50,
  });
  const zoomToRef = useRef({
    position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38,
  });
  const zoomOutFromRef = useRef({
    position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 38,
  });
  const zoomStartRef = useRef(0);
  const zoomPrevStatusRef = useRef<PosterZoomStatus>('idle');
  const zoomScratchRef = useRef({
    pos: new THREE.Vector3(), tgt: new THREE.Vector3(),
  });

  // Seed the desired pose with the opening shot so the first frame starts framed.
  useMemo(() => {
    const pose = rig.sample(0);
    desiredPosRef.current.copy(pose.position);
    desiredTargetRef.current.copy(pose.target);
    desiredFovRef.current = pose.fov;
  }, [rig]);

  // Building footprints (oriented boxes + roof height) for camera anti-clip.
  const obbs = useMemo(
    () => buildCityLayout()
      .filter((p) => p.outDir || p.layoutRole)
      .map((p) => {
        const b = buildingPlacementBounds(p);
        return { cx: b.center.x, cz: b.center.z, hx: b.halfX, hz: b.halfZ, rot: b.rotationY, top: b.height };
      })
      .filter((o) => o.top > 6),
    [],
  );

  const director = useMemo(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      throw new Error('Production camera must be perspective');
    }
    const bike: ProgressAdapter = {
      setProgress: (semanticT) => {
        // Record the bike's target progress; the per-frame damp (in useFrame)
        // eases the bike toward it so it moves as smoothly as the damped camera
        // rather than snapping to each discrete scroll tick.
        bikeTargetSemanticRef.current = semanticT;
      },
    };
    const cameraAdapter: ProgressAdapter = {
      setProgress: (semanticT) => {
        // Record the target pose; the per-frame damp (below) eases the camera
        // toward it so scene hand-offs are continuous instead of snapping.
        const pose = rig.sample(semanticT);
        desiredPosRef.current.copy(pose.position);
        desiredTargetRef.current.copy(pose.target);
        desiredFovRef.current = pose.fov;
      },
    };
    const content: ProgressAdapter = {
      setProgress: (semanticT) => {
        scene.userData.activeSection = productionCameraSectionAt(semanticT);
        scene.userData.contentProgress = semanticT;
      },
    };
    const fx: ProgressAdapter = {
      setProgress: (semanticT) => {
        // NOTE: the trail is *not* driven here — it's driven from the bike's
        // damped progress in useFrame (below) so it tracks the bike exactly
        // instead of the raw scroll-remap. Only scene-wide fx state lives here.
        scene.userData.fxProgress = semanticT;
      },
    };
    return new ProgressDirector({
      bike,
      camera: cameraAdapter,
      content,
      fx,
    });
  }, [bikeRef, camera, rig, scene]);

  useFrame((_state, delta) => {
    const samples = frameSamplesRef.current;
    samples.push(delta * 1000);
    if (samples.length > FRAME_SAMPLE_LIMIT) samples.shift();

    // Ease the pointer for the camera look-around peek (applied after each lookAt).
    const mouse = mouseEasedRef.current;
    const mouseTarget = mouseTargetRef.current;
    const mouseK = 1 - Math.pow(0.0006, delta);
    mouse.x += (mouseTarget.x - mouse.x) * mouseK;
    mouse.y += (mouseTarget.y - mouse.y) * mouseK;

    // ── Cinematic intro ──────────────────────────────────────────────────────
    // While loading/title/driving, the scroll ride is suspended: the bike is
    // driven manually (leaning against a building, then animating to the t=0
    // start) and the camera holds the close-up before easing back to the opening
    // chase. Handing off at t=0 is seamless because the drive-in ends exactly on
    // the t=0 route pose the scroll ride would start from.
    const phase = introPhaseRef.current;
    if (phase !== 'live') {
      const state0 = bikePath.state(0);
      // Drive-in progress is measured off a wall-clock timestamp captured the
      // moment we enter 'driving', so it always plays over exactly
      // INTRO_DRIVE_DURATION regardless of frame timing (a delta-accumulator can
      // fast-forward if the START re-render stalls a frame).
      if (phase === 'driving' && prevPhaseRef.current !== 'driving') {
        driveStartRef.current = performance.now();
      }
      prevPhaseRef.current = phase;
      const p = phase === 'driving'
        ? introEase(
            (performance.now() - driveStartRef.current)
              / (INTRO_DRIVE_DURATION * 1000),
          )
        : 0;
      // Bike drives the merge curve facing its direction of travel (not sliding
      // sideways): position follows the bezier, yaw tracks the curve tangent, and
      // the heading eases out of the parked orientation over the first fifth so
      // there's no snap when START is pressed. It arrives at the t=0 pose heading
      // straight down the street.
      const bikePos = introDrivePosition(p, state0.pos, introScratch.pos);
      const parkedQuat = introScratch.parkedQuat
        .copy(introYawQuat).multiply(state0.quat);
      const headingQuat = introScratch.headingQuat
        .setFromAxisAngle(introScratch.yUp, introDriveYaw(p, state0.pos))
        .multiply(state0.quat);
      const bikeQuat = parkedQuat.slerp(headingQuat, introEase(Math.min(1, p / 0.2)));
      const driveDistance = INTRO_BIKE_LEAN_POS.distanceTo(state0.pos);
      bikeRef.current?.setManualState(bikePos, bikeQuat, {
        lean: THREE.MathUtils.lerp(INTRO_BIKE_LEAN_ANGLE, state0.pose.lean, p),
        pitch: 0,
        crouch: THREE.MathUtils.lerp(INTRO_BIKE_LEAN_CROUCH, state0.pose.crouch, p),
        wheelSpin: wheelRotationForDistance(driveDistance * p),
      });
      // Camera: hold the close-up, then ease to the opening chase pose.
      if (camera instanceof THREE.PerspectiveCamera) {
        const chase = rig.sample(0);
        camera.position.copy(INTRO_CAM_POS).lerp(chase.position, p);
        cameraTargetRef.current.copy(INTRO_CAM_TARGET).lerp(chase.target, p);
        camera.fov = THREE.MathUtils.lerp(INTRO_CAM_FOV, chase.fov, p);
        camera.up.set(0, 1, 0);
        camera.lookAt(cameraTargetRef.current);
        camera.rotateY(-mouse.x * PARALLAX_YAW);
        camera.rotateX(-mouse.y * PARALLAX_PITCH);
        camera.updateProjectionMatrix();
        // Seed the damp state so the live ride continues from this exact pose
        // (no first-frame snap to rig.sample(0)).
        camInitedRef.current = true;
        desiredPosRef.current.copy(chase.position);
        desiredTargetRef.current.copy(chase.target);
        desiredFovRef.current = chase.fov;
      }
      scene.userData.activeSection = 'intro';
      scene.userData.contentProgress = 0;
      scene.userData.fxProgress = 0;
      if (phase === 'driving' && p >= 1 && !introDoneRef.current) {
        introDoneRef.current = true;
        onIntroCompleteRef.current?.();
      }
      return;
    }

    // ── Poster click-to-zoom ──────────────────────────────────────────────────
    // While a poster is zoomed the ride freezes: the scroll-driven bike + camera
    // updates below are skipped and the camera flies to a face-on view of the
    // board, holds, then flies back to the exact pose it opened from on close.
    const zoom = getPosterZoomState();
    if (zoom.status !== 'idle' && zoom.target
      && camera instanceof THREE.PerspectiveCamera) {
      const ZOOM_MS = 850;
      const from = zoomFromRef.current;
      const to = zoomToRef.current;
      const outFrom = zoomOutFromRef.current;
      if (zoom.status === 'in' && zoomPrevStatusRef.current !== 'in') {
        from.position.copy(camera.position);
        from.target.copy(cameraTargetRef.current);
        from.fov = camera.fov;
        const aspect = size.width / Math.max(1, size.height);
        const pose = faceOnPose(zoom.target, aspect);
        to.target.copy(pose.target);
        // Clip-safe backing: the ideal face-on distance can put the camera inside a
        // building (narrow research canyon, boxed-in TTT board). March the backing
        // ray against the building OBBs and stop short of the nearest one, then widen
        // the lens just enough to still frame the board at that safe distance.
        const dir = pose.position.clone().sub(pose.target).normalize();
        const idealDist = pose.position.distanceTo(pose.target);
        const centerY = pose.target.y;
        let maxDist = idealDist;
        for (const o of obbs) {
          if (o.top <= centerY) continue;
          const ox = pose.target.x - o.cx;
          const oz = pose.target.z - o.cz;
          const co = Math.cos(o.rot);
          const so = Math.sin(o.rot);
          const lox = ox * co + oz * so;
          const loz = -ox * so + oz * co;
          const ldx = dir.x * co + dir.z * so;
          const ldz = -dir.x * so + dir.z * co;
          let tmin = 0;
          let tmax = Number.POSITIVE_INFINITY;
          let ok = true;
          for (const [lo, ld, h] of [
            [lox, ldx, o.hx] as const,
            [loz, ldz, o.hz] as const,
          ]) {
            if (Math.abs(ld) < 1e-9) {
              if (lo < -h || lo > h) { ok = false; break; }
            } else {
              let t1 = (-h - lo) / ld;
              let t2 = (h - lo) / ld;
              if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
              tmin = Math.max(tmin, t1);
              tmax = Math.min(tmax, t2);
              if (tmin > tmax) { ok = false; break; }
            }
          }
          if (ok && tmin > 0.5 && tmin < maxDist) maxDist = tmin;
        }
        const usedDist = Math.max(12, Math.min(idealDist, maxDist - 4));
        to.position.copy(pose.target).addScaledVector(dir, usedDist);
        // fov that fits the whole board (both axes, small margin) at usedDist,
        // clamped to a natural range so open boards stay ~38° and boxed boards
        // widen only modestly rather than going fisheye.
        const fitH = 2 * Math.atan((zoom.target.height / 2 * 1.06) / usedDist);
        const fitW = 2 * Math.atan(
          (zoom.target.width / 2 * 1.06) / usedDist / aspect,
        );
        to.fov = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(Math.max(fitH, fitW)),
          34,
          60,
        );
        zoomStartRef.current = performance.now();
      }
      if (zoom.status === 'out' && zoomPrevStatusRef.current !== 'out') {
        outFrom.position.copy(camera.position);
        outFrom.target.copy(cameraTargetRef.current);
        outFrom.fov = camera.fov;
        zoomStartRef.current = performance.now();
      }
      zoomPrevStatusRef.current = zoom.status;

      const raw = zoom.status === 'held'
        ? 1
        : Math.min(1, (performance.now() - zoomStartRef.current) / ZOOM_MS);
      const e = raw * raw * raw * (raw * (raw * 6 - 15) + 10); // smootherstep
      const scratch = zoomScratchRef.current;
      if (zoom.status === 'in' || zoom.status === 'held') {
        scratch.pos.copy(from.position).lerp(to.position, e);
        scratch.tgt.copy(from.target).lerp(to.target, e);
        camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, e);
        if (zoom.status === 'in' && raw >= 1) setPosterZoomStatus('held');
      } else {
        scratch.pos.copy(outFrom.position).lerp(from.position, e);
        scratch.tgt.copy(outFrom.target).lerp(from.target, e);
        camera.fov = THREE.MathUtils.lerp(outFrom.fov, from.fov, e);
        if (raw >= 1) setPosterZoomStatus('idle');
      }
      camera.position.copy(scratch.pos);
      cameraTargetRef.current.copy(scratch.tgt);
      camera.up.set(0, 1, 0);
      camera.lookAt(cameraTargetRef.current);
      camera.updateProjectionMatrix();
      // Seed the scroll damp so the ride resumes from the frozen pose (no snap).
      camInitedRef.current = true;
      desiredPosRef.current.copy(from.position);
      desiredTargetRef.current.copy(from.target);
      desiredFovRef.current = from.fov;
      return;
    }
    zoomPrevStatusRef.current = 'idle';

    const snapshot = store.read();
    const targetRaw = snapshot.raw;
    // Lock factor for the research canyon (1 = strictly track scroll, no delay).
    // Uses last frame's semantic — one-frame latency at the boundary is invisible.
    const researchLock = researchLockAmount(semanticRef.current);
    if (!progressInitedRef.current) {
      smoothRawRef.current = targetRaw;
      progressInitedRef.current = true;
    } else {
      // ~0.3 s ease so a big per-tick jump glides in smoothly instead of snapping;
      // ramped toward near-1:1 inside the research canyon so the bike snaps to the
      // scroll there.
      const rawRate = THREE.MathUtils.lerp(3.6, RESEARCH_LOCK_RAW_RATE, researchLock);
      smoothRawRef.current = THREE.MathUtils.damp(smoothRawRef.current, targetRaw, rawRate, delta);
      if (Math.abs(smoothRawRef.current - targetRaw) < 1e-5) smoothRawRef.current = targetRaw;
    }
    // Drive bike + camera-target from the smoothed progress every frame it moves.
    if (smoothRawRef.current !== lastAppliedRawRef.current) {
      semanticRef.current = director.setProgress(smoothRawRef.current);
      updateCountRef.current += 1;
      lastAppliedRawRef.current = smoothRawRef.current;
    }
    lastVersionRef.current = snapshot.version;

    // Second-stage bike smoothing. Damping the bike's *progress* — not its world
    // position — keeps it glued to the route spline (no corner-cutting) while
    // turning discrete scroll ticks into a continuous glide. The trail is driven
    // from the SAME smoothed value on the SAME frame (right after the bike pose
    // is applied, so it reads the fresh bike state), so the ribbon never drifts
    // off the bike the way it did when the trail followed the raw scroll-remap.
    if (!bikeInitedRef.current) {
      bikeSmoothSemanticRef.current = bikeTargetSemanticRef.current;
      bikeInitedRef.current = true;
    } else {
      bikeSmoothSemanticRef.current = THREE.MathUtils.damp(
        bikeSmoothSemanticRef.current,
        bikeTargetSemanticRef.current,
        THREE.MathUtils.lerp(BIKE_SMOOTH_RATE, RESEARCH_LOCK_BIKE_RATE, researchLock),
        delta,
      );
      if (
        Math.abs(bikeSmoothSemanticRef.current - bikeTargetSemanticRef.current)
        < 1e-6
      ) {
        bikeSmoothSemanticRef.current = bikeTargetSemanticRef.current;
      }
    }
    bikeRef.current?.setProgress(bikeSmoothSemanticRef.current);
    bikeRef.current?.setTrailFx(bikeSmoothSemanticRef.current);

    // Critically-damp the camera toward the scroll-driven pose every frame. This
    // is what makes transitions seamless: the per-key rig stops (velocity → 0) at
    // every keyframe, so snapping to it reads as choppy; easing toward it gives
    // continuous motion through scene hand-offs. The target damps alongside the
    // position, so the bike stays framed the whole way.
    if (camera instanceof THREE.PerspectiveCamera) {
      if (!camInitedRef.current) {
        camera.position.copy(desiredPosRef.current);
        cameraTargetRef.current.copy(desiredTargetRef.current);
        camera.fov = desiredFovRef.current;
        camInitedRef.current = true;
      } else {
        // Damping rate (~0.15 s settle); ramped up in the research canyon so the
        // camera stays locked to the (near-1:1) bike and the shot reads as pinned.
        const L = THREE.MathUtils.lerp(6.5, RESEARCH_LOCK_CAM_RATE, researchLock);
        const p = camera.position;
        const dp = desiredPosRef.current;
        p.x = THREE.MathUtils.damp(p.x, dp.x, L, delta);
        p.y = THREE.MathUtils.damp(p.y, dp.y, L, delta);
        p.z = THREE.MathUtils.damp(p.z, dp.z, L, delta);
        const c = cameraTargetRef.current;
        const dt = desiredTargetRef.current;
        c.x = THREE.MathUtils.damp(c.x, dt.x, L, delta);
        c.y = THREE.MathUtils.damp(c.y, dt.y, L, delta);
        c.z = THREE.MathUtils.damp(c.z, dt.z, L, delta);
        camera.fov = THREE.MathUtils.damp(camera.fov, desiredFovRef.current, L, delta);
      }
      // Anti-clip: never let the camera sit inside a building — if its XZ is over
      // a footprint, ride up over that roof. Ramped by penetration so it eases up
      // as it approaches rather than popping (keeps the motion smooth).
      const MARGIN = 5;
      const CLEAR = 8;
      const cx = camera.position.x;
      const cz = camera.position.z;
      let minY = camera.position.y;
      for (const o of obbs) {
        const dx = cx - o.cx;
        const dz = cz - o.cz;
        const c = Math.cos(o.rot);
        const s = Math.sin(o.rot);
        const lx = dx * c + dz * s;
        const lz = -dx * s + dz * c;
        const penX = o.hx + MARGIN - Math.abs(lx);
        const penZ = o.hz + MARGIN - Math.abs(lz);
        if (penX > 0 && penZ > 0) {
          const ramp = Math.min(1, Math.min(penX, penZ) / MARGIN);
          const need = o.top + CLEAR;
          if (need > camera.position.y) {
            minY = Math.max(minY, camera.position.y + (need - camera.position.y) * ramp);
          }
        }
      }
      camera.position.y = minY;
      camera.up.set(0, 1, 0);
      camera.lookAt(cameraTargetRef.current);
      // Mouse look-around peek layered on top of the scripted view.
      camera.rotateY(-mouse.x * PARALLAX_YAW);
      camera.rotateX(-mouse.y * PARALLAX_PITCH);
      camera.updateProjectionMatrix();
    }
  }, -100);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      mouseTargetRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseTargetRef.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    if (!inspect) return undefined;
    const api = {
      version: 1 as const,
      rawForSemantic,
      snapshot: (): ScrollInspectionSnapshot => {
        const progress = store.read();
        const bike = bikeRef.current?.snapshot();
        const bikeObject = bikeRef.current?.object();
        const bikeNdc = bike
          ? new THREE.Vector3(...bike.position).project(camera)
          : undefined;
        const bikeFraming = bikeObject
          ? measureBikeFraming(bikeObject, camera, size)
          : undefined;
        const ribbon = scene.getObjectByName('bike-tron-ribbon');
        const echoes = scene.getObjectByName('bike-afterimages');
        const echoMesh = echoes instanceof THREE.InstancedMesh
          ? echoes
          : undefined;
        const echoAlpha = echoMesh?.geometry.getAttribute('instanceAlpha');
        let minimumEchoAlpha = Number.POSITIVE_INFINITY;
        let maximumEchoAlpha = 0;
        const echoColors: Array<[number, number, number]> = [];
        const echoAlphas: number[] = [];
        if (echoAlpha) {
          const echoCount = echoMesh?.count ?? 0;
          for (let index = 0; index < echoCount; index += 1) {
            const alpha = echoAlpha.getX(index);
            echoAlphas.push(alpha);
            minimumEchoAlpha = Math.min(
              minimumEchoAlpha,
              alpha,
            );
            maximumEchoAlpha = Math.max(
              maximumEchoAlpha,
              alpha,
            );
            if (echoMesh?.instanceColor) {
              echoColors.push([
                echoMesh.instanceColor.getX(index),
                echoMesh.instanceColor.getY(index),
                echoMesh.instanceColor.getZ(index),
              ]);
            }
          }
        }
        const expectedBike = bikePath.state(semanticRef.current);
        const expectedCamera = rig.sample(semanticRef.current);
        const sentinel = document.querySelector<HTMLElement>(
          '[data-scroll-sentinel]',
        );
        const pin = document.querySelector<HTMLElement>('[data-scroll-pin]');
        const maximum = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        return {
          raw: progress.raw,
          semanticT: semanticRef.current,
          updateCount: updateCountRef.current,
          adapterOrder: ADAPTER_ORDER,
          activeSection: String(scene.userData.activeSection ?? 'intro'),
          camera: {
            position: camera.position.toArray(),
            target: cameraTargetRef.current.toArray(),
            fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 0,
            roll: measureCameraRoll(camera),
            positionError: camera.position.distanceTo(expectedCamera.position),
            targetError: cameraTargetRef.current.distanceTo(expectedCamera.target),
            fovError: camera instanceof THREE.PerspectiveCamera
              ? Math.abs(camera.fov - expectedCamera.fov)
              : Number.POSITIVE_INFINITY,
          },
          bike: bike && bikeNdc && bikeFraming ? {
            ...bike,
            ndc: bikeNdc.toArray(),
            inFrame: !bikeFraming.clipped
              && bikeFraming.visibleFraction === 1,
            framing: bikeFraming,
            positionError: new THREE.Vector3(...bike.position)
              .distanceTo(expectedBike.pos),
            quaternionError: 1 - Math.abs(
              new THREE.Quaternion(...bike.quaternion).dot(expectedBike.quat),
            ),
            poseError: Math.max(
              Math.abs(bike.pose.lean - expectedBike.pose.lean),
              Math.abs(bike.pose.pitch - expectedBike.pose.pitch),
              Math.abs(bike.pose.crouch - expectedBike.pose.crouch),
              Math.abs(bike.pose.wheelSpin - expectedBike.pose.wheelSpin),
            ),
          } : undefined,
          canvas: { width: size.width, height: size.height },
          scroll: {
            y: window.scrollY,
            maximum,
            sentinelHeight: sentinel?.getBoundingClientRect().height ?? 0,
            pinned: pin?.dataset.scrollRuntime === 'active',
            shot: sentinel?.dataset.shot === 'true',
            reducedMotion: sentinel?.dataset.reducedMotion === 'true',
          },
          performance: frameMetrics(frameSamplesRef.current),
          trails: ribbon instanceof THREE.Mesh
            && ribbon.geometry instanceof THREE.BufferGeometry
            && echoMesh
            && echoMesh.instanceColor
            && echoAlpha
            ? {
                ribbonVisible: ribbon.visible,
                ribbonTriangles: ribbon.geometry.drawRange.count / 3,
                ribbonSampleCount:
                  ribbon.geometry.drawRange.count / 6 + 1,
                echoVisible: echoMesh.visible,
                echoCount: echoMesh.count,
                positionBufferId: (
                  ribbon.geometry.getAttribute('position') as THREE.BufferAttribute
                ).id,
                instanceMatrixId: echoMesh.instanceMatrix.id,
                instanceColorId: echoMesh.instanceColor.id,
                instanceAlphaId: (
                  echoAlpha as THREE.InstancedBufferAttribute
                ).id,
                minimumEchoAlpha: Number.isFinite(minimumEchoAlpha)
                  ? minimumEchoAlpha
                  : 0,
                maximumEchoAlpha,
                finaleOpacity: bike?.finaleOpacity ?? 1,
                echoColors,
                echoAlphas,
              }
            : undefined,
        };
      },
      measureSubjects: (subjectIds: readonly string[]) =>
        measureMountedSceneSubjects(scene, camera, size, subjectIds),
      setTrailsEnabledForMeasurement: (enabled: boolean) => {
        const ribbon = scene.getObjectByName('bike-tron-ribbon');
        const echoes = scene.getObjectByName('bike-afterimages');
        if (ribbon) ribbon.visible = enabled;
        if (echoes) echoes.visible = enabled;
      },
    };
    window.__EVANLY_SCROLL__ = api;
    return () => {
      if (window.__EVANLY_SCROLL__ === api) delete window.__EVANLY_SCROLL__;
    };
  }, [bikePath, bikeRef, camera, inspect, rig, scene, size.height, size.width, store]);

  useEffect(() => () => {
    delete scene.userData.activeSection;
    delete scene.userData.contentProgress;
    delete scene.userData.fxProgress;
  }, [scene]);

  return null;
}
