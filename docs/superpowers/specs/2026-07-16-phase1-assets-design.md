# Phase 1 — Assets (Attempt 3)

> Design doc for Phase 1 of Evan Li's scroll-driven cyberpunk portfolio.
> Scope is **assets only**: stand up the repo, rewrite the KitBash texture
> pipeline to preserve PBR, and build a `?viewer` inspector where every asset
> is visually signed off before any city/route/camera work begins.
>
> This is the deliberate "art-direct first" phase. Attempt 2 failed because it
> built the whole route/camera pipeline grey-box first and bolted textureless
> assets on at the end. Phase 1 inverts that: **nothing proceeds to Phase 2
> until the individual assets look good in isolation.**
>
> Parent context: `HANDOFF.md` (root). Later phases (City, Bike-on-route,
> Camera, Polish) get their own specs.

---

## Goals

1. A fresh Vite + React Three Fiber repo that builds and runs.
2. A rewritten offline mesh pipeline that produces **textured** per-piece
   `.glb` files from the KitBash NeoCity OBJ (the single biggest fix vs
   attempt 2 — its meshes had no PBR maps).
3. A `?viewer` asset inspector: load any asset centered, framed, well-lit,
   with a stats overlay, and step through the manifest.
4. The hero bike ported from attempt 2 (`cybersite/src/assets/vehicles/bike.ts`),
   plus hovercars and CC0 characters loaded as viewer entries.
5. A visual sign-off gate: Evan reviews assets in `?viewer` before Phase 2.

## Non-goals (explicitly deferred)

- Route spline, road geometry, city layout (Phase 2).
- Scroll wiring, bike-on-route choreography (Phase 3).
- Camera keys, content-display placement (Phase 4).
- DOM sections, nav, mobile/reduced-motion, deploy (Phase 5).
- The `?freecam` fly-around tool is ported in Phase 2 (when there's a city to
  fly through); `?viewer` OrbitControls is sufficient for single-asset review.

---

## Stack

Matches attempt 1's known-good versions (that attempt produced the best
visual result), on Vite instead of Next.js (single-page canvas app, no SSR).

- `vite` + `@vitejs/plugin-react`
- `typescript` (strict)
- `three` ^0.185
- `@react-three/fiber` ^9
- `@react-three/drei` ^10
- `@react-three/postprocessing` ^3
- `gsap` ^3 (present now for palette/theme consistency; scroll wiring is Phase 3)
- `vitest` for unit tests
- Dev deps for the pipeline: `obj2gltf`, `@gltf-transform/core`,
  `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`,
  `meshoptimizer`

---

## Repo layout

```
evanly.me/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  HANDOFF.md
  docs/superpowers/specs/...
  tools/
    process-kitbash.mjs      # rewritten pipeline (textured)
  public/
    models/
      neocity/               # generated .glb + manifest.json (gitignored if large)
  src/
    main.tsx                 # entry; route switch on query param
    theme.ts                 # palette (attempt 1) + lighting/bloom constants
    App.tsx                  # default scene shell (empty for now)
    viewer/
      Viewer.tsx             # ?viewer inspector (R3F canvas + controls + HUD)
      manifest.ts            # typed loader for public/models/neocity/manifest.json
      assets.ts              # registry: kitbash pieces + bike + vehicles + chars
    assets/
      bike.ts                # ported from cybersite (returns THREE.Group)
      rng.ts                 # ported mulberry32 RNG (bike dependency)
    content/
      resume.ts              # ported verbatim from cybersite (authoritative)
  test/
    pipeline.test.ts         # manifest shape / bbox determinism
    theme.test.ts            # palette invariants
```

`main.tsx` reads `location.search`: `?viewer` → `<Viewer/>`, else `<App/>`.

---

## theme.ts (attempt 1 palette)

Ported verbatim from `personal_site/src/components/three/common.ts`:

```
void:     #0A0B1E   (background)
panel:    #141838
magenta:  #FF3DA6
cyan:     #2BFDF9   (RESERVED for bike/rider — no city asset glows cyan)
amber:    #FFC857
violet:   #8A6CFF
lime:     #9DFF57
red:      #FF4D5E
blue:     #4D8CFF
white:    #EEF2FF
```

Plus Phase-1 lighting/bloom constants (starting values, tuned live in viewer):
`ambientIntensity`, `keyIntensity`, `bloomIntensity`, `bloomThreshold`,
`bloomRadius`, `exposure`. These are tuned *with the assets present* (attempt 2's
lesson: bloom set once at init and never adjusted → blowout).

NOTE: the ported `bike.ts` imports `COLORS` from cybersite's `theme.ts`
(tokens `tronCyan`, `signalMagenta`, `moonlight`). To avoid rewriting the bike,
`theme.ts` also exports a small `COLORS` compatibility object mapping those
three tokens onto the attempt-1 palette (`tronCyan → cyan`, `signalMagenta →
magenta`, `moonlight → white`). Cyan stays bike-reserved, so this is consistent.

---

## Texture pipeline rewrite (`tools/process-kitbash.mjs`)

The existing cybersite script is **incompatible with textured output** by
design: it bakes `baseColorFactor` into vertex `COLOR_0` and merges every
piece down to 2 flat materials (`NEO_BODY`, `NEO_EMISSIVE`). It also runs
`obj2gltf` with `unlit: true`, discarding PBR. All of that is removed.

### Source-path fix (do first, once)

The `.mtl` references textures at `KB3DTextures\4k\<name>.png`; the actual PNGs
are at `kb3d_neocity.png.4k\<name>.png`. Before conversion, populate
`KB3DTextures/4k/`:

```
cd "C:/Users/eliotli2/Downloads/Cyber Assets/Cyber_kitbash_neocity"
# Windows symlink needs admin; if it fails, copy instead.
mklink /D "KB3DTextures\4k" "kb3d_neocity.png.4k"
```

The script checks whether `KB3DTextures/4k/` resolves textures and errors early
with a clear message if not (rather than silently emitting grey meshes — the
exact attempt-2 failure).

### New pipeline steps

1. `obj2gltf(srcObj, { binary: true })` — **no `unlit`**, PBR preserved,
   textures resolved via the MTL. (~25s, large in-memory GLB.)
2. Load into gltf-transform.
3. For each of the 47 named scene children:
   a. Clone doc, dispose all other children.
   b. Compute bbox from original geometry.
   c. **Keep the original named materials and their texture maps** — no
      vertex-color bake, no material merge. (Draw-call count per piece is now
      "number of distinct materials", which is fine; these are inspected
      individually in Phase 1, and instancing/atlas concerns belong to Phase 2.)
   d. Geometry optimize: `prune → weld → simplify → dedup`.
      - `simplify` ratio is **per-piece by category**: large hero towers
        (`BldgLG_*`) ratio 0.6, medium 0.45, small buildings + props 0.3.
      - Category derived from the piece-name prefix (`BldgLG`/`BldgMD`/
        `BldgSM`, else `prop`).
   e. **Texture handling — two-step (Evan's call):**
      - **Step 1 (verify):** embed PNG as-is. Files are large; local-only.
        Purpose: confirm PBR quality in the viewer before optimizing.
      - **Step 2 (deliver):** re-run with `textureCompress` (KTX2/Basis) once
        quality is signed off. Optionally `--separate` externally-referenced
        textures so far-field pieces can share maps.
      - A `--ktx2` CLI flag selects step 2; default is step 1 (embedded PNG).
   f. `draco()` geometry compression, then write `<PieceName>.glb`.
4. Write `manifest.json`: `{ name, file, bbox, hasEmissive, tris, category }[]`.

### Scoped run (Evan's call: hero pieces first)

A `--only <substr,substr>` CLI flag processes just matching pieces. Phase 1c
runs ~5–6 representative pieces end-to-end first:
`BldgLG_C_Main` (biggest tower), a `BldgMD_*_Main`, a `BldgSM_A_Main`, and a
couple of `BldgSM_*` props. Verify PBR in the viewer, then drop `--only` for
the full 47.

### Idempotence / determinism

- Pure function of (OBJ bytes, flags). No `Date.now()`/random in the manifest.
- `manifest.json` entries sorted by name for stable diffs.
- The test suite loads a checked-in **fixture manifest** (a small hand-authored
  sample) and asserts shape + bbox-field types + sorted order — it does NOT
  require the 3.8GB textures or a pipeline run in CI.

---

## `?viewer` inspector (`src/viewer/Viewer.tsx`)

An R3F canvas dedicated to single-asset review.

- **Scene:** void background (`#0A0B1E`), a subtle ground plane/grid, drei
  `<Environment>` for PBR reflections, plus explicit key/fill/rim lights.
- **Post:** `@react-three/postprocessing` `<Bloom>` + tone mapping, driven by
  the `theme.ts` constants. A small dat-GUI-style HUD (plain DOM, ported style
  from cybersite `freecam.ts` HUD) exposes **live sliders** for bloom
  intensity/threshold/radius and exposure — so tuning happens against real
  assets, per the handoff lesson.
- **Controls:** drei `<OrbitControls>` (orbit/zoom/pan around the centered
  asset).
- **Asset selector:** prev/next through the asset registry; each entry framed
  to its bbox (camera dolly computed from bounding sphere). URL reflects
  selection (`?viewer&asset=<name>`) so a given asset is shareable/repeatable.
- **Stats overlay:** asset name, dimensions (from bbox), triangle count, draw
  calls (via `gl.info.render.calls` after a frame), hasEmissive.

### Asset registry (`src/viewer/assets.ts`)

Three kinds of entries behind one interface `{ id, label, kind, load() }`:

- **kitbash** — GLB pieces from `manifest.json`, loaded with drei `useGLTF`
  (DRACO-enabled). Emissive materials get an `emissiveIntensity` so neon reads
  under bloom (tuned in viewer, not guessed).
- **bike** — `buildBike(rng)` from the ported `bike.ts`, wrapped in
  `<primitive object={group} />`. A `pose()` control (crouch/lean/pitch/
  wheelSpin sliders) exercises the rig so the IK is verified visually.
- **vehicle / character** — hovercars (`.fbx`/`.dae`, have emissive textures)
  and Quaternius CC0 characters (`.gltf`), loaded with the appropriate drei
  loader. These validate the non-KitBash asset paths early.

The 5 `.obj` motorcycles are **reference-only** in Phase 1 (Evan chose the
cybersite procedural bike as the hero). Not wired into the registry.

---

## Ported files (verbatim or near-verbatim)

- `src/content/resume.ts` ← `cybersite/src/content/resume.ts` (authoritative,
  confirmed current).
- `src/assets/bike.ts` ← `cybersite/src/assets/vehicles/bike.ts`. Returns a
  `THREE.Group` with `pose()` and `ghostGeometry` — R3F-compatible via
  `<primitive>`. Its `COLORS`/`Rng` imports are repointed at `src/theme.ts`
  and `src/assets/rng.ts`.
- `src/assets/rng.ts` ← cybersite `src/utils/rng.ts` (bike dependency).

---

## Testing

- `test/pipeline.test.ts` — against a checked-in fixture manifest: asserts
  each entry has `{name:string, file:string, bbox:[n,n,n], hasEmissive:bool,
  tris:number, category:string}`, entries sorted by name, bbox non-negative.
  Does **not** run the heavy pipeline in CI.
- `test/theme.test.ts` — palette hex validity; `COLORS.tronCyan === cyan`
  (bike-reserved invariant); required lighting constants present and in range.
- **Visual quality is gated by Evan in `?viewer`, not by automated tests.**
  This is the explicit corrective to attempt 2 (267 passing tests, 0 visual
  quality gates that caught the real problems).

---

## Sign-off gate (end of Phase 1)

Phase 2 does not start until:
1. Pipeline emits textured `.glb` for the hero pieces; PBR verified in viewer.
2. Bloom/exposure baseline tuned in the viewer HUD and captured in `theme.ts`.
3. Bike renders and poses correctly (IK hands on grips, feet on pegs).
4. At least one hovercar and one character load and look acceptable.
5. Evan signs off on the assets in `?viewer`.
6. Full 47-piece pipeline run completes (after hero-piece sign-off), manifest
   committed.

---

## Open items carried to later phases

- KTX2 vs embedded final decision (step 2) — resolved during 1b/1c once file
  sizes and quality are seen.
- Instancing / texture-atlas strategy for placing many buildings (Phase 2 perf).
- Whether any `.obj` reference bikes get promoted (unlikely; hero bike chosen).
