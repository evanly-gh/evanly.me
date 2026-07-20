import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PointerLockControls, useEnvironment } from '@react-three/drei';
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
import { buildCityLayout, buildProps, buildSkyline, buildStreetFurniture } from '../../world/cityLayout';
import { buildRampGeometry, RAMPS, SCAFFOLD } from '../../world/setpieces';
import { KitPiece } from './KitPiece';
import { InstancedPieces } from './InstancedPieces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  return <InstancedPieces placements={layout} />;
}

function Props() {
  const props = useMemo(() => buildProps(), []);
  return <InstancedPieces placements={props} />;
}

function Ground() {
  const tex = useMemo(() => makeConcreteTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, -300]}>
      <planeGeometry args={[6000, 6000]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}

/** Lamp posts + powerline poles/cables along the roads. */
function StreetFurniture() {
  const { lamps, poles, cables } = useMemo(() => buildStreetFurniture(), []);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const ppoleRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(1, 1, 1); const v = new THREE.Vector3();
    lamps.forEach((l, i) => {
      m.compose(v.set(l.pos.x, 4.5, l.pos.z), q, s); poleRef.current?.setMatrixAt(i, m);
      m.compose(v.set(l.pos.x + Math.sin(l.rotationY) * 1.5, 9, l.pos.z + Math.cos(l.rotationY) * 1.5), q, s); headRef.current?.setMatrixAt(i, m);
    });
    poles.forEach((p, i) => { m.compose(v.set(p.x, 6.5, p.z), q, s); ppoleRef.current?.setMatrixAt(i, m); });
    for (const r of [poleRef, headRef, ppoleRef]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [lamps, poles]);
  const cableGeo = useMemo(() => {
    if (!cables.length) return null;
    const geos = cables.map((c) => {
      const mid = c.a.clone().add(c.b).multiplyScalar(0.5); mid.y -= 2.2;
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([c.a, mid, c.b]), 10, 0.1, 4, false);
    });
    return mergeGeometries(geos);
  }, [cables]);
  return (
    <group>
      <instancedMesh ref={poleRef} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.2, 0.26, 9, 6]} />
        <meshStandardMaterial color={0x14161f} roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, lamps.length]} frustumCulled={false}>
        <boxGeometry args={[0.7, 0.28, 0.5]} />
        <meshStandardMaterial color={0x201607} emissive={new THREE.Color(PALETTE.amber)} emissiveIntensity={2.4} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={ppoleRef} args={[undefined, undefined, poles.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.28, 0.34, 13, 6]} />
        <meshStandardMaterial color={0x121420} roughness={0.6} metalness={0.5} />
      </instancedMesh>
      {cableGeo && <mesh geometry={cableGeo}><meshStandardMaterial color={0x0a0a0e} roughness={0.9} /></mesh>}
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
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x12141d, roughness: 0.5, metalness: 0.45 }), []);
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2, toneMapped: false }), []);
  const stripeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.8, toneMapped: false }), []);
  const strutMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x0d0f17, roughness: 0.6, metalness: 0.5 }), []);
  return (
    <group>
      {RAMPS.map((r, i) => {
        const geo = buildRampGeometry(r.length, r.width, r.rise);
        const ang = Math.atan2(r.rise, r.length);
        const hyp = Math.hypot(r.length, r.rise);
        return (
          <group key={i} position={r.position} rotation={[0, r.rotationY, 0]}>
            <mesh geometry={geo} material={deckMat} />
            {[1, -1].map((s) => (
              <mesh key={'rail' + s} material={railMat} position={[r.length / 2, r.rise / 2 + 0.28, s * (r.width / 2)]} rotation={[0, 0, ang]}>
                <boxGeometry args={[hyp, 0.16, 0.16]} />
              </mesh>
            ))}
            {[0.2, 0.4, 0.6, 0.8].map((f, j) => (
              <mesh key={'st' + j} material={stripeMat} position={[r.length * f, r.rise * f + 0.13, 0]} rotation={[0, 0, ang]}>
                <boxGeometry args={[0.5, 0.05, r.width * 0.85]} />
              </mesh>
            ))}
            {[0.45, 0.8].map((f, j) => (
              <mesh key={'ub' + j} material={strutMat} position={[r.length * f, (r.rise * f) / 2, 0]}>
                <boxGeometry args={[0.6, r.rise * f, r.width * 0.85]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** A supported scaffold lattice against a tall building's road-facing wall. */
function Scaffold() {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.5, metalness: 0.6 }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }), []);
  const S = SCAFFOLD;
  const w = S.deckX1 - S.deckX0, l = S.deckZ1 - S.deckZ0;
  const cx = (S.deckX0 + S.deckX1) / 2, cz = (S.deckZ0 + S.deckZ1) / 2, y = S.deckY;
  const poleZs = [S.deckZ0 + 2, cz, S.deckZ1 - 2];
  const braceLen = Math.hypot(y, l * 0.4);
  return (
    <group>
      <Suspense fallback={null}>
        <KitPiece file={`neocity/${S.building}.glb`} position={S.buildingPos} rotationY={S.buildingRot} />
      </Suspense>
      {/* deck slab */}
      <mesh material={metal} position={[cx, y, cz]}><boxGeometry args={[w, S.deckThick, l]} /></mesh>
      {/* outer guard rail (cyan) + kickboard along the road edge */}
      <mesh material={rail} position={[S.deckX0, y + 0.8, cz]}><boxGeometry args={[0.14, 0.14, l]} /></mesh>
      <mesh material={metal} position={[S.deckX0, y + 0.4, cz]}><boxGeometry args={[0.22, 0.9, l]} /></mesh>
      {/* vertical support poles (outer edge → ground) + mid-depth poles */}
      {poleZs.map((zc, i) => (
        <group key={'pz' + i}>
          <mesh material={metal} position={[S.deckX0, y / 2, zc]}><boxGeometry args={[0.6, y, 0.6]} /></mesh>
          <mesh material={metal} position={[cx, y / 2, zc]}><boxGeometry args={[0.5, y, 0.5]} /></mesh>
          {/* cross beam tying outer→building at mid height */}
          <mesh material={metal} position={[cx, y * 0.55, zc]}><boxGeometry args={[w, 0.28, 0.28]} /></mesh>
        </group>
      ))}
      {/* long horizontal rails along z */}
      <mesh material={metal} position={[S.deckX0, y * 0.55, cz]}><boxGeometry args={[0.3, 0.3, l]} /></mesh>
      <mesh material={metal} position={[cx, y * 0.55, cz]}><boxGeometry args={[0.3, 0.3, l]} /></mesh>
      {/* diagonal cross-braces on the outer face */}
      {[0.28, 0.72].map((f, i) => (
        <mesh key={'br' + i} material={metal} position={[S.deckX0, y * 0.5, S.deckZ0 + l * f]} rotation={[Math.atan2(l * 0.4, y), 0, 0]}>
          <boxGeometry args={[0.25, braceLen, 0.25]} />
        </mesh>
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
    <>
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
      <Ground />
      <Roads />
      <Pillars />
      <StreetFurniture />
      <Ramps />
      <Suspense fallback={null}><Buildings /></Suspense>
      <Suspense fallback={null}><Props /></Suspense>
      <Suspense fallback={null}><Scaffold /></Suspense>
      <Skyline />
      <Moon />
      {FREECAM
        ? <FreeCam />
        : <OrbitControls makeDefault target={[40, 0, -160]} maxDistance={4000} />}
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
