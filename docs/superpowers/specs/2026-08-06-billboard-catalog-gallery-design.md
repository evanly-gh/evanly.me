# Billboard catalog in the asset gallery — design

**Date:** 2026-08-06
**Branch:** feat/gallery-all-assets

## Goal

Add every billboard used in the shipping city to the `?gallery` asset browser as
its own set of rows, so the billboards can be designed/iterated against a faithful
side-by-side catalog. Each billboard is shown **exactly as it appears in the city**
(real geometry, materials, textures) but **isolated** — just the billboard plus its
own mounting hardware, with the host building and surrounding scene removed.

## Decisions (from brainstorming)

- **Fidelity:** real geometry + real materials + real textures, isolated from the host building.
- **Generic repeated signs:** one representative per texture variant (8 facade + 4 hologram).
- **Boundary:** billboard + its own hardware (backing plate, rails, brackets, hologram
  emitter disc + beam). Exclude the host building and scene dressing (about plaza
  plinth/poles/lamps, research gateway frame).
- **Location:** new rows appended to the existing `?gallery` page.
- **Grouping:** one row per subsystem (6 rows).
- **Code approach (A):** extract the texture/material/geometry factories that are
  currently inlined in `City.tsx` into shared per-subsystem "kit" modules; `City.tsx`
  and the gallery both consume them. Single source of truth; city verified unchanged.

## Rows (6)

1. **Facade signs** — 8 units, one per texture variant. Hardware: backing plate + 2 rails + 2 brackets.
2. **Holograms** — 4 units, one per texture variant. Hardware: emitter disc + beam (no backing).
3. **About hero** — 1 unit. Screen + backing + rails/brackets/braces. Portrait loaded via `useTexture` (Suspense).
4. **Shibuya facade panel** — 1 representative unit (procedural; single texture/material, bare lit plane).
5. **Project panels** — 5 units (the curated `STUNT_PROJECT_PANELS`). Screen + backing + attachments.
6. **Research panels** — 8 units (all `RESEARCH_PANELS`). Screen + backing + 4 corner mounts. Gateway frame excluded (host structure).

## Architecture

### Shared kit modules (Approach A)

For each subsystem, create a module exporting the pieces currently inlined in
`City.tsx`, with no behavior change:

- `signKit.ts` — `makeSignTexture()`, `createSignResources({ own })`.
- `aboutKit.ts` — `makeAboutHeroResources({ own }, portrait, portraitSrc)`.
- `shibuyaKit.ts` — `makeShibuyaFacadeTexture()`, `createShibuyaPanelResources({ own })`.
- `stuntKit.ts` — `createProjectPanelResources({ own })`.
- `researchKit.ts` — `createResearchResources({ own })`.

Each `create*Resources` returns the exact `{ value, resources }` object the City
component builds today. `City.tsx` components call the kit factory inside their
existing `useCommittedThreeResource(...)` instead of building resources inline.
The pure builders (`buildSignRenderBatches`, `buildAboutHeroRenderAssembly`,
`buildStuntPanelRenderAssembly`, `buildResearchRenderAssembly`, `buildShibuyaFacadePanels`)
and render-config constants are already shared and unchanged.

### Catalog rendering

New module `BillboardCatalog.tsx` rendered inside `BuildingGallery`'s Canvas,
stacked on Z after the GLB pack rows.

- **Unit assembly:** for each billboard, obtain its world-space matrices from the
  real builder/assembly functions (fabrication avoided — generic signs pull the first
  real placement of each texture bucket from `buildSignLayout()`), keeping only the
  screen + its own hardware.
- **Re-basing:** compute `G = slot ∘ frame⁻¹` where `frame` is the screen's world
  position+rotation (scale dropped). Wrap each unit's meshes (with their absolute
  matrices, `matrixAutoUpdate={false}`) in a `<group matrix={G}>`, so the screen lands
  at the row slot facing +Z at true scale. Ground each unit by its combined bounding box.
- **Layout:** reuse the row/z-cursor + `Platform` + `Label` + `RowHeader` pattern from
  `BuildingGallery`; one row per subsystem, units packed left→right by real footprint,
  labelled with subsystem + variant/id + size.
- **Lighting:** add `<Environment preset="night" />` to the gallery Canvas so the
  metallic hardware (backings/rails/brackets) reads correctly; screens are unlit
  (`MeshBasic`, `toneMapped:false`) and already correct under the existing bloom.

## Verification

- `?gallery` renders all 6 billboard rows; each billboard reads as it does in the city.
- `?shot=<t>&inspect` at about/shibuya/projects/research beats confirms the city scene
  is visually unchanged after the kit extraction.
- `npm run build` (tsc + vite) passes.

## Out of scope

- Changing any billboard's visual design (this is the surface to do that next).
- Host buildings, plaza dressing, research gateway frame in the catalog.
- The separate `NORMALIZE` size-banding used for GLB packs (billboards show at true scale).
