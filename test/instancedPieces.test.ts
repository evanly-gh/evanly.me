import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import {
  cloneInstancedMaterial,
  type InstancedMaterialTransform,
} from '../src/components/three/InstancedPieces';
import * as instancing from '../src/components/three/InstancedPieces';

const source = readFileSync(
  new URL('../src/components/three/InstancedPieces.tsx', import.meta.url),
  'utf8',
);

describe('InstancedPieces material transform', () => {
  it('uses the shared catalog scale calculation for rendered instances', () => {
    expect(source).toContain("from '../../world/buildingCatalog'");
    expect(source).toContain('calculateRenderedScale(');
    expect(source).toContain('item.centerOffset');
  });

  it('applies the optional transform to a cloned material', () => {
    const cached = new THREE.MeshStandardMaterial({ color: 0xffffff });
    let received: THREE.Material | undefined;
    const transform: InstancedMaterialTransform = (material) => {
      received = material;
      material.name = 'transformed clone';
      return material;
    };

    const transformed = cloneInstancedMaterial(cached, transform);

    expect(received).not.toBe(cached);
    expect(transformed).toBe(received);
    expect(transformed.name).toBe('transformed clone');
  });

  it('isolates the cached GLTF material from pedestrian overrides', () => {
    const cached = new THREE.MeshStandardMaterial({
      color: 0xfefefe,
      roughness: 0.35,
      metalness: 0.8,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const transform: InstancedMaterialTransform = (material) => {
      const pedestrian = material as THREE.MeshStandardMaterial;
      pedestrian.color.set(0x14161e);
      pedestrian.roughness = 0.7;
      pedestrian.metalness = 0.2;
      pedestrian.emissive.set(0x2bfdf9);
      pedestrian.emissiveIntensity = 0.12;
      return pedestrian;
    };

    const transformed = cloneInstancedMaterial(
      cached,
      transform,
    ) as THREE.MeshStandardMaterial;

    expect(transformed).not.toBe(cached);
    expect(transformed.color.getHex()).toBe(0x14161e);
    expect(transformed.roughness).toBe(0.7);
    expect(transformed.metalness).toBe(0.2);
    expect(transformed.emissive.getHex()).toBe(0x2bfdf9);
    expect(transformed.emissiveIntensity).toBe(0.12);
    expect(cached.color.getHex()).toBe(0xfefefe);
    expect(cached.roughness).toBe(0.35);
    expect(cached.metalness).toBe(0.8);
    expect(cached.emissive.getHex()).toBe(0x000000);
    expect(cached.emissiveIntensity).toBe(0);
  });

  it('preserves the existing cloned tuning path when no transform is supplied', () => {
    const cached = new THREE.MeshStandardMaterial({
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
    });
    cached.name = 'neon';

    const transformed = cloneInstancedMaterial(cached) as THREE.MeshStandardMaterial;

    expect(transformed).not.toBe(cached);
    expect(transformed.emissiveIntensity).toBe(1.6);
    expect(cached.emissiveIntensity).toBe(0.4);
  });

  it('chunks placements deterministically without changing membership', () => {
    const buildSpatialChunks = (
      instancing as typeof instancing & {
        buildSpatialChunks: (
          items: Array<{ position: [number, number, number] }>,
          size?: number,
        ) => Array<{ id: string; items: Array<{ position: [number, number, number] }> }>;
      }
    ).buildSpatialChunks;
    expect(buildSpatialChunks).toBeTypeOf('function');
    const items = [
      { position: [181, 0, -1] as [number, number, number] },
      { position: [-1, 0, -1] as [number, number, number] },
      { position: [1, 0, 1] as [number, number, number] },
      { position: [180, 0, 0] as [number, number, number] },
    ];
    const chunks = buildSpatialChunks(items, 180);
    expect(chunks.map(({ id }) => id)).toEqual(['-1:-1', '0:0', '1:-1', '1:0']);
    expect(chunks.flatMap(({ items: members }) => members)).toHaveLength(items.length);
    expect(new Set(chunks.flatMap(({ items: members }) => members)))
      .toEqual(new Set(items));
    expect(buildSpatialChunks(items, 180)).toEqual(chunks);
  });

  it('preserves exact placement transforms after chunking', () => {
    const composePlacementMatrix = (
      instancing as typeof instancing & {
        composePlacementMatrix: (
          item: {
            position: [number, number, number];
            rotationY: number;
            scale?: number;
            foot?: number;
            centerOffset?: [number, number];
          },
          footRadius: number,
          height: number,
          targetHeight: number | undefined,
          local: THREE.Matrix4,
        ) => THREE.Matrix4;
      }
    ).composePlacementMatrix;
    expect(composePlacementMatrix).toBeTypeOf('function');
    const local = new THREE.Matrix4().makeTranslation(0, 1, 0);
    const actual = composePlacementMatrix({
      position: [10, 2, 20],
      rotationY: Math.PI / 2,
      scale: 2,
      foot: 3,
      centerOffset: [1, -2],
    }, 2, 4, undefined, local);
    const expected = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().compose(
        new THREE.Vector3(11, 2, 18),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
        new THREE.Vector3(1.5, 1.5, 1.5),
      ),
      local,
    );
    expect(actual.elements).toEqual(expected.elements);
  });

  it('computes a finite bounding sphere for each chunk mesh', () => {
    const applyInstanceMatrices = (
      instancing as typeof instancing & {
        applyInstanceMatrices: (
          mesh: THREE.InstancedMesh,
          matrices: THREE.Matrix4[],
        ) => void;
      }
    ).applyInstanceMatrices;
    expect(applyInstanceMatrices).toBeTypeOf('function');
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      2,
    );
    applyInstanceMatrices(mesh, [
      new THREE.Matrix4().makeTranslation(0, 0, 0),
      new THREE.Matrix4().makeTranslation(100, 0, 0),
    ]);
    expect(mesh.count).toBe(2);
    expect(mesh.boundingSphere?.center.x).toBeCloseTo(50, 6);
    expect(mesh.boundingSphere?.radius).toBeGreaterThan(50);
  });

  it('disposes cloned materials once across double cleanup', () => {
    const createOwnedMaterialDisposer = (
      instancing as typeof instancing & {
        createOwnedMaterialDisposer: (
          materials: THREE.Material[],
        ) => () => void;
      }
    ).createOwnedMaterialDisposer;
    expect(createOwnedMaterialDisposer).toBeTypeOf('function');
    const material = new THREE.MeshStandardMaterial();
    let disposals = 0;
    material.addEventListener('dispose', () => { disposals += 1; });
    const dispose = createOwnedMaterialDisposer([material, material]);
    dispose();
    dispose();
    expect(disposals).toBe(1);
  });

  it('uses default frustum culling for spatial chunks', () => {
    expect(source).not.toContain('frustumCulled={false}');
    expect(source).toContain('computeBoundingSphere()');
  });
});
