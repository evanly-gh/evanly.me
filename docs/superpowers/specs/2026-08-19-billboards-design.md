# Billboard overhaul — research canyon, project boards, about board

**Date:** 2026-08-19
**Status:** Approved, in implementation

## Goal

Rework the three billboard families (research canyon, project stunt boards, about
poster) with: (1) a unified cyberpunk art template matching the pasted reference
image, (2) rewritten narrative copy sourced from `resume_ai.tex` +
`PORTFOLIO_AND_HIRING_FINDINGS.md`, (3) resized/reshaped boards per section.

No Japanese copy anywhere in the billboard content (explicit user decision).

## Art template (shared)

New module `src/components/three/billboardFrame.ts` — one drawing helper reused by
research / project / about renderers. Supplies frame + composition; each renderer
passes copy + palette + optional hero image.

Template (from reference): horizontal, screen-filling; **double neon frame** (bright
inner stroke + soft outer glow) with **L-shaped corner brackets**; **left ~45% text
column** (eyebrow, big uppercase title, thin neon accent rule, subtitle/stack line,
shrink-to-fit body paragraph); **bottom-left brand lockup** (glyph + label);
**top-right translucent index number**; **right ~55% hero** = glowing concentric
halo ring + particle field in the accent color, OR the image slot when filled
(replaces the current "PLACEHOLDER" boxes). Body text uses shrink-to-fit wrapping —
never throws on overflow.

## Copy (final, narrative-first, 1–2 contextual numbers)

**About** — tagline `CS + ECON @ UW · ML SYSTEMS / ON-DEVICE INFERENCE`:
> Evan Li is a CS + Economics student at the University of Washington
> (Interdisciplinary Honors, 3.9 GPA, graduating June 2027). He builds ML systems
> that stay fast under tight memory budgets — LLM inference optimization, on-device
> model compression, and RL post-training. He researches phone-sized language
> models at UW's Mobile Intelligence Lab, is a founding developer of KleoKlaw (an AI
> job-application platform serving ~100 users), and is CTO of UW's Software
> Engineering Career Club. A former national-championship debater, he likes turning
> hard research ideas into systems that actually ship.

**RememberMe** — `PyTorch · ResNet-50 · FastAPI · pgvector`:
> A mobile app for remembering the people you meet — capture a face and a six-model
> computer-vision pipeline derives descriptive attributes, then searches your
> contacts by memory with pgvector. As team lead I trained the ResNet-50
> attractiveness regressor to Pearson r ≈ 0.88 (near state of the art) and published
> it to Hugging Face.

**OpenChinese** — `React Native · Expo · Supabase · Gemini`:
> A shipped Chinese-learning app built on a from-scratch SM-2 spaced-repetition
> engine with offline-first cloud sync. Its AI tutor assembles each prompt live from
> your weakest cards and active grammar through a JWT-gated Gemini edge function —
> real context engineering over 2,400 HSK cards, not a chatbot wrapper.

**RhetBench** — `Python · FastAPI · LLM Evals`:
> A persuasion benchmark for LLM agents: the agent must shift a scripted character's
> hidden belief within 25 turns, inferring which of six argument types actually moves
> them — theory-of-mind under partial observability on a deterministic, fully
> replayable NPC state machine. Solo overall winner of SWECCATHON 2026.

**TTT-E2E** — `PyTorch · HF Transformers · MAML`:
> Second-order meta-learning (MAML) that adapts a language model at test time, using
> a dual-branch trainable + frozen design. Evaluated across a four-method harness —
> baseline, in-context learning, RAG, and test-time training — to measure when
> on-the-fly adaptation actually beats retrieval.

**SLM Factory** — `LangGraph · PEFT/LoRA · llama.cpp · vLLM`:
> An agentic pipeline that autonomously fine-tunes a phone-sized language model for
> any task — task analysis, data curation, and a closed-loop LoRA search across an
> 18-variant Qwen3.5 pool under real RAM and quantization limits. It lifted
> biomedical NER span-F1 from 0.03 to 0.86 and delivers a fully optimized on-device
> model for about $5 and a day of compute.

**RL on HRM-Text** — `PyTorch · PEFT · RLVR (GRPO/DAPO)`:
> From-scratch RL post-training (SFT → DAPO) on a 1.1B double-recurrent reasoning
> model that no existing RL library supports. I led the RL workstream and hand-wrote
> both training loops, raising MATH pass@1 from 64.4% to 66.7% and characterizing how
> RL's sharpening gains plateau at small scale.

**SD on Qwen** — `vLLM · CUDA · Prometheus · SLURM`:
> A rigorous speculative-decoding study on the Qwen3.5 family, sweeping speculative
> depth and batch size on multi-GPU vLLM. It reached 2.88× decode throughput (up to
> 2.95× on the MoE model) and found that thinking mode roughly doubles the speedup,
> driven by longer chain-of-thought outputs and KV-cache reuse.

### Honesty constraints (must hold)
- No "ELSA 45→63%" number for TTT-E2E (unverified, removed from resume).
- RememberMe ResNet-50 is trained + published to Hugging Face, NOT deployed in-app.
- Advisor = Prof. Shyam Gollakota; Wen Cheng is a PhD student (never "(Ph.D.)").
- SD on Qwen advised by Prof. Ranjay Krishna.

## Data model (`src/content/resume.ts`)

- Replace `projectsMain: [Project,Project]` + `projectsSmall: [Project,Project,Project]`
  with `projects: [Project,Project,Project,Project]` =
  [RememberMe, OpenChinese, RhetBench, TTT-E2E].
- `research: [Project,Project]` → `[Project,Project,Project]` =
  [SLM Factory, RL on HRM-Text, SD on Qwen].
- Each `Project.blurb` = the copy above; `displayBlurb` retired (template shrink-fits
  the full blurb).
- `about.paragraph` updated to the About copy; tagline updated.
- Update every consumer: `stuntContent.ts`, `researchContent.ts`, `aboutArt.ts`,
  `scroll/NativePortfolio.tsx`, `world/contentAnchors.ts`,
  `choreography/productionCameraConstraints.ts`.

## Research canyon — 3 horizontal boards, ZERO building changes

Walls / gateways / lighting untouched. Rebuild `RESEARCH_PANELS` only: drop the 2
gateway-face + 6 duplicated facade panels; mount exactly 3 large horizontal boards
(~46 × 24, aspect ~1.9, y ≈ 24) on existing **east front walls** (camera-facing side)
at three z's, one per beat:

| Board | Content | z | t |
|---|---|---|---|
| 1 | SLM Factory (idx 0) | ≈ −410 | ~0.712 |
| 2 | RL on HRM-Text (idx 1) | ≈ −522 | ~0.76 |
| 3 | SD on Qwen (idx 2) | ≈ −690 | ~0.82 |

- Widen `contentIndex` to `0|1|2`; `RESEARCH_CONTENT_RECORDS` now 3 records.
- `activeResearchPanelIds(semanticT)` picks nearest board by t.
- Add third accent palette (idx 2).
- `inspectResearchScene` panel counts derived dynamically; building readiness checks
  (files/placements) unchanged.
- Board may overhang a single facade — acceptable; confirm visually.

## Project boards — 4 boards, ~equal area (~1,500 m²), unique shapes

| Board | Group | Size (aspect) | Format |
|---|---|---|---|
| RememberMe | flip-1 | 40×37 (~square) | facade-portrait |
| OpenChinese | flip-1 | 52×29 (landscape) | facade-hero |
| RhetBench | flip-2 | 38×39 (square) | holo |
| TTT-E2E | flip-2 | 58×26 (wide) | facade-ribbon |

- `STUNT_PROJECT_PANEL_DEFINITIONS` 5→4 (order: RememberMe, OpenChinese, RhetBench,
  TTT-E2E). Reuse existing backdrop parents; buildings unchanged.
- `ART_PROFILES` sizes re-matched to new aspects (no stretch).
- Project renderer switched to shrink-to-fit (no throw on long copy).
- `inspectStuntScene` hardcodes 5→4: screens 4, backings 4, attachments 16.

## About board

Rework `aboutArt.ts` to the shared template: portrait = right-side hero; name =
headline; tagline = subtitle; the ~7-line paragraph rendered via shrink-to-fit
(replacing the 3-line-or-throw `wrapWordsByCharacters`). Enlarge bio region.

## Verification (no test suite)

`?shot=<t>&inspect` at research t = 0.712 / 0.76 / 0.82, the flip-1 / flip-2 project
beats, and the about beat, plus Playwright screenshots. Iterate sizes/positions until
each board fills its frame and reads cleanly. `npm run build` must pass (tsc strict).
