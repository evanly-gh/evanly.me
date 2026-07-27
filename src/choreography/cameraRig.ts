import * as THREE from 'three';

export type CameraInterpolationMode = 'smooth' | 'hold' | 'cut' | 'dolly';

export interface CamPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface CamKey extends CamPose {
  t: number;
  /** Controls interpolation from this key to the next key. */
  mode?: CameraInterpolationMode;
}

const VALID_MODES = new Set<CameraInterpolationMode>([
  'smooth',
  'hold',
  'cut',
  'dolly',
]);

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function clonePose(pose: CamPose): CamPose {
  return {
    position: pose.position.clone(),
    target: pose.target.clone(),
    fov: pose.fov,
  };
}

function validateKey(key: CamKey): void {
  const values = [
    key.t,
    key.fov,
    ...key.position.toArray(),
    ...key.target.toArray(),
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error('CameraRig key values must be finite');
  }
  if (key.fov <= 0 || key.fov >= 180) {
    throw new Error('CameraRig FOV must be between 0 and 180 degrees');
  }
  if (key.mode !== undefined && !VALID_MODES.has(key.mode)) {
    throw new Error(`CameraRig interpolation mode is invalid: ${key.mode}`);
  }
}

function cloneKey(key: CamKey): CamKey {
  return {
    ...clonePose(key),
    t: key.t,
    mode: key.mode,
  };
}

export class CameraRig {
  private readonly keys: CamKey[] = [];

  constructor(keys: readonly CamKey[] = []) {
    for (const key of keys) this.addKey(key);
  }

  addKey(key: CamKey): void {
    validateKey(key);
    const previous = this.keys.at(-1);
    if (previous !== undefined && key.t <= previous.t) {
      throw new Error('CameraRig key times must be strictly increasing');
    }
    this.keys.push(cloneKey(key));
  }

  getKeyframes(): readonly CamKey[] {
    return this.keys.map(cloneKey);
  }

  sample(t: number): CamPose {
    if (!Number.isFinite(t)) {
      throw new Error('CameraRig sample progress must be finite');
    }
    if (this.keys.length === 0) {
      throw new Error('CameraRig has no keyframes');
    }
    if (this.keys.length === 1) return clonePose(this.keys[0]);

    const exactKey = this.keys.find((key) => t === key.t);
    if (exactKey !== undefined) return clonePose(exactKey);

    const first = this.keys[0];
    const last = this.keys[this.keys.length - 1];
    if (t <= first.t) return clonePose(first);
    if (t >= last.t) return clonePose(last);

    let lowerIndex = 0;
    for (let index = 0; index < this.keys.length - 1; index += 1) {
      if (t <= this.keys[index + 1].t) {
        lowerIndex = index;
        break;
      }
    }

    const lower = this.keys[lowerIndex];
    const upper = this.keys[lowerIndex + 1];

    const rawFraction = (t - lower.t) / (upper.t - lower.t);
    const mode = lower.mode ?? 'smooth';
    if (mode === 'hold') return clonePose(lower);
    if (mode === 'cut') return clonePose(upper);
    const fraction = mode === 'dolly' ? rawFraction : smoothstep(rawFraction);

    return {
      position: new THREE.Vector3().lerpVectors(
        lower.position,
        upper.position,
        fraction,
      ),
      target: new THREE.Vector3().lerpVectors(
        lower.target,
        upper.target,
        fraction,
      ),
      fov: THREE.MathUtils.lerp(lower.fov, upper.fov, fraction),
    };
  }

  apply(camera: THREE.PerspectiveCamera, t: number): CamPose {
    const pose = this.sample(t);
    camera.position.copy(pose.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.target);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return pose;
  }
}
