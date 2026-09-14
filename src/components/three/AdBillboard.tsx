import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type AdBillboardDef, type BillboardMount } from '../../world/adBillboards';

/**
 * Renders one cyberpunk ad billboard from a sliced reference texture on a 3D
 * mount (flat-wall / holo-floating / hanging-blade / freestanding-pillar) with
 * real glow (emissive halo + neon rim, picked up by the scene's bloom pass).
 *
 * The screen is an unlit image plane (MeshBasicMaterial, toneMapped:false) so
 * the neon-on-black artwork shows at full intensity and its bright pixels bloom;
 * holograms use additive blending so the black background drops out and only the
 * neon floats. All layout is anchored with y=0 at the ground so the same prefab
 * drops into the gallery row or the city.
 */

// Ground-anchored layout constants (metres), shared with billboardBounds().
const FLAT_ELEV = 2; // panel bottom above ground
const HOLO_FLOAT = 3; // hologram panel bottom above the emitter
const HOLO_EMITTER_Y = 1.1;
const HANG_CLEAR = 5; // blade bottom above ground
const HANG_ARM = 1.4; // mounting bar above the blade
const PILLAR_BASE = 2.6; // plinth height

export interface BillboardBounds {
  /** footprint width along the row (screen width). */
  width: number;
  /** total height ground -> top. */
  height: number;
  /** depth front->back (for platform sizing). */
  depth: number;
}

/** Footprint used by the catalog/city to space billboards. Uses manifest aspect. */
export function billboardBounds(def: AdBillboardDef): BillboardBounds {
  const h = def.heightM;
  const w = h * def.aspect;
  switch (def.mount) {
    case 'flat-wall':
      return { width: w, height: FLAT_ELEV + h, depth: 1.4 };
    case 'holo-floating':
      return { width: Math.max(w, 6), height: HOLO_FLOAT + h, depth: Math.max(w, 6) };
    case 'hanging-blade':
      return { width: w, height: HANG_CLEAR + h + HANG_ARM, depth: 3.2 };
    case 'freestanding-pillar':
      return { width: Math.max(w, 6), height: PILLAR_BASE + h, depth: Math.max(w * 0.5, 3) };
  }
}

// Shared cache so the same reference texture is decoded once even when reused
// across dozens of city billboards.
const TEX_CACHE = new Map<string, THREE.Texture>();
const TEX_PENDING = new Map<string, Promise<THREE.Texture>>();
const textureListeners = new Set<() => void>();

/** Notified whenever another billboard artwork finishes loading (BakedStatic
 *  uses this to re-bake the screen atlas). */
export function subscribeBillboardTextures(listener: () => void): () => void {
  textureListeners.add(listener);
  return () => { textureListeners.delete(listener); };
}

function loadBillboardTexture(image: string): Promise<THREE.Texture> {
  const cached = TEX_CACHE.get(image);
  if (cached) return Promise.resolve(cached);
  let pending = TEX_PENDING.get(image);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(`/images/billboards/${image}.png`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        TEX_CACHE.set(image, t);
        TEX_PENDING.delete(image);
        resolve(t);
        for (const listener of textureListeners) listener();
      }, undefined, reject);
    });
    TEX_PENDING.set(image, pending);
  }
  return pending;
}

function useBillboardTexture(image: string): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(() => TEX_CACHE.get(image) ?? null);
  useEffect(() => {
    let cancelled = false;
    loadBillboardTexture(image).then((t) => { if (!cancelled) setTex(t); }, () => {});
    return () => {
      cancelled = true;
    };
  }, [image]);
  return tex;
}

// Shared materials. Every billboard used to allocate its own material objects
// inline (`<meshStandardMaterial ... />` in JSX = a new instance per mesh), so
// identical parts — dark-metal backings, coloured neon rims — could never batch.
// Sharing by parameter saves memory/shader compiles AND lets BakedStatic merge the
// static billboards' opaque structure into a handful of draws. Emissive parts are
// keyed by colour so same-colour rims across the city collapse together.
const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#0a0d16', roughness: 0.55, metalness: 0.85 });
const bracketMat = new THREE.MeshStandardMaterial({ color: '#141a28', roughness: 0.5, metalness: 0.9 });
const wallStubMat = new THREE.MeshStandardMaterial({ color: '#0b0e18', roughness: 0.9, metalness: 0.3 });
const plinthBaseMat = new THREE.MeshStandardMaterial({ color: '#0a0d16', roughness: 0.6, metalness: 0.7 });

function cached<T>(map: Map<string, T>, key: string, make: () => T): T {
  let value = map.get(key);
  if (!value) { value = make(); map.set(key, value); }
  return value;
}
const rimMats = new Map<string, THREE.Material>();
const rimMat = (color: string) => cached(rimMats, color, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4.2, toneMapped: false, roughness: 0.4, metalness: 0.2 }));
const capMats = new Map<string, THREE.Material>();
const capMat = (color: string) => cached(capMats, color, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8, toneMapped: false, roughness: 0.4, metalness: 0.3 }));
const plinthTrimMats = new Map<string, THREE.Material>();
const plinthTrimMat = (color: string) => cached(plinthTrimMats, color, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, toneMapped: false }));
const emitterMats = new Map<string, THREE.Material>();
const emitterMat = (color: string) => cached(emitterMats, color, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3.6, toneMapped: false, roughness: 0.3, metalness: 0.7 }));
const haloMats = new Map<string, THREE.Material>();
const haloMat = (color: string, opacity: number) => cached(haloMats, `${color}:${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
const ringMats = new Map<string, THREE.Material>();
const ringMat = (color: string) => cached(ringMats, color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
const beamMats = new Map<string, THREE.Material>();
const beamMat = (color: string) => cached(beamMats, color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.17, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
const backGlowMats = new Map<string, THREE.Material>();
const backGlowMat = (color: string) => cached(backGlowMats, color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));

/** Additive halo behind a panel so coloured glow spills past its edges and
 *  washes out the surrounding haze under bloom. Two stacked planes: a tight
 *  bright rim-spill and a wide soft bloom. */
function Halo({ w, h, color }: { w: number; h: number; color: string }) {
  return (
    <group position={[0, 0, -0.06]}>
      <mesh material={haloMat(color, 0.42)}>
        <planeGeometry args={[w * 1.14, h * 1.14]} />
      </mesh>
      <mesh position={[0, 0, -0.04]} material={haloMat(color, 0.16)}>
        <planeGeometry args={[w * 1.5, h * 1.45]} />
      </mesh>
    </group>
  );
}

/** Thin emissive rim (4 bars) hugging the panel edge for an edge-glow accent. */
function NeonRim({ w, h, color }: { w: number; h: number; color: string }) {
  const t = Math.max(0.12, Math.min(w, h) * 0.012); // bar thickness
  const bars: Array<[number, number, number, number]> = [
    [0, h / 2, w + t, t], // top
    [0, -h / 2, w + t, t], // bottom
    [-w / 2, 0, t, h + t], // left
    [w / 2, 0, t, h + t], // right
  ];
  return (
    <group position={[0, 0, 0.03]}>
      {bars.map(([x, y, bw, bh], i) => (
        <mesh key={i} position={[x, y, 0]} material={rimMat(color)}>
          <boxGeometry args={[bw, bh, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

// Over-drive the artwork above 1.0 so its neon reads through (and overpowers)
// the city's magenta atmospheric haze and blooms hard.
const SCREEN_BOOST = 1.7;

/** Neon rim + additive halo for a w×h panel centred at the local origin. Reused
 *  by the section content billboards to match the ad-billboard glow. */
export function PanelGlow({ w, h, color }: { w: number; h: number; color: string }) {
  return (
    <>
      <Halo w={w} h={h} color={color} />
      <NeonRim w={w} h={h} color={color} />
    </>
  );
}

function ScreenPlane({
  tex,
  w,
  h,
  additive = false,
  doubleSide = false,
  renderOrder = 4,
}: {
  tex: THREE.Texture | null;
  w: number;
  h: number;
  additive?: boolean;
  doubleSide?: boolean;
  renderOrder?: number;
}) {
  const boost = useMemo(() => new THREE.Color(SCREEN_BOOST, SCREEN_BOOST, SCREEN_BOOST), []);
  if (!tex) return null;
  return (
    <mesh renderOrder={renderOrder}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={tex}
        color={boost}
        toneMapped={false}
        transparent={additive}
        opacity={additive ? 0.98 : 1}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={!additive}
        side={doubleSide ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}

function FlatWall({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  const cy = FLAT_ELEV + h / 2;
  return (
    <group position={[0, cy, 0]}>
      {/* backing plate */}
      <mesh position={[0, 0, -0.18]} material={darkMetalMat}>
        <boxGeometry args={[w + 0.9, h + 0.9, 0.35]} />
      </mesh>
      <Halo w={w} h={h} color={def.glow} />
      <ScreenPlane tex={tex} w={w} h={h} />
      <NeonRim w={w} h={h} color={def.glow} />
      {/* wall brackets behind */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.6), 0, -0.7]} material={bracketMat}>
          <boxGeometry args={[0.35, h * 0.7, 1.0]} />
        </mesh>
      ))}
    </group>
  );
}

function HoloFloating({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  const bob = useRef<THREE.Group>(null);
  const panelY = HOLO_FLOAT + h / 2;
  const beamH = panelY - h / 2 - HOLO_EMITTER_Y;
  useFrame((state) => {
    if (bob.current) bob.current.position.y = panelY + Math.sin(state.clock.elapsedTime * 1.1) * 0.25;
  });
  return (
    <group>
      {/* base ring on the ground */}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat(def.glow)}>
        <ringGeometry args={[w * 0.34, w * 0.5, 48]} />
      </mesh>
      {/* emitter disc */}
      <mesh position={[0, HOLO_EMITTER_Y, 0]} material={emitterMat(def.glow)}>
        <cylinderGeometry args={[w * 0.3, w * 0.36, 0.5, 32]} />
      </mesh>
      {/* projection beam cone */}
      <mesh position={[0, HOLO_EMITTER_Y + beamH / 2, 0]} material={beamMat(def.glow)}>
        <cylinderGeometry args={[w * 0.5, w * 0.28, beamH, 32, 1, true]} />
      </mesh>
      {/* floating hologram panel */}
      <group ref={bob} position={[0, panelY, 0]}>
        <Halo w={w} h={h} color={def.glow} />
        <ScreenPlane tex={tex} w={w} h={h} additive doubleSide renderOrder={6} />
      </group>
    </group>
  );
}

function HangingBlade({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  const bladeCy = HANG_CLEAR + h / 2;
  const barY = HANG_CLEAR + h + HANG_ARM / 2;
  const wallTop = barY + 1.5;
  return (
    <group>
      {/* storefront wall stub behind */}
      <mesh position={[0, wallTop / 2, -1.6]} material={wallStubMat}>
        <boxGeometry args={[w + 3, wallTop, 0.6]} />
      </mesh>
      {/* mounting arm from wall to blade top */}
      <mesh position={[0, barY, -0.8]} material={bracketMat}>
        <boxGeometry args={[w * 0.7, 0.3, 2.0]} />
      </mesh>
      {/* top cap bar (glowing) */}
      <mesh position={[0, HANG_CLEAR + h + 0.2, 0]} material={capMat(def.glow)}>
        <boxGeometry args={[w + 0.6, 0.4, 0.5]} />
      </mesh>
      {/* hanging blade (double-sided) */}
      <group position={[0, bladeCy, 0]}>
        {/* thin backing */}
        <mesh position={[0, 0, -0.12]} material={darkMetalMat}>
          <boxGeometry args={[w + 0.5, h + 0.5, 0.22]} />
        </mesh>
        <Halo w={w} h={h} color={def.glow} />
        <ScreenPlane tex={tex} w={w} h={h} doubleSide />
        <NeonRim w={w} h={h} color={def.glow} />
      </group>
    </group>
  );
}

function FreestandingPillar({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  const panelCy = PILLAR_BASE + h / 2;
  return (
    <group>
      {/* plinth base — sunk below y=0 so its bottom never sits coplanar with the
          road (that coplanar face was the scroll-by flicker), and kept shallow
          front-to-back so it doesn't bury itself in the building behind it. */}
      <mesh position={[0, PILLAR_BASE / 2 - 0.3, 0]} material={plinthBaseMat}>
        <boxGeometry args={[w + 1.6, PILLAR_BASE + 0.6, Math.max(w * 0.32, 2.2)]} />
      </mesh>
      {/* glowing plinth trim — a wider/deeper lip sunk under the base top so none
          of its faces are coplanar with the base (kills the top-face z-fight). */}
      <mesh position={[0, PILLAR_BASE - 0.4, 0]} material={plinthTrimMat(def.glow)}>
        <boxGeometry args={[w + 1.9, 0.3, Math.max(w * 0.32, 2.2) + 0.3]} />
      </mesh>
      {/* panel */}
      <group position={[0, panelCy, 0]}>
        <mesh position={[0, 0, -0.16]} material={darkMetalMat}>
          <boxGeometry args={[w + 0.7, h + 0.7, 0.3]} />
        </mesh>
        <Halo w={w} h={h} color={def.glow} />
        <ScreenPlane tex={tex} w={w} h={h} />
        <NeonRim w={w} h={h} color={def.glow} />
      </group>
    </group>
  );
}

/** Center-anchored flat panel (screen centred at origin) for facade mounting. */
function CenterPanel({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  return (
    <group>
      <mesh position={[0, 0, -0.16]} material={darkMetalMat}>
        <boxGeometry args={[w + 0.6, h + 0.6, 0.3]} />
      </mesh>
      <Halo w={w} h={h} color={def.glow} />
      <ScreenPlane tex={tex} w={w} h={h} />
      <NeonRim w={w} h={h} color={def.glow} />
    </group>
  );
}

/** Center-anchored hologram panel (additive, floats at a facade point). */
function CenterHolo({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  return (
    <group>
      <Halo w={w} h={h} color={def.glow} />
      <ScreenPlane tex={tex} w={w} h={h} additive doubleSide renderOrder={6} />
      {/* faint back-glow disc so it reads as a projected hologram */}
      <mesh position={[0, 0, -0.4]} material={backGlowMat(def.glow)}>
        <planeGeometry args={[w * 0.9, h * 0.9]} />
      </mesh>
    </group>
  );
}

/** Center-anchored projecting blade: hangs out from a wall on a top arm (the
 *  wall is at local -Z; the panel faces +Z toward the street). Double-sided. */
const HANG_ARM_LEN = 3.2; // must match adBillboardPlacement offset
function CenterBlade({ def, tex, w, h }: { def: AdBillboardDef; tex: THREE.Texture | null; w: number; h: number }) {
  const armY = h / 2 - 0.4;
  return (
    <group>
      {/* top arm back to the wall + end bracket */}
      <mesh position={[0, armY, -HANG_ARM_LEN / 2]} material={bracketMat}>
        <boxGeometry args={[0.3, 0.3, HANG_ARM_LEN]} />
      </mesh>
      <mesh position={[0, armY, -HANG_ARM_LEN]} material={bracketMat}>
        <boxGeometry args={[1.0, 1.4, 0.4]} />
      </mesh>
      {/* glowing top cap */}
      <mesh position={[0, h / 2 + 0.3, 0]} material={capMat(def.glow)}>
        <boxGeometry args={[w + 0.5, 0.4, 0.5]} />
      </mesh>
      {/* blade */}
      <mesh position={[0, 0, -0.12]} material={darkMetalMat}>
        <boxGeometry args={[w + 0.4, h + 0.4, 0.22]} />
      </mesh>
      <Halo w={w} h={h} color={def.glow} />
      <ScreenPlane tex={tex} w={w} h={h} doubleSide />
      <NeonRim w={w} h={h} color={def.glow} />
    </group>
  );
}

export function AdBillboard({
  def,
  position = [0, 0, 0],
  rotationY = 0,
  anchor = 'ground',
  fitBox,
  mount,
}: {
  def: AdBillboardDef;
  position?: [number, number, number];
  rotationY?: number;
  /** 'ground' = full mount anchored at y=0; 'center' = panel centred at position. */
  anchor?: 'ground' | 'center';
  /** contain-fit the panel within [width, height] metres (for facade slots). */
  fitBox?: [number, number];
  /** override the def's own mount so any artwork can use any mount. */
  mount?: BillboardMount;
}) {
  const mnt = mount ?? def.mount;
  const tex = useBillboardTexture(def.image);
  // Prefer the loaded texture's true aspect so the plane matches the crop exactly.
  const aspect = useMemo(() => {
    const img = tex?.image as { width?: number; height?: number } | undefined;
    return img?.width && img?.height ? img.width / img.height : def.aspect;
  }, [tex, def.aspect]);

  let w: number;
  let h: number;
  if (fitBox) {
    const [W, H] = fitBox;
    if (aspect > W / H) {
      w = W;
      h = W / aspect;
    } else {
      h = H;
      w = H * aspect;
    }
  } else {
    h = def.heightM;
    w = h * aspect;
  }

  if (anchor === 'center') {
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        {mnt === 'holo-floating' && <CenterHolo def={def} tex={tex} w={w} h={h} />}
        {mnt === 'hanging-blade' && <CenterBlade def={def} tex={tex} w={w} h={h} />}
        {(mnt === 'flat-wall' || mnt === 'freestanding-pillar') && <CenterPanel def={def} tex={tex} w={w} h={h} />}
      </group>
    );
  }

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {mnt === 'flat-wall' && <FlatWall def={def} tex={tex} w={w} h={h} />}
      {mnt === 'holo-floating' && <HoloFloating def={def} tex={tex} w={w} h={h} />}
      {mnt === 'hanging-blade' && <HangingBlade def={def} tex={tex} w={w} h={h} />}
      {mnt === 'freestanding-pillar' && <FreestandingPillar def={def} tex={tex} w={w} h={h} />}
    </group>
  );
}
