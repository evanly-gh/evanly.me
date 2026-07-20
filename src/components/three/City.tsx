import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, FlyControls, useEnvironment } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../../theme';
import { ROADS, buildCurveRibbon } from '../../world/roads';

const FREECAM = new URLSearchParams(location.search).has('freecam');

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
import { buildCityLayout, buildProps, buildSkyline } from '../../world/cityLayout';
import { buildRampGeometry, RAMPS, SCAFFOLD } from '../../world/setpieces';
import { KitPiece } from './KitPiece';

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

// ── Roads: deck + sidewalks (raised curbs) + glowing edge/centre lines ──
function Pillars() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: 0.7, metalness: 0.4 }), []);
  const pillars = useMemo(() => {
    const out: { x: number; z: number; h: number }[] = [];
    for (const r of ROADS) {
      if (r.ground) continue;
      const n = Math.max(6, Math.floor(r.curve.getLength() / 55));
      for (let i = 1; i < n; i++) {
        const p = r.curve.getPointAt(i / n);
        out.push({ x: p.x, z: p.z, h: p.y });
      }
    }
    return out;
  }, []);
  return (
    <group>
      {pillars.map((p, i) => (
        <mesh key={i} material={mat} position={[p.x, p.h / 2, p.z]}>
          <cylinderGeometry args={[2.2, 3, p.h, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function Roads() {
  const asphalt = useMemo(() => makeAsphaltTexture(), []);
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x14161f, map: asphalt, roughness: 0.7, metalness: 0.3 }), [asphalt]);
  const walkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x161924, roughness: 0.85, metalness: 0.1 }), []);
  const magenta = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.2, toneMapped: false }), []);
  const amber = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.8, toneMapped: false }), []);
  const teal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }), []);

  const nodes = useMemo(() => {
    return ROADS.map((r) => {
      const deck = buildCurveRibbon(r.curve, r.halfWidth, { lift: r.level });
      const edgeGlowL = buildCurveRibbon(r.curve, 0.3, { offset: r.halfWidth - 0.4, lift: r.level + 0.06 });
      const edgeGlowR = buildCurveRibbon(r.curve, 0.3, { offset: -(r.halfWidth - 0.4), lift: r.level + 0.06 });
      const centre = buildCurveRibbon(r.curve, 0.14, { lift: r.level + 0.06 });
      const walkL = r.ground ? buildCurveRibbon(r.curve, 3.2, { offset: r.halfWidth + 3.2, lift: 0.35 }) : null;
      const walkR = r.ground ? buildCurveRibbon(r.curve, 3.2, { offset: -(r.halfWidth + 3.2), lift: 0.35 }) : null;
      return { deck, edgeGlowL, edgeGlowR, centre, walkL, walkR, main: r.halfWidth > 10 };
    });
  }, []);

  return (
    <group>
      {nodes.map((n, i) => (
        <group key={i}>
          <mesh geometry={n.deck} material={deckMat} />
          {n.walkL && <mesh geometry={n.walkL} material={walkMat} />}
          {n.walkR && <mesh geometry={n.walkR} material={walkMat} />}
          <mesh geometry={n.edgeGlowL} material={n.main ? magenta : teal} />
          <mesh geometry={n.edgeGlowR} material={n.main ? magenta : teal} />
          <mesh geometry={n.centre} material={amber} />
        </group>
      ))}
    </group>
  );
}

function Buildings() {
  const layout = useMemo(() => buildCityLayout(), []);
  return (
    <group>
      {layout.map((p, i) => <KitPiece key={i} file={p.file} position={p.position} rotationY={p.rotationY} />)}
    </group>
  );
}

function Props() {
  const props = useMemo(() => buildProps(), []);
  return (
    <group>
      {props.map((p, i) => <KitPiece key={i} file={p.file} position={p.position} rotationY={p.rotationY} />)}
    </group>
  );
}

// ── Cheap far-field skyline: two InstancedMeshes (dark + emissive) ──
function Skyline() {
  const boxes = useMemo(() => buildSkyline(), []);
  const dark = useMemo(() => boxes.filter((b) => !b.emissive), [boxes]);
  const lit = useMemo(() => boxes.filter((b) => b.emissive), [boxes]);
  const darkRef = useRef<THREE.InstancedMesh>(null);
  const litRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    dark.forEach((b, i) => darkRef.current?.setMatrixAt(i, b.matrix));
    lit.forEach((b, i) => litRef.current?.setMatrixAt(i, b.matrix));
    if (darkRef.current) darkRef.current.instanceMatrix.needsUpdate = true;
    if (litRef.current) litRef.current.instanceMatrix.needsUpdate = true;
  }, [dark, lit]);
  return (
    <group>
      <instancedMesh ref={darkRef} args={[undefined, undefined, dark.length]}>
        <boxGeometry />
        <meshStandardMaterial color={0x0b0e18} roughness={0.8} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={litRef} args={[undefined, undefined, lit.length]}>
        <boxGeometry />
        <meshStandardMaterial color={0x0c0e1a} emissive={new THREE.Color(PALETTE.violet)} emissiveIntensity={0.14} toneMapped />
      </instancedMesh>
    </group>
  );
}

function Ramps() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x12141d, roughness: 0.5, metalness: 0.4 }), []);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2, toneMapped: false }), []);
  return (
    <group>
      {RAMPS.map((r, i) => {
        const geo = buildRampGeometry(r.length, r.width, r.rise);
        return (
          <group key={i} position={r.position} rotation={[0, r.rotationY, 0]}>
            <mesh geometry={geo} material={mat} />
            {/* side glow strips along the up-slope */}
            {[1, -1].map((s) => (
              <mesh key={s} material={glow} position={[r.length / 2, r.rise / 2, s * (r.width / 2 + 0.05)]}>
                <boxGeometry args={[r.length * 1.02, 0.14, 0.1]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Scaffold() {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.5, metalness: 0.6 }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.4, toneMapped: false }), []);
  const [cx, cy, cz] = SCAFFOLD.deckCenter;
  const L = SCAFFOLD.deckLen, W = SCAFFOLD.deckWidth;
  return (
    <group>
      <Suspense fallback={null}>
        <KitPiece file={`neocity/${SCAFFOLD.building}.glb`} position={SCAFFOLD.buildingPos} rotationY={SCAFFOLD.buildingRot} />
      </Suspense>
      {/* deck */}
      <mesh material={metal} position={[cx, cy, cz]}>
        <boxGeometry args={[W, SCAFFOLD.deckThick, L]} />
      </mesh>
      {/* cyan rail line along the road-facing edge */}
      <mesh material={rail} position={[cx - W / 2, cy + 0.5, cz]}>
        <boxGeometry args={[0.12, 0.12, L]} />
      </mesh>
      {/* legs + diagonal braces down to the ground on the outer edge */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={metal} position={[cx - W / 2, cy / 2, cz + s * (L / 2 - 2)]}>
            <boxGeometry args={[0.5, cy, 0.5]} />
          </mesh>
          <mesh material={metal} position={[cx, cy / 2, cz + s * (L / 2 - 2)]} rotation={[0, 0, Math.atan2(W, cy)]}>
            <boxGeometry args={[0.35, Math.hypot(cy, W), 0.35]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Moon() {
  return (
    <mesh position={MOON_POS}>
      <sphereGeometry args={[MOON_RADIUS, 48, 48]} />
      <meshStandardMaterial color={new THREE.Color(PALETTE.white)} emissive={new THREE.Color(PALETTE.white)} emissiveIntensity={1.1} toneMapped={false} />
    </mesh>
  );
}

export default function City() {
  return (
    <Canvas
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ position: [-60, 150, 260], fov: 55, near: 1, far: 8000 }}
    >
      <color attach="background" args={[PALETTE.void]} />
      <fog attach="fog" args={[PALETTE.void, 500, 2600]} />
      <ExposureSync />
      <ambientLight intensity={LIGHTING.ambientIntensity} />
      <directionalLight position={[200, 300, 100]} intensity={LIGHTING.keyIntensity} />
      <directionalLight position={[-200, 120, -400]} intensity={LIGHTING.fillIntensity} color={PALETTE.blue} />
      <Suspense fallback={null}><EnvMap /></Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, -300]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={0x05060d} roughness={0.95} metalness={0.1} />
      </mesh>
      <Roads />
      <Pillars />
      <Ramps />
      <Suspense fallback={null}><Buildings /></Suspense>
      <Suspense fallback={null}><Props /></Suspense>
      <Suspense fallback={null}><Scaffold /></Suspense>
      <Skyline />
      <Moon />
      {FREECAM
        ? <FlyControls makeDefault movementSpeed={150} rollSpeed={0.5} dragToLook />
        : <OrbitControls makeDefault target={[40, 0, -160]} maxDistance={4000} />}
      <EffectComposer>
        <Bloom intensity={LIGHTING.bloomIntensity} luminanceThreshold={LIGHTING.bloomThreshold} radius={LIGHTING.bloomRadius} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
