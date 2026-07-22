import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PointerLockControls, useEnvironment, useGLTF, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../../theme';
import {
  buildShibuyaIntersection,
  buildStraightRoadCrossings,
  shibuyaPlazaContains,
} from '../../world/intersections';
import { ROADS, buildCurveRibbon } from '../../world/roads';
import {
  INSPECTION_PRESET_IDS,
  applyInspectionPreset,
  getInspectionPreset,
  shouldEnableInspection,
  type InspectionPreset,
  type InspectionPresetId,
} from '../../world/inspectionPresets';

const URL_PARAMS = new URLSearchParams(location.search);
const FREECAM = URL_PARAMS.has('freecam');
const IS_DEVELOPMENT = (
  import.meta as ImportMeta & { env: { DEV: boolean } }
).env.DEV;
const INSPECT_ENABLED = shouldEnableInspection(IS_DEVELOPMENT, location.search);

/** Small procedural asphalt texture: dark base + noise speckle + patches. */
function makeAsphaltTexture(): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#0c0e16';
  ctx.fillRect(0, 0, s, s);
  // fine noise speckle
  for (let i = 0; i < 6000; i++) {
    const v = 8 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
  }
  // a few darker patches / seams
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * s, Math.random() * s);
    ctx.lineTo(Math.random() * s, Math.random() * s);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}
import { MOON_POS, MOON_RADIUS } from '../../world/route';
import { buildCityLayout, buildProps, buildSkyline, buildStreetFurniture } from '../../world/cityLayout';
import { buildRampGeometry, JUNK, RAMP2, SCAFFOLD } from '../../world/setpieces';
import { KitPiece } from './KitPiece';
import { InstancedPieces, type InstancedMaterialTransform } from './InstancedPieces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCrowdLayout, ROBOT_FILES, type RobotSpot } from '../../world/crowdLayout';
import { buildStreetDressingLayout } from '../../world/streetDressing';
import { buildingPlacementBounds } from '../../world/buildingCatalog';
import { buildHighwayPillarLayout } from '../../world/highwayLayout';
import { styleRobotMaterial } from './robotMaterial';
import { useCommittedThreeResource } from './useCommittedThreeResources';
import { styleShibuyaWallMaterial } from './shibuyaMaterial';
import { buildShibuyaFacadePanels } from '../../world/visualFraming';
import {
  CITY_GROUND_BOUNDS,
  buildBridgeLayout,
} from '../../world/bridgeLayout';
import {
  BRIDGE_RENDER_CONFIG,
  MOON_RENDER_CONFIG,
  TASK4_SCENE_NAMES,
  WATER_RENDER_CONFIG,
  buildBridgeRenderGeometry,
  inspectTask4Scene,
  type Task4SceneSnapshot,
} from '../../world/finaleRender';
import { buildSignLayout, FACADE_SIGN_TARGET, HOLOGRAM_ANCHOR_IDS } from '../../world/signLayout';
import {
  FACADE_SIGN_RENDER_CONFIG,
  HOLOGRAM_SIGN_RENDER_CONFIG,
  TASK5_SCENE_NAMES,
  buildSignRenderBatches,
  frameTask5FacadeInspectionSubject,
  inspectTask5Scene,
  setTask5CameraView,
  type SignRenderBatch,
  type Task5CameraView,
  type Task5FacadeInspectionSubject,
  type Task5SceneSnapshot,
} from './signRender';
import { buildSignPixelArt, type SignArtVariant } from './signArt';

declare global {
  interface Window {
    __EVANLY_INSPECTION__?: {
      version: 1;
      listPresets: () => InspectionPreset[];
      setPreset: (id: InspectionPresetId) => InspectionPreset & {
        subject?: Task5FacadeInspectionSubject;
      };
    };
    __EVANLY_TASK4_INSPECTION__?: {
      version: 1;
      snapshot: () => Task4SceneSnapshot;
    };
    __EVANLY_TASK5_INSPECTION__?: {
      version: 1;
      snapshot: () => Task5SceneSnapshot;
      setView: (id: string, view: Task5CameraView) => boolean;
    };
  }
}

/** Procedural concrete texture for the ground (grime + cracks + faint blocks). */
function makeConcreteTexture(): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#23262e';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const v = 24 + Math.floor(Math.random() * 34);
    ctx.fillStyle = `rgba(${v},${v},${v + 6},${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(10,10,14,0.6)'; // block seams
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) { // cracks
    ctx.strokeStyle = 'rgba(8,8,12,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * s, Math.random() * s);
    ctx.lineTo(Math.random() * s, Math.random() * s);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.anisotropy = 4;
  return tex;
}

function makeSignTexture(
  i: number,
  variant: SignArtVariant,
): THREE.CanvasTexture {
  const art = buildSignPixelArt(i, variant);
  const cv = document.createElement('canvas');
  cv.width = art.width;
  cv.height = art.height;
  const ctx = cv.getContext('2d')!;
  const image = ctx.createImageData(art.width, art.height);
  image.data.set(art.data);
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function SignBatchMesh({
  batch,
  name,
  geometry,
  material,
  renderOrder = 0,
}: {
  batch: SignRenderBatch;
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  renderOrder?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    batch.instances.forEach(({ matrix }, index) => mesh.setMatrixAt(index, matrix));
    mesh.count = batch.instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch]);
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, batch.instances.length]}
      userData={{ instances: batch.instances }}
      renderOrder={renderOrder}
      frustumCulled={false}
    />
  );
}

export function Signs() {
  const signs = useMemo(() => buildSignLayout(), []);
  const batches = useMemo(() => buildSignRenderBatches(signs), [signs]);
  const resources = useCommittedThreeResource('signs', ({ own }) => {
    const facadeTextures = Array.from({ length: 8 }, (_, index) =>
      own(makeSignTexture(index, 'facade')));
    const hologramTextures = Array.from({ length: 4 }, (_, index) =>
      own(makeSignTexture(index, 'hologram')));
    const facadeMaterials = facadeTextures.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: FACADE_SIGN_RENDER_CONFIG.screen.side,
      toneMapped: FACADE_SIGN_RENDER_CONFIG.screen.toneMapped,
      polygonOffset: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffset,
      polygonOffsetFactor: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetFactor,
      polygonOffsetUnits: FACADE_SIGN_RENDER_CONFIG.screen.polygonOffsetUnits,
      depthTest: FACADE_SIGN_RENDER_CONFIG.screen.depthTest,
      depthWrite: FACADE_SIGN_RENDER_CONFIG.screen.depthWrite,
    })));
    const hologramMaterials = hologramTextures.map((map) => own(new THREE.MeshBasicMaterial({
      map,
      side: HOLOGRAM_SIGN_RENDER_CONFIG.screen.side,
      toneMapped: HOLOGRAM_SIGN_RENDER_CONFIG.screen.toneMapped,
      transparent: HOLOGRAM_SIGN_RENDER_CONFIG.screen.transparent,
      opacity: HOLOGRAM_SIGN_RENDER_CONFIG.screen.opacity,
      depthWrite: HOLOGRAM_SIGN_RENDER_CONFIG.screen.depthWrite,
      depthTest: HOLOGRAM_SIGN_RENDER_CONFIG.screen.depthTest,
      blending: HOLOGRAM_SIGN_RENDER_CONFIG.screen.blending,
    })));
    const backingMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x05060c,
      roughness: 0.8,
      metalness: 0.65,
    }));
    const attachmentMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x20283a,
      roughness: 0.45,
      metalness: 0.85,
    }));
    const emitterMaterial = own(new THREE.MeshStandardMaterial({
      color: HOLOGRAM_SIGN_RENDER_CONFIG.emitter.color,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: HOLOGRAM_SIGN_RENDER_CONFIG.emitter.emissiveIntensity,
      roughness: 0.35,
      metalness: 0.8,
      toneMapped: false,
    }));
    const beamMaterial = own(new THREE.MeshBasicMaterial({
      color: PALETTE.cyan,
      transparent: HOLOGRAM_SIGN_RENDER_CONFIG.beam.transparent,
      opacity: HOLOGRAM_SIGN_RENDER_CONFIG.beam.opacity,
      depthWrite: HOLOGRAM_SIGN_RENDER_CONFIG.beam.depthWrite,
      depthTest: HOLOGRAM_SIGN_RENDER_CONFIG.beam.depthTest,
      blending: HOLOGRAM_SIGN_RENDER_CONFIG.beam.blending,
      side: HOLOGRAM_SIGN_RENDER_CONFIG.beam.side,
      toneMapped: false,
    }));
    const value = {
      textures: [...facadeTextures, ...hologramTextures],
      facadeMaterials,
      hologramMaterials,
      backingMaterial,
      attachmentMaterial,
      emitterMaterial,
      beamMaterial,
      planeGeometry: own(new THREE.PlaneGeometry(1, 1)),
      boxGeometry: own(new THREE.BoxGeometry(1, 1, 1)),
      emitterGeometry: own(new THREE.CylinderGeometry(1, 1.14, 1, 20)),
      beamGeometry: own(new THREE.CylinderGeometry(0.16, 1, 1, 20, 1, true)),
    };
    return {
      value,
      resources: [
        ...value.textures,
        ...value.facadeMaterials,
        ...value.hologramMaterials,
        value.backingMaterial,
        value.attachmentMaterial,
        value.emitterMaterial,
        value.beamMaterial,
        value.planeGeometry,
        value.boxGeometry,
        value.emitterGeometry,
        value.beamGeometry,
      ],
    };
  }, []);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {batches.facadeScreens.map((batch) => (
        <SignBatchMesh
          key={`facade-${batch.textureIndex}`}
          batch={batch}
          name={TASK5_SCENE_NAMES.facadeScreen}
          geometry={resources.planeGeometry}
          material={resources.facadeMaterials[batch.textureIndex!]}
          renderOrder={FACADE_SIGN_RENDER_CONFIG.screen.renderOrder}
        />
      ))}
      <SignBatchMesh
        batch={batches.backings}
        name={TASK5_SCENE_NAMES.facadeBacking}
        geometry={resources.boxGeometry}
        material={resources.backingMaterial}
        renderOrder={FACADE_SIGN_RENDER_CONFIG.backing.renderOrder}
      />
      <SignBatchMesh
        batch={batches.attachments}
        name={TASK5_SCENE_NAMES.facadeAttachment}
        geometry={resources.boxGeometry}
        material={resources.attachmentMaterial}
      />
      {batches.hologramScreens.map((batch) => (
        <SignBatchMesh
          key={`hologram-${batch.textureIndex}`}
          batch={batch}
          name={TASK5_SCENE_NAMES.hologramScreen}
          geometry={resources.planeGeometry}
          material={resources.hologramMaterials[batch.textureIndex!]}
          renderOrder={HOLOGRAM_SIGN_RENDER_CONFIG.screen.renderOrder}
        />
      ))}
      <SignBatchMesh
        batch={batches.emitters}
        name={TASK5_SCENE_NAMES.hologramEmitter}
        geometry={resources.emitterGeometry}
        material={resources.emitterMaterial}
      />
      <SignBatchMesh
        batch={batches.beams}
        name={TASK5_SCENE_NAMES.hologramBeam}
        geometry={resources.beamGeometry}
        material={resources.beamMaterial}
        renderOrder={HOLOGRAM_SIGN_RENDER_CONFIG.beam.renderOrder}
      />
    </group>
  );
}

function EnvMap() {
  const texture = useEnvironment({ preset: 'night' });
  const { scene } = useThree();
  useEffect(() => {
    scene.environment = texture;
    scene.environmentIntensity = LIGHTING.envIntensity;
    return () => { scene.environment = null; };
  }, [scene, texture]);
  return null;
}

function ExposureSync() {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = LIGHTING.exposure; }, [gl]);
  return null;
}

/**
 * FPS-style fly camera: pointer-lock mouse-look (yaw/pitch only, no roll) +
 * frame-rate-independent WASD movement, Q/E for down/up, Shift to boost.
 */
function FreeCam() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);
  const dir = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k['ShiftLeft'] || k['ShiftRight'] ? 520 : 170) * Math.min(dt, 0.05);
    camera.getWorldDirection(dir.current).normalize();
    right.current.crossVectors(dir.current, camera.up).normalize();
    if (k['KeyW']) camera.position.addScaledVector(dir.current, speed);
    if (k['KeyS']) camera.position.addScaledVector(dir.current, -speed);
    if (k['KeyD']) camera.position.addScaledVector(right.current, speed);
    if (k['KeyA']) camera.position.addScaledVector(right.current, -speed);
    if (k['KeyE'] || k['Space']) camera.position.y += speed;
    if (k['KeyQ']) camera.position.y -= speed;
  });
  return <PointerLockControls makeDefault pointerSpeed={0.9} />;
}

// ── Roads: deck + sidewalks (raised curbs) + glowing edge/centre lines ──
export function Pillars() {
  const pillars = useMemo(() => buildHighwayPillarLayout(
    buildCityLayout().map(buildingPlacementBounds),
  ), []);
  const resources = useCommittedThreeResource('pillars', ({ own }) => {
    const material = own(new THREE.MeshStandardMaterial({
      color: 0x0d0f18,
      roughness: 0.7,
      metalness: 0.4,
    }));
    const geometries = pillars.map((pillar) =>
      own(new THREE.CylinderGeometry(2.2, pillar.radius, pillar.height, 8)));
    return {
      value: { material, geometries },
      resources: [material, ...geometries],
    };
  }, [pillars]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {pillars.map((p, i) => (
        <mesh
          key={i}
          geometry={resources.geometries[i]}
          material={resources.material}
          position={[p.x, p.height / 2, p.z]}
          dispose={null}
        />
      ))}
    </group>
  );
}

export function Roads() {
  const resources = useCommittedThreeResource('roads', ({ own }) => {
    const asphalt = own(makeAsphaltTexture());
    const deckMat = own(new THREE.MeshStandardMaterial({ color: 0x14161f, map: asphalt, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }));
    const underMat = own(new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.85, metalness: 0.35, side: THREE.DoubleSide }));
    const walkMat = own(new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9, metalness: 0.08 }));
    const curbMat = own(new THREE.MeshStandardMaterial({ color: 0x4c525f, roughness: 0.85, metalness: 0.1 }));
    const magenta = own(new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.2, toneMapped: false }));
    const amber = own(new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.8, toneMapped: false }));
    const teal = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const crossingMat = own(new THREE.MeshStandardMaterial({ color: 0xd8dbe6, roughness: 0.7, emissive: new THREE.Color(0x8891a6), emissiveIntensity: 0.25 }));
    const indicatorMat = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 2.1, toneMapped: false }));
    const intersection = buildShibuyaIntersection();
    const straightRoadCrossings = buildStraightRoadCrossings();
    const shape = new THREE.Shape();
    intersection.plaza.outline.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    shape.closePath();
    const geometry = own(new THREE.ExtrudeGeometry(shape, {
      depth: intersection.plaza.thickness,
      bevelEnabled: false,
    }));
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, intersection.plaza.surfaceY, 0);
    const plazaGeometry = geometry;
    const nodes = ROADS.map((r) => {
      const deck = own(buildCurveRibbon(r.curve, r.halfWidth, { lift: r.level }));
      const infrastructureClip = r.ground ? shibuyaPlazaContains : undefined;
      const edgeGlowL = own(buildCurveRibbon(r.curve, 0.3, { offset: r.halfWidth - 0.4, lift: r.level + 0.06, clip: infrastructureClip }));
      const edgeGlowR = own(buildCurveRibbon(r.curve, 0.3, { offset: -(r.halfWidth - 0.4), lift: r.level + 0.06, clip: infrastructureClip }));
      const centre = own(buildCurveRibbon(r.curve, 0.14, { lift: r.level + 0.06, clip: infrastructureClip }));
      // wide raised sidewalks (half-width 4.5 → 9 m) + a raised curb lip at the road edge
      const walkL = r.ground ? own(buildCurveRibbon(r.curve, 4.5, { offset: r.halfWidth + 4.5, lift: 0.45, clip: infrastructureClip })) : null;
      const walkR = r.ground ? own(buildCurveRibbon(r.curve, 4.5, { offset: -(r.halfWidth + 4.5), lift: 0.45, clip: infrastructureClip })) : null;
      const curbL = r.ground ? own(buildCurveRibbon(r.curve, 0.4, { offset: r.halfWidth + 0.4, lift: 0.5, clip: infrastructureClip })) : null;
      const curbR = r.ground ? own(buildCurveRibbon(r.curve, 0.4, { offset: -(r.halfWidth + 0.4), lift: 0.5, clip: infrastructureClip })) : null;
      // elevated decks get a dark under-slab (slightly wider, dropped down) so
      // the highway reads as a solid deck when viewed from underneath
      const underDeck = r.ground ? null : own(buildCurveRibbon(r.curve, r.halfWidth + 0.8, { lift: r.level - 1.4 }));
      return { deck, edgeGlowL, edgeGlowR, centre, walkL, walkR, curbL, curbR, underDeck, main: r.halfWidth > 10 };
    });
    const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
    const indicatorCylinder = own(new THREE.CylinderGeometry(1, 1, 1, 10));
    const nodeGeometries = nodes.flatMap((node) => [
      node.deck,
      node.edgeGlowL,
      node.edgeGlowR,
      node.centre,
      node.walkL,
      node.walkR,
      node.curbL,
      node.curbR,
      node.underDeck,
    ].filter((candidate): candidate is THREE.BufferGeometry => Boolean(candidate)));
    const value = {
      asphalt,
      deckMat,
      underMat,
      walkMat,
      curbMat,
      magenta,
      amber,
      teal,
      crossingMat,
      indicatorMat,
      intersection,
      straightRoadCrossings,
      plazaGeometry,
      nodes,
      unitBox,
      indicatorCylinder,
    };
    return {
      value,
      resources: [
        asphalt,
        deckMat,
        underMat,
        walkMat,
        curbMat,
        magenta,
        amber,
        teal,
        crossingMat,
        indicatorMat,
        plazaGeometry,
        unitBox,
        indicatorCylinder,
        ...nodeGeometries,
      ],
    };
  }, []);
  if (!resources) return null;
  const {
    deckMat,
    underMat,
    walkMat,
    curbMat,
    magenta,
    amber,
    teal,
    crossingMat,
    indicatorMat,
    intersection,
    straightRoadCrossings,
    plazaGeometry,
    nodes,
    unitBox,
    indicatorCylinder,
  } = resources;

  return (
    <group dispose={null}>
      {nodes.map((n, i) => (
        <group key={i}>
          {n.underDeck && <mesh geometry={n.underDeck} material={underMat} />}
          <mesh geometry={n.deck} material={deckMat} />
          {n.walkL && <mesh geometry={n.walkL} material={walkMat} />}
          {n.walkR && <mesh geometry={n.walkR} material={walkMat} />}
          {n.curbL && <mesh geometry={n.curbL} material={curbMat} />}
          {n.curbR && <mesh geometry={n.curbR} material={curbMat} />}
          <mesh geometry={n.edgeGlowL} material={n.main ? magenta : teal} />
          <mesh geometry={n.edgeGlowR} material={n.main ? magenta : teal} />
          <mesh geometry={n.centre} material={amber} />
        </group>
      ))}
      <mesh geometry={plazaGeometry} material={deckMat} />
      {[...intersection.crossings, ...straightRoadCrossings.crossings].flatMap((crossing) =>
        crossing.stripes.map((stripe, index) => (
          <mesh
            key={`${crossing.id}-${index}`}
            geometry={unitBox}
            material={crossingMat}
            position={stripe.center}
            rotation={[0, Math.atan2(-stripe.longAxis.z, stripe.longAxis.x), 0]}
            scale={[stripe.length, 0.025, stripe.width]}
            dispose={null}
          />
        )))}
      {[...intersection.indicators, ...straightRoadCrossings.indicators].map((indicator) => (
        <group
          key={indicator.id}
          position={indicator.center}
          rotation={[0, Math.atan2(-indicator.longAxis.z, indicator.longAxis.x), 0]}
        >
          <mesh
            geometry={unitBox}
            material={indicatorMat}
            scale={[indicator.length, indicator.height, indicator.width]}
            dispose={null}
          />
          {[-0.9, 0, 0.9].map((x) => (
            <mesh
              key={x}
              geometry={indicatorCylinder}
              material={indicatorMat}
              position={[x, 0.085, 0]}
              scale={[0.12, 0.09, 0.12]}
              dispose={null}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

function Buildings() {
  const layout = useMemo(() => buildCityLayout(), []);
  const [walls, ordinary] = useMemo(() => [
    layout.filter(({ layoutRole }) => layoutRole?.startsWith('shibuya-')),
    layout.filter(({ layoutRole }) => !layoutRole?.startsWith('shibuya-')),
  ], [layout]);
  return (
    <>
      <InstancedPieces placements={ordinary} />
      <InstancedPieces
        placements={walls}
        materialTransform={styleShibuyaWallMaterial}
      />
    </>
  );
}

function ShibuyaWallLighting() {
  return (
    <group>
      <pointLight
        position={[240, 72, 0]}
        color={'#d7e8ff'}
        intensity={12000}
        distance={220}
        decay={2}
      />
      <pointLight
        position={[240, 22, 0]}
        color={'#9fdcff'}
        intensity={4200}
        distance={220}
        decay={2}
      />
    </group>
  );
}

function makeShibuyaFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#07131f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < 14; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const active = (row * 7 + column * 11) % 5 !== 0;
      context.fillStyle = active
        ? (row % 3 === 0 ? '#79ddff' : '#4e7899')
        : '#111d28';
      context.fillRect(8 + column * 20, 8 + row * 17, 12, 9);
    }
  }
  context.strokeStyle = '#9ce8ff';
  context.lineWidth = 2;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function ShibuyaFacadePanels() {
  const panels = useMemo(() => buildShibuyaFacadePanels(
    buildCityLayout().filter(({ layoutRole }) =>
      layoutRole?.startsWith('shibuya-')),
  ), []);
  const resources = useCommittedThreeResource('shibuya-panels', ({ own }) => {
    const texture = own(makeShibuyaFacadeTexture());
    const material = own(new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xd7efff,
      toneMapped: false,
      fog: true,
    }));
    const geometry = own(new THREE.PlaneGeometry(1, 1));
    return {
      value: { material, geometry },
      resources: [texture, material, geometry],
    };
  }, []);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {panels.map((panel, index) => (
        <mesh
          key={`shibuya-facade-${index}`}
          position={panel.position}
          rotation={[0, panel.rotationY, 0]}
          scale={[panel.width, panel.height, 1]}
          geometry={resources.geometry}
          material={resources.material}
          dispose={null}
        />
      ))}
    </group>
  );
}

function Props() {
  const props = useMemo(() => buildProps(), []);
  return <InstancedPieces placements={props} />;
}

export function Ground() {
  const width = CITY_GROUND_BOUNDS.x1 - CITY_GROUND_BOUNDS.x0;
  const depth = CITY_GROUND_BOUNDS.z1 - CITY_GROUND_BOUNDS.z0;
  const resources = useCommittedThreeResource('ground', ({ own }) => {
    const texture = own(makeConcreteTexture());
    const geometry = own(new THREE.PlaneGeometry(width, depth));
    const material = own(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.95,
      metalness: 0.05,
    }));
    return {
      value: { geometry, material },
      resources: [texture, geometry, material],
    };
  }, [width, depth]);
  if (!resources) return null;
  return (
    <mesh
      geometry={resources.geometry}
      material={resources.material}
      dispose={null}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        (CITY_GROUND_BOUNDS.x0 + CITY_GROUND_BOUNDS.x1) / 2,
        CITY_GROUND_BOUNDS.y,
        (CITY_GROUND_BOUNDS.z0 + CITY_GROUND_BOUNDS.z1) / 2,
      ]}
    />
  );
}

/** Lamp posts + powerline poles/cables along the roads. */
export function StreetFurniture() {
  const { lamps, poles, cables } = useMemo(() => buildStreetFurniture(), []);
  const resources = useCommittedThreeResource('street-furniture', ({ own }) => {
    const poleGeometry = own(new THREE.CylinderGeometry(0.2, 0.26, 9, 6));
    const headGeometry = own(new THREE.BoxGeometry(0.7, 0.28, 0.5));
    const powerPoleGeometry = own(new THREE.CylinderGeometry(0.28, 0.34, 13, 6));
    const poleMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x14161f,
      roughness: 0.6,
      metalness: 0.5,
    }));
    const headMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x201607,
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 2.4,
      toneMapped: false,
    }));
    const powerPoleMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x121420,
      roughness: 0.6,
      metalness: 0.5,
    }));
    const cableMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0a0a0e,
      roughness: 0.9,
    }));
    const cableParts = cables.map((cable) => {
      const midpoint = cable.a.clone().add(cable.b).multiplyScalar(0.5);
      midpoint.y -= 2.2;
      return own(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([cable.a, midpoint, cable.b]),
        10,
        0.1,
        4,
        false,
      ));
    });
    const cableGeometry = cableParts.length > 0
      ? own(mergeGeometries(cableParts))
      : null;
    return {
      value: {
        poleGeometry,
        headGeometry,
        powerPoleGeometry,
        cableGeometry,
        poleMaterial,
        headMaterial,
        powerPoleMaterial,
        cableMaterial,
      },
      resources: [
        poleGeometry,
        headGeometry,
        powerPoleGeometry,
        ...cableParts,
        ...(cableGeometry ? [cableGeometry] : []),
        poleMaterial,
        headMaterial,
        powerPoleMaterial,
        cableMaterial,
      ],
    };
  }, [cables]);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const ppoleRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(1, 1, 1); const v = new THREE.Vector3();
    lamps.forEach((l, i) => {
      m.compose(v.set(l.pos.x, 4.5, l.pos.z), q, s); poleRef.current?.setMatrixAt(i, m);
      m.compose(v.set(l.pos.x + Math.sin(l.rotationY) * 1.5, 9, l.pos.z + Math.cos(l.rotationY) * 1.5), q, s); headRef.current?.setMatrixAt(i, m);
    });
    poles.forEach((p, i) => {
      m.compose(v.set(p.pos.x, 6.5, p.pos.z), q, s);
      ppoleRef.current?.setMatrixAt(i, m);
    });
    for (const r of [poleRef, headRef, ppoleRef]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [lamps, poles, resources]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      <instancedMesh ref={poleRef} args={[resources.poleGeometry, resources.poleMaterial, lamps.length]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={headRef} args={[resources.headGeometry, resources.headMaterial, lamps.length]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={ppoleRef} args={[resources.powerPoleGeometry, resources.powerPoleMaterial, poles.length]} frustumCulled={false} dispose={null} />
      {resources.cableGeometry && (
        <mesh
          geometry={resources.cableGeometry}
          material={resources.cableMaterial}
          dispose={null}
        />
      )}
    </group>
  );
}

// ── Cheap far-field skyline: two InstancedMeshes (dark + emissive) ──
export function Skyline() {
  const boxes = useMemo(() => buildSkyline(), []);
  const dark = useMemo(() => boxes.filter((b) => !b.emissive), [boxes]);
  const lit = useMemo(() => boxes.filter((b) => b.emissive), [boxes]);
  const resources = useCommittedThreeResource('skyline', ({ own }) => {
    const geometry = own(new THREE.BoxGeometry());
    const darkMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0b0e18,
      roughness: 0.8,
      metalness: 0.3,
    }));
    const litMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x0c0e1a,
      emissive: new THREE.Color(PALETTE.violet),
      emissiveIntensity: 0.14,
      toneMapped: true,
    }));
    return {
      value: { geometry, darkMaterial, litMaterial },
      resources: [geometry, darkMaterial, litMaterial],
    };
  }, []);
  const darkRef = useRef<THREE.InstancedMesh>(null);
  const litRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    dark.forEach((b, i) => darkRef.current?.setMatrixAt(i, b.matrix));
    lit.forEach((b, i) => litRef.current?.setMatrixAt(i, b.matrix));
    if (darkRef.current) darkRef.current.instanceMatrix.needsUpdate = true;
    if (litRef.current) litRef.current.instanceMatrix.needsUpdate = true;
  }, [dark, lit, resources]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      <instancedMesh
        ref={darkRef}
        args={[resources.geometry, resources.darkMaterial, dark.length]}
        dispose={null}
      />
      <instancedMesh
        ref={litRef}
        args={[resources.geometry, resources.litMaterial, lit.length]}
        dispose={null}
      />
    </group>
  );
}

/** Ramp 1 — an improvised junk pile: a rusty truck-bed wedge dressed with
 *  crates, a dumpster and wood planks. Rises 0 → 11 over the run (toward −Z). */
export function JunkRamp() {
  const { run, width, rise } = JUNK;
  const resources = useCommittedThreeResource('junk-ramp', ({ own }) => {
    const plank = own(new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.92, metalness: 0.04 }));
    const rust = own(new THREE.MeshStandardMaterial({ color: 0x5a3428, roughness: 0.85, metalness: 0.35 }));
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.7, metalness: 0.4 }));
    const wedge = own(buildRampGeometry(run, width, rise));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: { plank, rust, dark, wedge, box },
      resources: [plank, rust, dark, wedge, box],
    };
  }, [run, width, rise]);
  const ang = Math.atan2(rise, run);
  const hyp = Math.hypot(run, rise);
  const crates: [string, number, number, number, number][] = [
    ['BldgSM_C_Containers', 4, 0, width / 2 + 2.5, 0.2],
    ['BldgSM_C_CratesA', 9, 0, -width / 2 - 2, -0.3],
    ['BldgSM_C_CratesB', 15, 3, width / 2 + 2, 0.15],
    ['BldgSM_C_Boxes', 2.5, 0, -width / 2 - 3, 0.1],
  ];
  if (!resources) return null;
  return (
    <group position={JUNK.base} rotation={[0, JUNK.rotationY, 0]}>
      {/* rusty wedge (the "truck bed" you ride up) */}
      <mesh geometry={resources.wedge} material={resources.rust} dispose={null} />
      {/* wood planks laid along the ride surface */}
      {[-3.5, 0, 3.5].map((zc) => (
        <mesh
          key={zc}
          geometry={resources.box}
          material={resources.plank}
          position={[run / 2, rise / 2 + 0.18, zc]}
          rotation={[0, 0, ang]}
          scale={[hyp, 0.22, 3]}
          dispose={null}
        />
      ))}
      {/* dumpster shoved against the base */}
      <mesh
        geometry={resources.box}
        material={resources.dark}
        position={[2, 1.4, width / 2 + 1]}
        scale={[4.5, 2.8, 3]}
        dispose={null}
      />
      {/* KitBash crates / containers dressing the pile */}
      <Suspense fallback={null}>
        {crates.map(([f, x, y, z, r], i) => (
          <KitPiece key={i} file={`neocity/KB3D_NEC_${f}.glb`} position={[x, y, z]} rotationY={r} center />
        ))}
      </Suspense>
    </group>
  );
}

/** Ramp 2 — a thin metal kicker off the end of the deck (y13 → 22). */
export function Ramp2() {
  const { run, width, rise } = RAMP2;
  const resources = useCommittedThreeResource('ramp-2', ({ own }) => {
    const deckMaterial = own(new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.45, metalness: 0.7 }));
    const stripeMaterial = own(new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.9, toneMapped: false }));
    const railMaterial = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const geometry = own(buildRampGeometry(run, width, rise));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: {
        deckMaterial,
        stripeMaterial,
        railMaterial,
        geometry,
        box,
      },
      resources: [
        deckMaterial,
        stripeMaterial,
        railMaterial,
        geometry,
        box,
      ],
    };
  }, [run, width, rise]);
  const ang = Math.atan2(rise, run);
  const hyp = Math.hypot(run, rise);
  if (!resources) return null;
  return (
    <group position={RAMP2.base} rotation={[0, RAMP2.rotationY, 0]}>
      <mesh geometry={resources.geometry} material={resources.deckMaterial} dispose={null} />
      {/* thin ride plate + amber centre stripes */}
      {[0.3, 0.6, 0.9].map((f, j) => (
        <mesh
          key={j}
          geometry={resources.box}
          material={resources.stripeMaterial}
          position={[run * f, rise * f + 0.1, 0]}
          rotation={[0, 0, ang]}
          scale={[0.4, 0.05, width * 0.8]}
          dispose={null}
        />
      ))}
      {/* cyan side rails running up the slope */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          geometry={resources.box}
          material={resources.railMaterial}
          position={[run / 2, rise / 2 + 0.4, s * (width / 2)]}
          rotation={[0, 0, ang]}
          scale={[hyp, 0.12, 0.12]}
          dispose={null}
        />
      ))}
    </group>
  );
}

/** A supported scaffold lattice against a tall building's road-facing wall. */
/** Elevated scaffold deck the bike rides across (x=240, y=13), built as a
 *  pole lattice and tied into the adjacent building with cross-beams. */
export function Scaffold() {
  const S = SCAFFOLD;
  const resources = useCommittedThreeResource('scaffold', ({ own }) => {
    const metal = own(new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.55, metalness: 0.6 }));
    const plank = own(new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.8, metalness: 0.3 }));
    const rail = own(new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }));
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    return {
      value: { metal, plank, rail, box },
      resources: [metal, plank, rail, box],
    };
  }, []);
  const [cx, y, cz] = S.deckCenter;
  const l = S.deckLen, w = S.deckWidth;
  const z0 = cz - l / 2, z1 = cz + l / 2;
  const ex = [cx - w / 2, cx + w / 2]; // deck edges (support pole lines)
  const nPole = 7;
  const poleZs = Array.from({ length: nPole }, (_, i) => z0 + (l * i) / (nPole - 1));
  const braceAng = Math.atan2(l / (nPole - 1), y);
  const braceLen = Math.hypot(y, l / (nPole - 1));
  const buildingFace = S.buildingPos[0] - 20; // approx road-facing wall of the tie building
  if (!resources) return null;
  const { metal, plank, rail, box } = resources;
  return (
    <group>
      <Suspense fallback={null}>
        <KitPiece file={`neocity/${S.building}.glb`} position={S.buildingPos} rotationY={S.buildingRot} center />
      </Suspense>
      {/* deck slab + plank strips */}
      <mesh geometry={box} material={metal} position={[cx, y - S.deckThick / 2, cz]} scale={[w, S.deckThick, l]} dispose={null} />
      {[-w / 3, 0, w / 3].map((dx) => (
        <mesh key={dx} geometry={box} material={plank} position={[cx + dx, y + 0.03, cz]} scale={[w / 4, 0.08, l - 1]} dispose={null} />
      ))}
      {/* support pole lattice (both deck edges → ground) */}
      {poleZs.map((zc, i) => (
        <group key={'pz' + i}>
          {ex.map((px) => (
            <mesh key={px} geometry={box} material={metal} position={[px, y / 2, zc]} scale={[0.5, y, 0.5]} dispose={null} />
          ))}
          {/* transverse tie under the deck */}
          <mesh geometry={box} material={metal} position={[cx, y - 0.6, zc]} scale={[w, 0.3, 0.3]} dispose={null} />
        </group>
      ))}
      {/* long horizontal ledgers at two heights on both edges */}
      {ex.map((px) => [y * 0.45, y * 0.8].map((hy, j) => (
        <mesh key={px + '-' + j} geometry={box} material={metal} position={[px, hy, cz]} scale={[0.3, 0.3, l]} dispose={null} />
      )))}
      {/* diagonal braces up each edge (scaffolding lattice) */}
      {ex.map((px) => poleZs.slice(0, -1).map((zc, i) => (
        <mesh key={px + 'b' + i} geometry={box} material={metal} position={[px, y / 2, zc + l / (nPole - 1) / 2]} rotation={[braceAng * (i % 2 ? -1 : 1), 0, 0]} scale={[0.22, braceLen, 0.22]} dispose={null} />
      )))}
      {/* cyan guard rails along the two long edges (parallel to travel) */}
      {ex.map((px) => (
        <group key={'r' + px}>
          <mesh geometry={box} material={rail} position={[px, y + 0.9, cz]} scale={[0.12, 0.12, l]} dispose={null} />
          <mesh geometry={box} material={metal} position={[px, y + 0.45, cz]} scale={[0.18, 0.9, l]} dispose={null} />
        </group>
      ))}
      {/* tie-beams + brace bolting the deck into the adjacent building */}
      {[z0 + l * 0.25, cz, z1 - l * 0.25].map((zc, i) => (
        <mesh key={'tie' + i} geometry={box} material={metal} position={[(ex[1] + buildingFace) / 2, y - 0.5, zc]} scale={[buildingFace - ex[1], 0.35, 0.35]} dispose={null} />
      ))}
      {[z0 + l * 0.25, z1 - l * 0.25].map((zc, i) => {
        const span = buildingFace - ex[1];
        return (
          <mesh key={'d' + i} geometry={box} material={metal} position={[(ex[1] + buildingFace) / 2, y * 0.45, zc]} rotation={[0, 0, Math.atan2(y * 0.9, span)]} scale={[Math.hypot(span, y * 0.9), 0.25, 0.25]} dispose={null} />
        );
      })}
    </group>
  );
}

export function FinaleBridge() {
  const owned = useCommittedThreeResource('finale-bridge', ({ own }) => {
    const render = buildBridgeRenderGeometry();
    const renderGeometries = [
      render.deckTop,
      render.underSlab,
      render.centreLine,
      ...render.edges.map(({ geometry }) => geometry),
      ...render.rails.map(({ geometry }) => geometry),
      ...render.cableGeometries,
      render.horizon.deckTop,
      render.horizon.underSlab,
      render.horizon.centreLine,
      ...render.horizon.edges.map(({ geometry }) => geometry),
      ...render.horizon.rails.map(({ geometry }) => geometry),
    ];
    renderGeometries.forEach(own);
    const deckMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x111722,
      roughness: 0.62,
      metalness: 0.48,
      side: THREE.DoubleSide,
    }));
    const underMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x080b12,
      roughness: 0.82,
      metalness: 0.58,
      side: THREE.DoubleSide,
    }));
    const structureMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.5,
      metalness: 0.78,
    }));
    const cyanMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x05252c,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 2.2,
      toneMapped: false,
    }));
    const magentaMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x28051d,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 2.2,
      toneMapped: false,
    }));
    const amberMaterial = own(new THREE.MeshStandardMaterial({
      color: 0x2a1804,
      emissive: new THREE.Color(PALETTE.amber),
      emissiveIntensity: 2,
      toneMapped: false,
    }));
    const unitBox = own(new THREE.BoxGeometry(1, 1, 1));
    const pierCylinder = own(new THREE.CylinderGeometry(1, 1.18, 1, 12));
    const pylonCylinder = own(new THREE.CylinderGeometry(1, 1.35, 1, 12));
    const value = {
      render,
      deckMaterial,
      underMaterial,
      structureMaterial,
      cyanMaterial,
      magentaMaterial,
      amberMaterial,
      unitBox,
      pierCylinder,
      pylonCylinder,
    };
    return {
      value,
      resources: [
        ...renderGeometries,
        unitBox,
        pierCylinder,
        pylonCylinder,
        deckMaterial,
        underMaterial,
        structureMaterial,
        cyanMaterial,
        magentaMaterial,
        amberMaterial,
      ],
    };
  }, []);
  if (!owned) return null;
  const {
    render,
    deckMaterial,
    underMaterial,
    structureMaterial,
    cyanMaterial,
    magentaMaterial,
    amberMaterial,
    unitBox,
    pierCylinder,
    pylonCylinder,
  } = owned;
  const { layout } = render;
  const accentMaterials = { cyan: cyanMaterial, magenta: magentaMaterial };
  const shorelineWidth = layout.water.x1 - layout.water.x0;

  return (
    <group
      name="lifecycle-finale-bridge-owned"
      dispose={null}
    >
      <mesh geometry={render.underSlab} material={underMaterial} />
      <mesh
        name={TASK4_SCENE_NAMES.bridgeDeck}
        geometry={render.deckTop}
        material={deckMaterial}
      />
      <mesh geometry={render.centreLine} material={amberMaterial} />
      {render.edges.map(({ geometry, definition }, index) => (
        <mesh
          key={`bridge-edge-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.rails.map(({ geometry, definition }, index) => (
        <mesh
          key={`bridge-rail-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      <mesh geometry={render.horizon.underSlab} material={underMaterial} />
      <mesh
        name={TASK4_SCENE_NAMES.horizonDeck}
        geometry={render.horizon.deckTop}
        material={deckMaterial}
      />
      <mesh geometry={render.horizon.centreLine} material={amberMaterial} />
      {render.horizon.edges.map(({ geometry, definition }, index) => (
        <mesh
          key={`horizon-edge-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.horizon.rails.map(({ geometry, definition }, index) => (
        <mesh
          key={`horizon-rail-${index}`}
          geometry={geometry}
          material={accentMaterials[definition.accent]}
        />
      ))}
      {render.railPosts.map((post, index) => (
        <mesh
          key={`bridge-post-${index}`}
          position={post.position}
          scale={[
            BRIDGE_RENDER_CONFIG.railPostWidth,
            post.height,
            BRIDGE_RENDER_CONFIG.railPostWidth,
          ]}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {render.horizon.railPosts.map((post, index) => (
        <mesh
          key={`horizon-post-${index}`}
          position={post.position}
          scale={[
            BRIDGE_RENDER_CONFIG.railPostWidth,
            post.height,
            BRIDGE_RENDER_CONFIG.railPostWidth,
          ]}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.piers.map((pier) => {
        const height = pier.topY - pier.bottomY;
        return (
          <mesh
            key={`pier-${pier.u}`}
            position={[pier.position.x, pier.bottomY + height / 2, pier.position.z]}
            scale={[pier.radius, height, pier.radius]}
            geometry={pierCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.pierCaps.map((cap) => (
        <mesh
          key={`pier-cap-${cap.u}`}
          position={cap.position}
          scale={cap.size}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.horizon.piers.map((pier) => {
        const height = pier.topY - pier.bottomY;
        return (
          <mesh
            key={`horizon-pier-${pier.u}`}
            position={[pier.position.x, pier.bottomY + height / 2, pier.position.z]}
            scale={[pier.radius, height, pier.radius]}
            geometry={pierCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.horizon.pierCaps.map((cap) => (
        <mesh
          key={`horizon-pier-cap-${cap.u}`}
          position={cap.position}
          scale={cap.size}
          geometry={unitBox}
          material={structureMaterial}
        />
      ))}
      {layout.pylons.map((pylon) => {
        const height = pylon.top.y - pylon.base.y;
        return (
          <mesh
            key={`pylon-${pylon.t}-${pylon.side}`}
            position={[
              pylon.base.x,
              pylon.base.y + height / 2,
              pylon.base.z,
            ]}
            scale={[pylon.radius, height, pylon.radius]}
            geometry={pylonCylinder}
            material={structureMaterial}
          />
        );
      })}
      {render.cableGeometries.map((geometry, index) => (
        <mesh key={`bridge-cable-${index}`} geometry={geometry} material={cyanMaterial} />
      ))}
      <mesh
        position={[
          (layout.water.x0 + layout.water.x1) / 2,
          -4,
          layout.shoreline.z,
        ]}
        scale={[shorelineWidth, 8, 4]}
        geometry={unitBox}
        material={structureMaterial}
      />
    </group>
  );
}

const WATER_VERTEX_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 transformed = position;
    float broad = sin(position.x * 0.018 + uTime * 0.34) * 0.42;
    float cross = sin(position.y * 0.031 - uTime * 0.48) * 0.24;
    vWave = broad + cross;
    transformed.z += vWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const WATER_FRAGMENT_SHADER = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    float streak = pow(abs(sin(vUv.y * 420.0 + uTime * 0.7)), 28.0);
    float ripple = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 90.0 - uTime);
    vec3 deep = vec3(0.004, 0.012, 0.032);
    vec3 cyan = vec3(0.02, 0.22, 0.31);
    vec3 color = mix(deep, cyan, 0.16 + max(vWave, 0.0) * 0.12);
    color += cyan * streak * ripple * 0.34;
    gl_FragColor = vec4(color, 0.96);
  }
`;

export function WaterBasin() {
  const layout = useMemo(() => buildBridgeLayout(), []);
  const waterResources = useCommittedThreeResource('water', ({ own }) => {
    const geometry = own(new THREE.PlaneGeometry(
      layout.water.x1 - layout.water.x0,
      layout.water.z1 - layout.water.z0,
      WATER_RENDER_CONFIG.widthSegments,
      WATER_RENDER_CONFIG.heightSegments,
    ));
    const material = own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      side: WATER_RENDER_CONFIG.side,
      transparent: WATER_RENDER_CONFIG.transparent,
      depthWrite: WATER_RENDER_CONFIG.depthWrite,
      blending: WATER_RENDER_CONFIG.blending,
    }));
    return {
      value: { geometry, material },
      resources: [geometry, material],
    };
  }, [layout]);
  useFrame(({ clock }) => {
    if (waterResources) {
      waterResources.material.uniforms.uTime.value = clock.getElapsedTime();
    }
  });
  if (!waterResources) return null;
  return (
    <mesh
      name={TASK4_SCENE_NAMES.water}
      geometry={waterResources.geometry}
      material={waterResources.material}
      dispose={null}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        (layout.water.x0 + layout.water.x1) / 2,
        layout.water.y,
        (layout.water.z0 + layout.water.z1) / 2,
      ]}
    />
  );
}

export function Moon() {
  const [albedo, height] = useTexture([
    MOON_RENDER_CONFIG.textures.albedo.url,
    MOON_RENDER_CONFIG.textures.bump.url,
  ]);
  albedo.colorSpace = MOON_RENDER_CONFIG.textures.albedo.colorSpace;
  height.colorSpace = MOON_RENDER_CONFIG.textures.bump.colorSpace;
  return (
    <group position={MOON_POS}>
      <mesh name={TASK4_SCENE_NAMES.moonSurface}>
        <sphereGeometry
          args={[
            MOON_RADIUS,
            MOON_RENDER_CONFIG.surface.widthSegments,
            MOON_RENDER_CONFIG.surface.heightSegments,
          ]}
        />
        <meshStandardMaterial
          map={albedo}
          bumpMap={height}
          bumpScale={MOON_RENDER_CONFIG.surface.bumpScale}
          color={MOON_RENDER_CONFIG.surface.color}
          roughness={MOON_RENDER_CONFIG.surface.roughness}
          metalness={MOON_RENDER_CONFIG.surface.metalness}
          emissive={MOON_RENDER_CONFIG.surface.emissive}
          emissiveIntensity={MOON_RENDER_CONFIG.surface.emissiveIntensity}
          fog={MOON_RENDER_CONFIG.surface.fog}
        />
      </mesh>
      <mesh name={TASK4_SCENE_NAMES.moonHalo} scale={MOON_RENDER_CONFIG.halo.scale}>
        <sphereGeometry
          args={[
            MOON_RADIUS,
            MOON_RENDER_CONFIG.halo.widthSegments,
            MOON_RENDER_CONFIG.halo.heightSegments,
          ]}
        />
        <meshBasicMaterial
          color={MOON_RENDER_CONFIG.halo.color}
          transparent={MOON_RENDER_CONFIG.halo.transparent}
          opacity={MOON_RENDER_CONFIG.halo.opacity}
          depthWrite={MOON_RENDER_CONFIG.halo.depthWrite}
          fog={MOON_RENDER_CONFIG.halo.fog}
          side={MOON_RENDER_CONFIG.halo.side}
          blending={MOON_RENDER_CONFIG.halo.blending}
        />
      </mesh>
    </group>
  );
}

function Task4SceneInspection() {
  const { scene } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: () => inspectTask4Scene(scene),
    };
    window.__EVANLY_TASK4_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK4_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK4_INSPECTION__;
      }
    };
  }, [scene]);
  return null;
}

function Task5SceneInspection() {
  const { scene, camera, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      snapshot: () => inspectTask5Scene(
        scene,
        FACADE_SIGN_TARGET,
        HOLOGRAM_ANCHOR_IDS.length,
        camera,
        size,
      ),
      setView: (id: string, view: Task5CameraView) =>
        setTask5CameraView(scene, camera, id, view),
    };
    window.__EVANLY_TASK5_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_TASK5_INSPECTION__ === inspection) {
        delete window.__EVANLY_TASK5_INSPECTION__;
      }
    };
  }, [camera, scene, size.height, size.width]);
  return null;
}

function SceneInspectionPresets() {
  const { camera, scene, size } = useThree();
  useEffect(() => {
    if (!INSPECT_ENABLED) return undefined;
    const inspection = {
      version: 1 as const,
      listPresets: () => INSPECTION_PRESET_IDS.map(getInspectionPreset),
      setPreset: (id: InspectionPresetId) => {
        const selected = applyInspectionPreset(camera, id);
        return id === 'facade-sign-close'
          ? {
              ...selected,
              subject: frameTask5FacadeInspectionSubject(scene, camera, size),
            }
          : selected;
      },
    };
    window.__EVANLY_INSPECTION__ = inspection;
    return () => {
      if (window.__EVANLY_INSPECTION__ === inspection) {
        delete window.__EVANLY_INSPECTION__;
      }
    };
  }, [camera, scene, size.height, size.width]);
  return null;
}

// ── Crowd: instanced humans on sidewalks with a sparse robot minority ──
useGLTF.preload('/models/props/ped_char.glb');
ROBOT_FILES.forEach((file) => useGLTF.preload(`/models/${file}`));

const pedestrianMaterialTransform: InstancedMaterialTransform = (material) => {
  const pedestrian = material instanceof THREE.MeshStandardMaterial
    ? material
    : new THREE.MeshStandardMaterial();
  pedestrian.color.set(0x14161e);
  pedestrian.roughness = 0.7;
  pedestrian.metalness = 0.2;
  pedestrian.emissive.set(PALETTE.cyan);
  pedestrian.emissiveIntensity = 0.12;
  return pedestrian;
};

function Pedestrians() {
  const layout = useMemo(() => buildCrowdLayout(), []);
  const humanPlacements = useMemo(() => layout.humans.map((human) => ({
    file: 'props/ped_char.glb',
    position: [human.x, 0, human.z] as [number, number, number],
    rotationY: human.r,
  })), [layout.humans]);
  return (
    <group>
      <InstancedPieces
        placements={humanPlacements}
        targetHeight={1.8}
        materialTransform={pedestrianMaterialTransform}
      />
      {layout.robots.map((robot, i) => <RobotCharacter key={`${robot.file}-${i}`} spot={robot} />)}
    </group>
  );
}

export function RobotCharacter({ spot }: { spot: RobotSpot }) {
  const { scene } = useGLTF(`/models/${spot.file}`);
  const owned = useCommittedThreeResource(`robot:${spot.file}`, ({ own }) => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const height = bounds.max.y - bounds.min.y || 1;
    const accent = spot.file.includes('recon') ? PALETTE.amber : PALETTE.cyan;
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) =>
            own(styleRobotMaterial(material, new THREE.Color(accent))))
        : own(styleRobotMaterial(object.material, new THREE.Color(accent)));
    });
    clone.position.y = -bounds.min.y;
    const materials: THREE.Material[] = [];
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      materials.push(...(
        Array.isArray(object.material) ? object.material : [object.material]
      ));
    });
    return {
      value: { proto: clone, scale: 1.5 / height },
      resources: materials,
    };
  }, [scene, spot.file]);
  if (!owned) return null;
  const { proto, scale } = owned;
  return (
    <group
      name="lifecycle-robot-clone"
      position={[spot.x, 0, spot.z]}
      rotation={[0, spot.r, 0]}
      scale={scale}
      dispose={null}
    >
      <primitive object={proto} dispose={null} />
    </group>
  );
}

// ── Procedural street dressing: crosswalks, manholes, cones, trashcans ──
export function StreetDressing() {
  const layout = useMemo(() => buildStreetDressingLayout(), []);
  const resources = useCommittedThreeResource('street-dressing', ({ own }) => {
    const dark = own(new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.6, metalness: 0.6 }));
    const cone = own(new THREE.MeshStandardMaterial({ color: 0x1a0d05, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.8, toneMapped: false }));
    const can = own(new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6, metalness: 0.5 }));
    const manholeGeometries = layout.manholes.map((spot) =>
      own(new THREE.CircleGeometry(spot.radius, 16)));
    const coneGeometries = layout.cones.map((spot) =>
      own(new THREE.ConeGeometry(spot.radius, 1, 8)));
    const canGeometries = layout.cans.map((spot) =>
      own(new THREE.CylinderGeometry(0.5, spot.radius, 1.2, 10)));
    return {
      value: {
        dark,
        cone,
        can,
        manholeGeometries,
        coneGeometries,
        canGeometries,
      },
      resources: [
        dark,
        cone,
        can,
        ...manholeGeometries,
        ...coneGeometries,
        ...canGeometries,
      ],
    };
  }, [layout]);
  if (!resources) return null;
  return (
    <group dispose={null}>
      {layout.manholes.map((spot, i) => (
        <mesh key={'mh' + i} geometry={resources.manholeGeometries[i]} material={resources.dark} position={[spot.x, 0.04, spot.z]} rotation={[-Math.PI / 2, 0, 0]} dispose={null} />
      ))}
      {layout.cones.map((spot, i) => (
        <mesh key={'cn' + i} geometry={resources.coneGeometries[i]} material={resources.cone} position={[spot.x, 0.5, spot.z]} dispose={null} />
      ))}
      {layout.cans.map((spot, i) => (
        <mesh key={'tc' + i} geometry={resources.canGeometries[i]} material={resources.can} position={[spot.x, 0.6, spot.z]} rotation={[0, spot.rotationY, 0]} dispose={null} />
      ))}
    </group>
  );
}

export default function City() {
  return (
    <>
    <Canvas
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ position: [-30, 92, 250], fov: 58, near: 1, far: 8000 }}
    >
      <color attach="background" args={['#05060f']} />
      <fog attach="fog" args={['#0a0a1c', 260, 2100]} />
      <ExposureSync />
      <ambientLight intensity={LIGHTING.ambientIntensity} />
      {/* cool moonlit key from the moon's direction */}
      <directionalLight position={[160, 380, -600]} intensity={LIGHTING.keyIntensity} color={'#aecbff'} />
      {/* violet sky / dark ground bounce */}
      <hemisphereLight args={[PALETTE.violet, '#050510', 0.18]} />
      {/* subtle neon fills: magenta from one flank, cyan from the other */}
      <directionalLight position={[-320, 90, 120]} intensity={0.28} color={PALETTE.magenta} />
      <directionalLight position={[340, 80, -280]} intensity={0.3} color={PALETTE.cyan} />
      <ShibuyaWallLighting />
      <Suspense fallback={null}><EnvMap /></Suspense>
      <Ground />
      <WaterBasin />
      <Roads />
      <FinaleBridge />
      <Pillars />
      <StreetFurniture />
      <JunkRamp />
      <Ramp2 />
      <Suspense fallback={null}><Buildings /></Suspense>
      <ShibuyaFacadePanels />
      <Suspense fallback={null}><Props /></Suspense>
      <Suspense fallback={null}><Scaffold /></Suspense>
      <Signs />
      <StreetDressing />
      <Suspense fallback={null}><Pedestrians /></Suspense>
      <Skyline />
      <Suspense fallback={null}><Moon /></Suspense>
      <SceneInspectionPresets />
      <Task4SceneInspection />
      <Task5SceneInspection />
      {FREECAM
        ? <FreeCam />
        : <OrbitControls
            makeDefault
            enabled={!INSPECT_ENABLED}
            target={[40, 18, -130]}
            maxDistance={4000}
          />}
      <EffectComposer>
        <Bloom intensity={LIGHTING.bloomIntensity} luminanceThreshold={LIGHTING.bloomThreshold} radius={LIGHTING.bloomRadius} mipmapBlur />
      </EffectComposer>
    </Canvas>
    {FREECAM && (
      <div style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 10,
        font: '12px/1.5 ui-monospace, monospace', color: PALETTE.cyan,
        background: 'rgba(10,11,30,0.8)', border: `1px solid ${PALETTE.panel}`,
        padding: '8px 12px', borderRadius: 6, pointerEvents: 'none',
      }}>
        click to look · <b>WASD</b> move · <b>Q/E</b> down/up · <b>Shift</b> boost · <b>Esc</b> release
      </div>
    )}
    </>
  );
}
