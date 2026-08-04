# Gallery: all Cyber Assets + height variants — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. This project has
> **no automated test suite**; verification is offline (`gltf-transform inspect`,
> manifest counts) and visual (`?gallery` + Playwright), per `CLAUDE.md`.

**Goal:** Show every usable Cyber Assets pack in `?gallery` as its own size-sorted
row, fully textured at original scale, plus 5 procedurally chopped neocity height
variants.

**Architecture:** Two offline Node scripts convert/derive GLBs + per-pack
manifests into `public/models/<pack>/`; `BuildingGallery.tsx` is refactored to
render N rows from a table of manifests. Reuses the existing `obj2gltf` +
`gltf-transform` (prune/weld/dedup/webp/draco) stack and the `KitPiece` renderer.

**Tech Stack:** Node ESM, `@gltf-transform/core|functions|extensions`, `obj2gltf`,
`fbx2gltf` (new devDep), `sharp`, `draco3dgltf`, React 19 + R3F + drei.

## Global Constraints

- Original geometry dimensions preserved — **no rescale**.
- Textures → WebP q85; DRACO geometry compression; preserve emissive materials
  (hint regex: `light|glass|banner|letters|neon|decal|screen`).
- Manifest entry shape (matches neocity): `{ name, file, bbox:[x,y,z], tris,
  hasEmissive, category }`. `file` is relative to `public/models/`.
- Dev-only scaffolding: relaxed size budgets (log, do not hard-fail on bytes).
- Excluded packs (no web-loadable mesh): `Cyber Signs Jonni` (.c4d), `Cyber dude`
  (.blend). Surface as excluded, don't silently drop.
- Graceful degradation: a pack whose tooling/deps/inputs are missing is skipped
  with a warning; gallery omits absent rows.
- Source root: `~/Downloads/Cyber Assets`.

---

### Task 1: Shared gallery-conversion core (`tools/process-gallery-core.mjs`)

**Files:**
- Create: `tools/process-gallery-core.mjs`

**Interfaces:**
- Produces:
  - `async createGalleryConverter()` → `async (job, res) => { buffer, bbox, tris, hasEmissive, textures }`
    where `job = { name, input, type:'obj'|'gltf'|'fbx', category }`.
  - `EMISSIVE_PATTERNS` (array), `pieceHasEmissive(document)`, `documentBbox(document)`,
    `countTris(document)`, `optimizeChain({ res, compress:true })` (returns transform list).
  - `convertToDocument(io, job)` — reads OBJ via `obj2gltf`, glTF via `io.read`,
    FBX via `fbx2gltf` → temp glb → `io.readBinary`. Throws if `fbx2gltf` missing.

- [ ] **Step 1:** Implement the module. Reuse patterns from
  `tools/process-props-core.mjs` (`createTransformIO`, `documentBbox`) and
  `tools/process-kitbash.mjs` (`categoryOf`/emissive/`countTris`, webp+draco chain).
  FBX path:
  ```js
  // convertToDocument, FBX branch
  const { promisify } = await import('util');
  let convertFbx;
  try { convertFbx = (await import('fbx2gltf')).default; }
  catch { throw new Error('FBX_TOOLING_MISSING'); }
  const tmp = path.join(os.tmpdir(), `fbx-${process.pid}-${Math.random().toString(36).slice(2)}.glb`);
  await convertFbx(job.input, tmp, ['--khr-materials-unlit', '--binary']).catch(async () => {
    // fbx2gltf signature variants: (src,dst) returns dst path
    return convertFbx(job.input, tmp);
  });
  const doc = await io.readBinary(new Uint8Array(fs.readFileSync(tmp)));
  fs.rmSync(tmp, { force: true });
  return doc;
  ```
  Optimize chain (webp res per job): `prune(), weld({tolerance:1e-4}), dedup(),
  textureCompress({encoder:sharp, targetFormat:'webp', quality:85, resize:[res,res]}),
  draco({quantizationVolume:'scene'})`.
- [ ] **Step 2 (verify):** `node -e "import('./tools/process-gallery-core.mjs').then(m=>console.log(Object.keys(m)))"`
  Expected: prints the exported names, no throw.
- [ ] **Step 3 (commit):** `git add tools/process-gallery-core.mjs && git commit -m "feat(gallery): shared multi-format asset conversion core"`

---

### Task 2: Pack definitions + runner (`tools/process-gallery.mjs`)

**Files:**
- Create: `tools/process-gallery.mjs`
- Modify: `package.json` (scripts: add `"assets:gallery"`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `public/models/<pack>/{*.glb, manifest.json}` for packs:
  `bikes, robots, hovercars, structures, monogon, quaternius`.

- [ ] **Step 1:** Define `PACKS` by globbing the source folders:
  - `bikes`: `Cyber bikes/**/*.obj`, res 1024
  - `robots`: `Cyber Robots/**/Package/*.obj`, res 1024
  - `hovercars`: `Cyber hovercars/**/meshes/**/*.obj` (dedupe: prefer files whose
    basename has no `_lod`/`LOD`; take one obj per leaf dir), res 1024
  - `structures`: the 3 single OBJs (`Cyber building/*.obj`, `Cyber citygen/*.obj`,
    `Cyber Resteraunt/*.obj`), res 1024
  - `quaternius`: `Cyberpunk Game Kit .../**/*.gltf` under subdirs
    `Character, Enemies, Pickups and Objects, Platforms` (skip `Blends`), res 512
  - `monogon`: `Cyber monogon stuff/**/*.fbx`, res 1024
  Each job `name` = sanitized basename (unique per pack; suffix `_2` on collision).
- [ ] **Step 2:** For each pack: stage to a temp dir, convert each job (try/catch —
  a failed job logs and is skipped), write `<name>.glb`, collect manifest entry
  `{name, file:`<pack>/<name>.glb`, bbox, tris, hasEmissive, category:pack}`.
  If a pack's converter throws `FBX_TOOLING_MISSING` for every job, skip the whole
  pack with a clear warning. Publish stage→`public/models/<pack>` (reuse
  `publishDirectory` pattern) and write sorted `manifest.json`.
- [ ] **Step 3:** Support `--only=bikes,robots` and `--res=` overrides.
- [ ] **Step 4:** Add script `"assets:gallery": "node tools/process-gallery.mjs"`.
- [ ] **Step 5 (run):** `npm run assets:gallery -- --only=bikes`
  Expected: `public/models/bikes/manifest.json` exists, lists 5 entries, GLBs written.
- [ ] **Step 6 (run full):** `npm run assets:gallery`
  Expected: manifests for bikes(5), robots(9), hovercars(≥8), structures(3),
  quaternius(≥40), monogon(17 or skipped-with-warning). Log a summary table.
- [ ] **Step 7 (verify one GLB):** `npx gltf-transform inspect public/models/bikes/<first>.glb`
  Expected: valid, has meshes + (webp) textures, DRACO in extensionsUsed.
- [ ] **Step 8 (commit):** `git add tools/process-gallery.mjs package.json public/models && git commit -m "feat(gallery): convert all Cyber Asset packs to GLB + manifests"`

---

### Task 3: Height-variant chopper (`tools/process-height-variants.mjs`)

**Files:**
- Create: `tools/process-height-variants.mjs`
- Modify: `package.json` (scripts: add `"assets:variants"`)

**Interfaces:**
- Consumes: `public/models/neocity/manifest.json`; neocity GLBs.
- Produces: `public/models/neocity-variants/{*.glb, manifest.json}`, 5 entries,
  category `VARIANT`.

- [ ] **Step 1: pick heights.** Read neocity manifest; `towers = entries where
  /Main|Building/.test(name) && bbox[1] > 15 && category in {LG,MD}`. Sort tower
  heights ascending; compute consecutive gaps; take the 5 largest gaps; target
  height per gap = `round(midpoint)`. Guarantee each target differs from every
  existing tower height by > 1m (nudge if needed).
- [ ] **Step 2: pick source per target.** For each target `h`, source = shortest
  tower with `bbox[1] > h + 3` (fallback: tallest tower). Record `{source, h}`.
- [ ] **Step 3: clip geometry.** For the source GLB (read via gltf-transform):
  ground it (`translate so min.y=0`) then for every primitive, decode
  POSITION/NORMAL/TEXCOORD_0 + indices into triangles and Sutherland–Hodgman clip
  each triangle against half-space `y ≤ h`, interpolating all attributes at
  crossings; emit clipped triangles to new non-indexed accessors. Drop zero-area
  triangles.
  ```js
  // clip one triangle (array of {p:[x,y,z], n:[..], uv:[u,v]}) against y<=h
  function clipTri(verts, h) {
    const out = [];
    for (let i=0;i<3;i++){
      const a=verts[i], b=verts[(i+1)%3];
      const ain=a.p[1]<=h, bin=b.p[1]<=h;
      if (ain) out.push(a);
      if (ain!==bin){
        const t=(h-a.p[1])/(b.p[1]-a.p[1]);
        out.push(lerpVert(a,b,t));
      }
    }
    // fan-triangulate the (3 or 4)-vertex polygon
    const tris=[];
    for (let i=1;i+1<out.length;i++) tris.push([out[0],out[i],out[i+1]]);
    return tris;
  }
  ```
- [ ] **Step 4: cap.** Compute XZ bbox of clipped verts; add 2 upward triangles at
  `y=h` covering that rect (uv 0..1), assign a new material
  `roof_cap` (baseColor `#0c0f18`, emissive `#16203a` intensity 0.4, metallic 0,
  rough 0.8). Append as its own primitive.
- [ ] **Step 5: optimize + write.** `weld({tolerance:1e-4}), dedup(),
  draco({quantizationVolume:'scene'})` (keep existing webp textures — do not
  re-encode). Name `${source}_H${h}`. Write GLB + manifest entry
  `{name, file:`neocity-variants/${name}.glb`, bbox:(recomputed), tris,
  hasEmissive:(source), category:'VARIANT'}`.
- [ ] **Step 6:** Add `"assets:variants": "node tools/process-height-variants.mjs"`.
- [ ] **Step 7 (run):** `npm run assets:variants`
  Expected: 5 GLBs + manifest, each a distinct new height (printed table:
  source → h). No target within 1m of an existing tower height.
- [ ] **Step 8 (verify):** `npx gltf-transform inspect public/models/neocity-variants/<first>.glb`
  Expected: valid, bbox[1] ≈ target h, has textures + DRACO, cap present
  (material count = source+1).
- [ ] **Step 9 (commit):** `git add tools/process-height-variants.mjs package.json public/models/neocity-variants && git commit -m "feat(gallery): 5 procedurally chopped neocity height variants"`

---

### Task 4: Multi-row gallery UI (`BuildingGallery.tsx`)

**Files:**
- Modify: `src/components/three/BuildingGallery.tsx`

**Interfaces:**
- Consumes: each `public/models/<pack>/manifest.json` (+ neocity + neocity-variants).
- Produces: stacked rows in `?gallery`.

- [ ] **Step 1: manifest table.** Replace the single neocity import with a `ROWS`
  table built from static imports wrapped so a missing file doesn't crash. Since
  Vite needs static import paths, import each known manifest with
  `import(... )` eagerly via `import.meta.glob('/public/models/*/manifest.json', {eager:true})`
  is not available for /public — instead import each manifest relatively:
  ```ts
  import neocity from '../../../public/models/neocity/manifest.json';
  import variants from '../../../public/models/neocity-variants/manifest.json';
  import bikes from '../../../public/models/bikes/manifest.json';
  // ...robots, hovercars, structures, monogon, quaternius
  ```
  Guard each with a try/catch wrapper module `safeManifest` is not possible for
  static imports; instead: generate empty `manifest.json` (`[]`) for any pack the
  scripts skipped so the import always resolves. (Task 2/3 already write `[]` when
  a pack is skipped — add that behavior.)
  `ROWS = [{key,label,color,items:manifest}, ...]` in display order:
  neocity, variants, structures, monogon, bikes, hovercars, robots, quaternius.
- [ ] **Step 2: per-row layout.** Refactor `useGalleryLayout` → `layoutRow(items)`
  returning `{items:LaidItem[], rowLength, rowDepth}`; sort items by
  `bbox[0]*bbox[1]*bbox[2]` **descending** before packing left→right by footprint
  (existing GAP logic). Compute each row's Z offset as running sum of
  `rowDepth + ROW_GAP` (ROW_GAP ~ 40).
- [ ] **Step 3: render rows.** Map `ROWS` → a `<group position={[0,0,rowZ]}>` per
  row containing the platforms/pieces/labels (reuse `Platform`, `KitPiece`,
  `Label`). `Label` uses the row color when `CATEGORY_COLOR[item.category]` is
  absent. Add a `RowHeader` `<Html>` at the row's −X end showing `label · N`.
- [ ] **Step 4: camera + HUD.** Frame the initial camera on the overall bounds
  (center X of longest row, mid Z of the stack, pulled back). Update HUD to list
  rows + counts + an "excluded: Signs (.c4d), dude (.blend)" line.
- [ ] **Step 5 (typecheck):** `npx tsc --noEmit`
  Expected: no errors (add `resolveJsonModule` already on; manifests are arrays).
- [ ] **Step 6 (visual):** `npm run dev`, open `http://localhost:5173/?gallery`
  (or the dev port printed). Confirm rows stacked on Z, size-sorted, textured,
  labeled, variants row shows 5 new heights.
- [ ] **Step 7 (commit):** `git add src/components/three/BuildingGallery.tsx && git commit -m "feat(gallery): render one size-sorted row per asset pack"`

---

### Task 5: Verify end-to-end + screenshot

- [ ] **Step 1:** `npx tsc --noEmit` → clean.
- [ ] **Step 2:** Playwright: load `?gallery`, wait for loads, screenshot each row
  region; confirm textures + labels + variant heights visually.
- [ ] **Step 3 (commit any fixups):** commit.

## Self-Review notes

- Spec coverage: rows per pack (T2,T4), size order (T4 S2), original size + webp
  (T1,T2), FBX handling + graceful skip (T1,T2), excluded packs surfaced (T4 S4),
  5 height variants via real clipping + cap (T3), labels unchanged (T4 S3). ✓
- Empty-`[]` manifests for skipped packs (added to T2/T3) keep T4's static imports
  resolvable — resolves the Vite static-import vs graceful-skip tension. ✓
- No fabricated test suite: project has none; verification is inspect + visual. ✓
