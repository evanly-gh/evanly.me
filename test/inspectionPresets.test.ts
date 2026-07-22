import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  INSPECTION_PRESET_IDS,
  INSPECTION_PRESETS,
  applyInspectionPreset,
  getInspectionPreset,
  shouldEnableInspection,
} from '../src/world/inspectionPresets';

describe('visual inspection presets', () => {
  it('publishes every required deterministic Task 6 view in stable order', () => {
    expect(INSPECTION_PRESET_IDS).toEqual([
      'straight-crosswalk-close',
      'shibuya-overhead',
      'shibuya-street-level',
      'highway-collision-corridor',
      'bridge-approach',
      'bridge-end',
      'water-pier-side',
      'moon-sightline',
      'facade-sign-close',
      'hologram-close',
    ]);
    expect(Object.keys(INSPECTION_PRESETS)).toEqual(INSPECTION_PRESET_IDS);
    expect(new Set(INSPECTION_PRESET_IDS).size).toBe(INSPECTION_PRESET_IDS.length);
  });

  it('returns immutable copies with finite, distinct camera positions and targets', () => {
    for (const id of INSPECTION_PRESET_IDS) {
      const first = getInspectionPreset(id);
      const second = getInspectionPreset(id);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect([...first.position, ...first.target, first.fov].every(Number.isFinite)).toBe(true);
      expect(new THREE.Vector3(...first.position).distanceTo(
        new THREE.Vector3(...first.target),
      )).toBeGreaterThan(1);
      first.position[0] = Number.NaN;
      expect(getInspectionPreset(id).position[0]).not.toBeNaN();
    }
  });

  it('applies position, target, and projection deterministically', () => {
    const camera = new THREE.PerspectiveCamera(58, 16 / 9, 1, 8000);
    const preset = applyInspectionPreset(camera, 'bridge-end');
    const expectedDirection = new THREE.Vector3(...preset.target)
      .sub(new THREE.Vector3(...preset.position))
      .normalize();
    const actualDirection = camera.getWorldDirection(new THREE.Vector3());

    expect(camera.position.toArray()).toEqual(preset.position);
    expect(camera.fov).toBe(preset.fov);
    expect(actualDirection.angleTo(expectedDirection)).toBeLessThan(1e-9);
  });

  it('rejects unknown preset ids without moving the camera', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    expect(() => applyInspectionPreset(camera, 'missing' as never)).toThrow(/preset/i);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
  });

  it('enables globals only for development inspect queries', () => {
    expect(shouldEnableInspection(true, '?city&inspect&task4=1')).toBe(true);
    expect(shouldEnableInspection(true, '?city&task4=1')).toBe(false);
    expect(shouldEnableInspection(false, '?city&inspect&task4=1')).toBe(false);
  });

  it('frames deterministic facade and hologram targets at close range', () => {
    const cases = [
      ['facade-sign-close', [208.57921093413654, 21.49027072840709, -400.8492331094949]],
      ['hologram-close', [159.1791752733725, 44, 28.688454428564107]],
    ] as const;
    for (const [id, expectedTarget] of cases) {
      const selected = getInspectionPreset(id);
      const target = new THREE.Vector3(...selected.target);
      const position = new THREE.Vector3(...selected.position);
      expect(target.distanceTo(new THREE.Vector3(...expectedTarget))).toBeLessThan(0.1);
      expect(position.distanceTo(target)).toBeGreaterThan(8);
      expect(position.distanceTo(target)).toBeLessThan(24);
    }
  });

  it('uses honest oblique Shibuya and horizon-continuation views', () => {
    const overhead = getInspectionPreset('shibuya-overhead');
    const direction = new THREE.Vector3(...overhead.target)
      .sub(new THREE.Vector3(...overhead.position))
      .normalize();
    expect(Math.abs(direction.y)).toBeLessThan(0.55);
    const street = getInspectionPreset('shibuya-street-level');
    expect(street.position[2]).toBeLessThan(-60);

    const bridgeEnd = getInspectionPreset('bridge-end');
    expect(bridgeEnd.target[2]).toBeLessThanOrEqual(-2200);
  });
});
