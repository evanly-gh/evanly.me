import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';

import {
  AD_BILLBOARDS_BY_MOUNT,
  type AdBillboardDef,
  type BillboardMount,
} from '../../world/adBillboards';
import { AdBillboard, billboardBounds } from './AdBillboard';

/**
 * Billboard catalog rows for the `?gallery` asset browser. Shows every cyberpunk
 * ad billboard built from the sliced reference textures, one row per mount type
 * (flat-wall / holo-floating / hanging-blade / freestanding-pillar) so the
 * different aspect ratios, mounts and glow all read side by side. Each prefab is
 * ground-anchored, so it just drops onto a platform in its row.
 */

const GAP = 14; // clear metres between billboards in a row
const ROW_GAP = 80; // clear metres between rows on Z

const ROWS: { mount: BillboardMount; label: string; color: string }[] = [
  { mount: 'flat-wall', label: 'Flat wall-mounted', color: '#5dd8ff' },
  { mount: 'holo-floating', label: 'Holographic floating', color: '#67e8ff' },
  { mount: 'hanging-blade', label: 'Hanging blade (storefront)', color: '#ff7db0' },
  { mount: 'freestanding-pillar', label: 'Freestanding pillar', color: '#ffcf6b' },
];

interface LaidUnit {
  def: AdBillboardDef;
  centerX: number;
  width: number;
  height: number;
  depth: number;
}

interface CatalogRow {
  mount: BillboardMount;
  label: string;
  color: string;
  z: number;
  units: LaidUnit[];
}

function useCatalogLayout(zStart: number) {
  return useMemo(() => {
    let zCursor = zStart;
    let maxRowLength = 0;
    const rows: CatalogRow[] = [];
    for (const { mount, label, color } of ROWS) {
      const defs = AD_BILLBOARDS_BY_MOUNT[mount];
      if (!defs.length) continue;
      const units: LaidUnit[] = [];
      let cursor = 0;
      let rowDepth = 8;
      for (const def of defs) {
        const b = billboardBounds(def);
        const halfW = Math.max(b.width, 4) / 2;
        cursor += halfW;
        units.push({ def, centerX: cursor, width: b.width, height: b.height, depth: b.depth });
        cursor += halfW + GAP;
        rowDepth = Math.max(rowDepth, b.depth, 8);
      }
      maxRowLength = Math.max(maxRowLength, cursor);
      const z = zCursor + rowDepth / 2;
      rows.push({ mount, label, color, z, units });
      zCursor += rowDepth + ROW_GAP;
    }
    return { rows, totalDepth: zCursor - zStart, maxRowLength };
  }, [zStart]);
}

function Platform({ x, radius, color }: { x: number; radius: number; color: string }) {
  return (
    <mesh position={[x, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 40]} />
      <meshStandardMaterial color="#10131f" emissive={color} emissiveIntensity={0.25} roughness={0.7} />
    </mesh>
  );
}

function UnitLabel({ unit, color }: { unit: LaidUnit; color: string }) {
  const y = Math.min(Math.max(unit.height + 4, 8), 220);
  return (
    <Html position={[unit.centerX, y, unit.depth / 2 + 6]} center distanceFactor={90} zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
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
        <div style={{ color, fontSize: 14 }}>{unit.def.title}</div>
        <div style={{ opacity: 0.7, fontSize: 11 }}>
          {Math.round(unit.width)}×{Math.round(unit.def.heightM)}m · {unit.def.aspect.toFixed(2)}
        </div>
      </div>
    </Html>
  );
}

function RowHeader({ row }: { row: CatalogRow }) {
  return (
    <Html position={[-30, 24, 0]} center distanceFactor={140} zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
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
        <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>{row.units.length} billboards</div>
      </div>
    </Html>
  );
}

export function BillboardCatalog({ zStart }: { zStart: number }) {
  const layout = useCatalogLayout(zStart);

  // Dev: expose row layout for scripted camera framing (mirrors __GALLERY_ROWS__).
  useEffect(() => {
    (window as unknown as { __BILLBOARD_ROWS__?: unknown }).__BILLBOARD_ROWS__ =
      layout.rows.map((r) => ({ mount: r.mount, z: r.z, count: r.units.length }));
  }, [layout]);

  return (
    <group name="billboard-catalog" dispose={null}>
      {layout.rows.map((row) => (
        <group key={row.mount} position={[0, 0, row.z]}>
          <RowHeader row={row} />
          {row.units.map((unit) => (
            <group key={unit.def.id}>
              <Platform x={unit.centerX} radius={Math.max(unit.width, unit.depth) / 2 + 3} color={row.color} />
              <AdBillboard def={unit.def} position={[unit.centerX, 0, 0]} />
              <UnitLabel unit={unit} color={row.color} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}
