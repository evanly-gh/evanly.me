import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSignLayout } from '../src/world/signLayout';
import {
  FACADE_SIGN_RENDER_CONFIG,
  buildSignRenderBatches,
  disposeOwnedSignResources,
} from '../src/components/three/signRender';

const positionOf = (matrix: THREE.Matrix4): THREE.Vector3 =>
  new THREE.Vector3().setFromMatrixPosition(matrix);

const scaleOf = (matrix: THREE.Matrix4): THREE.Vector3 => {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return scale;
};

describe('batched sign render assemblies', () => {
  it('batches all assemblies into at most twenty-five draw objects', () => {
    const signs = buildSignLayout();
    const facade = signs.filter((sign) => sign.mode === 'facade');
    const holograms = signs.filter((sign) => sign.mode === 'hologram');
    const batches = buildSignRenderBatches(signs);

    expect(batches.facadeScreens).toHaveLength(8);
    expect(batches.hologramScreens.length).toBeLessThanOrEqual(4);
    expect(batches.facadeScreens.flatMap(({ instances }) => instances)).toHaveLength(
      facade.length,
    );
    expect(batches.backings.instances).toHaveLength(facade.length);
    expect(batches.attachments.instances).toHaveLength(facade.length * 4);
    expect(batches.hologramScreens.flatMap(({ instances }) => instances)).toHaveLength(
      holograms.length,
    );
    expect(batches.emitters.instances).toHaveLength(holograms.length);
    expect(batches.beams.instances).toHaveLength(holograms.length);
    expect(batches.drawObjectCount).toBe(16);
    expect(batches.drawObjectCount).toBeLessThanOrEqual(25);
  });

  it('preserves per-sign matrices, dimensions, parent metadata, and depth separation', () => {
    const signs = buildSignLayout();
    const sign = signs.find((candidate) => candidate.mode === 'facade')!;
    if (sign.mode !== 'facade') throw new Error('Missing facade sign');
    const batches = buildSignRenderBatches(signs);
    const screen = batches.facadeScreens
      .flatMap(({ instances }) => instances)
      .find(({ id }) => id === sign.id)!;
    const backing = batches.backings.instances.find(({ id }) => id === sign.id)!;
    const screenPosition = positionOf(screen.matrix);
    const backingPosition = positionOf(backing.matrix);
    const screenScale = scaleOf(screen.matrix);
    const backingScale = scaleOf(backing.matrix);
    const normal = new THREE.Vector3(
      Math.sin(sign.rotationY),
      0,
      Math.cos(sign.rotationY),
    );

    expect(screen.parentId).toBe(sign.parentId);
    expect(screenPosition.toArray()).toEqual(sign.position);
    expect(screenScale.x).toBeCloseTo(sign.width, 10);
    expect(screenScale.y).toBeCloseTo(sign.height, 10);
    expect(backingScale.x).toBeCloseTo(sign.width + 0.8, 10);
    expect(backingScale.y).toBeCloseTo(sign.height + 0.8, 10);
    expect(backingScale.z).toBeCloseTo(FACADE_SIGN_RENDER_CONFIG.backing.depth, 10);
    expect(screenPosition.clone().sub(backingPosition).dot(normal)
      - FACADE_SIGN_RENDER_CONFIG.backing.depth / 2).toBeCloseTo(0.06, 10);
  });

  it('disposes only owned textures and materials', () => {
    const disposed: string[] = [];
    const ownedTexture = { dispose: () => disposed.push('texture') };
    const ownedMaterial = { dispose: () => disposed.push('material') };
    const unrelated = { dispose: () => disposed.push('unrelated') };

    disposeOwnedSignResources({
      textures: [ownedTexture],
      materials: [ownedMaterial],
    });

    expect(disposed).toEqual(['texture', 'material']);
    expect(unrelated).toBeDefined();
  });
});
