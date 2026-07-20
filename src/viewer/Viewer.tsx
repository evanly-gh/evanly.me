import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useEnvironment, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { PALETTE, LIGHTING } from '../theme';
import { validateManifest, type KitPiece } from './manifest';
import { buildRegistry, type AssetEntry } from './assets';
import { buildBike } from '../assets/bike';
import { makeRng } from '../assets/rng';
import { Hud, type HudState } from './Hud';

function frameObject(camera: THREE.PerspectiveCamera, controls: any, obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = sphere.radius / Math.sin((camera.fov * Math.PI) / 180 / 2);
  camera.position.set(sphere.center.x + dist * 0.7, sphere.center.y + dist * 0.4, sphere.center.z + dist * 0.7);
  camera.near = Math.max(0.1, dist / 100);
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  if (controls) { controls.target.copy(sphere.center); controls.update(); }
}

/**
 * PBR reflections via the useEnvironment HOOK (assigns scene.environment
 * directly), NOT drei's <Environment> component. The component's render-target
 * machinery leaves the scene rendering black in this drei 10.7 / three 0.185
 * combo; the hook gives the same IBL for the PBR KitBash metal/glass without it.
 */
function EnvMap() {
  const texture = useEnvironment({ preset: 'night' });
  const { scene } = useThree();
  useEffect(() => {
    scene.environment = texture;
    return () => { scene.environment = null; };
  }, [scene, texture]);
  return null;
}

function KitbashAsset({ src, onReady }: { src: string; onReady(o: THREE.Object3D): void }) {
  const gltf = useGLTF(src);
  useEffect(() => {
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && (mat.emissive && (mat.emissiveMap || mat.name?.toLowerCase().match(/light|neon|glass|screen/))))
          mat.emissiveIntensity = 1.5;
      }
    });
    onReady(gltf.scene);
  }, [gltf, onReady]);
  return <primitive object={gltf.scene} />;
}

function BikeAsset({ onReady }: { onReady(o: THREE.Object3D): void }) {
  const bike = useMemo(() => buildBike(makeRng(1)), []);
  useEffect(() => { onReady(bike.group); }, [bike, onReady]);
  return <primitive object={bike.group} />;
}

function CharacterAsset({ src, onReady }: { src: string; onReady(o: THREE.Object3D): void }) {
  const gltf = useGLTF(src);
  useEffect(() => { onReady(gltf.scene); }, [gltf, onReady]);
  return <primitive object={gltf.scene} />;
}

function Stage({ entry, onStats }: { entry: AssetEntry; onStats(s: { tris: number; calls: number; dims: string }): void }) {
  const { camera, controls, gl, scene } = useThree() as any;
  const onReady = useCallback((obj: THREE.Object3D) => {
    frameObject(camera, controls, obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    let tris = 0;
    obj.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        const g = m.geometry;
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      }
    });
    requestAnimationFrame(() => {
      gl.render(scene, camera);
      onStats({ tris: Math.round(tris), calls: gl.info.render.calls, dims: `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}m` });
    });
  }, [camera, controls, gl, scene, onStats]);
  if (entry.kind === 'bike') return <BikeAsset onReady={onReady} />;
  if (entry.kind === 'character') return <CharacterAsset src={entry.src!} onReady={onReady} />;
  return <KitbashAsset src={entry.src!} onReady={onReady} />;
}

function ExposureSync({ value }: { value: number }) {
  const { gl } = useThree();
  useEffect(() => { gl.toneMappingExposure = value; }, [gl, value]);
  return null;
}






export default function Viewer() {
  const [pieces, setPieces] = useState<KitPiece[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ tris: 0, calls: 0, dims: '—' });
  const [hud, setHud] = useState<HudState>({
    bloomIntensity: LIGHTING.bloomIntensity, bloomThreshold: LIGHTING.bloomThreshold,
    bloomRadius: LIGHTING.bloomRadius, exposure: LIGHTING.exposure,
  });

  useEffect(() => {
    fetch('/models/neocity/manifest.json')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`manifest ${r.status}`)))
      .then(d => setPieces(validateManifest(d)))
      .catch(e => { setErr(String(e)); setPieces([]); });
  }, []);

  const registry = useMemo(() => pieces ? buildRegistry(pieces) : [], [pieces]);
  const entry = pieces !== null ? registry[Math.min(index, registry.length - 1)] : undefined;

  // deep-link: on first load, select the asset named in ?asset=<id>
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || registry.length === 0) return;
    const want = new URLSearchParams(location.search).get('asset');
    if (want) {
      const i = registry.findIndex(a => a.id === want);
      if (i >= 0) setIndex(i);
    }
    setDeepLinked(true);
  }, [registry, deepLinked]);

  // reflect selection in URL
  useEffect(() => {
    if (entry) {
      const u = new URL(location.href);
      u.searchParams.set('asset', entry.id);
      history.replaceState(null, '', u);
    }
  }, [entry]);

  if (pieces === null) return null;

  return (
    <>
      <Canvas
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ position: [8, 6, 8], fov: 50 }}
      >
        <color attach="background" args={[PALETTE.void]} />
        <ExposureSync value={hud.exposure} />
        <ambientLight intensity={LIGHTING.ambientIntensity} />
        <directionalLight position={[10, 20, 10]} intensity={LIGHTING.keyIntensity} />
        <directionalLight position={[-15, 8, -5]} intensity={LIGHTING.fillIntensity} color={PALETTE.blue} />
        <directionalLight position={[0, 5, -20]} intensity={LIGHTING.rimIntensity} color={PALETTE.magenta} />
        <Suspense fallback={null}>
          <EnvMap />
          {entry && <Stage key={entry.id} entry={entry} onStats={setStats} />}
        </Suspense>
        <Grid args={[200, 200]} cellColor={PALETTE.panel} sectionColor={PALETTE.violet} fadeDistance={120} infiniteGrid position={[0, 0, 0]} />
        <OrbitControls makeDefault />
        <EffectComposer>
          <Bloom intensity={hud.bloomIntensity} luminanceThreshold={hud.bloomThreshold} radius={hud.bloomRadius} mipmapBlur />
        </EffectComposer>
      </Canvas>
      <Hud
        assetLabels={registry.map(a => a.label)}
        index={index}
        onIndex={setIndex}
        state={hud}
        onState={setHud}
        stats={stats}
      />
      {err && <div style={{ position: 'fixed', bottom: 12, left: 12, color: PALETTE.red, font: '12px monospace' }}>manifest error: {err} (run npm run kitbash)</div>}
    </>
  );
}
