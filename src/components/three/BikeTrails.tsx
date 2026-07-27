import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import * as THREE from 'three';
import {
  BIKE_ECHO_POOL_SIZE,
  BIKE_TRAIL_MAX_SAMPLES,
  createBikeTrailSampler,
  type BikeTrailSampler,
} from '../../choreography/bikeTrail';
import type { BikeState } from '../../choreography/bikePath';
import { useCommittedThreeResource } from './useCommittedThreeResources';

const TRAIL_VERTEX_SHADER = `
  attribute float trailAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = trailAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAGMENT_SHADER = `
  varying float vAlpha;
  void main() {
    vec3 tronCyan = vec3(0.0, 0.86, 1.0);
    gl_FragColor = vec4(tronCyan, vAlpha);
  }
`;

const ECHO_VERTEX_SHADER = `
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

const ECHO_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

interface BikeTrailsResources {
  sampler: BikeTrailSampler;
  ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  echoes: THREE.InstancedMesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  trailPositions: THREE.BufferAttribute;
  trailAlpha: THREE.BufferAttribute;
  echoAlpha: THREE.InstancedBufferAttribute;
  matrix: THREE.Matrix4;
}

export interface BikeTrailsHandle {
  setProgress(
    semanticT: number,
    finaleFade?: number,
    currentState?: BikeState,
  ): void;
  objects(): {
    ribbon: THREE.Mesh;
    echoes: THREE.InstancedMesh;
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
  const activePositionCount = sample.trailCount * 6;
  for (let index = 0; index < activePositionCount; index += 1) {
    positionArray[index] = sample.trailPositions[index];
  }
  for (let index = 0; index < sample.trailCount; index += 1) {
    const opacity = Math.pow(1 - sample.trailAges[index], 1.35)
      * 0.72
      * THREE.MathUtils.clamp(finaleFade, 0, 1);
    alphaArray[index * 2] = opacity;
    alphaArray[index * 2 + 1] = opacity;
  }
  resources.trailPositions.needsUpdate = true;
  resources.trailAlpha.needsUpdate = true;
  resources.ribbon.geometry.setDrawRange(0, (sample.trailCount - 1) * 6);

  const colorArray = resources.echoes.instanceColor?.array as Float32Array;
  const echoAlphaArray = resources.echoAlpha.array as Float32Array;
  for (let index = 0; index < BIKE_ECHO_POOL_SIZE; index += 1) {
    resources.matrix.fromArray(sample.echoMatrices, index * 16);
    resources.echoes.setMatrixAt(index, resources.matrix);
    const colorOffset = index * 4;
    const instanceOffset = index * 3;
    colorArray[instanceOffset] = sample.echoColors[colorOffset];
    colorArray[instanceOffset + 1] = sample.echoColors[colorOffset + 1];
    colorArray[instanceOffset + 2] = sample.echoColors[colorOffset + 2];
    echoAlphaArray[index] = sample.echoColors[colorOffset + 3];
  }
  resources.echoes.count = sample.echoCount;
  resources.echoes.instanceMatrix.needsUpdate = true;
  if (resources.echoes.instanceColor) {
    resources.echoes.instanceColor.needsUpdate = true;
  }
  resources.echoAlpha.needsUpdate = true;
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

      const echoGeometry = own(ghostGeometry.clone());
      const echoAlpha = new THREE.InstancedBufferAttribute(
        new Float32Array(BIKE_ECHO_POOL_SIZE),
        1,
      ).setUsage(THREE.DynamicDrawUsage);
      echoGeometry.setAttribute('instanceAlpha', echoAlpha);
      const echoMaterial = own(createShaderMaterial(
        ECHO_VERTEX_SHADER,
        ECHO_FRAGMENT_SHADER,
        THREE.AdditiveBlending,
      ));
      const echoes = own(new THREE.InstancedMesh(
        echoGeometry,
        echoMaterial,
        BIKE_ECHO_POOL_SIZE,
      ));
      echoes.name = 'bike-sandevistan-echoes';
      echoes.frustumCulled = false;
      echoes.renderOrder = 29;
      echoes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      echoes.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(BIKE_ECHO_POOL_SIZE * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage);

      const value: BikeTrailsResources = {
        sampler: createBikeTrailSampler(),
        ribbon,
        echoes,
        trailPositions: ribbonGeometry.getAttribute(
          'position',
        ) as THREE.BufferAttribute,
        trailAlpha: ribbonGeometry.getAttribute(
          'trailAlpha',
        ) as THREE.BufferAttribute,
        echoAlpha,
        matrix: new THREE.Matrix4(),
      };
      return {
        value,
        resources: [
          ribbonGeometry,
          ribbonMaterial,
          echoGeometry,
          echoMaterial,
          echoes,
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
          echoes: resourcesRef.current.echoes,
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
      <primitive object={resources.echoes} dispose={null} />
    </group>
  );
});
