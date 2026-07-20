# Handoff: Cyberpunk Portfolio Site — Attempt 3

> **Purpose of this document:** everything a fresh Claude session needs to
> start attempt 3 of Evan Li's scroll-driven cyberpunk portfolio site.
> Read this before touching code. It covers what was tried, what failed,
> what's salvageable, where the assets live, and what to build.

---

## Current status (updated 2026-07-20)

**Phase 1 (Assets) is COMPLETE** (branch `phase1-assets`), pending only Evan's
visual sign-off in `?viewer`.

- Repo scaffolded (Vite + R3F), `theme.ts`, `?viewer` asset inspector with a
  live bloom/exposure HUD and deep-linking (`?viewer&asset=<id>`).
- **Hero bike + rider** built and iterated to match the TRON reference
  (`src/assets/bike.ts`): smooth round body, exposed thick textured wheels,
  dark engine, elevated top strip, red brake light; clothed rider (helmet/vest/
  pants/boots + cyan circuitry, dark suit). 2 draw calls for the rider.
- **KitBash pipeline** (`tools/process-kitbash.mjs`) rewritten to emit
  **WebP@1024 + DRACO** GLBs (the broken KTX2-via-sharp branch was replaced;
  flags `--webp`/`--res=N`). Full run done: **47/47 pieces, ~88 MB**, PBR
  intact, `manifest.json` committed (`.glb` binaries gitignored, regenerate via
  `npm run kitbash -- --webp --res=1024`).
- **Character**: a Quaternius CC0 gltf verified in `?viewer`. Hovercars remain
  deferred (ship as `.unitypackage`).
- Work log + review screenshots: `docs/progress/phase1/`.

**Next: Phase 2 (City).** A draft design spec exists at
`docs/superpowers/specs/2026-07-20-phase2-city-design.md`. Per the build order
below, Phase 2 must not start until Evan signs off Phase 1's assets.

---

## Who is this for

Evan Li — CS + Economics student at UW, ML systems focus. The site is
a personal portfolio at **evanly.me**. It's a scroll-scrubbed cinematic
ride: a Tron-style bike carries the viewer through a neon cyberpunk city,
revealing About / Projects / Research sections zone by zone, ending on a
moonlit bridge. Below the 3D canvas, accessible DOM sections repeat the
content for SEO and reduced-motion users.

---

## What has been tried (two prior attempts)

### Attempt 1 — `personal_site` (pretty good, too simple)

- **Repo:** `github.com/evanly-gh/personal_site`, branch `city-rebuild`
- **Local clone:** `C:\Users\eliotli2\Documents\VSCode\personal_site`
  (checkout the `city-rebuild` branch, not `main`)
- **Stack:** Next.js 16 + React Three Fiber (R3F) + drei + GSAP
  ScrollTrigger + @react-three/postprocessing + Tailwind
- **What worked:** the site looked cohesive and polished. A pixel-art neon
  city with individually-built R3F building components (ShopHouse,
  ApartmentBlock, OfficeTower, TieredTower, HoloTower, BackdropSlab), a
  biker rig, scroll-synced captions, lane-aligned traffic, flying cars,
  pedestrians, a crash-site scene, post-processing bloom. The R3F
  component model (each building/prop is a React component with a `seed`
  prop) made scene composition fast and readable.
- **What was lacking:** (a) the road was basically straight (no dramatic
  turns or stunts); (b) all assets were procedural (three.js box geometry +
  canvas textures) so they looked "stylized low-poly" — Evan wanted more
  visual detail; (c) no big cinematic moments (backflips, Shibuya-style
  crossings). The site was functional but not "wow."
- **Key files worth salvaging:**
  - `src/components/three/CityScene.tsx` — scene composition pattern (how
    buildings/props/traffic are laid out in JSX)
  - `src/components/three/path.ts` — waypoint spline + scroll mapping
    (simpler route, but the pattern is good)
  - `src/components/three/content.ts` — résumé data structure (slightly
    different shape from attempt 2, but same content)
  - `src/components/Hero.tsx` — scroll-trigger wiring + caption system
  - `src/components/three/panels.tsx` — HoloScreen/Gantry content displays
  - `src/components/three/common.ts` — palette, mulberry32 RNG, material
    helpers
  - `DECISIONS.md` — documents every non-obvious choice; READ IT before
    building. Covers visual direction, lighting, degradation, content
    architecture.
  - Building components under `src/components/three/buildings/` — each is
    a self-contained R3F component (seed-driven, parametric). The procedural
    style is being replaced with loaded KitBash meshes, but the COMPONENT
    PATTERN (props in, visual out) is the right model.
  - Props under `src/components/three/props/` — HoverCar, StreetLamp,
    Pedestrian, FlyingTraffic, etc. Some may be reusable alongside KitBash
    buildings.

### Attempt 2 — `cybersite` (technically ambitious, visually bad)

- **Repo:** `github.com/evanly-gh/cybersite`, branch `build/cyberpunk-hero`
- **Local clone:** `C:\Users\eliotli2\Documents\VSCode\cybersite`
- **Stack:** Vite + raw Three.js (imperative, no React) + GSAP
  ScrollTrigger + TypeScript strict
- **What was tried:** a complete rebuild from scratch with a more complex
  route (90° Shibuya turn, ramp/backflip/scaffolding stunt, research
  canyon, moonlit bridge), KitBash NeoCity loaded meshes, a subagent-driven
  development process with per-task TDD + code review.
- **What went wrong:** the site looks *worse* than attempt 1 despite more
  code and effort. Root causes:
  1. **Assets had no textures.** The KitBash buildings loaded as geometry
     with no PBR maps (the texture download was initially missing). I faked
     materials in code → dull grey clay. NOW RESOLVED: textures have been
     downloaded (see Assets section below).
  2. **Path-first, art-last workflow.** Built the entire route/camera/scroll
     choreography grey-box-first, then tried to bolt assets on. Nobody ever
     art-directed the individual assets or the scene composition. The
     correct order (which Evan explicitly wants for attempt 3) is: design
     assets → assemble city → add bike → design camera.
  3. **Bloom/exposure out of control.** The bike's light pool and
     sandevistan ghost trail blow out into giant white smears. Emissive
     materials + post-processing bloom were never tuned together.
  4. **Camera frequently frames nothing.** The chase-cam keys were computed
     from route math without visual verification. The About section shows a
     blown-out metro line, not the hero wall. Research shows dark sky.
  5. **Over-engineered process, under-engineered visuals.** 18 tasks, each
     with TDD + code review → 267 passing tests, 0 visual quality gates
     that caught real problems.
- **Key files worth salvaging (framework-agnostic math/pipeline):**
  - `tools/process-kitbash.mjs` — the offline OBJ→split→decimate→DRACO
    pipeline. Works, tested. BUT: must be re-run with textures this time
    (see Assets section). The current `.glb` files in `public/models/neocity/`
    are textureless and should NOT be carried to attempt 3.
  - `src/world/route.ts` — the spline with waypoints, semantic-t → arc-length
    remap, `sampleRoute(t)`, `roadFrame(t)`, `ZONES`. This math is correct
    and tested (pure functions of t, deterministic). Port the LOGIC; the
    waypoint coordinates encode the route Evan approved (straight → 90°
    right at Shibuya → ramp1 → flip1 → scaffold → ramp2 → flip2 → descend
    → research → bridge).
  - `src/choreography/bikePath.ts` — bike position + pose (backflips, turn
    lean, crouch) as pure `f(t)`. Correct. Port the math.
  - `src/choreography/cameraRig.ts` — generic keyframe camera interpolation
    (addKey, sample, apply). Clean utility, framework-agnostic.
  - `src/content/resume.ts` — the authoritative résumé data. Current.
  - `src/assets/vehicles/bike.ts` — the Tron bike builder (procedural,
    IK-posed rider, 8 draw calls). Complex but functional. Decide whether
    to port this or rebuild in R3F.
  - `src/viewer/freecam.ts` — the fly-around inspection camera with
    PointerLock WASD + bloom/exposure sliders + FX toggles. Port to
    attempt 3 as a `?freecam` dev tool.
  - `src/core/core.ts` — WebGL renderer setup (EffectComposer, bloom pass,
    CA/vignette shader, quality tiers, auto-downgrade). The post-processing
    chain is sound; the TUNING was wrong.
  - The test suite structure (vitest, seeded determinism tests, canvas
    document-proxy stub for Node) — pattern is good.
- **Do NOT salvage from attempt 2:**
  - `src/world/cityLayout.ts` — building placement. The layout logic works
    but produced bad visual results. Re-do with art-directed placement.
  - `src/world/streets.ts` — road geometry. UV fix landed but the overall
    approach (imperative quad-strip sweep) is verbose. R3F has cleaner
    patterns.
  - `src/choreography/segments/ride.ts` — camera keys. These are the
    source of the "camera frames nothing" problem. Re-do from scratch with
    visual verification at each key.
  - `src/fx/sandevistan.ts` — ghost trail. Blows out under bloom.
    Reimagine the effect.
  - The `public/models/neocity/*.glb` files — textureless. Re-process
    with the texture pipeline.

---

## Assets on disk

### KitBash3D NeoCity (buildings) — the primary city kit

**Location:** `C:\Users\eliotli2\Downloads\Cyber Assets\Cyber_kitbash_neocity\`

**Contents (VERIFIED):**
- `kb3d_neocity-native.obj` (185MB) + `.mtl` — 47 named building pieces,
  62 PBR materials
- `kb3d_neocity.png.4k/` — **384 4K PBR texture PNGs** (basecolor,
  normal, roughness, metallic, AO, height). 3.8GB. ALL referenced textures
  present (0 missing).
- `kb3d_neocity-native.fbx` (90MB) — same geometry in FBX
- `kb3d_neocity.fbxobj.native/` — duplicate OBJ+FBX+MTL in a subfolder
  (its `KB3DTextures/4k/` is EMPTY — use the textures from
  `kb3d_neocity.png.4k/` above)

**CRITICAL:** The `.mtl` references textures at `KB3DTextures\4k\<name>.png`
(Windows path). The actual textures are at `kb3d_neocity.png.4k/<name>.png`
(different folder name). When running `obj2gltf`, either:
- Symlink/copy `kb3d_neocity.png.4k/` → `KB3DTextures/4k/` so the MTL
  paths resolve, OR
- Use the OBJ from `kb3d_neocity.fbxobj.native/` (its MTL also references
  `KB3DTextures\4k\`) and symlink the textures into its `KB3DTextures/4k/`
  subfolder (which exists but is empty)

**Piece naming:** `KB3D_NEC_<Group>_<Variant>_<Part>`:
- Large towers: `BldgLG_A` (Main/Base/BuildingA-D/Tree), `BldgLG_B`
  (Main/AntennaA), `BldgLG_C` (Main/Base/AntennaA-D)
- Medium buildings: `BldgMD_A/B/C` (Main/Base/Banners/AntennaA)
- Small buildings + street props: `BldgSM_A` (Main/ConcreteBarrier),
  `BldgSM_B` (Main/Bbq/Cart/Computers/FridgeA-B/Umbrella),
  `BldgSM_C` (Main/AC/Boxes/Containers/CratesA-B/Fan/NeonSignA-C/
  Pipes/Shelf/Stool)

**Biggest pieces (for perf budgeting, post-decimation):**
- BldgLG_C_Main: ~196k tris, bbox 35×143×34m
- BldgLG_B_Main: ~100k tris, bbox 55×201×45m
- BldgMD_C_Main: ~116k tris, bbox 49×58×23m

### Other downloaded asset packs

**Location:** `C:\Users\eliotli2\Downloads\Cyber Assets\`

| Pack | Contents | Has textures? | License | Notes |
|---|---|---|---|---|
| Cyber bikes (5) | .obj motorcycles | Rendered PNGs only | Check | Chopper/Cross/GunBike/Scooter/Tracer |
| Cyber hovercars (12) | .fbx+.dae vehicles | YES (emissive PNGs) | Check | coupe/sedan/truck/ambulance/police/taxi/van |
| Cyberpunk Game Kit (Quaternius, 71) | .gltf CC0 | Basic colors | CC0 | Characters/Enemies/Pickups/Platforms |
| Cyber Robots (9) | .obj voxel mechs | GIF frames | Check | Best blocky-mech reference |
| Cyber building (1) | .obj tall shell | Rendered PNG | Check | Tall/thin skyscraper |
| Cyber citygen (1) | .obj dense block | Diffuse JPGs | Check | Layout/massing reference (4.2M tris) |
| Cyber Restaurant (1) | .obj isometric | Rendered PNG | Check | Storefront reference |

**Reference images (from attempt 2):**
`C:\Users\eliotli2\Documents\VSCode\cybersite\references\cyber-assets\`
- `previews/` — rendered point-cloud previews of each pack
- `REFERENCES.md` — detailed inventory with channel legend (IMG/MESH/BLIND)
- `kitbash_parts.txt` — all 47 NeoCity piece names

### Résumé content

**Authoritative source:** `C:\Users\eliotli2\Documents\VSCode\cybersite\src\content\resume.ts`
- Still current (confirmed by Evan)
- Evan Li, CS+Econ @ UW, ML systems / on-device inference
- About (bio + face portrait + 2 misc images — all placeholder slots)
- 2 main projects: TTT-E2E, RememberMe
- 3 small projects: Mandarin App, Bellevue Hackathon, DubHacks
- 2 research: Mobile Intelligence Lab, LLM HW Benchmarking
- Education, Skills, Experience, Contact

---

## Attempt 3 — What to build

### Stack

**React Three Fiber on Vite** (not Next.js):
- `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`
- `three` 0.185+
- `gsap` + `ScrollTrigger` for scroll-scrubbed timeline
- Vite (fast HMR, no SSR baggage — this is a single-page canvas app)
- TypeScript strict
- Vitest for tests

Why R3F over raw Three.js: attempt 1 used R3F and produced a better result
with less code. The declarative component model makes scene composition
(placing buildings, toggling FX, iterating on layout) much faster. The
stunt choreography math (spline, bike path, camera rig) is framework-
agnostic and ports directly.

### Route (from attempt 2, approved by Evan)

```
ZONE            t-range     path
intro/cruise    0.00–0.12   straight, pure driving
about           0.12–0.28   straight boulevard, About content
buffer/turn     0.28–0.36   90° RIGHT at Shibuya crossing
projects-ramp1  0.36–0.46   ramp up, backflip 1 (2 big projects, slow-mo)
scaffold-ride   0.46–0.52   land on building scaffolding
projects-ramp2  0.52–0.62   ramp off scaffold, backflip 2 (3 small projects)
descend         0.62–0.68   ramp back down to road
research        0.68–0.84   straight ground strip, low cam looking UP
buffer/lift     0.84–0.89   road rises onto bridge
bridge/finale   0.89–1.00   bridge toward moon, camera pulls back
```

Buffer beats between every zone so transitions ease, never snap.

### Art direction

- **High-res cinematic** (drop the pixel-art look from attempt 1). The
  KitBash assets are film-grade meshes with 4K PBR textures — render them
  at full resolution.
- **Fidelity first** — it's a showpiece portfolio. Accept larger downloads
  (with a good loading screen). Downscale textures selectively (2K/1K for
  far-field, 4K for near-camera).
- **Dense neon metropolis** — buildings form continuous walls flanking the
  road. Far-field skyline silhouettes give depth without full render cost.
- Palette: deep void bg, neon accents (magenta/cyan/amber/teal). Cyan
  reserved for the bike/rider; city glows use the other neons.
- Bloom + vignette + chromatic aberration post-processing, but **TUNED**
  (attempt 2's biggest visual failure was uncontrolled bloom blowout).

### Content display

- **About:** one hero billboard (portrait + name + tagline) + supporting
  signs (bio + misc images). Solid neon billboards on building walls.
- **Projects:** holographic floating panels at each backflip apex. Time
  dilates (the apex spans a wide t-band, so scrolling barely advances the
  bike while signs sit readable). 2 big projects at flip 1, 3 small at
  flip 2.
- **Research:** large solid billboards HIGH on canyon-wall buildings. Low
  camera looking up → monumental feel.
- **Shibuya crossing:** iconic set-piece (scramble crosswalks, giant corner
  billboards, dense crowds).
- **Finale:** bike rides the bridge toward a huge detailed moon. Camera
  pulls back to a wide silhouette.

### DOM layer

- **Nav bar** at top (port from attempt 1)
- **Post-hero DOM sections** below the fold: About, Projects, Research,
  Contact — styled as terminal/arcade panels (port from attempt 1's
  section components, update styling)
- **Cursor trail** (RGB-split sandevistan effect, port from attempt 2's
  `src/fx/cursorTrail.ts` or attempt 1's `CursorTrail.tsx`)
- **NO scroll-synced caption chips** (Evan chose to omit these)

### Build order (STRICT — Evan's explicit requirement)

```
Phase 1: ASSETS — design each asset to look good in isolation
  1a. Set up the repo (Vite + R3F + deps)
  1b. Texture pipeline: re-run process-kitbash with real PBR textures
      embedded → textured .glb files
  1c. Load and display individual KitBash buildings in isolation (?viewer)
      — verify they look good with PBR materials, bloom, lighting
  1d. Port/rebuild the bike, vehicles, people, props
  1e. Each asset gets a viewer entry and visual sign-off before proceeding

Phase 2: CITY — assemble the city landscape
  2a. Lay out the route (port route.ts math)
  2b. Build the road along the route
  2c. Place buildings along the road (KitBash pieces)
  2d. Add the Shibuya crossing, scaffolding, ramps, bridge
  2e. Add far-field skyline + moon
  2f. Add traffic, crowds, metro
  2g. Visual sign-off on the static city (freecam inspection)

Phase 3: BIKE — add the rider
  3a. Place the bike on the route (port bikePath.ts)
  3b. Wire scroll → t (GSAP ScrollTrigger)
  3c. Add bike FX (sandevistan, light pools, drift — TUNED)

Phase 4: CAMERA — design the shots
  4a. Default chase cam
  4b. Per-zone camera keys, each visually verified via screenshot
  4c. Content display placement + camera framing together
  4d. Slow-mo apex framing for project reveals
  4e. Research low-up framing
  4f. Finale pull-back

Phase 5: POLISH
  5a. Post-processing tuning (bloom, exposure, CA, vignette)
  5b. DOM sections + nav
  5c. Mobile / reduced-motion
  5d. Performance audit
  5e. Deploy to evanly.me
```

Each phase is verified visually before the next begins. The freecam tool
(`?freecam`) should be available from Phase 1 onward.

### Deploy target

- **New repo** (e.g. `evanly-site`), fresh, cherry-pick only what's needed
- Deploy to the **evanly.me** Vercel project/domain
- Archive/delete the old `cybersite` and `personal-site` Vercel projects

---

## Offline mesh pipeline (process-kitbash)

The pipeline script exists at `C:\Users\eliotli2\Documents\VSCode\cybersite\tools\process-kitbash.mjs`. It converts the monolithic OBJ → per-piece DRACO `.glb` files. For attempt 3 it MUST be re-run with textures:

**Before running:**
1. The `.mtl` expects textures at `KB3DTextures\4k\<name>.png`. The actual
   textures are at `kb3d_neocity.png.4k\<name>.png` (different folder).
   Fix by copying or symlinking:
   ```
   cd "C:\Users\eliotli2\Downloads\Cyber Assets\Cyber_kitbash_neocity"
   mklink /D "KB3DTextures\4k" "kb3d_neocity.png.4k"
   ```
   Or copy the files into `KB3DTextures\4k\`.
2. The script uses `obj2gltf` which reads the `.mtl` and resolves texture
   paths relative to the OBJ file. With the symlink in place, it will find
   the PNGs and embed them into the `.glb`.

**Pipeline modifications needed for textured output:**
- Currently the pipeline strips textures (runs with `--unlit`). Remove
  `--unlit` so PBR materials + textures are preserved.
- Consider `--separate` flag to keep textures as external files (reduces
  per-piece `.glb` size, allows shared textures across pieces). OR embed
  them and accept larger files (simpler, fewer 404 risks).
- Add texture compression in the gltf-transform step: `textureCompress`
  with KTX2/Basis for web delivery (dramatically smaller than raw PNG).
- Adjust simplify ratio per piece: near-camera hero buildings keep more
  geometry (ratio 0.5–0.7), far-field fillers decimate harder (0.2–0.3).

**Deps:** `npm install --save-dev obj2gltf @gltf-transform/cli @gltf-transform/core @gltf-transform/functions meshoptimizer`

---

## Key lessons from attempts 1 + 2

1. **Art-direct first, engineer second.** Attempt 2 built a perfect scroll
   pipeline with 267 tests and produced ugly output because nobody looked
   at what it rendered until the end. Each asset and each camera angle
   must be visually approved before moving on.

2. **Textures are everything.** The single biggest difference between
   "wow" and "dull clay" is surface detail (basecolor + normal +
   roughness maps). Geometry without textures looks bad no matter how
   detailed the mesh.

3. **Bloom must be tuned WITH the assets, not after.** Attempt 2 set bloom
   to 0.9 and exposure to 1.1 at init and never adjusted. Emissive
   materials + bloom interact nonlinearly — tune them TOGETHER, per-scene,
   with the actual assets present.

4. **The R3F component model is faster to iterate.** Attempt 1's
   `<ShopHouse seed={42} position={[x,0,z]} w={8} d={6} />` is easier to
   place, rearrange, and debug than attempt 2's imperative `const g = buildShopHouse(rng); g.position.set(x,0,z); scene.add(g);`. For a
   one-person project where iteration speed matters, declarative wins.

5. **The stunt choreography math is correct.** The route spline, bike
   path (backflips, lean, crouch), and camera rig from attempt 2 are
   tested and work. Don't rewrite them — port the pure math, wrap it in
   R3F hooks.

6. **The freecam inspector is essential.** Being able to fly around the
   city at any point during development catches problems that screenshots
   at fixed t-values miss.

7. **Road clearance is a regression magnet.** Attempt 2 had buildings
   intruding the road THREE separate times (initial layout, yaw rotation
   bug, review finding). Enforce a minimum road-clearance clamp from the
   start and test it.

---

## Vercel cleanup

Evan has 4 Vercel projects (evanly.me, cybersite-dyo5, cybersite,
personal-site). These are likely:
- `evanly.me` — the live domain, keep this, point it at the new repo
- `cybersite` + `cybersite-dyo5` — two imports of the same repo (Vercel
  auto-suffixed the duplicate). Delete both after attempt 3 is deployed.
- `personal-site` — attempt 1. Archive/delete.

---

## Palette reference (from both attempts)

**Attempt 1 (content.ts / common.ts):**
```
void:     #0A0B1E
panel:    #141838
magenta:  #FF3DA6
cyan:     #2BFDF9  (bike-reserved)
amber:    #FFC857
violet:   #8A6CFF
lime:     #9DFF57
red:      #FF4D5E
blue:     #4D8CFF
white:    #EEF2FF
```

**Attempt 2 (theme.ts):**
```
void:         0x07080f
shadowBlue:   0x101426
tronCyan:     0x00f0ff  (bike-reserved)
signalMagenta: 0xff2bd6
sodiumAmber:  0xffb347
holoTeal:     0xb7f5e9
moonlight:    0xf5f0e6
skyHorizon:   0x0b0e1e
towerBody:    0x0a0c16
nightHaze:    0x2a1e55
```

Pick one or merge for attempt 3. Both share the core idea: deep dark
background, neon accents, cyan reserved for the bike.

---

## Files the new session should read first

1. **This document** (HANDOFF.md)
2. **Attempt 1's DECISIONS.md:** `C:\Users\eliotli2\Documents\VSCode\personal_site\DECISIONS.md` (on `city-rebuild` branch) — visual direction, lighting rationale, degradation strategy
3. **Attempt 2's design spec:** `C:\Users\eliotli2\Documents\VSCode\cybersite\docs\superpowers\specs\2026-07-15-city-rebuild-design.md` — the route, content mapping, stunt geometry (all still valid)
4. **Attempt 2's résumé data:** `C:\Users\eliotli2\Documents\VSCode\cybersite\src\content\resume.ts`
5. **Asset reference:** `C:\Users\eliotli2\Documents\VSCode\cybersite\references\cyber-assets\REFERENCES.md`
