# Hanging monorail asset — design

**Date:** 2026-08-09
**Status:** approved (build autonomously, gallery-first)

## Problem

The city's suspended monorail train is currently `MONORAIL_CAR_COUNT = 3` plain
`BoxGeometry` cars, each hung from the box-beam guideway by one thin strut
([`MonorailTrain` in City.tsx:796](../../../src/components/three/City.tsx)). It reads as
"a few blue boxes." We want a proper Japanese-style suspended monorail
(Shonan / Chiba / Wuppertal references) with at least **5 cars**, rebuilt to fit the
cyberpunk-neon city, and inspectable in the `?gallery` asset browser first — the live
city monorail stays untouched until the look is approved.

## Decisions

- **Style:** cyberpunk neon. Dark metallic body, emissive window strips + neon accent
  stripe, tuned to the existing palette.
- **Scope:** rebuild the **cars** and the **bogie/hanger** that connects each car to the
  beam. The existing box-beam guideway geometry is out of scope (a short *display* beam
  segment is added only so the gallery train has something to hang from).
- **Integration:** gallery only. No change to `MonorailTrain`/`Roads`/`Pillars` in
  `City.tsx` this pass. The kit is written to be reusable so a later "swap into the city"
  pass just consumes the same builder.
- **Palette** (respecting `theme.ts` — *cyan is reserved for the bike/rider*, and the
  guideway's own glow is violet):
  - Body: dark metallic (`0x181a24`, metalness ~0.6, roughness ~0.4).
  - Window band: warm white (`PALETTE.white`), emissive, `toneMapped:false`.
  - Accent stripe: `PALETTE.magenta`, emissive, `toneMapped:false`.
  - Hanger/bogie accents: `PALETTE.violet` (ties to the guideway `monorailGlow`).
  - Nose cabs: white headlights (front car) / red taillights (`PALETTE.red`, rear car);
    dark tinted windshield glass.
  - Display beam: `0x12131c` body with a violet fascia glow line (mirrors `Roads`).

## Architecture

Three units, each with one clear job:

### 1. `src/components/three/monorailKit.ts` (pure resource builder)

Mirrors [`signKit.ts`](../../../src/components/three/signKit.ts): no rendering, just
dimensions + a `createMonorailResources({ own })` factory returning
`CommittedThreeAllocation<MonorailKitResources>` (geometries + materials, all registered
via `own` for disposal), consumed by `useCommittedThreeResource`.

- **Dimensions/constants** (exported): car length ~8, width ~3, height ~2.2, corner
  radius ~0.55, car gap ~1.2, `MONORAIL_SHOWCASE_CAR_COUNT = 5`, nose cab length ~1.8,
  bogie neck drop, bogie housing size.
- **Geometries:**
  - `midBody` — rounded-rectangle cross-section (width × height, filleted corners)
    extruded along the car length; small end bevel so caps aren't razor-sharp.
  - `noseBody` — mid body shortened, plus a raked **cab**: front section tapered
    down/in with a slanted windshield face.
  - `windowBand` — thin emissive strip run along each side (a long box), plus thin dark
    **mullion** boxes dividing it into windows (instanced/repeated).
  - `windshield` — a slanted dark-glass quad for the nose cab front.
  - `stripe` — thin emissive box along the body waistline.
  - `doorInset` — shallow darker recessed panel between window groups.
  - `bogieNeck` — tapered box rising from the roof.
  - `bogieHousing` — block that tucks under the beam.
  - `bogieWheel` — small cylinder disc (running wheels), repeated.
  - `headlight` / `taillight` — small emissive discs for the cab.
  - `displayBeam` — a straight box-beam segment (gallery mount only).
- **Materials:** `bodyMat`, `windowMat` (emissive white), `stripeMat` (emissive
  magenta), `glassMat` (dark, low-emissive), `hangerMat` (dark metal), `accentMat`
  (emissive violet), `headlightMat` (emissive white), `taillightMat` (emissive red),
  `beamMat` + `beamGlowMat`.
- **Layout helper:** `carVariant(index, count)` → `'nose-front' | 'nose-rear' | 'mid'`.

### 2. `src/components/three/MonorailShowcase.tsx` (gallery component)

Mirrors [`BillboardCatalog.tsx`](../../../src/components/three/BillboardCatalog.tsx).
Props: `{ zStart: number }`. Allocates the kit once via
`useCommittedThreeResource('monorail-showcase', createMonorailResources, [])`, then:

- Computes a 5-car train laid end-to-end along X (car length + gap), centered.
- Renders a horizontal **display beam** above the train; each car hangs from it by its
  **bogie** (neck + housing + wheels) so the "suspended from inside the beam" read is
  clear. Cars: 2 nose (front + rear, taillights on rear) + 3 mid.
- Each car assembled from kit geometries: body, window band + mullions, stripe, doors,
  and (nose only) windshield + head/taillights.
- A lit `Platform` disc under the train, a `RowHeader` ("Monorail — suspended train"),
  and a `Label` (car count, length, tris estimate). Exposes `__MONORAIL_ROW__` on
  `window` for scripted camera framing, matching `__BILLBOARD_ROWS__`.

### 3. `src/components/three/BuildingGallery.tsx` (wiring)

- Reserve a `MONORAIL_ZONE` depth behind the billboard zone; extend `sceneDepth` so
  ground + fog still cover it.
- Render `<MonorailShowcase zStart={totalDepth + BILLBOARD_ZONE_CONSUMED} />` after
  `<BillboardCatalog>` as the last row.

## Data flow

`createMonorailResources` (pure, in `monorailKit.ts`) → `useCommittedThreeResource` in
`MonorailShowcase` (allocates once, disposes on unmount) → assembled into meshes hung
from the display beam → placed by `BuildingGallery` as the final gallery row. No coupling
to the live city scene.

## Testing / verification

No automated suite (per CLAUDE.md). Verify by:
1. `npm run build` (`tsc && vite build`) is clean — no type/resource-lifecycle errors.
2. `http://localhost:5173/?gallery` — fly to the back row (`__MONORAIL_ROW__.z`), confirm:
   a 5-car suspended train, rounded neon bodies, lit window rows, magenta stripe, nose
   cabs with windshields + head/taillights, each car hung by a visible bogie from the
   display beam, no z-fighting or floating gaps.
3. Screenshot via Playwright for a final visual check.

## Out of scope (future pass)

- Swapping the new car/bogie into the live city `MonorailTrain` (currently plain boxes on
  a moving path). The kit is built to make this a small follow-up.
- Rebuilding the actual city guideway beam.
