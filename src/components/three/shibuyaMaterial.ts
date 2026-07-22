import * as THREE from 'three';

export function styleShibuyaWallMaterial(
  material: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial;
export function styleShibuyaWallMaterial(material: THREE.Material): THREE.Material;
export function styleShibuyaWallMaterial(material: THREE.Material): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  material.emissive.setHex(0x2f5875);
  material.emissiveIntensity = 0.9;
  material.toneMapped = true;
  return material;
}
