# Gallery: all Cyber Assets + procedural height variants

**Date:** 2026-08-03
**Status:** Proposed
**Scope:** The dev-only `?gallery` page and the offline asset pipeline that feeds it.

## Goal

Extend `?gallery` so it displays **every usable asset pack** from
`C:\Users\eliotli2\Downloads\Cyber Assets`, not just the neocity kit. Each pack
renders as its **own row** (neocity, bikes, robots, …), fully textured, at each
piece's **original geometry size**, labeled exactly like the current neocity
row. Assets within a row are **ordered by size**. Additionally, generate **5 new
building height variants** by clipping tall neocity towers to heights not already
present in the set, shown in their own row.

This is dev scaffolding (isolated `<BuildingGallery>` Canvas, routed via
`?gallery` in `main.tsx`), not part of the shipping `<City>` scene.

## Source inventory

| Pack (row)        | Source folder                         | Format → tooling            | Count |
|-------------------|---------------------------------------|-----------------------------|-------|
| neocity           | (already converted) `public/models/neocity` | existing GLB          | 47    |
| Height Variants   | derived from neocity towers           | offline geometry clip       | 5     |
| bikes             | `Cyber bikes`                         | OBJ → obj2gltf              | 5     |
| robots            | `Cyber Robots`                        | OBJ → obj2gltf              | 9     |
| hovercars         | `Cyber hovercars`                     | OBJ → obj2gltf              | 12    |
| structures        | `Cyber building` + `Cyber citygen` + `Cyber Resteraunt` | OBJ → obj2gltf | 3     |
| monogon           | `Cyber monogon stuff`                 | FBX → fbx2gltf              | 17    |
| quaternius        | Quaternius game kit                   | glTF passthrough            | ~71   |

**Excluded (no readable mesh format):** `Cyber Signs Jonni` (`.c4d` only),
`Cyber dude` (`.blend` only). The gallery HUD lists these as "excluded: no
web-loadable mesh" so it's clear they were considered, not forgotten. If
`fbx2gltf` cannot be installed, the **monogon** row is likewise skipped with a
HUD note rather than failing the whole build.

## Architecture

Two independent pieces, matching existing conventions:

### 1. Offline pipeline (Node, `tools/`)

**`tools/process-gallery.mjs`** — one script, driven by a `PACKS` table. For each
pack it converts every source mesh to an optimized GLB and writes
`public/models/<pack>/<name>.glb` plus `public/models/<pack>/manifest.json`.

- Reuse the existing conversion stack: `obj2gltf` for OBJ, direct read for glTF,
  and `fbx2gltf` (new devDependency, bundles the FBX2glTF binary) for FBX.
- Reuse the existing `gltf-transform` optimize chain: `prune → weld → dedup →
  textureCompress(webp, q85) → draco`. Preserve emissive materials (same
  `EMISSIVE_PATTERNS` hint as `process-kitbash.mjs`). **No geometry rescale** —
  original dimensions preserved.
- Texture resolution per pack: structures/monogon buildings `1024`, vehicles/
  robots `1024`, small props `512` (tunable via `--res=`).
- **Relaxed budgets:** the strict props delivery budget (200 KB/file) does not
  apply — this is a dev gallery. The script logs per-file KB and a total, but
  does not hard-fail on size.
- Manifest entry shape matches neocity: `{ name, file, bbox, tris, hasEmissive,
  category }`, where `category` = pack key (drives label color).
- Graceful degradation: a pack whose tooling/deps are unavailable (e.g. FBX) is
  skipped with a warning and produces no manifest; the gallery simply omits that
  row.

**`tools/process-height-variants.mjs`** — generates the 5 chopped towers.

1. Read `public/models/neocity/manifest.json`; collect tower heights
   (`bbox[1]`) for pieces whose name contains `Main` or `Building` (the actual
   vertical masses), category LG/MD.
2. Sort those heights; find the **5 largest gaps**; target height = midpoint of
   each gap → 5 heights guaranteed **not already in the set**.
3. For each target, pick the **shortest source tower still taller** than the
   target (minimizes how much is cut, preserving the most original detail).
4. **Clip** the source GLB geometry at plane `y = h`:
   - Per triangle, Sutherland–Hodgman clip against the half-space `y ≤ h`,
     interpolating `POSITION`, `NORMAL`, `TEXCOORD_0` at crossings (so textures
     stay correct on the kept walls). Produces 0/1/2 output triangles each.
   - Rebuild primitive accessors from the clipped triangle soup (non-indexed;
     `weld` re-indexes downstream).
5. **Cap** the opening: two triangles spanning the XZ bounding rect of the
   clipped result at `y = h`, upward normals, assigned a new dark roof material
   (so the top doesn't read as hollow).
6. Optimize (`weld → dedup → draco`, keep existing WebP textures) and write to
   `public/models/neocity-variants/<source>_H<round(h)>.glb` + `manifest.json`.
   Category `VARIANT`.

All offline geometry math lives in `gltf-transform` accessor space — no browser,
no three.js runtime dependency.

### 2. Gallery component (`src/components/three/BuildingGallery.tsx`)

Refactor from "one hardcoded neocity row" to "N rows from a `ROWS` table":

- `ROWS: { key, label, color, manifest }[]` — imports each pack's `manifest.json`.
  Missing manifests (pack not built) are filtered out at module load so the file
  degrades gracefully.
- **Per-row layout:** reuse the current footprint-packing algorithm (`useGalleryLayout`)
  but parameterized per row and **sorted by bbox volume descending**. Each row is
  offset on **Z** by the running sum of `(maxDepthOfRow + ROW_GAP)`.
- **Row header:** an `<Html>` label at the start (−X end) of each row showing the
  pack name + count, colored by the pack.
- **Per-piece label:** unchanged (`#index · category · name · tris · height`).
- Reuse `KitPiece` for rendering (it already clones, grounds, centers, and boosts
  emissive) — works for any GLB, so no per-pack rendering code.
- Camera/flycam/postprocessing unchanged; initial camera framed on the whole
  stack (center of bounding area). HUD updated to list rows + excluded packs.

`KitPiece`, `main.tsx` routing, and the shipping scene are untouched.

## Data flow

```
Cyber Assets/*  ──process-gallery.mjs──▶  public/models/<pack>/{*.glb,manifest.json}
neocity GLBs    ──process-height-variants.mjs──▶ public/models/neocity-variants/{*.glb,manifest.json}
                                                     │
                       BuildingGallery.tsx  ◀── imports all manifest.json
                                                     │
                                    rows stacked on Z, sorted by size, labeled
```

## npm scripts

- `assets:gallery` → `node tools/process-gallery.mjs`
- `assets:variants` → `node tools/process-height-variants.mjs`

New devDependency: `fbx2gltf` (only used by the offline script; graceful skip if
absent).

## Testing / verification (no automated suite exists)

1. Run `npm run assets:gallery` and `npm run assets:variants`; confirm each
   `public/models/<pack>/manifest.json` lists the expected count and every GLB
   loads in `gltf-transform inspect` without error.
2. `npm run dev`, open `?gallery`; visually confirm: one row per pack, rows
   separated on Z, pieces textured, sorted large→small within each row, labels
   present, 5 variant towers show distinct new heights with capped tops.
3. Playwright screenshot of the gallery for the record (per project convention).

## Risks / mitigations

- **FBX tooling unavailable** → monogon row auto-skipped, HUD notes it. Non-fatal.
- **Triangle clipping edge cases** (degenerate/coincident verts) → drop
  zero-area output triangles; `weld` cleans seams. Cap uses the clipped bbox so
  it always closes the silhouette.
- **Output size** (quaternius ~71 pieces + textures) → WebP+DRACO keeps it
  reasonable; this is dev-only and not shipped in the production route bundle.
- **Quaternius row length** (~71 wide) → acceptable; flycam traverses it. Can be
  trimmed later by deleting manifest entries (same prune-by-eye workflow as today).

## Out of scope

- Integrating any new asset into the shipping `<City>` scene / route.
- Converting `.c4d` / `.blend` sources (would need C4D/Blender export first).
- Automated tests (project has none; visual harness only).
