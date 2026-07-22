import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { styleShibuyaWallMaterial } from '../src/components/three/shibuyaMaterial';

describe('Shibuya wall material treatment', () => {
  it('preserves facade textures while adding restrained local visibility', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      roughness: 0.7,
    });
    const styled = styleShibuyaWallMaterial(material);

    expect(styled).toBe(material);
    expect(styled.map).toBe(texture);
    expect(styled.emissive.getHex()).toBe(0x2f5875);
    expect(styled.emissiveIntensity).toBe(0.9);
    expect(styled.toneMapped).toBe(true);
  });

  it('leaves non-standard materials intact', () => {
    const material = new THREE.MeshBasicMaterial();
    expect(styleShibuyaWallMaterial(material)).toBe(material);
  });
});
