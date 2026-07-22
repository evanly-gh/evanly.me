import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { styleRobotMaterial } from '../src/components/three/robotMaterial';
import * as robotMaterials from '../src/components/three/robotMaterial';

describe('robot material styling', () => {
  it('clones standard materials before applying metallic styling', () => {
    const source = new THREE.MeshStandardMaterial({
      color: 0xff00ff,
      roughness: 0.9,
      metalness: 0.1,
    });
    const styled = styleRobotMaterial(source, new THREE.Color(0x00ffff));

    expect(styled).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(styled).not.toBe(source);
    expect(source.color.getHex()).toBe(0xff00ff);
    expect(source.roughness).toBe(0.9);
    expect(source.metalness).toBe(0.1);
    expect(styled.roughness).toBe(0.48);
    expect(styled.metalness).toBe(0.72);
  });

  it('converts non-standard materials without casting and preserves usable inputs', () => {
    const map = new THREE.Texture();
    const source = new THREE.MeshBasicMaterial({ color: 0x336699, map });
    const styled = styleRobotMaterial(source, new THREE.Color(0xffaa00));

    expect(styled).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(styled).not.toBe(source);
    expect(styled.map).toBe(map);
    expect(source.color.getHex()).toBe(0x336699);
    expect(source.map).toBe(map);
  });

  it('narrowly clones physical materials without mutating physical properties', () => {
    const source = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      clearcoat: 0.65,
    });
    const styled = styleRobotMaterial(source, new THREE.Color(0x00ffff));

    expect(styled).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(styled).not.toBe(source);
    expect(source.clearcoat).toBe(0.65);
  });

  it('disposes cloned robot materials without cached geometry or maps', () => {
    const createRobotMaterialDisposer = (
      robotMaterials as typeof robotMaterials & {
        createRobotMaterialDisposer: (root: THREE.Object3D) => () => void;
      }
    ).createRobotMaterialDisposer;
    expect(createRobotMaterialDisposer).toBeTypeOf('function');
    const geometry = new THREE.BoxGeometry();
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, [material, material]));
    let geometryDisposals = 0;
    let mapDisposals = 0;
    let materialDisposals = 0;
    geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
    map.addEventListener('dispose', () => { mapDisposals += 1; });
    material.addEventListener('dispose', () => { materialDisposals += 1; });
    const dispose = createRobotMaterialDisposer(root);
    dispose();
    dispose();
    expect(materialDisposals).toBe(1);
    expect(geometryDisposals).toBe(0);
    expect(mapDisposals).toBe(0);
  });
});
