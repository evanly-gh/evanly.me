# Overnight work log — Phase 1 (Assets)

> Autonomous session. Goal: implement as much of the Phase 1 plan as possible
> with good record-keeping, screenshots, and clean commits. Screenshots for this
> session live in `docs/progress/phase1/`.

## Context (refreshed from docs)
- `HANDOFF.md`, `docs/superpowers/specs/2026-07-16-phase1-assets-design.md`,
  `docs/superpowers/plans/2026-07-17-phase1-assets.md`.
- Phase 1 = design each asset to look good in isolation, verified in `?viewer`.
- Sign-off gate: textured hero pieces verified; bloom/exposure baseline; bike
  poses correctly; ≥1 hovercar + ≥1 character load; full 47-piece run + manifest.

## Status at session start
- Bike + rider hero asset: DONE and committed (`c3d6fd0`).
- KitBash pipeline (`tools/process-kitbash.mjs`): existed but only emitted
  giant embedded-PNG GLBs (~500 MB/piece) and its `--ktx2` branch was broken
  (sharp can't encode KTX2).

## Work done this session

### Pipeline: WebP texture compression (replaces broken KTX2 branch)
- `--ktx2`/`--webp`/`--compress` now run `textureCompress` with
  `targetFormat: 'webp'`, `quality: 85`, `resize: [res, res]` via sharp.
- New `--res=<n>` flag (default 1024).
- Result on hero pieces: **1.6 GB → 10.5 MB** for 4 pieces (biggest tower
  3.3 MB) with PBR maps intact.

### Viewer: deep-linkable assets
- `?viewer&asset=<id>` now selects that asset on load (previously always
  started on the bike).

## Hero-piece review (Phase 1c) — PBR verified in `?viewer`
All render with full PBR (basecolor/normal/roughness/metal), lit by the night
env + key/fill/rim lights, emissive glows under bloom. No grey clay.

| piece | tris | calls | dims (m) | notes |
|---|---|---|---|---|
| BldgLG_C_Main | 267k | 15 | 35×143×34 | full PBR facade + red "KITBASH" neon sign ✓ |
| BldgMD_C_Main | 150k | 15 | 49×58×23 | podium base, glass curtain walls, red vent strip ✓ |
| BldgSM_C_NeonSignA | 3k | 7 | 3.7×2.0×0.9 | emissive red "CHINESE MEDICINE" sign glows ✓ |

Screenshots: `docs/progress/phase1/kb-*.png`.

## Decision: WebP over KTX2 (resolves spec "Open items")
The spec left KTX2-vs-embedded open. KTX2 via sharp is not supported (sharp
can't encode KTX2, and no `toktx` binary is installed). WebP@1024 gives
web-appropriate sizes (few MB/piece) with PBR intact and needs no extra
tooling, so WebP is the delivery format. KTX2/Basis can be revisited in
Phase 5 perf if GPU decode/VRAM becomes the bottleneck.

Tri counts are high (LG 267k, MD 150k) — the meshopt simplify ratios barely
reduced these dense hero pieces. Acceptable for isolated Phase-1 review;
instancing/LOD/decimation is a Phase-2 perf task (already noted in the spec).

## Character verified (sign-off #4)
Copied `Character.gltf` (Quaternius, CC0, self-contained 1.5 MB) →
`public/models/characters/`. Loads in `?viewer&asset=char-0`: a mech with an
orange hoodie + sword, 7.5k tris, renders with its CC0 colours. Screenshot
`docs/progress/phase1/char-quaternius.png`.
Hovercars remain deferred (ship as a `.unitypackage`, not loadable) — the
documented Phase-1 deviation; the character covers the non-KitBash load path.

## Full 47-piece run — COMPLETE
`node tools/process-kitbash.mjs --webp --res=1024`, ~6 min.
- Pieces written: **47/47** (LG=15, MD=10, SM=22)
- Total size: **88 MB** (WebP@1024 + DRACO); embedded-PNG equivalent would be
  ~15+ GB, so ~170× smaller.
- `manifest.json` written with name/file/bbox/hasEmissive/tris/category and
  committed (force-added; the `.glb` binaries stay gitignored).
- Spot-checked `BldgLG_A_Main` (93k tris, rooftop antenna/AC/penthouse, window
  bands) — full PBR ✓. Screenshot `docs/progress/phase1/kb-BldgLG_A.png`.

## Phase 1 sign-off status
1. Textured hero `.glb`, PBR verified in viewer — ✅
2. Bloom/exposure baseline in `theme.ts` (viewer HUD defaults) — ✅ (kept
   bloom 0.6 / thr 0.75 / radius 0.6 / exposure 1.0; reads well on all pieces)
3. Bike renders + poses (IK hands on grips, feet on pegs) — ✅ (committed)
4. ≥1 character loads — ✅; hovercar deferred (unitypackage) — documented
5. Evan sign-off in `?viewer` — ⏳ awaiting Evan
6. Full 47-piece run + manifest committed — ✅

Everything except Evan's visual sign-off (#5) is done. Assets are deep-linkable
in `?viewer&asset=<id>` for review.
