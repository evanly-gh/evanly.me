# Billboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework research canyon (3 big horizontal boards), project boards (4 boards, equal area / unique shapes), and the about poster, with rewritten narrative copy and a shared cyberpunk frame matching the reference image.

**Architecture:** Content lives in `src/content/resume.ts` (single source of truth). Boards are canvas-textured planes rendered from per-section layout modules (`researchContent.ts`, `stuntContent.ts`, `aboutArt.ts`) and drawn by per-section render functions. A new `src/components/three/billboardFrame.ts` holds pure canvas primitives (neon frame, corner brackets, corner index, hero halo, brand lockup, shrink-to-fit text) that all three renderers compose.

**Tech Stack:** React 19, react-three-fiber, three.js, TypeScript (strict), Vite. Verification = `npm run build` (tsc strict) + `?shot=<t>&inspect` Playwright screenshots (no unit test suite).

## Global Constraints

- No Japanese copy anywhere in billboard content.
- Honesty: no "ELSA 45→63%" for TTT-E2E; RememberMe ResNet-50 = trained + published to Hugging Face (not deployed); advisor = Prof. Shyam Gollakota, Wen Cheng is a PhD student (never "(Ph.D.)"); SD on Qwen advised by Prof. Ranjay Krishna.
- `CamKey[]` t must be strictly increasing (cameraRig throws otherwise) — do not reorder research/project camera keys.
- Do NOT change any research canyon buildings/walls/gateways/lighting — billboards only.
- Do NOT change stunt backdrop buildings/scaffold — panels only.
- `npm run build` must pass after every task.

---

### Task 1: Content model + copy (`resume.ts`) and its consumers

**Files:**
- Modify: `src/content/resume.ts` (interface + data)
- Modify: `src/world/contentAnchors.ts`
- Modify: `src/choreography/productionCameraConstraints.ts` (PRODUCTION_SHOT_EXPECTATIONS ids)
- Modify: `src/scroll/NativePortfolio.tsx`

**Interfaces:**
- Produces: `RESUME.projects: Project[4]` = [RememberMe, OpenChinese, RhetBench, TTT-E2E]; `RESUME.research: Project[3]` = [SLM Factory, RL on HRM-Text, SD on Qwen]; `RESUME.about.paragraph` (long bio), `RESUME.about.heroTagline`.
- `Project` keeps `title, stack, blurb, image`; `displayBlurb` removed.

- [ ] **Step 1:** In `resume.ts`, change `Resume` interface: replace `projectsMain`/`projectsSmall` with `projects: [Project,Project,Project,Project]`; `research: [Project,Project,Project]`; remove `displayBlurb` from `Project`.
- [ ] **Step 2:** Fill `projects` + `research` with the approved copy (see spec `docs/superpowers/specs/2026-08-19-billboards-design.md`), update `about.paragraph` and `heroTagline`.
- [ ] **Step 3:** Update `contentAnchors.ts`: `ResumeAnchorRef` sections → `'about' | 'projects' | 'research'`; rebuild project anchors (4) + research anchors (3) with new ids/titles/indices. Research anchor semanticT/positions: board1 z-410 t0.712, board2 z-522 t0.76, board3 z-690 t0.82.
- [ ] **Step 4:** Update `productionCameraConstraints.ts` `PRODUCTION_SHOT_EXPECTATIONS` subjectIds: projects-flip-1 → `['project-rememberme','project-openchinese']`; projects-flip-2 → `['project-rhetbench','project-ttt-e2e']`; research shots → new board ids `['research-board-1']`/`['research-board-2']`/`['research-board-3']`.
- [ ] **Step 5:** Update `NativePortfolio.tsx` to iterate `RESUME.projects` and `RESUME.research`, using `blurb` (no `displayBlurb`).
- [ ] **Step 6:** `npm run build` — expect PASS. Commit.

---

### Task 2: Research canyon — 3 big horizontal boards (no building changes)

**Files:**
- Modify: `src/world/researchContent.ts`
- Modify: `src/world/researchCamera.ts` (`activeResearchPanelIds`)
- Modify: `src/components/three/researchRender.ts` (`textureIndex` type, gateway-face filter no-op)

**Interfaces:**
- Produces: `RESEARCH_PANELS: ResearchPanel[3]` with ids `research-board-1|2|3`, `contentIndex: 0|1|2`, mounted on existing east front walls at z ≈ −410 / −522 / −690, width≈46 height≈24 y≈24, mount `'tower-facade'`.
- `activeResearchPanelIds(t)` returns the single nearest board id by t.

- [ ] **Step 1:** In `researchContent.ts`: widen `contentIndex` to `0|1|2`; `RESEARCH_CONTENT_RECORDS` already maps `RESUME.research` (now 3).
- [ ] **Step 2:** Replace `gatewayPanels`/`endPanels`/`RESEARCH_PANELS` with a builder that picks the east (`side===1`) front wall nearest each target z (−410, −522, −690) and mounts one `facadePanel(id, ...)` each (width 46, height 24, y 24), ids `research-board-1|2|3`, contentIndex 0|1|2. Keep `facadePanel` helper.
- [ ] **Step 3:** `researchCamera.ts` `activeResearchPanelIds`: return the id of the board whose panel.position z is nearest to the route z at `semanticT` (map t→z via existing sampleRoute, or nearest by |t - boardT|). Keep return type `string[]` (single-element array).
- [ ] **Step 4:** `researchRender.ts`: widen `ResearchRenderInstance.textureIndex` to `0|1|2`; the `mount !== 'gateway-face'` filter now keeps all 3 (harmless). Panel-count readiness derives from `assembly` — no hardcode change needed; verify `wallsReady` (3 files/38 placements) unchanged.
- [ ] **Step 5:** `npm run build` — expect PASS. Commit.

---

### Task 3: Project boards — 4 boards, equal area, unique shapes

**Files:**
- Modify: `src/world/stuntContent.ts`
- Modify: `src/components/three/stuntRender.ts` (`inspectStuntScene` counts)

**Interfaces:**
- Produces: `STUNT_PROJECT_PANEL_DEFINITIONS[4]` ids `project-rememberme` (40×37, facade-portrait, flip-1), `project-openchinese` (52×29, facade-hero, flip-1), `project-rhetbench` (38×39, floating-hologram profile but mount 'facade', flip-2), `project-ttt-e2e` (58×26, facade-ribbon, flip-2).

- [ ] **Step 1:** Replace the 5 `panelDefinition(...)` entries with the 4 above, pulling `RESUME.projects[0..3]`. Keep `mount: 'facade'` for all. Reuse backdrop parents (flip-1: stunt-backdrop-2/-3; flip-2: stunt-backdrop-6/-7). Panel `blurb` now `definition.project.blurb` (was displayBlurb).
- [ ] **Step 2:** Update `ART_PROFILES` sizes to the 4 new aspects: facade-portrait 40×37 → 984×912; facade-hero 52×29 → 1280×714; floating-hologram 38×39 → 940×964; facade-ribbon 58×26 → 1280×574. Keep palettes.
- [ ] **Step 3:** `stuntRender.ts` `inspectStuntScene` `ready`: `mountedScreens === 4 && mountedBackings === 4 && mountedAttachments === 16` (emitters/beams/supports stay 0).
- [ ] **Step 4:** `npm run build` — expect PASS. Commit.

---

### Task 4: Shared frame + reference art direction

**Files:**
- Create: `src/components/three/billboardFrame.ts`
- Modify: `src/world/researchContent.ts` (`renderResearchArt`)
- Modify: `src/world/stuntContent.ts` (`renderProjectArt` → shrink-to-fit, no throw)
- Modify: `src/content/aboutArt.ts` (paragraph via shrink-to-fit, template)

**Interfaces:**
- Produces (pure canvas helpers): `drawNeonFrame(ctx,{w,h,color})`, `drawCornerBrackets(ctx,{w,h,color})`, `drawCornerIndex(ctx,{w,h,text,color})`, `drawHeroHalo(ctx,{cx,cy,r,color})`, `drawBrandLockup(ctx,{x,y,label,color})`, `drawShrinkText(ctx,{text,x,y,maxW,maxLines,fontPx,weight,family,color,glow}) → nextY`.

- [ ] **Step 1:** Create `billboardFrame.ts` with the six helpers (double stroke + shadow glow frame; L-brackets at corners; translucent big index top-right; radial halo gradient + ring; lockup glyph+label; uniform shrink-to-fit wrap).
- [ ] **Step 2:** `renderResearchArt`: compose helpers — left ~55% text column (eyebrow, title, accent rule, stack, blurb via drawShrinkText), right halo hero, top-right index (`0N`), bottom-left lockup `EVAN LI // RESEARCH`. Add a third accent palette for contentIndex 2.
- [ ] **Step 3:** `renderProjectArt`: replace `wrapLines` (throws) with `drawShrinkText`; add frame/brackets/index/halo/lockup `EVAN LI // PROJECT`. Keep `regions` for the pixel audit.
- [ ] **Step 4:** `aboutArt.ts`: replace `wrapWordsByCharacters` (3-line throw) with `drawShrinkText` for the paragraph; portrait = right hero; name headline + tagline; frame/brackets/index/lockup. Enlarge bio region.
- [ ] **Step 5:** `npm run build` — expect PASS. Commit.

---

### Task 5: Visual verification + tuning

**Files:** iterate on `researchContent.ts` (board z/size/y), `stuntContent.ts` (localY/localZ/size), camera keys only if needed.

- [ ] **Step 1:** `npm run dev`; screenshot `?shot=0.712&inspect`, `0.76`, `0.82` (research), `0.41`, `0.59` (projects), `0.192` (about) via Playwright.
- [ ] **Step 2:** Confirm each board fills its frame, is horizontal (research), text is readable, no bad clipping. Adjust sizes/positions; rebuild; re-screenshot until clean.
- [ ] **Step 3:** Final `npm run build`; commit.

## Self-Review

- Spec coverage: template (T4), copy (T1), data model (T1), research 3 boards no-building-change (T2), projects 4 boards equal-area/unique (T3), about paragraph (T4). ✓
- Type consistency: `contentIndex`/`textureIndex` widened together to `0|1|2` (T2); panel ids consistent between stuntContent, contentAnchors, productionCameraConstraints (`project-rememberme|openchinese|rhetbench|ttt-e2e`, `research-board-1|2|3`). ✓
- Placeholder scan: copy is verbatim in spec; helper signatures defined in T4. ✓
