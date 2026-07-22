import * as THREE from 'three';

const ROBOT_DARK = new THREE.Color(0x121922);

function materialColor(material: THREE.Material): THREE.Color {
  if ('color' in material && material.color instanceof THREE.Color) {
    return material.color.clone();
  }
  return new THREE.Color(0x59636f);
}

function materialMap(material: THREE.Material): THREE.Texture | null {
  if ('map' in material && (material.map === null || material.map instanceof THREE.Texture)) {
    return material.map;
  }
  return null;
}

export function styleRobotMaterial(
  source: THREE.Material,
  accent: THREE.Color,
): THREE.MeshStandardMaterial {
  const styled = source instanceof THREE.MeshStandardMaterial
    || source instanceof THREE.MeshPhysicalMaterial
    ? source.clone()
    : new THREE.MeshStandardMaterial({
      color: materialColor(source),
      map: materialMap(source),
      transparent: source.transparent,
      opacity: source.opacity,
      side: source.side,
    });

  styled.color.copy(materialColor(source)).lerp(ROBOT_DARK, 0.82);
  styled.roughness = 0.48;
  styled.metalness = 0.72;
  styled.emissive.copy(accent);
  styled.emissiveIntensity = 0.14;
  styled.needsUpdate = true;
  return styled;
}

export function createRobotMaterialDisposer(root: THREE.Object3D): () => void {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
    }
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const material of materials) material.dispose();
  };
}
