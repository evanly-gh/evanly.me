import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { INTRO_CAM_POS, type IntroPhase } from '../../choreography/introSequence';

/**
 * Diegetic title card for the intro: a neon billboard carrying the
 * "EVAN LI // PORTFOLIO CITY — A THREE.JS RIDE" title, mounted in the scene
 * BEHIND the parked bike so the title reads as part of the world instead of a
 * DOM overlay blocking the hero shot. Oriented once toward the fixed title-screen
 * camera, and faded out when the bike drives off (phase → driving/live).
 */

// Behind + above the parked bike (INTRO_BIKE_LEAN_POS ≈ (-452,0,12)), floating in
// front of the sidewalk facade so it never clips into a building.
const BILLBOARD_POS = new THREE.Vector3(-448, 6.6, 13);
const BILLBOARD_WIDTH = 10.5;
const BILLBOARD_HEIGHT = 4;

function buildTitleTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Dark translucent panel so the neon reads against the night city.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6, 7, 18, 0.74)';
  ctx.fillRect(0, 0, w, h);

  // Left cyan border accent + magenta rules (mirrors the old HUD title styling).
  ctx.shadowColor = '#2bfdf9';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#2bfdf9';
  ctx.fillRect(26, 44, 7, h - 88);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff3abf';
  ctx.fillRect(46, 46, w * 0.62, 3);
  ctx.fillRect(46, h - 46, w * 0.42, 3);

  ctx.textBaseline = 'alphabetic';

  // Eyebrow.
  ctx.fillStyle = '#ffbf45';
  ctx.font = '700 26px "Arial Narrow", "Bahnschrift", Impact, sans-serif';
  ctx.fillText('S C E N E _ 0 0   /   E N T E R', 62, 100);

  // Title — chromatic-split neon like the DOM version.
  const drawChroma = (text: string, x: number, y: number, size: number) => {
    ctx.font = `800 ${size}px "Arial Narrow", "Bahnschrift", Impact, sans-serif`;
    ctx.fillStyle = '#ff3abf';
    ctx.fillText(text, x + 5, y);
    ctx.fillStyle = '#2bfdf9';
    ctx.fillText(text, x - 4, y);
    ctx.shadowColor = 'rgba(220, 246, 255, 0.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#eafcff';
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  };
  drawChroma('EVAN LI //', 60, 210, 118);
  drawChroma('PORTFOLIO CITY', 60, 306, 118);

  // Subtitle.
  ctx.fillStyle = '#9ce8ff';
  ctx.font = '700 30px "Arial Narrow", "Bahnschrift", Impact, sans-serif';
  ctx.fillText('A   T H R E E . J S   R I D E', 62, 352);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function IntroBillboard({ phase }: { phase: IntroPhase }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(buildTitleTexture, []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [texture],
  );

  // Orient the card so its front (+Z, upright text) faces the fixed intro camera.
  useLayoutEffect(() => {
    meshRef.current?.lookAt(INTRO_CAM_POS);
  }, []);

  useLayoutEffect(
    () => () => {
      texture.dispose();
      material.dispose();
    },
    [texture, material],
  );

  useFrame(() => {
    const target = phase === 'driving' || phase === 'live' ? 0 : 1;
    material.opacity += (target - material.opacity) * 0.08;
  });

  return (
    <mesh ref={meshRef} position={BILLBOARD_POS} material={material}>
      <planeGeometry args={[BILLBOARD_WIDTH, BILLBOARD_HEIGHT]} />
    </mesh>
  );
}
