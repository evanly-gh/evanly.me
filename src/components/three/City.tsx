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
import { buildCityLayout, buildProps, buildSkyline, buildStreetFurniture, buildBillboards } from '../../world/cityLayout';
import { buildRampGeometry, JUNK, RAMP2, SCAFFOLD } from '../../world/setpieces';
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

/** Procedural cyberpunk billboard: neon gradient, glyphs, borders, scanlines. */
const BILLBOARD_WORDS = ['ネオ', 'サイバー', '電脳', '無限', '２０９９', '夜市', 'NEO-X', 'NOODLE', '麺', 'データ', 'CYBER', '現金', 'ヤバい', 'NET://', '零', 'HACK', '東京', 'VOID', '銀河', 'ONLINE'];
const BILLBOARD_COLORS = ['#FF3DA6', '#2BFDF9', '#FFC857', '#8A6CFF', '#9DFF57', '#FF4D5E', '#4D8CFF'];

function makeBillboardTexture(i: number): THREE.CanvasTexture {
  const rnd = (() => { let s = (i + 1) * 99991; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const W = 512, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const c1 = BILLBOARD_COLORS[Math.floor(rnd() * BILLBOARD_COLORS.length)];
  const c2 = BILLBOARD_COLORS[Math.floor(rnd() * BILLBOARD_COLORS.length)];
  // dark base + subtle gradient wash
  ctx.fillStyle = '#07060f'; ctx.fillRect(0, 0, W, H);
  const grd = ctx.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, c1 + '22'); grd.addColorStop(1, c2 + '18');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  // neon border
  ctx.strokeStyle = c1; ctx.lineWidth = 12; ctx.shadowColor = c1; ctx.shadowBlur = 30;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.shadowBlur = 0;
  // a couple of accent bars
  for (let b = 0; b < 3; b++) {
    ctx.fillStyle = (rnd() < 0.5 ? c1 : c2) + '55';
    const by = 40 + rnd() * (H - 120);
    ctx.fillRect(30, by, W - 60, 6 + rnd() * 10);
  }
  // big glyph text (stacked)
  const vertical = rnd() < 0.5;
  const word = BILLBOARD_WORDS[Math.floor(rnd() * BILLBOARD_WORDS.length)];
  ctx.fillStyle = rnd() < 0.5 ? c2 : '#EEF2FF';
  ctx.shadowColor = c2; ctx.shadowBlur = 26;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (vertical) {
    const fs = Math.min(150, (H - 80) / word.length);
    ctx.font = `900 ${fs}px "Segoe UI", system-ui, sans-serif`;
    [...word].forEach((ch, k) => ctx.fillText(ch, W / 2, 70 + fs / 2 + k * fs));
  } else {
    ctx.font = `900 ${Math.min(180, (W - 60) / (word.length * 0.62))}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(word, W / 2, H / 2);
  }
  ctx.shadowBlur = 0;
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function Billboards() {
  const boards = useMemo(() => buildBillboards(), []);
  const N = 8;
  const mats = useMemo(
    () => Array.from({ length: N }, (_, i) => new THREE.MeshBasicMaterial({ map: makeBillboardTexture(i), toneMapped: false, side: THREE.DoubleSide })),
    [],
  );
  const backMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x05060c, roughness: 0.8, metalness: 0.3 }), []);
  return (
    <group>
      {boards.map((b, i) => (
        <group key={i} position={b.position} rotation={[0, b.rotationY, 0]}>
          <mesh material={backMat} position={[0, 0, -0.25]}><boxGeometry args={[b.w + 0.8, b.h + 0.8, 0.5]} /></mesh>
          <mesh material={mats[b.tex]}><planeGeometry args={[b.w, b.h]} /></mesh>
        </group>
      ))}
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
  const walkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9, metalness: 0.08 }), []);
  const curbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x4c525f, roughness: 0.85, metalness: 0.1 }), []);
  const magenta = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a0616, emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.2, toneMapped: false }), []);
  const amber = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.8, toneMapped: false }), []);
  const teal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }), []);

  const nodes = useMemo(() => {
    return ROADS.map((r) => {
      const deck = buildCurveRibbon(r.curve, r.halfWidth, { lift: r.level });
      const edgeGlowL = buildCurveRibbon(r.curve, 0.3, { offset: r.halfWidth - 0.4, lift: r.level + 0.06 });
      const edgeGlowR = buildCurveRibbon(r.curve, 0.3, { offset: -(r.halfWidth - 0.4), lift: r.level + 0.06 });
      const centre = buildCurveRibbon(r.curve, 0.14, { lift: r.level + 0.06 });
      // wide raised sidewalks (half-width 4.5 → 9 m) + a raised curb lip at the road edge
      const walkL = r.ground ? buildCurveRibbon(r.curve, 4.5, { offset: r.halfWidth + 4.5, lift: 0.45 }) : null;
      const walkR = r.ground ? buildCurveRibbon(r.curve, 4.5, { offset: -(r.halfWidth + 4.5), lift: 0.45 }) : null;
      const curbL = r.ground ? buildCurveRibbon(r.curve, 0.4, { offset: r.halfWidth + 0.4, lift: 0.5 }) : null;
      const curbR = r.ground ? buildCurveRibbon(r.curve, 0.4, { offset: -(r.halfWidth + 0.4), lift: 0.5 }) : null;
      return { deck, edgeGlowL, edgeGlowR, centre, walkL, walkR, curbL, curbR, main: r.halfWidth > 10 };
    });
  }, []);

  return (
    <group>
      {nodes.map((n, i) => (
        <group key={i}>
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

/** Ramp 1 — an improvised junk pile: a rusty truck-bed wedge dressed with
 *  crates, a dumpster and wood planks. Rises 0 → 11 over the run (toward −Z). */
function JunkRamp() {
  const plank = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.92, metalness: 0.04 }), []);
  const rust = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5a3428, roughness: 0.85, metalness: 0.35 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.7, metalness: 0.4 }), []);
  const { run, width, rise } = JUNK;
  const wedge = useMemo(() => buildRampGeometry(run, width, rise), [run, width, rise]);
  const ang = Math.atan2(rise, run);
  const hyp = Math.hypot(run, rise);
  const crates: [string, number, number, number, number][] = [
    ['BldgSM_C_Containers', 4, 0, width / 2 + 2.5, 0.2],
    ['BldgSM_C_CratesA', 9, 0, -width / 2 - 2, -0.3],
    ['BldgSM_C_CratesB', 15, 3, width / 2 + 2, 0.15],
    ['BldgSM_C_Boxes', 2.5, 0, -width / 2 - 3, 0.1],
  ];
  return (
    <group position={JUNK.base} rotation={[0, JUNK.rotationY, 0]}>
      {/* rusty wedge (the "truck bed" you ride up) */}
      <mesh geometry={wedge} material={rust} />
      {/* wood planks laid along the ride surface */}
      {[-3.5, 0, 3.5].map((zc) => (
        <mesh key={zc} material={plank} position={[run / 2, rise / 2 + 0.18, zc]} rotation={[0, 0, ang]}>
          <boxGeometry args={[hyp, 0.22, 3]} />
        </mesh>
      ))}
      {/* dumpster shoved against the base */}
      <mesh material={dark} position={[2, 1.4, width / 2 + 1]}><boxGeometry args={[4.5, 2.8, 3]} /></mesh>
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
function Ramp2() {
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x161922, roughness: 0.45, metalness: 0.7 }), []);
  const stripe = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 1.9, toneMapped: false }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }), []);
  const { run, width, rise } = RAMP2;
  const geo = useMemo(() => buildRampGeometry(run, width, rise), [run, width, rise]);
  const ang = Math.atan2(rise, run);
  const hyp = Math.hypot(run, rise);
  return (
    <group position={RAMP2.base} rotation={[0, RAMP2.rotationY, 0]}>
      <mesh geometry={geo} material={deckMat} />
      {/* thin ride plate + amber centre stripes */}
      {[0.3, 0.6, 0.9].map((f, j) => (
        <mesh key={j} material={stripe} position={[run * f, rise * f + 0.1, 0]} rotation={[0, 0, ang]}>
          <boxGeometry args={[0.4, 0.05, width * 0.8]} />
        </mesh>
      ))}
      {/* cyan side rails running up the slope */}
      {[1, -1].map((s) => (
        <mesh key={s} material={rail} position={[run / 2, rise / 2 + 0.4, s * (width / 2)]} rotation={[0, 0, ang]}>
          <boxGeometry args={[hyp, 0.12, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

/** A supported scaffold lattice against a tall building's road-facing wall. */
/** Elevated scaffold deck the bike rides across (x=240, y=13), built as a
 *  pole lattice and tied into the adjacent building with cross-beams. */
function Scaffold() {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.55, metalness: 0.6 }), []);
  const plank = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.8, metalness: 0.3 }), []);
  const rail = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x03231f, emissive: new THREE.Color('#b7f5e9'), emissiveIntensity: 1.6, toneMapped: false }), []);
  const S = SCAFFOLD;
  const [cx, y, cz] = S.deckCenter;
  const l = S.deckLen, w = S.deckWidth;
  const z0 = cz - l / 2, z1 = cz + l / 2;
  const ex = [cx - w / 2, cx + w / 2]; // deck edges (support pole lines)
  const nPole = 7;
  const poleZs = Array.from({ length: nPole }, (_, i) => z0 + (l * i) / (nPole - 1));
  const braceAng = Math.atan2(l / (nPole - 1), y);
  const braceLen = Math.hypot(y, l / (nPole - 1));
  const buildingFace = S.buildingPos[0] - 20; // approx road-facing wall of the tie building
  return (
    <group>
      <Suspense fallback={null}>
        <KitPiece file={`neocity/${S.building}.glb`} position={S.buildingPos} rotationY={S.buildingRot} center />
      </Suspense>
      {/* deck slab + plank strips */}
      <mesh material={metal} position={[cx, y - S.deckThick / 2, cz]}><boxGeometry args={[w, S.deckThick, l]} /></mesh>
      {[-w / 3, 0, w / 3].map((dx) => (
        <mesh key={dx} material={plank} position={[cx + dx, y + 0.03, cz]}><boxGeometry args={[w / 4, 0.08, l - 1]} /></mesh>
      ))}
      {/* support pole lattice (both deck edges → ground) */}
      {poleZs.map((zc, i) => (
        <group key={'pz' + i}>
          {ex.map((px) => (
            <mesh key={px} material={metal} position={[px, y / 2, zc]}><boxGeometry args={[0.5, y, 0.5]} /></mesh>
          ))}
          {/* transverse tie under the deck */}
          <mesh material={metal} position={[cx, y - 0.6, zc]}><boxGeometry args={[w, 0.3, 0.3]} /></mesh>
        </group>
      ))}
      {/* long horizontal ledgers at two heights on both edges */}
      {ex.map((px) => [y * 0.45, y * 0.8].map((hy, j) => (
        <mesh key={px + '-' + j} material={metal} position={[px, hy, cz]}><boxGeometry args={[0.3, 0.3, l]} /></mesh>
      )))}
      {/* diagonal braces up each edge (scaffolding lattice) */}
      {ex.map((px) => poleZs.slice(0, -1).map((zc, i) => (
        <mesh key={px + 'b' + i} material={metal} position={[px, y / 2, zc + l / (nPole - 1) / 2]} rotation={[braceAng * (i % 2 ? -1 : 1), 0, 0]}>
          <boxGeometry args={[0.22, braceLen, 0.22]} />
        </mesh>
      )))}
      {/* cyan guard rails along the two long edges (parallel to travel) */}
      {ex.map((px) => (
        <group key={'r' + px}>
          <mesh material={rail} position={[px, y + 0.9, cz]}><boxGeometry args={[0.12, 0.12, l]} /></mesh>
          <mesh material={metal} position={[px, y + 0.45, cz]}><boxGeometry args={[0.18, 0.9, l]} /></mesh>
        </group>
      ))}
      {/* tie-beams + brace bolting the deck into the adjacent building */}
      {[z0 + l * 0.25, cz, z1 - l * 0.25].map((zc, i) => (
        <mesh key={'tie' + i} material={metal} position={[(ex[1] + buildingFace) / 2, y - 0.5, zc]}>
          <boxGeometry args={[buildingFace - ex[1], 0.35, 0.35]} />
        </mesh>
      ))}
      {[z0 + l * 0.25, z1 - l * 0.25].map((zc, i) => {
        const span = buildingFace - ex[1];
        return (
          <mesh key={'d' + i} material={metal} position={[(ex[1] + buildingFace) / 2, y * 0.45, zc]} rotation={[0, 0, Math.atan2(y * 0.9, span)]}>
            <boxGeometry args={[Math.hypot(span, y * 0.9), 0.25, 0.25]} />
          </mesh>
        );
      })}
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
      camera={{ position: [-150, 14, 60], fov: 60, near: 1, far: 8000 }}
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
      <Suspense fallback={null}><EnvMap /></Suspense>
      <Ground />
      <Roads />
      <Pillars />
      <StreetFurniture />
      <JunkRamp />
      <Ramp2 />
      <Suspense fallback={null}><Buildings /></Suspense>
      <Suspense fallback={null}><Props /></Suspense>
      <Suspense fallback={null}><Scaffold /></Suspense>
      <Billboards />
      <Skyline />
      <Moon />
      {FREECAM
        ? <FreeCam />
        : <OrbitControls makeDefault target={[20, 12, -60]} maxDistance={4000} />}
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
