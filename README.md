# evanly.me

An interactive 3D "cyber-city" personal website. You scroll, and a lone bike rides
a scripted route through a neon cyberpunk metropolis — past your About billboard,
over stunt ramps, through a research district, and out onto a moonlit bridge — with
the camera scrubbing along a cinematic timeline the whole way.

Hey there, I'm Evan and this is the code behind my portfolio site. This took way too
long to make... hope you enjoy it!

> Live site: **evanly.me** (the project's namesake domain).

---

## Overview

The site is a single continuous 3D shot. Instead of pages, the whole portfolio is a
**scroll-scrubbed ride** through a procedurally-built city: page scroll position maps
to "story progress" (`t` ∈ 0–1), which drives a bike along a spline, a keyframed
camera along a matching timeline, and section content (About / Projects / Research /
Finale) that reveals in-world on 3D billboards and panels.

Everything is built to degrade gracefully: browsers without WebGL 2, users who prefer
reduced motion, and small/low-power viewports all fall back to a plain, accessible
HTML résumé rendered from the same content source.

## Features

- **Scroll-scrubbed cinematic camera.** A pinned GSAP ScrollTrigger converts scroll
  into a normalized progress value; a keyframed camera rig (`smooth` / `hold` / `cut`
  / `dolly` interpolation modes) is sampled and the real camera **critically-damps**
  toward that pose each frame, so section-to-section hand-offs glide instead of snap.
- **A bike that rides the story.** The bike follows a deterministic route spline —
  a straight intro run, a Bézier 90° "Shibuya" turn, two stunt ramps with real
  **ballistic-parabola jumps** (launched tangent to the ramp slope), a scaffold ride,
  and a lift onto an elevated bridge — trailing a Tron-style light ribbon and
  Sandevistan afterimage echoes.
- **Cinematic intro gate.** Loading bar → `START` → the bike drives itself in from
  leaning against a building to the `t=0` start pose, handing off seamlessly to the
  live scroll ride.
- **Procedural neon city.** A deterministic, seeded layout of KitBash/Quaternius
  buildings, roads with glowing edge/center lines, a straddle-beam monorail with a
  parked train, a Shibuya crossing, instanced crowds (humans + robots), street
  furniture, animated water, an atmospheric moon, and ~40 hand-made ad billboards.
- **Interactive peek + polish.** A subtle mouse look-around parallax is layered on the
  scripted camera; on-screen section titles and an outro hero fade in/out imperatively
  (zero React re-renders while scrolling).
- **Graceful fallbacks & a11y.** WebGL 2 pre-flight probe, render/async error
  boundaries, `prefers-reduced-motion` handling, small-viewport detection, a
  skip-to-content link, and a full static HTML portfolio fallback.

## Tech Stack

| Area | Choice |
| --- | --- |
| UI framework | **React 19** |
| 3D | **three.js** (`^0.185`) via **React Three Fiber** (`@react-three/fiber` 9) |
| 3D helpers | **@react-three/drei** (GLTF/Draco, environment, controls) |
| Post-processing | **@react-three/postprocessing** (Bloom, HueSaturation, BrightnessContrast, Vignette) |
| Scroll animation | **GSAP** + **ScrollTrigger** |
| Build / dev | **Vite 6** + **TypeScript 5.7** (strict) |
| Asset pipeline | `@gltf-transform/*`, `draco3dgltf`, `meshoptimizer`, `obj2gltf`, `fbx2gltf`, `sharp` |

## Architecture / How It Works

### Progress pipeline

```
scroll (GSAP ScrollTrigger, pinned)
  → raw progress 0–1            [scroll/scrollRuntime.ts]
  → smoothed + remapped         [choreography/scrollRemap.ts]
  → semantic story t 0–1
  → ProgressDirector fans out to adapters   [choreography/progressDirector.ts]
        bike → camera → content → fx
```

`ProgressDirector` is a small transactional dispatcher: a single progress value is
pushed, in a fixed order, to the bike, camera, content, and FX adapters
(`components/three/ProductionDirector.tsx`). The camera adapter records a *desired*
pose from the rig; the render loop then damps the live camera toward it, applies an
**anti-clip pass** (oriented-bounding-box test that rides the camera up over any
building roof it would otherwise enter), and layers the mouse parallax peek.

### Directory map (`src/`)

- **`world/`** — pure data/layout generation, no rendering. `cityLayout.ts`
  (`buildCityLayout(seed)`) composes sub-layouts (`buildingCatalog`, `roads`,
  `bridgeLayout`, `intersections`, `crowdLayout`, `streetDressing`, `signLayout`,
  `researchLayout`, `stuntLayout`, `shoreline`, `highwayLayout`, …). `route.ts` owns
  the bike spline and `sampleRoute(t)` (Catmull-Rom + Bézier turn + parabolic jump
  arcs, with a semantic→arc-length remap). `visibilityProfile.ts` runs frustum
  culling into `full` / `cinematic` profiles. `layoutWorker.ts` runs all of this off
  the main thread.
- **`choreography/`** — scroll-to-scene mapping. `cameraRig.ts` (the `CameraRig`
  keyframe interpolator; keys must have strictly-increasing `t`),
  `productionCameraRig.ts` (the master timeline, organized by section),
  `progressDirector.ts`, `bikePath.ts` / `bikeContact.ts` / `bikeTrail.ts`,
  `reducedMotion.ts`.
- **`components/three/`** — the R3F render tree. `City.tsx` is the main scene (the
  `<Canvas>`, lighting, post FX, and every instanced layer). `ProductionDirector.tsx`
  wires progress into the scene each frame. `BikeRider.tsx` / `BikeTrails.tsx` render
  the bike + trails. `InstancedPieces.tsx` is the GPU-instancing workhorse. Per-section
  render assemblies live in `aboutRender` / `stuntRender` / `researchRender` /
  `signRender` / `finaleRender`.
- **`scroll/`** — `ScrollExperience.tsx` (the shell: intro gate, section titles, outro
  banner, error boundaries, fallback routing), `scrollRuntime.ts` (the pinned scroll
  runtime), `webglSupport.ts` (WebGL 2 probe), `NativePortfolio.tsx` (static fallback).
- **`content/`** — `resume.ts` (single source of truth for all copy), `aboutArt.ts`.
- **`assets/`** — procedural bike/rider geometry, procedural textures, seeded RNG.
- **`viewer/`**, **`world/inspectionPresets.ts`** — dev-only inspection tooling.

### Rendering & performance

The scene is dense, so the heavy lifting is in keeping the frame budget and first
load under control:

- **GPU instancing everywhere.** `InstancedPieces` groups placements by source GLB and
  draws each file as instanced meshes — draw calls scale with *file variety*, not
  instance count. Where possible it **merges a file's material-parts into one grouped
  geometry** so a whole building is a single `InstancedMesh` per spatial chunk (a
  ~14× reduction in matrix-buffer work for big buildings), falling back to per-part
  instancing when per-instance coloring (e.g. crowd palettes) is needed.
- **Off-thread layout.** The ~2.5 s of layout generation + frustum culling runs in a
  **Web Worker** (`layoutWorker.ts`); the canvas mounts immediately from a
  buildings-only bootstrap layout and swaps in the culled result when it arrives.
- **Progressive mount.** Instanced file-groups mount a few per macrotask
  (`setTimeout`-paced) behind procedural building shells, so first-load matrix
  construction never lands as one long frame.
- **GPU pre-warm.** On idle, `gl.compile` + `initTexture` walk the whole graph to
  compile shader programs and upload textures ahead of time, eliminating the
  first-scroll hitch when a big texture (e.g. the About poster) first enters frustum.
- **Cheap far field.** Distant skyline is two `InstancedMesh`es (dark + emissive);
  "canyon filler" backdrops use a tiny procedural-window shader.
- **Tuned canvas.** `dpr` capped at 1.5, `antialias: false` (the EffectComposer
  resolves separately), `powerPreference: 'high-performance'`, ACES tone mapping, and
  Bloom run at half resolution with mipmap blur.
- **Custom GLSL.** Hand-written shaders for the animated water (vertex wave
  displacement + a moonlight-reflection/Fresnel fragment pass) and the procedural
  window-lit canyon fillers.

## Setup / Development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc type-check + production build → dist/
npm run preview    # serve the production build
```

### Dev inspection harness (URL params)

There is no automated test suite; the project is verified visually via URL params
(useful with Playwright or a browser):

- `?shot=<t>&inspect` — pin the production camera at semantic-`t` (0–1) for a beat.
- `?city&inspect` — inspect the raw city layout with OrbitControls.
- `?freecam` — WASD / Q-E / Shift / Esc fly camera (dev builds).
- `?gallery` — line up every kit piece with labels.
- `?viewer` — standalone asset viewer.

Inspection APIs (`window.__EVANLY_*__`) are gated behind `import.meta.env.DEV` /
`VITE_ENABLE_INSPECTION` and the `&inspect` flag.

## Asset Pipeline

Source meshes/textures are processed offline into web-ready, Draco-compressed GLB and
WebP. The Draco decoder is self-hosted under `public/draco/` so building GLBs decode
without a third-party round-trip.

```bash
npm run assets:kitbash    # KitBash OBJ → per-piece DRACO GLB (textures preserved)
npm run assets:props      # prop meshes → DRACO GLB
npm run assets:variants   # height-variant building meshes
npm run assets:gallery    # gallery structures
npm run assets:moon       # NASA moon albedo/height → WebP
npm run assets:portrait   # About portrait → WebP
npm run assets:manifest   # regenerate runtime asset manifest
```

Note: large NeoCity GLBs are tracked with **Git LFS** (see `.gitattributes`).

## Build & Deploy

`npm run build` type-checks then produces a static `dist/`. `vite.config.ts` splits
the heavy dependencies into long-lived vendor chunks (`react`, `three`, `r3f`, `gsap`)
so the initial chunk stays lean and caches well across deploys, and emits the layout
Web Worker as an ES module. The output in `dist/` is a static bundle deployable to any
static host / CDN (no server runtime required).

## Project Structure

```
src/
  components/three/   R3F scene, city, bike, moon, camera director, per-section renders
  world/              deterministic layout + route math + visibility culling + worker
  choreography/       camera rig, progress director, bike path, scroll remap
  scroll/             scroll runtime + experience shell + WebGL gate + static fallback
  content/            résumé data + generated art
  assets/             procedural bike/rider, procedural textures, seeded RNG
  viewer/             dev-only asset viewer
public/               models (Draco GLB), textures, billboard images, Draco decoder
tools/                offline asset pipeline (mesh → DRACO GLB, moon, props, portrait)
```
