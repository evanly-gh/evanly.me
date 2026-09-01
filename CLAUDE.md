# evanly.me — agent notes

Scroll-driven cyberpunk 3D portfolio. React 19 + React Three Fiber, a
deterministic procedural city, a scripted bike ride through it, and a
scroll-position-driven camera timeline. No test suite currently exists (see
"Testing" below).

## Stack

- React 19, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, three.js, GSAP ScrollTrigger
- Vite + TypeScript. `npm run dev`, `npm run build` (`tsc && vite build`), `npm run preview`
- Asset pipeline scripts: `npm run assets:kitbash|props|moon|portrait|manifest` (see `tools/`)

## Architecture, by directory

- `src/world/` — pure data/layout generation, no rendering. `cityLayout.ts` builds a
  deterministic seeded city (`buildCityLayout(seed)` → flat `Placement[]`) from
  sub-layouts (`buildingCatalog.ts`, `roads.ts`, `bridgeLayout.ts`, `intersections.ts`,
  `crowdLayout.ts`, `streetDressing.ts`, `signLayout.ts`, `researchLayout.ts`,
  `stuntLayout.ts`, `shoreline.ts`). `route.ts` defines the bike's spline path and
  `sampleRoute(t)` (t is 0–1 story progress, remapped internally between semantic
  and arc-length parameterization). `researchCamera.ts` / `stuntCamera.ts` /
  `aboutReveal.ts` hold section-specific camera/content geometry. `finaleRender.ts`
  holds the moon's render config.
- `src/choreography/` — the scroll-to-scene mapping. `cameraRig.ts` defines `CamKey`
  (`{ t, position, target, fov, mode }`, modes `smooth | hold | cut | dolly`) and the
  `CameraRig` class that interpolates between keys — **keys must have strictly
  increasing `t`, or the constructor throws**. `productionCameraRig.ts` is the master
  camera timeline (`PRODUCTION_CAMERA_KEYS`), organized by section (intro / about /
  shibuya / projects / descend / research / lift / bridge / finale). `progressDirector.ts`
  drives bike + camera + content + fx from scroll progress. `bikePath.ts` /
  `bikeContact.ts` / `bikeTrail.ts` handle bike motion/contact/trail.
- `src/components/three/` — the R3F render tree. `City.tsx` is the main scene
  (instances every `Placement`, renders the moon, sky, etc). `ProductionDirector.tsx`
  wires `progressDirector` output into the scene each frame. `BikeRider.tsx` /
  `BikeTrails.tsx` render the bike. `aboutRender.ts` / `researchRender.ts` /
  `stuntRender.ts` render section-specific content (About poster, research
  billboards, stunt/project panels).
- `src/scroll/` — `ScrollExperience.tsx` + `scrollRuntime.ts` own the actual scroll
  listener and progress state, plus dev-mode URL param handling (see below).
  `NativePortfolio.tsx` is the non-3D fallback/base layout. `webglSupport.ts` gates
  WebGL vs fallback.
- `src/content/` — copy/text content (`resume.ts`, `aboutArt.ts`).

## Verification / scouting harness (no automated tests — use this instead)

- `http://localhost:5174/?shot=<t>&inspect` — pins the production camera at
  semantic-t `t` (0–1) for screenshotting a specific story beat.
- `http://localhost:5174/?city&inspect` — inspects the raw city layout, OrbitControls
  enabled.
- `http://localhost:5174/?freecam` — WASD/Q/E/Shift/Esc fly camera (dev builds only).
- Under `?city&inspect`, `window.__EVANLY_SCOUT__.view(px,py,pz,tx,ty,tz,fov)` is a
  dev-only helper (added in `SceneInspectionPresets()` in `City.tsx`, gated by
  `INSPECT_ENABLED`) for parking an arbitrary scouting camera. **This is scaffolding
  and should be removed before considering the scene "ship-ready."**

Use Playwright (or manual browser) + these URL params to visually confirm any
camera/geometry change — this is the primary verification method right now.

## Working conventions

- Camera edits: add keys to the relevant array in `productionCameraRig.ts`, keeping
  `t` strictly increasing. Use the `trackKey()` helper (samples `sampleRoute(t)` for
  the target while position stays fixed) for "locked camera tracks moving subject"
  shots — used for the Shibuya and descend sections.
- Geometry edits (buildings, roads): trace back through `src/world/cityLayout.ts` to
  find which sub-layout owns the placement, edit there, then re-check visually via
  `?city&inspect` or `?shot=<t>&inspect` at the relevant t.
- No commits/pushes were made until this handoff — `git log` on `phase1-assets` now
  reflects everything through the camera/geometry pass + repo cleanup described above.