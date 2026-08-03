import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewport,
  Html,
  PointerLockControls,
} from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import manifest from '../../../public/models/neocity/manifest.json';
import { PALETTE, LIGHTING } from '../../theme';
import { KitPiece } from './KitPiece';

/**
 * Standalone building-type gallery (`?gallery`). Lines up EVERY neocity kit
 * piece in one flyable row so the route-zone variety can be pruned by eye:
 * each piece sits on a lit platform under a floating label (index, name, tris,
 * category). Tell the agent which indices to delete and the route pool shrinks
 * to match — the route zone currently decodes 39 of these on first load, and
 * route-ready waits for the slowest decode, so fewer distinct pieces = faster.
 *
 * This is dev scaffolding, isolated from the shipping <City> scene (its own
 * Canvas, no zones/postprocessing budget), routed in main.tsx via `?gallery`.
 */

const CATEGORY_COLOR: Record<string, string> = {
  LG: '#5dd8ff',
  MD: '#ffcf6b',
  SM: '#ff7db0',
};

const GAP = 16; // clear metres between neighbouring footprints

interface GalleryItem {
  index: number;
  name: string;
  file: string;
  tris: number;
  category: string;
  x: number;
  width: number;
  depth: number;
  height: number;
}

/** Lay the pieces out left-to-right, grouped by family (name order), spacing
 *  each by its real footprint so nothing overlaps regardless of native size. */
function useGalleryLayout(): { items: GalleryItem[]; rowLength: number } {
  return useMemo(() => {
    const sorted = [...manifest].sort((a, b) => a.name.localeCompare(b.name));
    const items: GalleryItem[] = [];
    let cursor = 0;
    sorted.forEach((entry, index) => {
      const [bx, by, bz] = entry.bbox;
      const width = Math.max(bx, bz, 2);
      const halfW = width / 2;
      cursor += halfW;
      items.push({
        index,
        name: entry.name.replace(/^KB3D_NEC_/, ''),
        file: entry.file,
        tris: entry.tris,
        category: entry.category ?? '?',
        x: cursor,
        width,
        depth: bz,
        height: by,
      });
      cursor += halfW + GAP;
    });
    return { items, rowLength: cursor };
  }, []);
}

/** Small emissive disc so each piece reads as standing on a marked stand. */
function Platform({ x, radius }: { x: number; radius: number }) {
  return (
    <mesh position={[x, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 40]} />
      <meshStandardMaterial
        color="#10131f"
        emissive={PALETTE.violet}
        emissiveIntensity={0.25}
        roughness={0.7}
      />
    </mesh>
  );
}

function Label({ item }: { item: GalleryItem }) {
  const color = CATEGORY_COLOR[item.category] ?? '#c9d4ff';
  return (
    <Html
      position={[item.x, 13, item.depth / 2 + 6]}
      center
      distanceFactor={90}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          font: '600 13px/1.35 ui-monospace, monospace',
          color: '#eaf2ff',
          background: 'rgba(8,10,24,0.86)',
          border: `1px solid ${color}`,
          borderRadius: 6,
          padding: '5px 9px',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          boxShadow: `0 0 12px ${color}55`,
        }}
      >
        <div style={{ color, fontSize: 15 }}>#{item.index} · {item.category}</div>
        <div>{item.name}</div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          {item.tris.toLocaleString()} tris · {Math.round(item.height)}m
        </div>
      </div>
    </Html>
  );
}

/** Minimal self-contained WASD/QE fly camera (mirrors City's FreeCam) so the
 *  gallery needs no coupling to the main scene module. */
function GalleryFlyCam({ lookAt }: { lookAt: [number, number, number] }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    camera.lookAt(...lookAt);
  }, [camera, lookAt]);
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const onLockChange = () => {
      if (!document.pointerLockElement) keys.current = {};
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, []);
  const dir = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const k = keys.current;
    if (document.pointerLockElement == null) return;
    const speed = (k['ShiftLeft'] || k['ShiftRight'] ? 620 : 190) * Math.min(dt, 0.05);
    camera.getWorldDirection(dir.current).normalize();
    right.current.crossVectors(dir.current, camera.up).normalize();
    if (k['KeyW']) camera.position.addScaledVector(dir.current, speed);
    if (k['KeyS']) camera.position.addScaledVector(dir.current, -speed);
    if (k['KeyD']) camera.position.addScaledVector(right.current, speed);
    if (k['KeyA']) camera.position.addScaledVector(right.current, -speed);
    if (k['KeyE'] || k['Space']) camera.position.y += speed;
    if (k['KeyQ']) camera.position.y -= speed;
  });
  return (
    <>
      <PointerLockControls makeDefault pointerSpeed={0.9} />
      <GizmoHelper alignment="top-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ff5d7a', '#7dffb2', '#5dd8ff']} labelColor="black" />
      </GizmoHelper>
    </>
  );
}

export default function BuildingGallery() {
  const { items, rowLength } = useGalleryLayout();
  const center = rowLength / 2;
  const [ready, setReady] = useState(0);
  // Stable identity so each ReadySignal effect runs exactly once on mount
  // (an inline closure here would change every render and loop the counter).
  const bump = useCallback(() => setReady((n) => n + 1), []);

  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        camera={{ position: [center, 70, 200], fov: 60, near: 1, far: 12000 }}
      >
        <color attach="background" args={['#05060f']} />
        <fog attach="fog" args={['#0a0a1c', 600, 4000]} />
        <ambientLight intensity={LIGHTING.ambientIntensity * 1.6} />
        <hemisphereLight args={[PALETTE.violet, '#050510', 0.4]} />
        <directionalLight position={[center - 300, 200, 300]} intensity={0.5} color={PALETTE.magenta} />
        <directionalLight position={[center + 300, 220, -200]} intensity={0.55} color={PALETTE.cyan} />
        <directionalLight position={[center, 400, 60]} intensity={0.6} color="#ffffff" />

        {/* ground + gridline so the lineup reads as a row on a floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, 0, 0]}>
          <planeGeometry args={[rowLength + 400, 800]} />
          <meshStandardMaterial color="#080a14" roughness={0.9} />
        </mesh>
        <gridHelper
          args={[Math.max(rowLength + 400, 800), Math.round((rowLength + 400) / 20), '#1b2340', '#11162a']}
          position={[center, 0.02, 0]}
        />

        {items.map((item) => (
          <group key={item.file}>
            <Platform x={item.x} radius={Math.max(item.width, item.depth) / 2 + 3} />
            <Suspense fallback={null}>
              <KitPiece
                file={item.file}
                position={[item.x, 0, 0]}
                center
              />
              <ReadySignal onReady={bump} />
            </Suspense>
            <Label item={item} />
          </group>
        ))}

        <GalleryFlyCam lookAt={[center, 20, 0]} />

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={LIGHTING.bloomIntensity}
            luminanceThreshold={LIGHTING.bloomThreshold}
            radius={LIGHTING.bloomRadius}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      <div
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 10,
          font: '12px/1.6 ui-monospace, monospace', color: PALETTE.cyan,
          background: 'rgba(10,11,30,0.85)', border: `1px solid ${PALETTE.panel}`,
          padding: '10px 14px', borderRadius: 6, pointerEvents: 'none', maxWidth: 360,
        }}
      >
        <div style={{ color: '#eaf2ff', fontWeight: 700, marginBottom: 4 }}>
          Building gallery — {items.length} kit pieces ({Math.min(ready, items.length)} loaded)
        </div>
        <div>click to look · <b>WASD</b> move · <b>Q/E</b> down/up · <b>Shift</b> boost · <b>Esc</b> release</div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          <span style={{ color: CATEGORY_COLOR.LG }}>■ LG</span>{'  '}
          <span style={{ color: CATEGORY_COLOR.MD }}>■ MD</span>{'  '}
          <span style={{ color: CATEGORY_COLOR.SM }}>■ SM</span>
          {'  '}— tell me the <b>#</b>s to delete
        </div>
      </div>
    </>
  );
}

/** Fires once its Suspense boundary resolves (the GLB decoded), to count loads. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}
