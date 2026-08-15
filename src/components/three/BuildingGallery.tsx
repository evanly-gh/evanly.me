import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Html,
  PointerLockControls,
} from '@react-three/drei';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../../theme';
import { KitPiece } from './KitPiece';
import { BillboardCatalog } from './BillboardCatalog';
import { MonorailShowcase } from './MonorailShowcase';

// Every pack's manifest. Each was written by tools/process-gallery.mjs (or
// assets:kitbash / assets:variants); a pack that was skipped still ships an
// empty [] manifest so these static imports always resolve.
import neocityManifest from '../../../public/models/neocity/manifest.json';
import variantsManifest from '../../../public/models/neocity-variants/manifest.json';
import structuresManifest from '../../../public/models/structures/manifest.json';
import monogonManifest from '../../../public/models/monogon/manifest.json';
import bikesManifest from '../../../public/models/bikes/manifest.json';
import hovercarsManifest from '../../../public/models/hovercars/manifest.json';
import robotsManifest from '../../../public/models/robots/manifest.json';
import quaterniusManifest from '../../../public/models/quaternius/manifest.json';

/**
 * Standalone asset gallery (`?gallery`). Lays out EVERY converted asset pack as
 * its own flyable row — neocity, procedural height variants, structures, monogon,
 * bikes, hovercars, robots, Quaternius — stacked along Z. Within each row pieces
 * are ordered largest→smallest by footprint volume and spaced by their real
 * footprint, each on a lit platform under a floating label (name, tris, height).
 *
 * Dev scaffolding, isolated from the shipping <City> scene (own Canvas, no
 * zones/postprocessing budget), routed in main.tsx via `?gallery`.
 */

interface ManifestEntry {
  name: string;
  file: string;
  bbox: [number, number, number];
  tris: number;
  hasEmissive?: boolean;
  category?: string;
}

interface RowDef {
  key: string;
  label: string;
  color: string;
  items: ManifestEntry[];
}

/** Display order: neocity first, its derived variants next, then the rest. */
const ROW_SOURCES: { key: string; label: string; color: string; manifest: unknown }[] = [
  { key: 'neocity', label: 'NeoCity kit', color: '#5dd8ff', manifest: neocityManifest },
  { key: 'variants', label: 'Height variants (chopped)', color: '#b98bff', manifest: variantsManifest },
  { key: 'structures', label: 'Structures', color: '#ffcf6b', manifest: structuresManifest },
  { key: 'monogon', label: 'Monogon voxel streets', color: '#7dffb2', manifest: monogonManifest },
  { key: 'bikes', label: 'Bikes', color: '#ff7db0', manifest: bikesManifest },
  { key: 'hovercars', label: 'Hovercars', color: '#67e8ff', manifest: hovercarsManifest },
  { key: 'robots', label: 'Robots', color: '#ff5d7a', manifest: robotsManifest },
  { key: 'quaternius', label: 'Quaternius game kit', color: '#ffd27d', manifest: quaterniusManifest },
];

/** Excluded source folders (no web-loadable mesh format) — surfaced in the HUD. */
const EXCLUDED = 'excluded: Cyber Signs (.c4d), Cyber dude (.blend)';

const CATEGORY_COLOR: Record<string, string> = {
  LG: '#5dd8ff',
  MD: '#ffcf6b',
  SM: '#ff7db0',
};

const GAP = 16; // clear metres between neighbouring footprints in a row
const ROW_GAP = 60; // clear metres between rows on Z

/**
 * Per-pack size normalization. Source packs use wildly different units (a
 * structures "building" is 2785m; Quaternius/monogon pieces are a few metres),
 * which makes the gallery unbrowseable. Bring each flagged pack into a sane
 * band while preserving aspect ratio:
 *   'pack'  — one factor for the whole pack (largest piece → target), keeps
 *             intra-pack relative sizes.
 *   'piece' — each piece scaled to the target independently (for structures,
 *             whose three pieces span a 50× range).
 * Target = desired longest dimension in metres. Unlisted packs render 1:1.
 */
const NORMALIZE: Record<string, { mode: 'pack' | 'piece'; target: number }> = {
  structures: { mode: 'piece', target: 90 },
  quaternius: { mode: 'pack', target: 26 },
  monogon: { mode: 'pack', target: 42 },
};

interface GalleryItem {
  index: number;
  name: string;
  file: string;
  tris: number;
  category: string;
  scale: number;
  x: number;
  width: number;
  depth: number;
  height: number;
}

interface LaidRow extends RowDef {
  items: ManifestEntry[];
  laid: GalleryItem[];
  rowLength: number;
  rowDepth: number;
  z: number;
}

/** Lay every row out: pieces ordered largest→smallest by bbox volume, packed
 *  left→right by real footprint; rows stacked on Z spaced by their depth. */
function useGalleryRows(): { rows: LaidRow[]; maxRowLength: number; totalDepth: number } {
  return useMemo(() => {
    let zCursor = 0;
    let maxRowLength = 0;
    const rows: LaidRow[] = [];

    for (const src of ROW_SOURCES) {
      const items = (src.manifest as ManifestEntry[]) ?? [];
      if (items.length === 0) continue;

      // Per-pack normalization factor (see NORMALIZE).
      const rule = NORMALIZE[src.key];
      let packFactor = 1;
      if (rule?.mode === 'pack') {
        const packMax = Math.max(...items.map((e) => Math.max(...e.bbox)));
        if (packMax > 0) packFactor = rule.target / packMax;
      }
      const scaleOf = (e: ManifestEntry) => {
        if (rule?.mode === 'piece') { const m = Math.max(...e.bbox); return m > 0 ? rule.target / m : 1; }
        return rule?.mode === 'pack' ? packFactor : 1;
      };

      // Scale, then order largest→smallest by normalized footprint volume.
      const scaled = items.map((e) => {
        const s = scaleOf(e);
        return { entry: e, scale: s, bbox: e.bbox.map((v) => v * s) as [number, number, number] };
      });
      scaled.sort((a, b) => b.bbox[0] * b.bbox[1] * b.bbox[2] - a.bbox[0] * a.bbox[1] * a.bbox[2]);

      const laid: GalleryItem[] = [];
      let cursor = 0;
      let rowDepth = 0;
      scaled.forEach(({ entry, scale, bbox }, index) => {
        const [bx, by, bz] = bbox;
        const width = Math.max(bx, bz, 2);
        const halfW = width / 2;
        cursor += halfW;
        laid.push({
          index,
          name: entry.name.replace(/^KB3D_NEC_/, ''),
          file: entry.file,
          tris: entry.tris,
          category: entry.category ?? src.key,
          scale,
          x: cursor,
          width,
          depth: bz,
          height: by,
        });
        cursor += halfW + GAP;
        rowDepth = Math.max(rowDepth, bz, 8);
      });

      const rowLength = cursor;
      maxRowLength = Math.max(maxRowLength, rowLength);
      const z = zCursor + rowDepth / 2;
      rows.push({ ...src, items, laid, rowLength, rowDepth, z });
      zCursor += rowDepth + ROW_GAP;
    }

    return { rows, maxRowLength, totalDepth: zCursor };
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

function Label({ item, color }: { item: GalleryItem; color: string }) {
  const c = CATEGORY_COLOR[item.category] ?? color;
  const y = Math.min(Math.max(item.height + 4, 8), 220);
  return (
    <Html
      position={[item.x, y, item.depth / 2 + 6]}
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
          border: `1px solid ${c}`,
          borderRadius: 6,
          padding: '5px 9px',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          boxShadow: `0 0 12px ${c}55`,
        }}
      >
        <div style={{ color: c, fontSize: 15 }}>#{item.index} · {item.category}</div>
        <div>{item.name}</div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          {item.tris.toLocaleString()} tris · {Math.round(item.height)}m
        </div>
      </div>
    </Html>
  );
}

/** Big label parked at the −X end of a row naming the pack. */
function RowHeader({ row }: { row: LaidRow }) {
  return (
    <Html
      position={[-30, 24, 0]}
      center
      distanceFactor={140}
      zIndexRange={[100, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          font: '800 22px/1.2 ui-monospace, monospace',
          color: row.color,
          background: 'rgba(6,7,18,0.9)',
          border: `2px solid ${row.color}`,
          borderRadius: 10,
          padding: '10px 16px',
          whiteSpace: 'nowrap',
          textAlign: 'right',
          textShadow: `0 0 18px ${row.color}`,
          boxShadow: `0 0 26px ${row.color}55`,
        }}
      >
        {row.label}
        <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>{row.laid.length} pieces</div>
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
    // Dev affordance (this whole page is dev scaffolding): jump the camera.
    //   __GALLERY_CAM__(px,py,pz, tx,ty,tz)
    (window as unknown as { __GALLERY_CAM__?: unknown }).__GALLERY_CAM__ = (
      px: number, py: number, pz: number, tx: number, ty: number, tz: number,
    ) => {
      camera.position.set(px, py, pz);
      camera.lookAt(tx, ty, tz);
      camera.updateProjectionMatrix();
    };
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
  const { rows, maxRowLength, totalDepth } = useGalleryRows();
  const totalPieces = rows.reduce((n, r) => n + r.laid.length, 0);
  const center = maxRowLength / 2;
  const [ready, setReady] = useState(0);
  // Stable identity so each ReadySignal effect runs exactly once on mount.
  const bump = useCallback(() => setReady((n) => n + 1), []);

  // Reserve floor + fog depth for the billboard catalog + monorail rows on Z.
  const BILLBOARD_ZONE = 900;
  const MONORAIL_ZONE = 260;
  const monorailZStart = totalDepth + BILLBOARD_ZONE + ROW_GAP;
  const sceneDepth = totalDepth + BILLBOARD_ZONE + MONORAIL_ZONE;
  const groundW = maxRowLength + 400;
  const groundD = sceneDepth + 400;

  // Dev: expose row layout (key, z, length) for scripted camera framing.
  useEffect(() => {
    (window as unknown as { __GALLERY_ROWS__?: unknown }).__GALLERY_ROWS__ =
      rows.map((r) => ({ key: r.key, z: r.z, rowLength: r.rowLength }));
  }, [rows]);

  // Open framed on the first row's start (biggest pieces first) rather than the
  // whole stack — some packs (structures) contain huge models that would
  // otherwise swallow the default view.
  const firstRow = rows[0];
  const openX = firstRow ? Math.min(320, firstRow.rowLength * 0.2) : center;
  const openZ = firstRow ? firstRow.z : 0;
  const openTarget: [number, number, number] = [openX, 70, openZ];

  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        camera={{ position: [openX, 220, openZ + 480], fov: 60, near: 1, far: 20000 }}
      >
        <color attach="background" args={['#05060f']} />
        <fog attach="fog" args={['#0a0a1c', 900, 6000]} />
        <ambientLight intensity={LIGHTING.ambientIntensity * 1.6} />
        <hemisphereLight args={[PALETTE.violet, '#050510', 0.4]} />
        <directionalLight position={[center - 300, 400, 300]} intensity={0.5} color={PALETTE.magenta} />
        <directionalLight position={[center + 300, 420, -200]} intensity={0.55} color={PALETTE.cyan} />
        <directionalLight position={[center, 700, totalDepth / 2]} intensity={0.6} color="#ffffff" />
        {/* Night env map so the billboards' metallic hardware (backings, rails,
            brackets) reads as it does in the shipping city scene. */}
        <Suspense fallback={null}>
          <Environment preset="night" />
        </Suspense>

        {/* ground + gridline so the lineup reads as rows on a floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, 0, sceneDepth / 2]}>
          <planeGeometry args={[groundW, groundD]} />
          <meshStandardMaterial color="#080a14" roughness={0.9} />
        </mesh>
        <gridHelper
          args={[Math.max(groundW, groundD), Math.round(Math.max(groundW, groundD) / 20), '#1b2340', '#11162a']}
          position={[center, 0.02, sceneDepth / 2]}
        />

        {rows.map((row) => (
          <group key={row.key} position={[0, 0, row.z]}>
            <RowHeader row={row} />
            {row.laid.map((item) => (
              <group key={item.file}>
                <Platform x={item.x} radius={Math.max(item.width, item.depth) / 2 + 3} />
                <Suspense fallback={null}>
                  <KitPiece file={item.file} position={[item.x, 0, 0]} center scale={item.scale} />
                  <ReadySignal onReady={bump} />
                </Suspense>
                {/* The restaurant is a dark low-poly model meant to be neon-lit
                    (see reference): give it dedicated magenta + cyan pools so it
                    reads dark-with-neon instead of flat under the fill light. */}
                {item.file === 'structures/Resteraunt.glb' && (
                  <>
                    {/* magenta wash from the big signs — the dominant light */}
                    <pointLight
                      position={[item.x, item.height * 0.8, item.depth * 0.2]}
                      color={PALETTE.magenta} intensity={3.6} distance={item.height * 3.0} decay={0}
                    />
                    {/* cyan pool localized to the storefront (low, front) */}
                    <pointLight
                      position={[item.x, item.height * 0.26, item.depth * 0.55]}
                      color={PALETTE.cyan} intensity={1.7} distance={item.height * 1.05} decay={0}
                    />
                  </>
                )}
                <Label item={item} color={row.color} />
              </group>
            ))}
          </group>
        ))}

        {/* Billboard catalog rows — every billboard used in the city, isolated
            with its own hardware, appended after the GLB pack rows on Z. */}
        <Suspense fallback={null}>
          <BillboardCatalog zStart={totalDepth + ROW_GAP} />
        </Suspense>

        {/* Procedural suspended-monorail asset, appended as the final row. */}
        <MonorailShowcase zStart={monorailZStart} />

        <GalleryFlyCam lookAt={openTarget} />

        <EffectComposer multisampling={0}>
          {/* Ambient occlusion: darkens crevices / bars / contact seams while
              leaving big flat faces bright — gives the pieces real 3D depth. */}
          <N8AO aoRadius={6} distanceFalloff={1} intensity={4} halfRes />
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
          padding: '10px 14px', borderRadius: 6, pointerEvents: 'none', maxWidth: 420,
        }}
      >
        <div style={{ color: '#eaf2ff', fontWeight: 700, marginBottom: 4 }}>
          Asset gallery — {rows.length} rows, {totalPieces} pieces ({Math.min(ready, totalPieces)} loaded)
        </div>
        <div>click to look · <b>WASD</b> move · <b>Q/E</b> down/up · <b>Shift</b> boost · <b>Esc</b> release</div>
        <div style={{ marginTop: 4, opacity: 0.9, display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
          {rows.map((r) => (
            <span key={r.key} style={{ color: r.color }}>■ {r.label}</span>
          ))}
        </div>
        <div style={{ marginTop: 4, opacity: 0.6, fontStyle: 'italic' }}>{EXCLUDED}</div>
      </div>
    </>
  );
}

/** Fires once its Suspense boundary resolves (the GLB decoded), to count loads. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}
