import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';

import { PALETTE } from '../../theme';
import { useCommittedThreeResource } from './useCommittedThreeResources';
import { MonorailBogie, MonorailCarBody } from './MonorailCar';
import {
  BEAM_HEIGHT,
  CAR_GAP,
  CAR_HEIGHT,
  CAR_LENGTH,
  CAR_WIDTH,
  SHOWCASE_CAR_COUNT,
  carVariant,
  consistLength,
  createMonorailResources,
} from './monorailKit';

/**
 * Gallery showcase (`?gallery`) for the suspended monorail. Hangs a full
 * SHOWCASE_CAR_COUNT-car consist (2 nose cabs + mid cars) from a short display
 * beam by its bogies, on a lit platform under a floating label — mirroring
 * BillboardCatalog's row conventions. Uses the same MonorailCar pieces the live
 * city scene does, so this is a faithful preview of the shipped asset.
 */

const ROW_COLOR = PALETTE.violet;

// Vertical stack (world Y). The display beam mimics the real guideway: a fat
// box the consist hangs beneath by its bogies.
const BEAM_Y = 12;
const BEAM_HALF_WIDTH = 2.6; // matches ROADS elevated-highway halfWidth
const BEAM_UNDERSIDE = BEAM_Y - BEAM_HEIGHT / 2;
const NECK_DROP = 1.6; // roof → beam underside (gallery hangs a touch low)
const CAR_CENTER_Y = BEAM_UNDERSIDE - NECK_DROP - CAR_HEIGHT / 2;
// Beam underside expressed in the car's local frame (car centred at origin).
const BOGIE_TOP_LOCAL = BEAM_UNDERSIDE - CAR_CENTER_Y;

function Platform({ x, radius }: { x: number; radius: number }) {
  return (
    <mesh position={[x, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 48]} />
      <meshStandardMaterial color="#10131f" emissive={ROW_COLOR} emissiveIntensity={0.25} roughness={0.7} />
    </mesh>
  );
}

function RowHeader() {
  return (
    <Html position={[-30, 24, 0]} center distanceFactor={140} zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          font: '800 22px/1.2 ui-monospace, monospace',
          color: ROW_COLOR,
          background: 'rgba(6,7,18,0.9)',
          border: `2px solid ${ROW_COLOR}`,
          borderRadius: 10,
          padding: '10px 16px',
          whiteSpace: 'nowrap',
          textAlign: 'right',
          textShadow: `0 0 18px ${ROW_COLOR}`,
          boxShadow: `0 0 26px ${ROW_COLOR}55`,
        }}
      >
        Monorail — suspended train
        <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>{SHOWCASE_CAR_COUNT} cars</div>
      </div>
    </Html>
  );
}

function TrainLabel({ x, length }: { x: number; length: number }) {
  return (
    <Html position={[x, BEAM_Y + 4, CAR_WIDTH / 2 + 6]} center distanceFactor={90} zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          font: '600 13px/1.35 ui-monospace, monospace',
          color: '#eaf2ff',
          background: 'rgba(8,10,24,0.86)',
          border: `1px solid ${ROW_COLOR}`,
          borderRadius: 6,
          padding: '5px 9px',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          boxShadow: `0 0 12px ${ROW_COLOR}55`,
        }}
      >
        <div style={{ color: ROW_COLOR, fontSize: 14 }}>Suspended monorail</div>
        <div style={{ opacity: 0.75, fontSize: 11 }}>
          {SHOWCASE_CAR_COUNT} cars · {Math.round(length)}m · procedural neon
        </div>
      </div>
    </Html>
  );
}

export function MonorailShowcase({ zStart }: { zStart: number }) {
  const res = useCommittedThreeResource('monorail-showcase', createMonorailResources, []);

  const layout = useMemo(() => {
    const step = CAR_LENGTH + CAR_GAP;
    const xs = Array.from({ length: SHOWCASE_CAR_COUNT }, (_, i) => i * step + CAR_LENGTH / 2);
    const length = consistLength(SHOWCASE_CAR_COUNT);
    return { xs, length, center: length / 2 };
  }, []);

  useEffect(() => {
    (window as unknown as { __MONORAIL_ROW__?: unknown }).__MONORAIL_ROW__ =
      { z: zStart, x: layout.center, length: layout.length };
  }, [zStart, layout]);

  if (!res) return null;

  const beamLength = layout.length + 8;

  return (
    <group name="monorail-showcase" position={[0, 0, zStart]} dispose={null}>
      <RowHeader />
      <Platform x={layout.center} radius={layout.length / 2 + 10} />

      {/* display beam segment the consist hangs from (≈ real guideway width) */}
      <mesh
        geometry={res.beam}
        material={res.beamMat}
        position={[layout.center, BEAM_Y, 0]}
        scale={[beamLength, 1, (BEAM_HALF_WIDTH * 2) / 1.4]}
      />
      {[-1, 1].map((sz) => (
        <mesh
          key={sz}
          geometry={res.beamGlow}
          material={res.beamGlowMat}
          position={[layout.center, BEAM_UNDERSIDE + 0.06, sz * (BEAM_HALF_WIDTH - 0.06)]}
          scale={[beamLength - 1, 1, 1]}
        />
      ))}

      {layout.xs.map((x, i) => (
        <group key={i} position={[x, CAR_CENTER_Y, 0]}>
          <MonorailCarBody res={res} variant={carVariant(i, SHOWCASE_CAR_COUNT)} />
          <MonorailBogie res={res} topY={BOGIE_TOP_LOCAL} housingH={0.8} wheelZ={0.7} />
        </group>
      ))}

      <TrainLabel x={layout.center} length={layout.length} />
    </group>
  );
}
