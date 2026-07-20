import { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useEnvironment } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../../theme';
import { buildRibbon } from '../../world/road';
import { MOON_POS, MOON_RADIUS, sampleRoute } from '../../world/route';
import { buildCityLayout } from '../../world/cityLayout';
import { KitPiece } from './KitPiece';

function Buildings() {
  const layout = useMemo(() => buildCityLayout(), []);
  return (
    <group>
      {layout.map((p, i) => (
        <KitPiece key={i} file={p.file} position={p.position} rotationY={p.rotationY} />
      ))}
    </group>
  );
}

function EnvMap() {
  const texture = useEnvironment({ preset: 'night' });
  const { scene } = useThree();
  useEffect(() => {
    scene.environment = texture;
    return () => { scene.environment = null; };
  }, [scene, texture]);
  return null;
}

function ExposureSync() {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = LIGHTING.exposure; }, [gl]);
  return null;
}

/** The road deck + glowing edge / centre strips swept along the route. */
function Road() {
  const deck = useMemo(() => buildRibbon(9), []);
  const edgeL = useMemo(() => buildRibbon(0.35, { offset: 8.6, lift: 0.06 }), []);
  const edgeR = useMemo(() => buildRibbon(0.35, { offset: -8.6, lift: 0.06 }), []);
  const center = useMemo(() => buildRibbon(0.18, { offset: 0, lift: 0.06 }), []);

  return (
    <group>
      <mesh geometry={deck}>
        <meshStandardMaterial color={0x0a0c16} roughness={0.65} metalness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={edgeL}>
        <meshStandardMaterial color={0x1a0616} emissive={new THREE.Color(PALETTE.magenta)} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh geometry={edgeR}>
        <meshStandardMaterial color={0x1a0616} emissive={new THREE.Color(PALETTE.magenta)} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh geometry={center}>
        <meshStandardMaterial color={0x1a1206} emissive={new THREE.Color(PALETTE.amber)} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Moon() {
  return (
    <mesh position={MOON_POS}>
      <sphereGeometry args={[MOON_RADIUS, 48, 48]} />
      <meshStandardMaterial
        color={new THREE.Color(PALETTE.white)}
        emissive={new THREE.Color(PALETTE.white)}
        emissiveIntensity={1.1}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function City() {
  // Overview camera: look down the intro/about straight toward the Shibuya turn.
  const start = sampleRoute(0.2).pos;
  return (
    <Canvas
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ position: [start.x - 40, 120, 220], fov: 55, near: 1, far: 6000 }}
    >
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={[PALETTE.void, 400, 2200]} />
      <ExposureSync />
      <ambientLight intensity={LIGHTING.ambientIntensity} />
      <directionalLight position={[200, 300, 100]} intensity={LIGHTING.keyIntensity} />
      <directionalLight position={[-200, 120, -400]} intensity={LIGHTING.fillIntensity} color={PALETTE.blue} />
      <Suspense fallback={null}>
        <EnvMap />
      </Suspense>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -400]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={0x05060d} roughness={0.9} metalness={0.1} />
      </mesh>
      <Road />
      <Suspense fallback={null}>
        <Buildings />
      </Suspense>
      <Moon />
      <OrbitControls makeDefault target={[start.x, 0, start.z]} maxDistance={3000} />
      <EffectComposer>
        <Bloom intensity={LIGHTING.bloomIntensity} luminanceThreshold={LIGHTING.bloomThreshold} radius={LIGHTING.bloomRadius} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
