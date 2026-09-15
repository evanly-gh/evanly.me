import * as THREE from 'three';

// three.js re-composes every object's local matrix and re-multiplies its world
// matrix each frame while `matrixAutoUpdate` is on (the default). The city is
// ~1,000+ objects and almost all of them never move, and this traversal
// measured ~2 ms per frame of main-thread time on the profiling laptop. After
// the world has settled we compute world matrices once and switch the static
// subtrees to manual updates. Anything animated stays live via DYNAMIC_ROOTS
// (its whole subtree is left alone), and objects mounted later still get their
// matrices because a fresh object always has matrixAutoUpdate=true.

const DYNAMIC_ROOTS = /production-bike-rider|bike-trails|ad-holo-bob|intro-billboard/i;

export function freezeStaticMatrices(scene: THREE.Scene): number {
  scene.updateMatrixWorld(true);
  let frozen = 0;
  const visit = (object: THREE.Object3D, dynamicAncestor: boolean) => {
    const dynamic = dynamicAncestor
      || DYNAMIC_ROOTS.test(object.name)
      || (object as THREE.Camera).isCamera === true;
    if (!dynamic && object !== scene && object.matrixAutoUpdate) {
      object.matrixAutoUpdate = false;
      frozen += 1;
    }
    for (const child of object.children) visit(child, dynamic);
  };
  visit(scene, false);
  return frozen;
}
