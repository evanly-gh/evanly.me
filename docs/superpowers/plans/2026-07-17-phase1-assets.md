# Phase 1 — Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vite + React Three Fiber repo, rewrite the KitBash mesh pipeline to produce **textured** per-piece `.glb` files, and build a `?viewer` asset inspector where every asset is visually signed off before any city work begins.

**Architecture:** Single-page R3F canvas app on Vite. An offline Node pipeline (`tools/process-kitbash.mjs`) converts the 185MB NeoCity OBJ → per-piece DRACO `.glb` with PBR materials preserved, emitting a `manifest.json`. The app has two entry routes chosen by query param: a default empty scene shell (`<App/>`) and the asset inspector (`<Viewer/>`). The bike is ported from attempt 2 (returns a `THREE.Group`, wrapped via R3F `<primitive>`).

**Tech Stack:** Vite, TypeScript (strict), three ^0.185, @react-three/fiber ^9, @react-three/drei ^10, @react-three/postprocessing ^3, gsap ^3, vitest ^4. Pipeline dev deps: obj2gltf ^3, @gltf-transform/core|functions|extensions ^4, draco3dgltf, meshoptimizer.

## Global Constraints

- **Palette (attempt 1, verbatim):** void `#0A0B1E`, panel `#141838`, magenta `#FF3DA6`, cyan `#2BFDF9`, amber `#FFC857`, violet `#8A6CFF`, lime `#9DFF57`, red `#FF4D5E`, blue `#4D8CFF`, white `#EEF2FF`.
- **Cyan `#2BFDF9` is RESERVED for the bike/rider.** No city asset glows cyan.
- **TypeScript strict** everywhere (`strict: true`).
- **Textures are two-step (Evan's call):** embedded PNG first (verify quality), KTX2/Basis second (delivery). Default pipeline output = embedded PNG; `--ktx2` flag selects compressed.
- **Scoped run first (Evan's call):** verify ~5–6 hero pieces via `--only` before processing all 47.
- **Visual quality is gated by Evan in `?viewer`, not by automated tests.** (Attempt 2 had 267 tests and 0 visual gates.)
- **Source assets (read-only, do not modify):**
  - OBJ: `C:\Users\eliotli2\Downloads\Cyber Assets\Cyber_kitbash_neocity\kb3d_neocity-native.obj`
  - MTL: same dir, `kb3d_neocity-native.mtl` (references `KB3DTextures\4k\<name>.png`)
  - Textures: `C:\Users\eliotli2\Downloads\Cyber Assets\Cyber_kitbash_neocity\kb3d_neocity.png.4k\` (384 PNGs)
  - Characters (CC0 gltf): `C:\Users\eliotli2\Downloads\Cyber Assets\Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001\Cyberpunk Game Kit - Quaternius\`
- **Ported source files (copy from these exact paths):**
  - `cybersite/src/assets/vehicles/bike.ts` → `src/assets/bike.ts`
  - `cybersite/src/utils/rng.ts` → `src/assets/rng.ts`
  - `cybersite/src/content/resume.ts` → `src/content/resume.ts`
- **KNOWN DEVIATION FROM SPEC:** The hovercars ship as `Cyber hovercars/HoverCars.unitypackage` — NOT loadable `.fbx`/`.dae`. Hovercar loading is deferred (needs Unity extraction). Phase 1's non-KitBash asset validation uses the Quaternius `.gltf` characters instead. This is the only spec deviation.

---

## File Structure

```
evanly.me/
  index.html                       # Task 1
  vite.config.ts                   # Task 1
  tsconfig.json                    # Task 1
  package.json                     # Task 1
  .gitignore                       # Task 1
  vitest.config.ts                 # Task 2
  tools/
    process-kitbash.mjs            # Tasks 6-9 (rewrite)
  public/
    models/neocity/                # generated (gitignored)
  src/
    main.tsx                       # Task 3
    App.tsx                        # Task 3
    theme.ts                       # Task 2
    assets/
      rng.ts                       # Task 4 (ported)
      bike.ts                      # Task 5 (ported)
    content/
      resume.ts                    # Task 4 (ported)
    viewer/
      manifest.ts                  # Task 10
      assets.ts                    # Task 11
      Viewer.tsx                   # Task 12-13
      Hud.tsx                      # Task 12
  test/
    fixtures/manifest.sample.json  # Task 10
    theme.test.ts                  # Task 2
    pipeline.test.ts               # Task 10
    rng.test.ts                    # Task 4
```

---

### Task 1: Repo scaffold (Vite + TS + deps)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Vite project. `npm run dev` serves; `npm run build` compiles; `npm test` runs vitest.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "evanly-site",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "kitbash": "node tools/process-kitbash.mjs"
  },
  "dependencies": {
    "@react-three/drei": "^10.7.7",
    "@react-three/fiber": "^9.6.1",
    "@react-three/postprocessing": "^3.0.4",
    "gsap": "^3.15.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "three": "^0.185.1"
  },
  "devDependencies": {
    "@gltf-transform/core": "^4.4.1",
    "@gltf-transform/extensions": "^4.4.1",
    "@gltf-transform/functions": "^4.4.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/three": "^0.185.0",
    "@vitejs/plugin-react": "^4.3.4",
    "draco3dgltf": "^1.5.7",
    "meshoptimizer": "^0.22.0",
    "obj2gltf": "^3.2.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "test", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Evan Li</title>
    <style>
      html, body, #root { margin: 0; height: 100%; background: #0A0B1E; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
public/models/neocity/*.glb
public/models/neocity/manifest.json
*.local
.DS_Store
```

- [ ] **Step 6: Install and verify**

Run: `npm install`
Expected: completes without peer-dependency errors that block install.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore
git commit -m "chore: scaffold Vite + R3F project"
```

---

### Task 2: theme.ts + palette test

**Files:**
- Create: `src/theme.ts`, `vitest.config.ts`, `test/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const PALETTE: { void, panel, magenta, cyan, amber, violet, lime, red, blue, white }` — all `string` hex.
  - `export const COLORS: { tronCyan: number, signalMagenta: number, moonlight: number }` — numeric, bike-compat shim.
  - `export const LIGHTING: { ambientIntensity, keyIntensity, fillIntensity, rimIntensity, bloomIntensity, bloomThreshold, bloomRadius, exposure }` — all `number`.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test `test/theme.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { PALETTE, COLORS, LIGHTING } from '../src/theme';

describe('theme', () => {
  it('every palette value is a 6-digit hex string', () => {
    for (const v of Object.values(PALETTE)) {
      expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('cyan is reserved for the bike and matches the COLORS shim', () => {
    expect(PALETTE.cyan.toLowerCase()).toBe('#2bfdf9');
    // COLORS.tronCyan (numeric) must equal PALETTE.cyan
    expect(COLORS.tronCyan).toBe(parseInt(PALETTE.cyan.slice(1), 16));
  });

  it('lighting constants are present and finite', () => {
    for (const key of ['ambientIntensity','keyIntensity','fillIntensity','rimIntensity','bloomIntensity','bloomThreshold','bloomRadius','exposure'] as const) {
      expect(Number.isFinite(LIGHTING[key])).toBe(true);
    }
    expect(LIGHTING.bloomThreshold).toBeGreaterThanOrEqual(0);
    expect(LIGHTING.bloomThreshold).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- theme`
Expected: FAIL — cannot resolve `../src/theme`.

- [ ] **Step 4: Create `src/theme.ts`**

```ts
/** Attempt-1 palette (verbatim). Cyan is reserved for the bike/rider. */
export const PALETTE = {
  void: '#0A0B1E',
  panel: '#141838',
  magenta: '#FF3DA6',
  cyan: '#2BFDF9',
  amber: '#FFC857',
  violet: '#8A6CFF',
  lime: '#9DFF57',
  red: '#FF4D5E',
  blue: '#4D8CFF',
  white: '#EEF2FF',
} as const;

const hexNum = (h: string): number => parseInt(h.slice(1), 16);

/**
 * Compatibility shim for the ported bike (cybersite bike.ts imports
 * COLORS.{tronCyan,signalMagenta,moonlight} as numbers). Mapped onto the
 * attempt-1 palette; cyan stays bike-reserved.
 */
export const COLORS = {
  tronCyan: hexNum(PALETTE.cyan),
  signalMagenta: hexNum(PALETTE.magenta),
  moonlight: hexNum(PALETTE.white),
} as const;

/** Starting lighting/bloom values; tuned live in the viewer HUD. */
export const LIGHTING = {
  ambientIntensity: 0.35,
  keyIntensity: 2.2,
  fillIntensity: 0.8,
  rimIntensity: 1.4,
  bloomIntensity: 0.6,
  bloomThreshold: 0.75,
  bloomRadius: 0.6,
  exposure: 1.0,
} as const;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- theme`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/theme.ts vitest.config.ts test/theme.test.ts
git commit -m "feat: add theme palette + lighting constants with tests"
```

---

### Task 3: App shell + query-param route switch

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `PALETTE` from `src/theme.ts`.
- Produces: `main.tsx` renders `<Viewer/>` when `location.search` includes `viewer`, else `<App/>`. (Viewer import is a stub until Task 12 — use a lazy placeholder so this task builds standalone.)

- [ ] **Step 1: Create `src/App.tsx`** (empty scene shell)

```tsx
import { Canvas } from '@react-three/fiber';
import { PALETTE } from './theme';

export default function App() {
  return (
    <Canvas camera={{ position: [0, 5, 15], fov: 55 }}>
      <color attach="background" args={[PALETTE.void]} />
      <ambientLight intensity={0.4} />
      <mesh rotation={[0.4, 0.6, 0]}>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color={PALETTE.violet} />
      </mesh>
      <directionalLight position={[5, 10, 5]} intensity={2} />
    </Canvas>
  );
}
```

- [ ] **Step 2: Create `src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const Viewer = React.lazy(() => import('./viewer/Viewer'));

const isViewer = new URLSearchParams(location.search).has('viewer');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isViewer ? (
      <React.Suspense fallback={null}>
        <Viewer />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
```

- [ ] **Step 3: Create a temporary `src/viewer/Viewer.tsx` stub** (replaced in Task 12; needed so the lazy import resolves and `npm run build` passes)

```tsx
export default function Viewer() {
  return null;
}
```

- [ ] **Step 4: Verify build + dev**

Run: `npm run build`
Expected: `tsc` passes, vite build succeeds, `dist/` produced.

Run: `npm run dev` then open `http://localhost:5173/` — a violet cube renders on the void background. Open `http://localhost:5173/?viewer` — blank (stub). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/viewer/Viewer.tsx
git commit -m "feat: app shell with ?viewer route switch"
```

---

### Task 4: Port rng.ts + resume.ts (+ rng test)

**Files:**
- Create: `src/assets/rng.ts`, `src/content/resume.ts`, `test/rng.test.ts`
- Copy source: `cybersite/src/utils/rng.ts`, `cybersite/src/content/resume.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Rng { (): number; range(a,b): number; int(a,b): number; pick<T>(arr): T; chance(p): boolean }` and `export function makeRng(seed: number): Rng`.
  - `export const RESUME: Resume` and its interfaces.

- [ ] **Step 1: Copy `rng.ts` verbatim** from `C:\Users\eliotli2\Documents\VSCode\cybersite\src\utils\rng.ts` to `src/assets/rng.ts` (no edits — it has no imports).

- [ ] **Step 2: Copy `resume.ts` verbatim** from `C:\Users\eliotli2\Documents\VSCode\cybersite\src\content\resume.ts` to `src/content/resume.ts` (no edits — self-contained, no imports).

- [ ] **Step 3: Write the failing test `test/rng.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/assets/rng';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('range/int/pick/chance behave within bounds', () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const x = r.range(2, 5);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x).toBeLessThan(5);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
    }
    expect(r.pick([9])).toBe(9);
    expect(typeof r.chance(0.5)).toBe('boolean');
  });
});
```

- [ ] **Step 4: Run test to verify it passes** (implementation already copied)

Run: `npm test -- rng`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/assets/rng.ts src/content/resume.ts test/rng.test.ts
git commit -m "feat: port rng + resume data with determinism test"
```

---

### Task 5: Port bike.ts, repointed imports

**Files:**
- Create: `src/assets/bike.ts`
- Copy source: `cybersite/src/assets/vehicles/bike.ts`

**Interfaces:**
- Consumes: `COLORS` from `src/theme.ts`, `Rng` from `src/assets/rng.ts`.
- Produces:
  - `export interface BikePose { lean: number; pitch: number; crouch: number; wheelSpin: number }`
  - `export interface BikeAsset { group: THREE.Group; pose(p: BikePose): void; ghostGeometry: THREE.BufferGeometry }`
  - `export function buildBike(rng: Rng): BikeAsset`

- [ ] **Step 1: Copy `bike.ts`** from `C:\Users\eliotli2\Documents\VSCode\cybersite\src\assets\vehicles\bike.ts` to `src/assets/bike.ts`.

- [ ] **Step 2: Repoint the two import lines** at the top of `src/assets/bike.ts`.

Change:
```ts
import { COLORS } from '../../theme';
import type { Rng } from '../../utils/rng';
```
To:
```ts
import { COLORS } from '../theme';
import type { Rng } from './rng';
```

(All `COLORS.tronCyan`, `COLORS.signalMagenta`, `COLORS.moonlight` uses now resolve to the numeric shim from Task 2.)

- [ ] **Step 3: Write a smoke test `test/bike.test.ts`** — verify it constructs and poses without throwing. (three works in node for geometry construction; no WebGL needed.)

```ts
import { describe, it, expect } from 'vitest';
import { buildBike } from '../src/assets/bike';
import { makeRng } from '../src/assets/rng';

describe('buildBike', () => {
  it('builds a poseable bike group with ghost geometry', () => {
    const bike = buildBike(makeRng(1));
    expect(bike.group.name).toBe('bike');
    expect(bike.ghostGeometry.getAttribute('position').count).toBeGreaterThan(0);
    // pose() must not throw across the choreography envelope
    expect(() => bike.pose({ lean: 0.4, pitch: Math.PI, crouch: 1, wheelSpin: 3 })).not.toThrow();
  });
});
```

- [ ] **Step 4: Run test**

Run: `npm test -- bike`
Expected: PASS (1 test). If three's addon import path (`three/addons/utils/BufferGeometryUtils.js`) fails to resolve under vitest, add `test.server.deps.inline: ['three']` to `vitest.config.ts` — but try first without.

- [ ] **Step 5: Commit**

```bash
git add src/assets/bike.ts test/bike.test.ts
git commit -m "feat: port Tron bike, repoint imports to new theme/rng"
```

---

### Task 6: Pipeline — source resolution + CLI flags

**Files:**
- Create/Rewrite: `tools/process-kitbash.mjs`
- Reference source (do not run as-is): `cybersite/tools/process-kitbash.mjs`

**Interfaces:**
- Consumes: source OBJ/MTL/textures (Global Constraints paths).
- Produces: a script that parses `--only <substr,substr>`, `--ktx2`, and an optional positional OBJ path; validates that texture paths resolve BEFORE conversion; exits non-zero with a clear message otherwise. Later tasks (7–9) fill in conversion/split/optimize/write.

This is the first of a 4-task rewrite (6→7→8→9). Build the script incrementally; it is runnable (even if it only validates) after each task.

- [ ] **Step 1: Write the skeleton `tools/process-kitbash.mjs`**

```js
/**
 * process-kitbash.mjs — Offline pipeline: KitBash NeoCity OBJ → per-piece
 * DRACO GLB with PBR materials/textures PRESERVED.
 *
 * Attempt-3 rewrite. Differs from cybersite's version: no `unlit`, no
 * vertex-color bake, no material merge — original named materials and their
 * texture maps are kept. Two-step textures: embedded PNG (default) or KTX2
 * (`--ktx2`). Scoped runs via `--only`.
 *
 * Usage:
 *   node tools/process-kitbash.mjs [obj] [--only=BldgLG_C,BldgSM_A] [--ktx2]
 */
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CLI parsing ---
const argv = process.argv.slice(2);
const flags = { only: null, ktx2: false, obj: null };
for (const a of argv) {
  if (a.startsWith('--only=')) flags.only = a.slice(7).split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--ktx2') flags.ktx2 = true;
  else if (!a.startsWith('--')) flags.obj = a;
}

const DEFAULT_OBJ = path.join(
  os.homedir(), 'Downloads', 'Cyber Assets', 'Cyber_kitbash_neocity',
  'kb3d_neocity-native.obj'
);
const srcObj = flags.obj ? path.resolve(flags.obj.replace(/^~/, os.homedir())) : DEFAULT_OBJ;
const srcDir = path.dirname(srcObj);
const outDir = path.resolve(__dirname, '..', 'public', 'models', 'neocity');

// --- Source validation (fail LOUD, not silent-grey like attempt 2) ---
if (!fs.existsSync(srcObj)) {
  console.error(`ERROR: source OBJ not found: ${srcObj}`);
  process.exit(1);
}
const mtlPath = srcObj.replace(/\.obj$/i, '.mtl');
if (!fs.existsSync(mtlPath)) {
  console.error(`ERROR: MTL not found next to OBJ: ${mtlPath}`);
  process.exit(1);
}
// The MTL references KB3DTextures/4k/<name>.png. Verify at least one resolves.
const texDir = path.join(srcDir, 'KB3DTextures', '4k');
const altTexDir = path.join(srcDir, 'kb3d_neocity.png.4k');
if (!fs.existsSync(texDir) || fs.readdirSync(texDir).length === 0) {
  console.error(
    `ERROR: textures not found at ${texDir}\n` +
    `The MTL expects KB3DTextures/4k/<name>.png. Populate it first:\n` +
    `  cd "${srcDir}"\n` +
    `  mklink /D "KB3DTextures\\4k" "kb3d_neocity.png.4k"   (admin cmd)\n` +
    `Actual textures live at: ${altTexDir}`
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
console.log(`Source OBJ : ${srcObj}`);
console.log(`Textures   : ${texDir}`);
console.log(`Output dir : ${outDir}`);
console.log(`Mode       : ${flags.ktx2 ? 'KTX2' : 'embedded PNG'}${flags.only ? `  only=[${flags.only.join(',')}]` : ''}`);

// Tasks 7-9 append conversion/split/optimize/write below.
```

- [ ] **Step 2: Run the validation path**

Run: `node tools/process-kitbash.mjs` (with `KB3DTextures/4k` NOT yet populated)
Expected: exits with the "textures not found" message and the `mklink` hint (proves the loud-failure guard works).

- [ ] **Step 3: Populate the texture dir** (one-time manual, per spec)

In an **admin** cmd.exe:
```
cd "C:\Users\eliotli2\Downloads\Cyber Assets\Cyber_kitbash_neocity"
mklink /D "KB3DTextures\4k" "kb3d_neocity.png.4k"
```
If mklink is denied, copy instead: `xcopy /E /I "kb3d_neocity.png.4k" "KB3DTextures\4k"`.

Run: `node tools/process-kitbash.mjs`
Expected: prints Source/Textures/Output/Mode lines and exits cleanly (no conversion yet).

- [ ] **Step 4: Commit**

```bash
git add tools/process-kitbash.mjs
git commit -m "feat: kitbash pipeline skeleton with loud texture validation"
```

---

### Task 7: Pipeline — OBJ→GLB conversion (PBR preserved)

**Files:**
- Modify: `tools/process-kitbash.mjs` (append)

**Interfaces:**
- Consumes: `srcObj`, `outDir`, `flags` from Task 6.
- Produces: an in-memory gltf-transform `Document` (`masterDoc`) with all 47 named scene children, PBR materials + textures intact.

- [ ] **Step 1: Append conversion + load code**

```js
import { createRequire } from 'module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const require = createRequire(import.meta.url);

console.log('\n[1/4] Converting OBJ -> GLB (PBR preserved, ~25s) ...');
const obj2gltf = require('obj2gltf');
const t0 = Date.now();
// NOTE: no `unlit`. PBR materials + texture maps are preserved.
let fullGlb = await obj2gltf(srcObj, { binary: true, checkTransparency: false });
console.log(`  Done, GLB ${(fullGlb.length / 1048576).toFixed(1)} MB`);

console.log('[2/4] Loading into gltf-transform ...');
const encoder = await draco3d.createEncoderModule({});
const decoder = await draco3d.createDecoderModule({});
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': encoder, 'draco3d.decoder': decoder });
const masterDoc = await io.readBinary(new Uint8Array(fullGlb));
fullGlb = null;
const masterScene = masterDoc.getRoot().listScenes()[0];
const masterNodes = masterScene.listChildren();
console.log(`  ${masterNodes.length} scene children (expect 47)`);
```

- [ ] **Step 2: Run to verify conversion**

Run: `node tools/process-kitbash.mjs --only=BldgLG_C`
Expected: prints "GLB NNN.N MB" then "47 scene children (expect 47)". (Conversion always converts the whole OBJ; `--only` filters the split step in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add tools/process-kitbash.mjs
git commit -m "feat: kitbash OBJ->GLB conversion preserving PBR materials"
```

---

### Task 8: Pipeline — per-piece split + geometry optimize

**Files:**
- Modify: `tools/process-kitbash.mjs` (append)

**Interfaces:**
- Consumes: `masterDoc`, `masterNodes`, `io`, `flags`, `outDir`.
- Produces: for each selected piece, a written `<PieceName>.glb` (DRACO geometry, PBR textures embedded as PNG), and an in-memory `manifest` array of `{ name, file, bbox:[w,h,d], hasEmissive, tris, category }`.

- [ ] **Step 1: Append category helper + split loop**

```js
import { cloneDocument, getBounds, weld, dedup, prune, draco, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Category + simplify ratio from the KB3D piece-name prefix. */
function categoryOf(name) {
  if (name.includes('BldgLG')) return { category: 'LG', ratio: 0.6 };
  if (name.includes('BldgMD')) return { category: 'MD', ratio: 0.45 };
  if (name.includes('BldgSM')) return { category: 'SM', ratio: 0.3 };
  return { category: 'prop', ratio: 0.3 };
}

/** Emissive if any material name hints light/glass/neon/banner/letters/decal/screen. */
const EMISSIVE_PATTERNS = ['light','glass','banner','letters','neon','decal','screen'];
function pieceHasEmissive(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    const n = (m.getName() || '').toLowerCase();
    if (EMISSIVE_PATTERNS.some(p => n.includes(p))) return true;
  }
  return false;
}

function countTris(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      t += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  return Math.round(t);
}

console.log('\n[3/4] Splitting + optimizing pieces ...\n');
const manifest = [];
for (let i = 0; i < masterNodes.length; i++) {
  const name = masterNodes[i].getName();
  if (flags.only && !flags.only.some(s => name.includes(s))) continue;

  const pieceDoc = cloneDocument(masterDoc);
  const scene = pieceDoc.getRoot().listScenes()[0];
  for (const ch of scene.listChildren()) if (ch.getName() !== name) ch.dispose();

  // bbox from original geometry
  let bbox = [0, 0, 0];
  try {
    const b = getBounds(scene);
    bbox = [b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]].map(v => +v.toFixed(3));
  } catch { /* leave zeros */ }

  const hasEmissive = pieceHasEmissive(pieceDoc);
  const { category, ratio } = categoryOf(name);

  // Optimize geometry ONLY — materials/textures preserved as-is.
  await pieceDoc.transform(
    prune(),
    weld({ tolerance: 1e-4 }),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }),
    dedup(),
    draco({ quantizationVolume: 'scene' }),
  );

  const tris = countTris(pieceDoc);
  const outFile = path.join(outDir, `${name}.glb`);
  const glb = await io.writeBinary(pieceDoc);
  fs.writeFileSync(outFile, Buffer.from(glb));

  manifest.push({ name, file: `neocity/${name}.glb`, bbox, hasEmissive, tris, category });
  console.log(`  [${String(i+1).padStart(2,'0')}] ${name.padEnd(40)} ${(glb.byteLength/1024).toFixed(0).padStart(7)} KB  tris=${tris}${hasEmissive?' [E]':''}`);
}
```

- [ ] **Step 2: Run on hero pieces**

Run: `node tools/process-kitbash.mjs --only=BldgLG_C_Main,BldgMD_C_Main,BldgSM_A_Main,BldgSM_C_NeonSignA`
Expected: writes 3–4 `.glb` files into `public/models/neocity/`, each line showing KB size + tri count. `BldgSM_C_NeonSignA` should show `[E]`.

- [ ] **Step 3: Sanity-check a file exists and is non-trivial**

Run: `ls -la public/models/neocity/*.glb`
Expected: files present, sizes > 100KB (textures embedded → larger than the attempt-2 textureless files).

- [ ] **Step 4: Commit** (code only — `.glb` are gitignored)

```bash
git add tools/process-kitbash.mjs
git commit -m "feat: per-piece split with PBR-preserving geometry optimize"
```

---

### Task 9: Pipeline — manifest write + KTX2 branch + summary

**Files:**
- Modify: `tools/process-kitbash.mjs` (append)

**Interfaces:**
- Consumes: `manifest`, `flags`, `outDir`, `pieceDoc` transform pipeline.
- Produces: `public/models/neocity/manifest.json` (sorted by name); when `--ktx2`, textures are compressed via `textureCompress` in the transform chain.

- [ ] **Step 1: Add the KTX2 branch to the transform chain in Task 8's loop**

In the `pieceDoc.transform(...)` call added in Task 8, insert texture compression conditionally. Replace the transform call with:

```js
  const transforms = [
    prune(),
    weld({ tolerance: 1e-4 }),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }),
    dedup(),
  ];
  if (flags.ktx2) {
    const { textureCompress } = await import('@gltf-transform/functions');
    const sharp = (await import('sharp')).default;
    transforms.push(textureCompress({ encoder: sharp, targetFormat: 'ktx2', resize: [2048, 2048] }));
  }
  transforms.push(draco({ quantizationVolume: 'scene' }));
  await pieceDoc.transform(...transforms);
```

NOTE: `--ktx2` requires `sharp` and KTX tooling. If not installed, the branch errors clearly. Default (embedded PNG) needs neither. Add `sharp` to devDeps ONLY when Evan approves step 2 (post-hero-sign-off). Document this in the run log, do not install pre-emptively.

- [ ] **Step 2: Append manifest write + summary** (after the split loop)

```js
console.log('\n[4/4] Writing manifest.json ...');
manifest.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const totalKB = manifest.reduce((s, m) => {
  try { return s + fs.statSync(path.join(outDir, path.basename(m.file))).size / 1024; } catch { return s; }
}, 0);
console.log(`\n=== Summary ===`);
console.log(`  Pieces written : ${manifest.length}`);
console.log(`  Total size     : ${totalKB.toFixed(0)} KB`);
console.log(`  With emissive  : ${manifest.filter(m => m.hasEmissive).length}`);
console.log(`  Output         : ${outDir}`);
console.log('\nDone.');
```

- [ ] **Step 3: Re-run hero pieces (embedded PNG) and check manifest**

Run: `node tools/process-kitbash.mjs --only=BldgLG_C_Main,BldgMD_C_Main,BldgSM_A_Main,BldgSM_C_NeonSignA`
Run: `cat public/models/neocity/manifest.json`
Expected: valid JSON array, entries sorted by name, each with `name/file/bbox/hasEmissive/tris/category`.

- [ ] **Step 4: Commit**

```bash
git add tools/process-kitbash.mjs
git commit -m "feat: manifest write + KTX2 branch + run summary"
```

---

### Task 10: manifest.ts loader + pipeline shape test

**Files:**
- Create: `src/viewer/manifest.ts`, `test/fixtures/manifest.sample.json`, `test/pipeline.test.ts`

**Interfaces:**
- Consumes: manifest JSON shape from Task 9.
- Produces:
  - `export interface KitPiece { name: string; file: string; bbox: [number,number,number]; hasEmissive: boolean; tris: number; category: 'LG'|'MD'|'SM'|'prop' }`
  - `export function validateManifest(data: unknown): KitPiece[]` — throws on malformed data, returns typed + name-sorted array.

- [ ] **Step 1: Create the fixture `test/fixtures/manifest.sample.json`**

```json
[
  { "name": "BldgSM_A_Main", "file": "neocity/BldgSM_A_Main.glb", "bbox": [8.1, 12.3, 6.4], "hasEmissive": false, "tris": 4200, "category": "SM" },
  { "name": "BldgLG_C_Main", "file": "neocity/BldgLG_C_Main.glb", "bbox": [35.0, 143.2, 34.1], "hasEmissive": true, "tris": 58000, "category": "LG" }
]
```

- [ ] **Step 2: Write the failing test `test/pipeline.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { validateManifest } from '../src/viewer/manifest';

const sample = JSON.parse(readFileSync(new URL('./fixtures/manifest.sample.json', import.meta.url), 'utf8'));

describe('validateManifest', () => {
  it('returns typed entries sorted by name', () => {
    const out = validateManifest(sample);
    expect(out.map(p => p.name)).toEqual(['BldgLG_C_Main', 'BldgSM_A_Main']);
    expect(out[0].bbox).toHaveLength(3);
    expect(out[0].category).toBe('LG');
    expect(typeof out[0].tris).toBe('number');
  });

  it('throws on malformed data', () => {
    expect(() => validateManifest([{ name: 'x' }])).toThrow();
    expect(() => validateManifest({})).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL — cannot resolve `../src/viewer/manifest`.

- [ ] **Step 4: Create `src/viewer/manifest.ts`**

```ts
export interface KitPiece {
  name: string;
  file: string;
  bbox: [number, number, number];
  hasEmissive: boolean;
  tris: number;
  category: 'LG' | 'MD' | 'SM' | 'prop';
}

const CATEGORIES = ['LG', 'MD', 'SM', 'prop'] as const;

export function validateManifest(data: unknown): KitPiece[] {
  if (!Array.isArray(data)) throw new Error('manifest: expected an array');
  const out = data.map((e, i) => {
    if (typeof e !== 'object' || e === null) throw new Error(`manifest[${i}]: not an object`);
    const o = e as Record<string, unknown>;
    if (typeof o.name !== 'string') throw new Error(`manifest[${i}]: name`);
    if (typeof o.file !== 'string') throw new Error(`manifest[${i}]: file`);
    if (!Array.isArray(o.bbox) || o.bbox.length !== 3 || !o.bbox.every(n => typeof n === 'number'))
      throw new Error(`manifest[${i}]: bbox`);
    if (typeof o.hasEmissive !== 'boolean') throw new Error(`manifest[${i}]: hasEmissive`);
    if (typeof o.tris !== 'number') throw new Error(`manifest[${i}]: tris`);
    if (!CATEGORIES.includes(o.category as typeof CATEGORIES[number])) throw new Error(`manifest[${i}]: category`);
    return {
      name: o.name, file: o.file, bbox: o.bbox as [number, number, number],
      hasEmissive: o.hasEmissive, tris: o.tris, category: o.category as KitPiece['category'],
    };
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/viewer/manifest.ts test/fixtures/manifest.sample.json test/pipeline.test.ts
git commit -m "feat: manifest loader + validation with fixture test"
```

---

### Task 11: Asset registry

**Files:**
- Create: `src/viewer/assets.ts`

**Interfaces:**
- Consumes: `KitPiece` (Task 10), `buildBike`/`makeRng` (Tasks 4–5).
- Produces:
  - `export type AssetKind = 'kitbash' | 'bike' | 'character'`
  - `export interface AssetEntry { id: string; label: string; kind: AssetKind; src?: string; piece?: KitPiece }`
  - `export function buildRegistry(pieces: KitPiece[]): AssetEntry[]` — kitbash pieces from the manifest, plus a `bike` entry, plus a few Quaternius `character` entries (public-copied paths).
  - `export const CHARACTER_SRCS: string[]` — public URLs of copied character gltf.

- [ ] **Step 1: Copy a couple of Quaternius characters into `public/`**

Run (bash):
```bash
mkdir -p public/models/characters
cp "C:/Users/eliotli2/Downloads/Cyber Assets/Cyberpunk Game Kit - Quaternius-20260716T040550Z-1-001/Cyberpunk Game Kit - Quaternius/Character/Character.gltf" public/models/characters/ 2>&1 || echo "check path"
```
If the `.gltf` references external `.bin`/textures, copy the whole `Character/` folder contents. Verify with `ls public/models/characters/`.

Add `public/models/characters/` to `.gitignore` (large binaries):
```
public/models/characters/
```

- [ ] **Step 2: Create `src/viewer/assets.ts`**

```ts
import type { KitPiece } from './manifest';

export type AssetKind = 'kitbash' | 'bike' | 'character';

export interface AssetEntry {
  id: string;
  label: string;
  kind: AssetKind;
  /** public URL for gltf-loaded assets (kitbash, character) */
  src?: string;
  piece?: KitPiece;
}

export const CHARACTER_SRCS: string[] = [
  '/models/characters/Character.gltf',
];

export function buildRegistry(pieces: KitPiece[]): AssetEntry[] {
  const kit: AssetEntry[] = pieces.map(p => ({
    id: p.name, label: p.name, kind: 'kitbash', src: `/models/${p.file}`, piece: p,
  }));
  const bike: AssetEntry = { id: 'bike', label: 'Tron Bike (hero)', kind: 'bike' };
  const chars: AssetEntry[] = CHARACTER_SRCS.map((src, i) => ({
    id: `char-${i}`, label: `Character ${i + 1}`, kind: 'character', src,
  }));
  return [bike, ...kit, ...chars];
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit** (code only)

```bash
git add src/viewer/assets.ts .gitignore
git commit -m "feat: viewer asset registry (kitbash + bike + characters)"
```

---

### Task 12: Viewer HUD (DOM overlay)

**Files:**
- Create: `src/viewer/Hud.tsx`

**Interfaces:**
- Consumes: `LIGHTING` from `src/theme.ts`.
- Produces:
  - `export interface HudState { bloomIntensity: number; bloomThreshold: number; bloomRadius: number; exposure: number }`
  - `export interface HudProps { assetLabels: string[]; index: number; onIndex(i: number): void; state: HudState; onState(s: HudState): void; stats: { tris: number; calls: number; dims: string } }`
  - `export function Hud(props: HudProps): JSX.Element`

- [ ] **Step 1: Create `src/viewer/Hud.tsx`**

```tsx
import { PALETTE } from '../theme';

export interface HudState {
  bloomIntensity: number;
  bloomThreshold: number;
  bloomRadius: number;
  exposure: number;
}

export interface HudProps {
  assetLabels: string[];
  index: number;
  onIndex(i: number): void;
  state: HudState;
  onState(s: HudState): void;
  stats: { tris: number; calls: number; dims: string };
}

const box: React.CSSProperties = {
  position: 'fixed', top: 12, left: 12, zIndex: 9999,
  font: '12px/1.5 ui-monospace, monospace', color: PALETTE.cyan,
  background: 'rgba(10,11,30,0.85)', border: `1px solid ${PALETTE.panel}`,
  padding: '10px 12px', borderRadius: 6, width: 260, userSelect: 'none',
};

function Slider(p: { label: string; min: number; max: number; step: number; value: number; onChange(v: number): void }) {
  return (
    <label style={{ display: 'block', margin: '4px 0' }}>
      <span>{p.label}: {p.value.toFixed(2)}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        style={{ width: '100%' }}
        onChange={e => p.onChange(Number(e.target.value))} />
    </label>
  );
}

export function Hud(props: HudProps) {
  const { state, onState, stats } = props;
  const set = (patch: Partial<HudState>) => onState({ ...state, ...patch });
  return (
    <div style={box}>
      <div style={{ color: PALETTE.white, fontWeight: 700 }}>ASSET VIEWER</div>
      <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        <button onClick={() => props.onIndex((props.index - 1 + props.assetLabels.length) % props.assetLabels.length)}>◀</button>
        <span style={{ flex: 1, textAlign: 'center' }}>{props.assetLabels[props.index]}</span>
        <button onClick={() => props.onIndex((props.index + 1) % props.assetLabels.length)}>▶</button>
      </div>
      <div style={{ color: PALETTE.amber, margin: '6px 0' }}>
        tris {stats.tris.toLocaleString()} · calls {stats.calls} · {stats.dims}
      </div>
      <hr style={{ border: 0, borderTop: `1px solid ${PALETTE.panel}` }} />
      <Slider label="Bloom" min={0} max={2} step={0.05} value={state.bloomIntensity} onChange={v => set({ bloomIntensity: v })} />
      <Slider label="Threshold" min={0} max={1} step={0.01} value={state.bloomThreshold} onChange={v => set({ bloomThreshold: v })} />
      <Slider label="Radius" min={0} max={1} step={0.01} value={state.bloomRadius} onChange={v => set({ bloomRadius: v })} />
      <Slider label="Exposure" min={0.2} max={2} step={0.05} value={state.exposure} onChange={v => set({ exposure: v })} />
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/viewer/Hud.tsx
git commit -m "feat: viewer HUD overlay with bloom/exposure sliders"
```

---

### Task 13: Viewer canvas (assemble + visual sign-off)

**Files:**
- Rewrite: `src/viewer/Viewer.tsx` (replaces the Task 3 stub)

**Interfaces:**
- Consumes: `buildRegistry`/`AssetEntry` (Task 11), `validateManifest`/`KitPiece` (Task 10), `Hud`/`HudState` (Task 12), `buildBike`+`makeRng` (Tasks 4–5), `LIGHTING`/`PALETTE` (Task 2).
- Produces: the `?viewer` experience — orbit around one centered, framed, lit asset; bloom/exposure live-tuned; prev/next through the registry; stats overlay. Default export `Viewer`.

- [ ] **Step 1: Rewrite `src/viewer/Viewer.tsx`**

```tsx
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, Grid } from '@react-three/drei';
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
  const onReady = (obj: THREE.Object3D) => {
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
  };
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
  if (pieces === null) return null;
  const entry = registry[Math.min(index, registry.length - 1)];

  // reflect selection in URL
  useEffect(() => {
    if (entry) {
      const u = new URL(location.href);
      u.searchParams.set('asset', entry.id);
      history.replaceState(null, '', u);
    }
  }, [entry]);

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
        <Environment preset="night" />
        <Grid args={[200, 200]} cellColor={PALETTE.panel} sectionColor={PALETTE.violet} fadeDistance={120} infiniteGrid position={[0, 0, 0]} />
        <Suspense fallback={null}>
          {entry && <Stage key={entry.id} entry={entry} onStats={setStats} />}
        </Suspense>
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
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors. (If drei's `useGLTF` DRACO decoder needs setup, add `useGLTF.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')` at module top — try without first.)

- [ ] **Step 3: Visual verification (Evan sign-off gate)**

Ensure hero pieces are processed (Task 8/9 run). Run: `npm run dev`, open `http://localhost:5173/?viewer`.
Verify each of these, adjusting the HUD sliders:
1. Bike renders with cyan glow; step the pose is fine (static neutral pose OK for now).
2. Each kitbash hero piece shows **textured PBR surfaces** (not grey clay) — this is THE Phase-1 success criterion.
3. Neon/emissive pieces glow under bloom without white-smear blowout at the tuned settings.
4. Character loads and is recognizable.
5. Stats overlay shows sane tri counts and dims.

Capture the tuned slider values; if they differ materially from `theme.ts` `LIGHTING`, update `theme.ts` and re-commit.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/Viewer.tsx src/theme.ts
git commit -m "feat: asset viewer canvas with framing, lighting, live bloom tuning"
```

---

### Task 14: Full 47-piece pipeline run (post-sign-off)

**Files:** none (operational task; outputs are gitignored).

**Interfaces:**
- Consumes: the validated pipeline (Tasks 6–9) + Evan's hero-piece sign-off (Task 13).
- Produces: all 47 `.glb` + full `manifest.json` in `public/models/neocity/`.

- [ ] **Step 1: Run the full pipeline** (only after Task 13 sign-off)

Run: `node tools/process-kitbash.mjs`
Expected: ~47 pieces written, summary printed, `manifest.json` has 47 entries.

- [ ] **Step 2: Spot-check in the viewer**

Run: `npm run dev`, open `?viewer`, page through several LG/MD/SM/prop pieces. Confirm no piece is missing/broken/grey.

- [ ] **Step 3: Decide KTX2 (step 2)** — if download sizes are too large for delivery, install `sharp`, add to devDeps, and re-run with `--ktx2`; re-verify quality. Otherwise defer KTX2 to Phase 5 perf. Record the decision in a one-line note appended to the Phase 1 spec's "Open items" section.

- [ ] **Step 4: Commit any spec note** (no binaries)

```bash
git add docs/superpowers/specs/2026-07-16-phase1-assets-design.md
git commit -m "docs: record KTX2 decision after full pipeline run"
```

---

## Self-Review

**Spec coverage:**
- Repo (Vite+R3F+deps) → Task 1 ✓
- theme.ts / palette / COLORS shim → Task 2 ✓
- Route switch (`?viewer`) → Task 3 ✓
- Ported resume/rng/bike → Tasks 4–5 ✓
- Texture pipeline rewrite (source fix, no-unlit, no bake/merge, per-category simplify, two-step textures, `--only`, `--ktx2`, manifest) → Tasks 6–9 ✓
- manifest loader + fixture test → Task 10 ✓
- Asset registry (kitbash/bike/character; hovercar deviation documented) → Task 11 ✓
- Viewer HUD (live bloom/exposure sliders) → Task 12 ✓
- Viewer canvas (framing, lighting, stats, orbit, URL asset param) → Task 13 ✓
- Hero-first then full run sign-off gate → Tasks 13–14 ✓
- Visual-gated-by-Evan (not tests) → stated in Tasks 13 & Global Constraints ✓

**Placeholder scan:** No TBD/TODO; all code steps contain full code; commands have expected output. ✓

**Type consistency:** `KitPiece` fields identical across manifest.ts (Task 10), assets.ts (Task 11), Viewer.tsx (Task 13). `HudState` identical across Hud.tsx (Task 12) and Viewer.tsx (Task 13). `buildBike`/`makeRng`/`Rng` signatures match Tasks 4–5. `validateManifest`/`buildRegistry` names consistent. ✓

**Known deviations:** hovercars deferred (unitypackage, not fbx/dae) — documented in Global Constraints and Task 11.
