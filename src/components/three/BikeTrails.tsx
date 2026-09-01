import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import * as THREE from 'three';
import {
  BIKE_TRAIL_MAX_SAMPLES,
  bikeAfterimageDistanceAt,
  buildBikeAfterimageField,
  createBikeTrailSampler,
  writeAfterimageAlphas,
  type BikeAfterimageField,
  type BikeTrailSampler,
} from '../../choreography/bikeTrail';
import type { BikeState } from '../../choreography/bikePath';
import { useCommittedThreeResource } from './useCommittedThreeResources';

const TRAIL_VERTEX_SHADER = `
  attribute float trailAlpha;
  attribute float trailAge;
  varying float vAlpha;
  varying float vAge;
  void main() {
    vAlpha = trailAlpha;
    vAge = trailAge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Sandevistan colour cascade: the trail's colour cycles through a cyberpunk
// palette (cyan → magenta → violet → cyan) several times along its length, so
// distinct bands stripe the ribbon. Because vAge is tied to how far a point sits
// behind the moving head, a fixed world point's phase drifts as the bike
// advances — the bands appear to flow backward down the trail, no time uniform
// needed.
const TRAIL_FRAGMENT_SHADER = `
  varying float vAlpha;
  varying float vAge;
  const float TRAIL_COLOR_CYCLES = 3.0;
  vec3 cyberpunkBand(float phase) {
    vec3 cyan = vec3(0.0, 0.92, 1.0);
    vec3 magenta = vec3(1.0, 0.12, 0.80);
    vec3 violet = vec3(0.55, 0.22, 1.0);
    if (phase < 0.3333) {
      return mix(cyan, magenta, phase / 0.3333);
    } else if (phase < 0.6666) {
      return mix(magenta, violet, (phase - 0.3333) / 0.3333);
    }
    return mix(violet, cyan, (phase - 0.6666) / 0.3334);
  }
  void main() {
    float phase = fract(vAge * TRAIL_COLOR_CYCLES);
    gl_FragColor = vec4(cyberpunkBand(phase), vAlpha);
  }
`;

// Afterimage silhouettes carry a static per-instance colour (baked gradient) and
// a dynamic per-instance alpha (revealed sequentially as the bike passes each).
const AFTERIMAGE_VERTEX_SHADER = `
  attribute float instanceAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = instanceColor;
    vAlpha = instanceAlpha;
    vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
  }
`;

const AFTERIMAGE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.001) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

interface BikeTrailsResources {
  sampler: BikeTrailSampler;
  ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  afterimages: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  afterimageField: BikeAfterimageField;
  trailPositions: THREE.BufferAttribute;
  trailAlpha: THREE.BufferAttribute;
  trailAge: THREE.BufferAttribute;
  afterimageAlpha: THREE.InstancedBufferAttribute;
}

export interface BikeTrailsHandle {
  setProgress(
    semanticT: number,
    finaleFade?: number,
    currentState?: BikeState,
  ): void;
  objects(): {
    ribbon: THREE.Mesh;
    afterimages: THREE.InstancedMesh;
  } | null;
}

function createTrailGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(
    new Float32Array(BIKE_TRAIL_MAX_SAMPLES * 2 * 3),
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  const alpha = new THREE.BufferAttribute(
    new Float32Array(BIKE_TRAIL_MAX_SAMPLES * 2),
    1,
  ).setUsage(THREE.DynamicDrawUsage);
  const age = new THREE.BufferAttribute(
    new Float32Array(BIKE_TRAIL_MAX_SAMPLES * 2),
    1,
  ).setUsage(THREE.DynamicDrawUsage);
  const indices = new Uint16Array((BIKE_TRAIL_MAX_SAMPLES - 1) * 6);
  for (let index = 0; index < BIKE_TRAIL_MAX_SAMPLES - 1; index += 1) {
    const vertex = index * 2;
    const offset = index * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 2;
    indices[offset + 2] = vertex + 1;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 2;
    indices[offset + 5] = vertex + 3;
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('trailAlpha', alpha);
  geometry.setAttribute('trailAge', age);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function createShaderMaterial(
  vertexShader: string,
  fragmentShader: string,
  blending: THREE.Blending = THREE.NormalBlending,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending,
    toneMapped: false,
  });
}

export function applyBikeTrailsProgress(
  resources: BikeTrailsResources,
  semanticT: number,
  finaleFade = 1,
  currentState?: BikeState,
): void {
  const sample = resources.sampler.update(
    semanticT,
    finaleFade,
    currentState,
  );
  const positionArray = resources.trailPositions.array as Float32Array;
  const alphaArray = resources.trailAlpha.array as Float32Array;
  const ageArray = resources.trailAge.array as Float32Array;
  const activePositionCount = sample.trailCount * 6;
  for (let index = 0; index < activePositionCount; index += 1) {
    positionArray[index] = sample.trailPositions[index];
  }
  for (let index = 0; index < sample.trailCount; index += 1) {
    const age = sample.trailAges[index];
    const opacity = Math.pow(1 - age, 1.35)
      * 0.72
      * THREE.MathUtils.clamp(finaleFade, 0, 1);
    alphaArray[index * 2] = opacity;
    alphaArray[index * 2 + 1] = opacity;
    ageArray[index * 2] = age;
    ageArray[index * 2 + 1] = age;
  }
  resources.trailPositions.needsUpdate = true;
  resources.trailAlpha.needsUpdate = true;
  resources.trailAge.needsUpdate = true;
  resources.ribbon.geometry.setDrawRange(0, (sample.trailCount - 1) * 6);

  // Reveal tracks the bike's CURRENT distance (not a latched maximum): silhouettes
  // ahead of the bike fade in as it passes, and conceal again on reverse scroll.
  writeAfterimageAlphas(
    resources.afterimageField,
    bikeAfterimageDistanceAt(semanticT),
    finaleFade,
    resources.afterimageAlpha.array as Float32Array,
  );
  resources.afterimageAlpha.needsUpdate = true;
}

export const BikeTrails = forwardRef<BikeTrailsHandle, {
  ghostGeometry: THREE.BufferGeometry;
}>(function BikeTrails({ ghostGeometry }, forwardedRef) {
  const desiredSemantic = useRef(0);
  const desiredFade = useRef(1);
  const desiredState = useRef<BikeState | undefined>(undefined);
  const resourcesRef = useRef<BikeTrailsResources | null>(null);
  const resources = useCommittedThreeResource(
    'bike-trails',
    ({ own }) => {
      const ribbonGeometry = own(createTrailGeometry());
      const ribbonMaterial = own(createShaderMaterial(
        TRAIL_VERTEX_SHADER,
        TRAIL_FRAGMENT_SHADER,
      ));
      const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
      ribbon.name = 'bike-tron-ribbon';
      ribbon.frustumCulled = false;
      ribbon.renderOrder = 30;

      // Frozen silhouettes for the whole route. Transforms + colours are baked
      // once here; only per-instance alpha changes per frame (reveal + fade).
      const afterimageField = buildBikeAfterimageField();
      const afterimageGeometry = own(ghostGeometry.clone());
      const afterimageAlpha = new THREE.InstancedBufferAttribute(
        new Float32Array(afterimageField.count),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      afterimageGeometry.setAttribute('instanceAlpha', afterimageAlpha);
      const afterimageMaterial = own(createShaderMaterial(
        AFTERIMAGE_VERTEX_SHADER,
        AFTERIMAGE_FRAGMENT_SHADER,
        THREE.AdditiveBlending,
      ));
      const afterimages = own(new THREE.InstancedMesh(
        afterimageGeometry,
        afterimageMaterial,
        afterimageField.count,
      ));
      afterimages.name = 'bike-afterimages';
      afterimages.frustumCulled = false;
      afterimages.renderOrder = 29;
      afterimages.count = afterimageField.count;
      afterimages.instanceMatrix.array.set(afterimageField.matrices);
      afterimages.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      afterimages.instanceMatrix.needsUpdate = true;
      afterimages.instanceColor = new THREE.InstancedBufferAttribute(
        Float32Array.from(afterimageField.colors),
        3,
      );
      afterimages.instanceColor.needsUpdate = true;

      const value: BikeTrailsResources = {
        sampler: createBikeTrailSampler(),
        ribbon,
        afterimages,
        afterimageField,
        trailPositions: ribbonGeometry.getAttribute(
          'position',
        ) as THREE.BufferAttribute,
        trailAlpha: ribbonGeometry.getAttribute(
          'trailAlpha',
        ) as THREE.BufferAttribute,
        trailAge: ribbonGeometry.getAttribute(
          'trailAge',
        ) as THREE.BufferAttribute,
        afterimageAlpha,
      };
      return {
        value,
        resources: [
          ribbonGeometry,
          ribbonMaterial,
          afterimageGeometry,
          afterimageMaterial,
          afterimages,
        ],
      };
    },
    [ghostGeometry],
  );

  const apply = (
    semanticT: number,
    finaleFade = desiredFade.current,
    currentState?: BikeState,
  ): void => {
    desiredSemantic.current = semanticT;
    desiredFade.current = finaleFade;
    desiredState.current = currentState;
    if (resourcesRef.current) {
      applyBikeTrailsProgress(
        resourcesRef.current,
        semanticT,
        finaleFade,
        currentState,
      );
    }
  };

  useImperativeHandle(forwardedRef, () => ({
    setProgress: apply,
    objects: () => resourcesRef.current
      ? {
          ribbon: resourcesRef.current.ribbon,
          afterimages: resourcesRef.current.afterimages,
        }
      : null,
  }), []);

  useLayoutEffect(() => {
    resourcesRef.current = resources;
    if (resources) {
      applyBikeTrailsProgress(
        resources,
        desiredSemantic.current,
        desiredFade.current,
        desiredState.current,
      );
    }
    return () => {
      if (resourcesRef.current === resources) resourcesRef.current = null;
    };
  }, [resources]);

  if (!resources) return null;
  return (
    <group name="bike-trails">
      <primitive object={resources.ribbon} dispose={null} />
      <primitive object={resources.afterimages} dispose={null} />
    </group>
  );
});
