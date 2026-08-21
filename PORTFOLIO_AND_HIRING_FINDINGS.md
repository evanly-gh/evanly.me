# Portfolio & Hiring Findings — Evan Li

*Compiled 2026-08-15. Purpose: (1) capture what top tech companies actually hire for in 2025–2026 across AI Research, ML Systems, SWE/Full-Stack, PM, and Security tracks; (2) deep-dive every project in this workspace; (3) map each project to the roles it best supports, with resume-ready framing. This document is the source material for the resume rewrite.*

---

## 0. TL;DR — The Strategic Picture

**Your strongest, rarest asset is the ML-systems / inference-optimization cluster** (SD-on-Qwen3.5, SLM_Factory, RL-on-HRM-Text). Every major lab flagged inference optimization + post-training as their **rarest, best-paid, hardest-to-fill** category. Anthropic/OpenAI/NVIDIA inference-engineer postings map almost 1:1 to your speculative-decoding and quantization work.

**Your second asset is unusual breadth with real depth:** a genuinely sophisticated 3D web frontend (evanly.me), production multi-tenant backend + security engineering (KleoKlaw), agentic automation with guardrails (career-ops, KleoKlaw), CV systems integration (remember-me), and AI-safety evals (RhetBench). Very few new grads can credibly claim AI research **and** full-stack **and** security **and** founding-engineer product work.

**The market context (2026):** entry-level generalist SWE is down ~25–28% from its peak and "seniorized," but AI/ML engineering has a ~63% talent shortage and security postings are up 124% YoY. **Lean into the bifurcation** — position as AI-integrated systems/full-stack + security, not "generic new-grad SWE."

**Three highest-ROI moves (all sources converged on these):**
1. **Land 1–2 merged PRs in a major inference framework** (vLLM / SGLang / llama.cpp / TRL / verl). NVIDIA and Microsoft *name vLLM contributions as a stand-out qualification*. Your SD-on-Qwen3.5 work is the natural on-ramp.
2. **Rewrite every bullet as a quantified achievement** — pair a speed/cost metric with a quality-retention metric (e.g. "2.88× throughput at 97% of baseline accuracy").
3. **Publish the systems work as clean OSS + a rigorous writeup** framed as baseline → hypothesis → experiment → result → trade-offs (this is literally Anthropic's stated evaluation rubric).

**Honesty flags (read Part E before writing bullets):** the self-trained ResNet-50 beauty regressor **is real** — hosted on Hugging Face (`evanlyhf/scut-fbp5500-beauty`) — but it is **not wired into the remember-me app** and its model card publishes **no metrics**. Claim "trained + published," not "deployed in-app" or a specific accuracy (unless you produce one). Small accuracy notes are in Part E.

---

## PART A — What Big Tech Actually Hires For (2025–2026)

### A1. AI / ML Research & Research Engineer (Anthropic, OpenAI, DeepMind, Meta FAIR, Microsoft)

**The research/engineer line is blurred.** Anthropic: *"Engineers there do lots of research, and researchers do lots of engineering… all their papers have engineers as authors, often first author."* OpenAI uses "Member of Technical Staff" as the umbrella for both. Apply as an engineer if that's your strength.

**Credential bar varies sharply:**
- **Meta FAIR Research Scientist** = hardest: PhD + **first/last-author** papers at NeurIPS/ICML/ICLR required. (Target FAIR *Research Engineer* / MSL instead if not publishing.)
- **DeepMind** strongly prefers publications + **JAX/TPU** (not PyTorch — this is a real differentiator).
- **Anthropic / OpenAI**: deliberately *not* credential-driven. Anthropic states ~half of technical staff had no prior ML experience; "plenty never went to college." Minimum is a Bachelor's "or equivalent experience."
- **Microsoft MAI**: most degree-flexible; postings explicitly name *"LLMs, or SLMs such as Qwen, Llama or its variants"* — a direct match to your Qwen3/GGUF work.

**Skills in demand:** PyTorch (default) / JAX (DeepMind); post-training (SFT, RLHF, **DPO/PPO/GRPO**, reward modeling — "the single highest-paid technical skill in AI right now"); inference optimization (vLLM, speculative decoding/EAGLE, quantization GPTQ/AWQ/**GGUF**, CUDA/**Triton**); evals/benchmarking (Inspect, Promptfoo, LLM-as-judge design); distributed training (Megatron, ZeRO-3, Ray).

**What actually gets people hired (Anthropic, verbatim):** *"If you have done interesting independent research, written an insightful blog post, or made substantial contributions to open-source software, put that at the TOP of your resume."* Also: from-scratch implementations of foundational work; reproducing papers then extending them; merged OSS PRs into serious repos; and **mission fit** ("a brilliant engineer who treats alignment as someone else's problem is not a good fit").

**Interview reality:** Anthropic evaluates *technical depth* (a project you can defend under sustained follow-up), *empirical judgment* (how you designed an eval / interpreted a surprising result / changed course on evidence), and *collaborative impact*. Performance roles use a take-home optimizing code for a simulated accelerator; a strong submission shows "baseline behavior, measurement method, hypothesis, change, result, limitations, and next experiment." **Frame your projects exactly this way.**

**Early-career on-ramps:** OpenAI Residency (~$220K, 6 mo), Meta AI Residency, Anthropic Claude Corps Fellowship (<2 yrs experience, no degree required), **Ai2 (Allen Institute, Seattle)** pre-doctoral/postbac — geographically ideal for UW and a strong PhD bridge.

### A2. ML Systems / Infrastructure / Performance Engineering (Anthropic, OpenAI, NVIDIA, Google, Microsoft, Meta)

**This is your best-fit track.** Direct quotes from live postings:

- **Anthropic — Performance Engineer, Inference Systems** (minimum quals, verbatim): *"Hands-on performance engineering experience: profiling, roofline analysis, latency/throughput optimization, and root-cause investigation"*; *"Proficiency in Python, with the ability to read, instrument, and contribute to large production codebases you didn't write"*; *"Solid data analysis skills (SQL, pandas…) sufficient to turn raw telemetry into clear findings"*; *"Ability to communicate quantitative results clearly in writing."* Nice-to-have: *"Familiarity with GPU/TPU accelerator performance concepts (memory bandwidth, kernel overheads, quantization, collective communication). **Reasoning about these matters more than having written kernels yourself.**"* — an achievable bar from a research background. The four metrics they hold the fleet to: **throughput, latency, reliability, correctness.**
- **NVIDIA — AI Inference Performance Engineer, New College Grad 2026**: *"own the end-to-end optimization pipeline… quantization, scheduling, memory management, and distributed inference across TensorRT-LLM, SGLang, and vLLM."* "Ways to stand out": CUDA/Triton/CUTLASS; *"prior contributions to major LLM inference frameworks (e.g. vLLM)"*; optimizing for *"low-latency, resource-constrained systems or embedded AI pipelines (e.g. Jetson)"* — the last maps directly to SLM_Factory's on-device angle.
- **OpenAI** runs narrow inference roles (CUDA/Kernels, Multi-Modal, GPU Inference, Performance Optimization): *"reason from first principles about distributed systems, model inference, and hardware efficiency."*
- **Google** ML-infra clusters on TPU/XLA/JAX; responsibilities explicitly name *"speculative decoding, sparsity, quantization, LoRA."*
- **Microsoft MAI — LLM Inference**: internals of **vLLM and SGLang**, PyTorch, NVIDIA GPU kernels, Infiniband/NVLink.

**Metrics that matter (name them + absolute+relative):** TTFT, TPOT/ITL, **P99 e2e latency**, tokens/sec, GPU utilization/MFU, VRAM & KV-cache reduction, cost per 1M tokens, acceptance rate (spec decoding). Rule: not "3× speedup" but *"3× throughput, 250 ms → 80 ms p99, at 97% of baseline quality."*

**Career arc note:** vLLM itself came out of UC Berkeley Sky Computing Lab → OSS → industry/startup. That academic-systems-research → OSS-infra → industry arc is exactly the one you're already on.

### A3. New-Grad SWE / Full-Stack (Meta, Google, Amazon, Microsoft, startups)

- **New-grad reqs are deliberately language-agnostic** ("one or more of Java/Python/C++/JS" + DSA). Big tech hires juniors on fundamentals, not your specific stack. Meta UG SWE pays $176K–$290K.
- **AI-tool fluency has newly entered *minimum* quals** at Google ("Experience utilizing AI productivity tools…") and Amazon.
- **Explicit React/TypeScript requirements appear at ~SWE III / 2-yr tier**, not new-grad — but **startups want the modern stack now** (TypeScript + React/Next.js + FastAPI/NestJS + Postgres + Redis + AWS + AI-agent building) plus ownership, traded for equity + lower base.
- **The 2026 stack to demonstrate**, in priority order: TypeScript (biggest salary lever, ~$147K vs $120K median), React, **Next.js App Router/RSC**, Node/FastAPI APIs (REST fundamental, GraphQL a depth signal), **PostgreSQL/Supabase** (your Supabase XP maps directly), Docker + CI/CD (GitHub Actions), multi-layer testing (Jest + **Playwright/Cypress E2E**), LLM integration, and calibrated system design (expectation = sensible core architecture, *not* billion-user; biggest failure is **over-engineering**).
- **What gets shortlisted:** 3–5 quality **deployed** projects with live links ("the single biggest credibility upgrade"), one merged PR to a 1,000+ star repo, DevOps maturity (a `docker-compose.yml`), clean pinned READMEs. Tutorial clones and never-deployed notebooks get ignored.

### A4. APM / Early-Career PM (Google, Meta, Microsoft, Uber)

- **CS/technical degree is increasingly the baseline** — Google/Uber/Meta all name CS/engineering/technical fields first. Google APM preferred quals now include *"applying AI/ML concepts to products"* and *"leading entrepreneurial efforts."*
- **Meta RPM** is the most accessible for non-traditional/entrepreneurial backgrounds (values "career changers, entrepreneurs"; **takes no referrals** — resume + questionnaire decide). Uber APM has a **graded take-home** gate.
- **Engineer→PM framing:** lead with credibility ("you can read a codebase, estimate effort, earn engineers' trust"), then **talk the "why," not the "how"** — output → outcomes. Your **SMS startup + job-automation tools are zero-to-one products with real users**, the strongest APM credential. Metrics: DAU/MAU, adoption, retention, growth %, A/B tests.

### A5. Early-Career Security / AppSec (Amazon, Meta, Google, Microsoft)

- Every big-tech early-career security req wants: (1) CS/STEM degree, (2) **coding in Python + one of C/C++/Java/Go**, (3) demonstrated **finding/exploiting common vulns and/or threat modeling**.
- **Meta Product Security** preferred quals literally reward **CTFs, bug bounty, public research**. Microsoft names certs verbatim (**OSCP, OSWE, GPEN**). Google rewards *"building LLM-based agents for security workflows."*
- **Target Product Security / Application Security** (not SOC/GRC) — it weights coding + vuln-finding, your strength. Skills: OWASP Top 10 (2025), secure coding, STRIDE threat modeling, SAST (Semgrep/**CodeQL**), Burp/ZAP, and the fast-growing **AI/LLM security** niche (prompt injection, OWASP Top 10 for Agentic Apps).
- Signals: CTF write-ups, HackerOne/Bugcrowd VDP disclosures, HackTheBox/PortSwigger progression, a security tool side project. Certs order: Security+ → eJPT → OSCP (stretch).

---

## PART B — Project Deep-Dives

*READMEs were written and pushed to `main` for all six of your own repos. Status table in §6.*

### B1. SLM_Factory ⭐ (flagship) — `github.com/evanly-gh/SLM_Factory`
**One-liner:** An agentic pipeline that autonomously fine-tunes a phone-sized LLM for an arbitrary user task, handling task determination, hardware/quantization-constrained model selection, data curation, and a closed-loop LoRA fine-tuning search. Open-backend re-implementation of the Pioneer Agent paper, specialized to on-device Android deployment of quantized Qwen3/Qwen3.5.

**Architecture:** A **LangGraph state machine** over a single `AgentState`, two modes (cold-start / production) sharing a `curate → train → evaluate → iterate` loop with `rollback`/`escalate`/`downward_probe` branches. Global guard enforces a step cap + wall-clock budget. Pre-graph does hardware research (local Kaggle CSV → Exa fallback → LLM extraction) then filters an 18-variant model pool (Qwen3/3.5 × {Q4_K_M, Q8_0, bf16}, 0.6B–4B) gating only on *known* quantities (weight bytes fit RAM/storage), never on guessed throughput.

**Tech stack:** Python 3.11, LangGraph + SQLite checkpointer, Claude (Sonnet, 1M-ctx) as orchestrator, **Unsloth + PEFT + Transformers + PyTorch** (4-bit base + LoRA), **llama.cpp GGUF** build+inference, self-hosted **vLLM serving Qwen3.6-35B-A3B** as the sole CoT teacher/judge/synthesizer, HF datasets, Exa, Kaggle, SLURM (L40S / RTX 6000 Ada), ~200 tests.

**Hard problems solved (the impressive part):**
- **Quantization-honest evaluation** — quantized variants scored on real GGUF builds; cache key `sha1(weights_ref|quant)` (fixed a collision where Q8 silently reused Q4 files); failed measurements recorded `n/a`, never fabricated `0.0`.
- **Causal-attribution discipline** — exactly one intervention per iteration, always-from-base training, carry-forward-best-config on data rebuilds.
- **Durable multi-day runs** — SQLite-authoritative checkpointing, SLURM `USR1` checkpoint+requeue rollover, locked cross-process spend ledger (crash-loop can't re-spend), 93 GB checkpoint-leak fix.
- **Contamination firewalls** — four normalized-text layers + closed label space pinned from the eval set.
- **No-modelled-metrics purge** — removed invented per-chip decode multipliers after one was 20% off; bytes-per-parameter arithmetic confirmed accurate to +4.9%/−1.1%.
- A **200+-paper independent critique** of the source paper (`docs/PAPER.md`) identifying benchmark-contamination/eval-protocol artifacts in its headline numbers.

**Results:** BC5CDR NER span-F1 0.86 (from ~0.025 baseline), GSM8K 0.83 (from 0.67 zero-shot), per-run cost accounting (~$13 Claude for the NER run). Honest negatives too: reports "ship the base model" as a valid outcome when FT adds nothing.

**Who it impresses & why:**
- **AI/ML Research:** the joint (data, hyperparams, model-selection) search framing, failure-taxonomy-driven curriculum, and *eval-methodology hygiene* (eval-before-training, closed label space, contamination firewalls, quant-honest scoring) — plus the 200-paper critique = real research literacy.
- **ML Systems (very strong):** production-grade long-running-job engineering — durable checkpointing, signal-driven requeue, CUDA isolation, locked cost ledger, GGUF cache correctness.
- **SWE:** clean node/router separation, 200+ tests incl. kill/resume smoke tests, docs-as-ground-truth (every claim cites `path::symbol`).
- **PM:** a crisp product thesis ("fine-tune any model for any task, sized to your phone") with honest scope tracking and per-run cost accounting.
- **Security:** trusted-input-only execution sandbox, multi-layer prompt-injection/contamination defenses, crash-safe spend reservation ledger.

**Also directly maps to:** NVIDIA's "resource-constrained / embedded AI pipelines" stand-out qual; Microsoft MAI's "SLMs such as Qwen."

---

### B2. SD-on-Qwen3.5 ⭐ — `github.com/evanly-gh/SD-on-Qwen3.5`
**One-liner:** A rigorous speculative-decoding study on the Qwen3.5 family (dense 27B & MoE 35B-A3B) sweeping speculative depth k=1–6 across batch sizes 1/4/8/16, with thinking mode on/off, on 2× L40S via vLLM native MTP self-speculation.

**Architecture:** Single-file `run_experiment.py` orchestrates a vLLM OpenAI-API server (`--tensor-parallel-size 2`, bf16, `--speculative-config {num_speculative_tokens:k, method:mtp}`), drives concurrency with `AsyncOpenAI` + `asyncio.gather`, and computes TAR / mean-accepted-length by scraping Prometheus `/metrics` deltas. SLURM `submit_all.sh` maps 9 conditions to ports so they co-reside; seeded/checksummed 150-prompt dataset (GSM8K/SQuAD/HumanEval); pandas+matplotlib analysis self-joins each SD run to its matched AR baseline.

**Notable engineering & research judgment:**
- **Documented research pivot under a tooling constraint** — discovered vLLM forces Qwen3.5 drafts onto the built-in MTP head (bound to target hidden size), correctly reframed Axis 1 from draft-size to speculative depth.
- **Preemption-safe** atomic per-batch checkpoint + resume on `(prompt_id, batch_size)`.
- **Version-robust metric parsing** across vLLM counter renames (`_total` suffix stripping).
- **Correct baseline discipline** (separate dense vs MoE denominators) and a notable positive finding: **speculative decoding roughly doubles its speedup under thinking mode** (up to ~5.9× at batch 16 vs ~2.95× standard), driven by longer chain-of-thought output length and KV-cache reuse. (README corrected to this framing, commit `595f6a0`; an earlier draft mischaracterized it as a batch-utilization artifact.)

**Results (the numbers to put on your resume):** dense 27B optimum **k=4 → 2.88× throughput** (bs=1), degrading by k=6; MoE 35B-A3B beats dense at every batch, up to **2.95× at bs=16**; thinking mode ~1.5–2 pts lower acceptance. Full TAR/tok-s tables committed.

**Who it impresses & why:**
- **ML Systems (strongest):** end-to-end vLLM SD harness, tensor-parallel multi-GPU serving, Prometheus measurement, SLURM parallelization, preemption-safe resume, process-group lifecycle + port management, bundled-CUDA-vs-module conflict handling. **This is production inference-systems work — the exact profile Anthropic/NVIDIA/OpenAI inference roles want.**
- **AI/ML Research:** controlled experimental design, literature-grounded hypotheses, and intellectual honesty (reports a refuted hypothesis, discounts a confounded result).
- **SWE:** clean CLI, atomic writes, idempotent/resumable jobs, defensive error handling.

**Highest-leverage next step:** this is your best candidate for an **upstream vLLM/llama.cpp PR** — the single move that converts a research project into NVIDIA's named "contributions to major inference frameworks" qual.

---

### B3. RL-on-HRM-Text ⭐ — `github.com/evanly-gh/RL-on-HRM-Text`
**One-liner:** From-scratch two-stage post-training (LoRA **SFT → DAPO**, a decoupled-clip GRPO variant / RLVR) on `sapientinc/HRM-Text-1B` — a 1.18B model with a nested double-recurrent (H/L module) architecture + PrefixLM attention — to hill-climb the MATH benchmark.

**Why it's hard / impressive:** HRM-Text has **zero RL ecosystem support** — its recurrence + PrefixLM attention break TRL (causal-only) *and* vLLM PagedAttention (causal-only). So **both the SFT and RL loops are hand-written** on PyTorch + HF + PEFT, with correct `token_type_ids` handling for the bidirectional prefix. This demonstrates genuine understanding of GRPO/DAPO internals (group-relative advantage `(r−mean)/(std+eps)`, asymmetric clip eps_low 0.20/eps_high 0.28, dynamic sampling dropping zero-variance groups, KL-free, LoRA-merge→fresh-adapter flow) rather than calling a library.

**Engineering wins:** caught **silent data corruption** (a JSON-escaping bug had stripped valid `\boxed{}` from 17,592/20,000 SFT rows — would have zeroed every RL reward — caught by a mandatory 100%-boxed assert); **difficulty-band engineering** for RL signal (L3–5 prompts → ~4× more useful gradient groups than AIME-level); preemptible-SLURM survival (USR1 trap + self-resubmit chain on an 8–9h partition); diagnosed a benchmark-identity trap (MATH-500 48% vs full hendrycks 63.5%).

**Results:** MATH pass@1 **64.4% (base) → 64.9% (SFT) → 66.7% (DAPO)**, same engine/protocol, 800-problem eval. Genuine research finding: **RL sharpens pass@1 toward pass@k and no further; headroom shrinks with scale → ~0.1 pt ceiling at 1B** (matches the paper's own projection). Honest negative-result reporting.

**Who it impresses & why:**
- **AI/ML Research:** correct from-scratch RL math, a measured scientific result (not just a leaderboard bump), rigorous eval with leniency/numerics/benchmark-identity ablations.
- **ML Systems:** preemptible-SLURM hygiene, LoRA merge→fresh-adapter RL flow, PPO-batch logprob alignment across padding, single-GPU (H200) memory-aware design.
- **SWE/Security:** defensive data validation (the assert that caught 88% corruption), verifier robustness, reward-gaming awareness.

---

### B4. RhetBench — `github.com/evanly-gh/RhetBench`
**One-liner:** A persuasion-strategy benchmark for LLM agents (built for SWECCATHON 2026 on the Mesocosm platform): an agent must shift a scripted NPC's hidden belief within 25 turns, inferring which of 6 argument types moves that NPC — Theory-of-Mind under partial observability.

**Architecture:** `PersuasionEnv` + a **deterministic, LLM-free NPC state machine** (Gottman rapport model, fatigue, one-shot pivot signal) so the measured capability is cleanly separated from the measurement — every episode replayable from `(seed, actions)`. A 3-stage argument classifier, 24 NPC archetype configs, seeded no-duplicate scenario picker, baked baselines, FastAPI adapter, and a vanilla-JS replay viewer on GitHub Pages. Zero-dependency core (stdlib only).

**Notable:** an **eval-validity fix** — GPT-4o's "I understand your concern…" preamble misfired the CONCESSION classifier ~75% of turns; Stage-0 preamble stripping fixed it, validated over 300+ turns. Denominator-collapse guard in the persuasion score; adversarial scenario design (`contrarian_trap` with negative base shifts) to resist saturation.

**Results:** post-overhaul (harder profiles) Claude 0.40–0.60 win-rate, GPT-4o 0.29–0.56; consistent finding that models over-default to LOGICAL and lose CONCESSION-dominant scenarios.

**Who it impresses & why:**
- **AI/ML Research (evals & safety) — strongest fit:** persuasion is a named frontier-model safety risk; this is a purpose-built persuasion eval with hidden state, adaptation pressure, a defensible taxonomy vs prior work (PMIYC, PersuasionBench), reproducibility guarantees, and discrimination testing. **This is exactly the eval-design maturity Anthropic/OpenAI safety teams screen for.**
- **SWE:** clean modular architecture, deterministic state machine, seeded-RNG discipline, CI-style tests, Pages showcase pipeline.
- **PM:** clear metric taxonomy + research-gap positioning + shipped demo.
- **Security:** partial-observability adversarial design; persuasion-as-attack-surface (social-engineering) relevance.

---

### B5. evanly.me — `github.com/evanly-gh/evanly.me`
**One-liner:** A 3D "cybercity" personal site rendered as one continuous cinematic shot — page scroll drives a bike along a scripted route past diegetic portfolio content (About/Projects/Research on in-world billboards).

**Architecture & the genuinely hard graphics work:** React 19 + Three.js + React-Three-Fiber + drei + postprocessing + GSAP ScrollTrigger, Vite + strict TypeScript. Scroll → semantic progress `t` → a transactional `ProgressDirector` fans one value to bike → camera → content → fx adapters in fixed order. **Custom GLSL shaders** (water: vertex wave displacement + Fresnel + moonlight reflection; procedural window-grid emissive). **GPU instancing with material-part merging** (~14× matrix-buffer reduction). **Off-main-thread layout in a Web Worker** (~2.5 s of layout + culling, no mount freeze). Route math: centripetal Catmull-Rom spline + De Casteljau Bézier for the 90° turn + ballistic-parabola jump arcs, with arc-length reparameterization. Camera uses desired-pose + critical damping + an OBB anti-clip pass. Draco-compressed assets, GPU pre-warm to kill first-scroll hitch.

**Robustness/a11y:** WebGL2 pre-flight probe, render error boundary, `prefers-reduced-motion`, full static HTML fallback, skip-to-content.

**Who it impresses & why:**
- **SWE/Frontend (strong):** strict TS, pure/testable `world/` layer separated from rendering, Web Worker offloading, vendor chunk-splitting, graceful degradation — reads like production code, not a demo.
- **Graphics/Rendering:** custom GLSL, instancing+geometry merging, spline/Bézier/ballistic math, damped cinematic camera with collision avoidance, bloom/tone-mapping budget management.
- **PM/design sense:** strong art direction and diegetic-content storytelling — product taste.

*Note: live URL is presumed `evanly.me` (no CNAME committed to confirm). Verify and add the link prominently — a deployed 3D site is a huge credibility upgrade.*

---

### B6. remember-me — `github.com/evanly-gh/remember-me`
**One-liner:** An Expo/React Native app to remember people you meet — capture a face, auto-derive descriptive attributes via a computer-vision pipeline, and semantically search your contacts.

**Accuracy note (see Part E):** you **did** train a ResNet-50 beauty regressor — timm ResNet-50 (ImageNet-pretrained) + single-output regression head, fine-tuned on **SCUT-FBP5500** (5,500 frontal faces, 60-rater averaged 1–5 scores), predicting a continuous [1.0, 5.0] score — **published to Hugging Face at `evanlyhf/scut-fbp5500-beauty`**. However, it is **not currently wired into the remember-me app** (the running app pipeline uses 7 off-the-shelf models; the CLIP "attractive" flag was removed), and the HF card lists **no eval metrics**. So it's a legitimate standalone ML project to claim ("trained + published"), just not an integrated app feature. README updated (commit `e46d61e`).

**Architecture:** 3 tiers + Supabase. Expo RN app (camera/location/auth/theming) → Express proxy → **FastAPI CV service** that lazy-loads and orchestrates 7 analyzers in dependency order: MediaPipe landmarks, 3 demographic ViTs, SegFormer-B5 parsing, HSEmotion, OpenCV color (LAB space, trimmed-median), obstruction ViT, hair-type ViT. **Hybrid semantic search**: lexical `ilike` + 384-d MiniLM embeddings via **pgvector** `search_contacts` RPC, with exact-first ranking, dedup, and in-flight search cancellation. Dockerized for HF Spaces (2 GB RAM budget vs ~400 MB peak).

**Genuinely notable engineering:** 7-model orchestration with correct dependency ordering + lazy loading for cold-start economics; **softmax expected-value age estimation** (converts a 9-bucket classifier to a smooth estimate); LAB-space lighting-stable color analysis; **mature model curation** (removed a hallucination-prone zero-shot analyzer, kept two ~93–99% specialized ViTs) — a "less-but-reliable" judgment call.

**Who it impresses & why:**
- **ML Systems (standout):** clean 3-tier separation, lazy loading, Dockerized microservice with RAM budgeting, numpy-serialization edge handling.
- **AI/ML (CV):** integrating & reasoning about 7 heterogeneous vision models + non-trivial signal processing. *Caveat: models are off-the-shelf — frame as "integrated/orchestrated," not "trained."*
- **SWE (mobile/full-stack):** end-to-end Expo app + proxy + Python service, thoughtful UX.
- **Security/Privacy (talking points):** currently CORS `*`, "future" JWT not implemented, **public** photo bucket, stores biometric/demographic data. Frame as *"here's the hardening I'd do"* (lock CORS, enforce Supabase JWT at proxy, private bucket + signed URLs, consent/retention) — a README Privacy Note was added.

---

### B7. KleoKlaw (Founding Developer) — `github.com/SkylerY20/KleoKlaw` *(shared repo — README NOT modified, per your instruction)*
**One-liner:** A multi-tenant, SMS-driven autonomous job-application engine — a user texts in, uploads a resume once, and the system ingests postings, matches, tailors a resume, and fills + submits real ATS forms, all steered over an iMessage/SMS conversation with an LLM agent.

**Architecture:** 6-phase pipeline (onboarding → ingestion → extraction → matching → tailoring → submission) + a conversational SMS agent. **Hybrid persistence done right:** Firestore as source of truth for domain data; **Postgres/Neon reserved strictly for the transactional queue** (`FOR UPDATE SKIP LOCKED`, advisory locks for per-tenant rate caps, DLQ, CAS transitions, two-transaction claim/finalize with orphan recovery that distinguishes "already submitted" from "safe to replay"). Pydantic contracts, a state machine, six pollable workers.

**ATS automation depth (the hard part):** Greenhouse (live, real submissions, IMAP OTP auto-resolve) and Workday (live — account creation, multi-page repeating panels, typeaheads, hierarchical catalogs) fully working; Lever dry-run, Ashby paused (reputation risk), Oracle discovery. **Three-pass PII-safe autofill** (placeholder-only Pass 1 to avoid leaking PII to ATS validation endpoints; Pass 3 runs on a **local desktop agent** so durable secrets never leave the operator machine). Anti-detection via persistent stealth Chromium + humanized input models.

**AI agent:** ~15-tool manifest, tiered per-user memory (cost-capped), provider abstraction (DeepSeek→Gemini→Anthropic) with daily + per-user spend caps, and **claim-level anti-fabrication guards** (can't invent a job_id, confirm protected-class status, or answer underivable questions) — real "LLM safety in production," not a toy chatbot.

**Security:** per-user **credential vault** (PyNaCl SecretBox DEK, KEK-wrapped, audit log), Firestore rules locking PII to backend Admin SDK only, fail-closed webhook signature verification, secret-never-leaves-server Pass-3 architecture with an explicitly-documented threat-model deviation.

**Scale:** ~1,769 fast tests passing; 5,559 postings measured for extraction tuning (recall 86.1%→93.3%); Workday E2E across 50–57 provisioned tenants; 11 pilot users.

**Who it impresses & why:** **SWE/Backend (strong)** — distributed queue systems, deliberate hybrid persistence with documented trade-offs, crash-safe recovery on real serverless infra. **ML/AI** — production tool-use agent with guardrails + measured extraction recall. **PM (startup)** — end-to-end founding-dev ownership (onboarding→billing→core→retention), visible product judgment (Ashby paused, A2P→iMessage). **Security (strong)** — multi-tenant credential handling, PII-minimization in automation, applied threat modeling around a browser-automation attack surface.

---

### B8. career-ops (your fork/adaptation) — upstream `github.com/santifer/career-ops` *(git untouched; a separate `README.evan.md` was drafted locally)*
**One-liner:** You forked a draft-only, interactive job-application helper and built the entire **decision-gated, scheduled, headless auto-apply layer** the upstream deliberately omits — while preserving its "fill, never blindly submit" safety stance.

**Your contribution (authored by you per git blame):** a 6-stage pipeline (`daily-run.mjs`) — scan → parallel `claude -p` scoring workers → decision gate (`apply-decision.mjs`, pure & unit-tested; APPLY ≥3.7 / CONSIDER / SKIP with `hard_blockers` vs `hard_stops`) → Playwright submitters (`submit.py`, `submit_workday.py` — Greenhouse/Ashby/Lever/Workday) → xlsx export → status tracker, run headless from Windows Task Scheduler ~7am with per-run audit logs.

**Notable engineering:** two independent safety gates (classify on data + re-check live DOM), live-DOM abort on free-text/CAPTCHA/login-wall, idempotent replay-safe automation (run-identity UUIDs, compare-and-set tracker writes with a new exit-code-5 guard so the 7am run can't clobber a manual edit), cost-bounded LLM fan-out (spend-tier→model map: Haiku/Sonnet/Opus), a Claude Code skill router (~35 modes), a dependency-light hand-rolled OOXML xlsx encoder, and a cross-platform security-hardened test harness (**closes CodeQL command-injection alerts by construction**). Multi-language: Node + Python + Bash + Go TUI.

**Who it impresses & why:** **SWE** — production orchestration with failure isolation, atomic locked writes, deterministic artifacts, a real test suite. **AI/agentic engineering** — a **deterministic decision gate wrapping non-deterministic LLM output** (the "guardrails around a model" pattern teams want) + browser-agent automation of messy DOMs. **PM** — explicit thresholds, dry-run→armed ramp, human-in-the-loop veto, quality-over-quantity gating. **Security** — two-gate no-bypass policy, credentials in gitignored env, replay protection, CodeQL findings eliminated.

---

### B9. OpenChinese — `github.com/evanly-gh/OpenChinese` ✅ (README pushed `2bd039be`)
**One-liner:** A shipped Chinese-learning mobile app (installable APK) with a from-scratch SM-2 spaced-repetition scheduler, offline-first Supabase sync, and a personalized AI tutor powered by a JWT-gated Gemini edge function.

**Architecture:** React Native 0.81 / React 19 / Expo 54 / TypeScript, Expo Router file-based routing (4 tabs). **SM-2 SRS from scratch** (`src/algorithms/sm2.ts`): real SuperMemo-2 (interval/repetition/efactor/lapses/dueDate) with a custom 3-tier rating→grade mapping, working-set windowing, weak-card selection by ascending ease factor, and mastery graduation at interval ≥ 21. **Offline-first storage** (namespaced AsyncStorage) with clean pull-on-login / push-after-mutation cloud sync (`cloudSync.ts`), idempotent upserts keyed `user_id,card_id` (last-write-wins). **AI tutor:** `supabase/functions/gemini-chat/index.ts` (Deno) keeps `GEMINI_API_KEY` server-side, requires a Supabase JWT, calls **Gemini 2.0 Flash** with a structured JSON contract; the client system prompt is dynamically assembled from the learner's live SRS state (weakest words + active grammar) — context engineering, not a toy wrapper. TTS via expo-speech (zh-CN/zh-TW). EAS Build (APK + app-bundle), OTA via expo-updates.

**Scale/metrics:** 2,400 HSK vocab cards (HSK 1–5; HSK 6–9 are empty placeholders), 71 grammar rules, 8 vocab + 2 grammar exercise types, mixed 10–40-question tests. ~40 TS/TSX source modules.

**Who it impresses & why:**
- **SWE (mobile/full-stack):** real RN/Expo app with typed routing, gesture/reanimated swipe deck, a hand-written SRS scheduler + queueing, offline-first storage with sync + version-gated migrations, and a Deno serverless backend. End-to-end ownership.
- **AI/ML (LLM integration):** context-engineered prompting from live user state, structured JSON output contract, Gemini 2.0 Flash via a server proxy — practical, cost/latency-aware LLM productization.
- **PM:** an actually-shipped installable app with a coherent SRS + exercises + tests + AI-chat + gamification feature set — evidence of scoping and finishing.
- **Security:** correct secret handling (Gemini key server-side only; anon key the sole client secret), JWT-gated edge function, auth-scoped upserts keyed on `user_id` (RLS-ready). *Flag: relies on Supabase RLS being configured server-side (not visible in-repo).*

*Quality flag: `__tests__/sm2.test.ts` is stale — it tests old rating names and 7/9 fail against the refactored 3-tier API. Fix it if you want green CI (and to claim tested code).*

---

## PART C — Portfolio → Role Mapping & Gap Analysis

### C1. Which projects to lead with, by target role

| Target role | Lead projects | Framing angle |
|---|---|---|
| **AI/ML Research / Research Engineer** | SD-on-Qwen3.5, RL-on-HRM-Text, SLM_Factory, RhetBench | Empirical loop (hypothesis→experiment→result→trade-off); honest negative results; eval-methodology rigor. Put OSS + writeups at top. |
| **ML Systems / Inference / Performance** | SD-on-Qwen3.5, SLM_Factory, RL-on-HRM-Text, remember-me (serving) | throughput/latency/acceptance-rate + quality retention; durable jobs; SLURM; vLLM/GGUF. Name TTFT/TPOT/p99. |
| **SWE / Full-Stack** | KleoKlaw, evanly.me, career-ops, OpenChinese | Shipped products w/ live links + users; stack depth (TS/React/FastAPI/Postgres/Supabase/Docker); ownership. |
| **APM / PM** | KleoKlaw (founding dev), career-ops, OpenChinese, evanly.me | Zero-to-one products with real users; the "why"/outcome; adoption/retention metrics; product judgment calls. |
| **Security / AppSec** | KleoKlaw, career-ops, RhetBench, remember-me | Multi-tenant credential vault, PII-minimization, CodeQL hardening, threat modeling, LLM/agentic security, persuasion-as-attack-surface. |

### C2. Coverage of the "in-demand skills" checklists (what you can already claim)

- **Inference optimization:** ✅ speculative decoding (depth sweep, MTP), quantization (GGUF/Q4/Q8), vLLM serving, tensor-parallel, Prometheus perf measurement, acceptance-rate analysis. *Rare & high-value.*
- **Post-training:** ✅ SFT + GRPO/DAPO from scratch, reward/verifier design, LoRA/PEFT, difficulty-band curriculum.
- **On-device / edge ML:** ✅ SLM_Factory (hardware/quant-constrained model selection, llama.cpp GGUF, phone deployment) — matches NVIDIA "embedded/resource-constrained" qual.
- **Evals:** ✅ RhetBench (eval design, LLM-as-judge-adjacent, discrimination testing), SLM_Factory (contamination firewalls, quant-honest scoring).
- **Full-stack:** ✅ React/Three.js/TS (evanly.me), React Native/Expo/Supabase (remember-me, OpenChinese), FastAPI + Postgres/Firestore + Docker (KleoKlaw), Node/Python/Bash (career-ops).
- **Distributed/durable systems:** ✅ SLURM preemptible jobs, transactional queues, crash recovery, spend ledgers.
- **Security engineering:** ✅ credential vault/crypto, PII-minimization, CodeQL, agentic-LLM guardrails, webhook signature verification.
- **AI-tool fluency:** ✅ Claude Code as an orchestration/scoring engine (career-ops, SLM_Factory) — now a *minimum* qual at Google/Amazon.

### C3. Gaps / highest-ROI additions (converged across all three research reports)

1. **Merged OSS PR(s) in vLLM / SGLang / llama.cpp / TRL / verl** — the single highest-leverage move for ML-systems & research roles (NVIDIA/Microsoft name it explicitly). SD-on-Qwen3.5 is your on-ramp.
2. **Quantify every bullet, absolute + relative + quality retention.** Dig real numbers out of your logs/analytics.
3. **A clean public writeup** of the SD or RL work (baseline→hypothesis→experiment→result→limitations→next) — matches Anthropic's evaluation rubric verbatim.
4. **Deploy + link everything** — confirm evanly.me is live; add live links / store links for mobile apps; pin 3–5 repos with clean READMEs (now done for 6).
5. **For DeepMind specifically:** a small **JAX/TPU** project (they're not a PyTorch shop).
6. **For Security roles:** 1–2 **CTF write-ups** + a **HackerOne/Bugcrowd VDP disclosure** + a small security tool → hits Meta/Amazon preferred quals directly. Consider Security+ → eJPT.
7. **For APM:** add leadership/hackathon lines; reframe KleoKlaw/career-ops around user outcomes + growth metrics.
8. **A `docker-compose.yml` + one Playwright E2E test** on a full-stack repo reads as maturity to SWE recruiters (KleoKlaw/career-ops already have strong test culture — surface it).

---

## PART D — Resume-Ready Bullet Drafts (adapt with real numbers; never fabricate)

*Formula everyone agreed on: action verb + what you built + specific tech + quantified outcome (absolute + relative), defendable under follow-up.*

**SD-on-Qwen3.5 (systems/research):**
- *Built an end-to-end speculative-decoding benchmark harness (vLLM, tensor-parallel 2× L40S, native MTP self-speculation) sweeping speculative depth k=1–6 × batch sizes 1–16 across dense-27B and MoE-35B Qwen3.5 targets; identified k=4 as optimal, achieving 2.88× throughput on dense 27B and up to 2.95× on MoE, with Prometheus-based acceptance-rate measurement.*
- *Discovered that speculative decoding roughly doubles its speedup under thinking mode (up to 5.9× at batch 16 vs 2.95× standard), driven by longer chain-of-thought outputs and KV-cache reuse.*

**RL-on-HRM-Text (research/systems):**
- *Implemented SFT + DAPO (GRPO-variant RLVR) from scratch for a 1.18B double-recurrent PrefixLM model unsupported by TRL/vLLM, raising MATH pass@1 from 64.4%→66.7% on a fixed 800-problem eval; established that RL sharpens pass@1 toward pass@k with a ~0.1pt ceiling at 1B scale.*
- *Caught a JSON-escaping bug that had silently corrupted 88% (17,592/20,000) of SFT training labels via a mandatory format assertion, preventing a fully-zeroed reward signal.*

**SLM_Factory (systems/research/product):**
- *Built an agentic LangGraph pipeline that autonomously fine-tunes phone-sized Qwen3.5 SLMs under hardware/quantization constraints, reaching 0.86 span-F1 on BC5CDR NER (from 0.025) and 0.83 on GSM8K, with quantization-honest GGUF evaluation and durable multi-day SLURM checkpoint/requeue.*

**KleoKlaw (SWE/backend/security/founding):**
- *As Founding Developer, built a multi-tenant SMS-driven autonomous job-application engine (FastAPI, Firestore + Postgres/Neon, Playwright): a crash-safe transactional queue (FOR UPDATE SKIP LOCKED, two-phase claim/finalize, DLQ) and live ATS automation for Greenhouse & Workday, tuned extraction recall 86%→93% over 5,559 postings.*
- *Designed a per-user credential vault (PyNaCl DEK/KEK) and a three-pass PII-safe autofill keeping durable secrets on a local agent, with claim-level anti-fabrication guards on the LLM agent.*

**career-ops (SWE/agentic/security):**
- *Extended an open-source job-application tool with a decision-gated, headless auto-apply pipeline (Node + Python/Playwright, Claude Code scoring workers) wrapping non-deterministic LLM scoring in a unit-tested deterministic gate, with two independent safety checks and CodeQL command-injection findings eliminated by construction.*

**evanly.me (frontend/graphics):**
- *Built a 3D "cybercity" portfolio (React Three Fiber, custom GLSL, GSAP) rendered as one continuous scroll-driven shot, with GPU instancing + material merging (~14× buffer reduction), Web Worker layout offloading, and spline/Bézier/ballistic camera-route math.*

**remember-me (ML systems / CV — accurate framing):**
- *Built a 3-tier facial-attribute app (Expo RN, Express, FastAPI) orchestrating 7 computer-vision models (MediaPipe, ViT classifiers, SegFormer) with dependency-ordered lazy loading, plus hybrid lexical + 384-d pgvector semantic search over contacts.*

---

## PART E — Honesty Flags & Accuracy Notes (read before submitting anything)

1. **remember-me ResNet-50 — real, but standalone (not in-app).** You trained a timm ResNet-50 + regression head on **SCUT-FBP5500** (5,500 faces, 60-rater 1–5 scores → continuous [1.0,5.0] output) and published it to HF (`evanlyhf/scut-fbp5500-beauty`). **Accurate claims:** "trained a ResNet-50 for facial-beauty regression on SCUT-FBP5500 and published to Hugging Face." **Do NOT claim:** a specific accuracy/correlation (the HF card lists none) or that it's integrated into the app (it isn't — the running app uses 7 off-the-shelf CV models). **To strengthen:** run an eval on the held-out split (SCUT ResNet models typically hit ~0.87–0.90 Pearson / ~0.24 MAE), add the number to the model card, then you can quote it. No training notebook is in the repo or linked from HF — worth uploading.
2. **RL-on-HRM-Text — it's DAPO (a GRPO variant), not plain GRPO**, and the loops are custom (no TRL). Also: a presentation cheat-sheet cites a *projected* DAPO 66.4%; the committed figure shows *measured* 66.7% — use the measured number.
3. **SD-on-Qwen3.5 — the setup script (`setup/setup_env.sh`) still pins the old vLLM 0.9.2 / torch 2.5.1** stack, contradicting the realized vLLM 0.22.1 / torch 2.11 run. Reconcile if you want the repo internally consistent.
4. **RhetBench — 24 scenarios** (some in-repo docs still say 23/15). README is now correct.
5. **KleoKlaw — README was intentionally NOT modified** (shared company repo, your call). The agent had overwritten it before the redirect; I restored the original via `git restore`, so the working tree is clean and nothing was committed/pushed.
6. **career-ops — nothing committed/pushed**; a separate `README.evan.md` was drafted locally and left uncommitted (origin points to the upstream `santifer`, not your fork).
7. **OpenChinese — done** (README pushed `2bd039be`). One quality flag: `sm2.test.ts` is stale (7/9 fail against the refactored API) — fix before claiming "tested." HSK 6–9 vocab arrays are empty placeholders (only HSK 1–5 populated = 2,400 cards).
8. **evanly.me live URL unverified** (no CNAME committed) — confirm it's deployed and add the link.

---

## PART F — Deliverable Status

| Project | Owner/Repo | README | Committed & pushed | Commit |
|---|---|---|---|---|
| SLM_Factory | you (evanly-gh) | ✅ rewritten | ✅ pushed to main | `eb689f2` |
| SD-on-Qwen3.5 | you | ✅ rewritten | ✅ pushed to main | `9ad5543` |
| RL-on-HRM-Text | you | ✅ rewritten | ✅ pushed to main | `15b803b` |
| RhetBench | you | ✅ rewritten | ✅ pushed to main | `34d844f` |
| remember-me | you | ✅ rewritten (+ Privacy Note, + real ResNet-50/SCUT-FBP5500) | ✅ pushed to main | `e46d61e` |
| evanly.me | you | ✅ rewritten | ✅ pushed to main | `82bdcaf` |
| OpenChinese | you (evanly-gh) | ✅ rewritten | ✅ pushed to main | `2bd039be` |
| KleoKlaw | SkylerY20 (shared) | ⏭️ skipped (your call) | ❌ not committed | — |
| career-ops | santifer (upstream) | 📝 `README.evan.md` local only | ❌ not committed | — |
| data_io | sapientinc (3rd-party) | ⏭️ skipped (not your project) | ❌ n/a | — |

---

## PART G — Key Sources (spot-verify before quoting in applications; postings rotate)

**AI research:** Anthropic careers & Pre-training RE (greenhouse.io/anthropic), OpenAI Research Engineer + Residency, DeepMind RE postings, Meta FAIR, Microsoft Research / MAI; Ai2 (Seattle). **ML systems:** Anthropic Performance Engineer / Inference Systems (greenhouse jobs 4020350008, 5224564008, 5257650008), OpenAI inference roles, NVIDIA NCG 2026 (jobs.nvidia.com), Google TPU/XLA, Microsoft MAI LLM Inference; vLLM repo/contributors. **SWE/PM/Security:** Meta/Google/Amazon/Microsoft new-grad + APM + Product Security postings (metacareers, google careers, amazon.jobs, careers.microsoft.com), OWASP Top 10:2025, State of JS, PwC AI-skills premium. Full URL lists are preserved in the three research agent transcripts if you want them itemized.

---

## PART H — Interview Intake (answers from Evan, 2026-08-15)

**Targeting & positioning**
- **Role priority:** (1) ML roles, (2) SWE/full-stack, (3) other (security, PM, systems architecture).
- **Dream:** an AI research lab — OpenAI, Anthropic, DeepMind, etc.
- **Level to present as:** **rising junior seeking a Summer 2027 internship** (companies like the timeline). Applying now. Open to new-grad roles too (anything not freshman-exclusive); not in a MS/PhD program.
- **Work auth:** US citizen.

**Background (from resume_ai.tex + answers)**
- **UW, B.S. Computer Science & B.S. Economics, Interdisciplinary Honors, expected June 2027. GPA 3.9.** Email evanly@uw.edu. As of Aug 2026 → entering junior year.
- **Research:** Mobile Intelligence Lab, UW — the **SLM_Factory** project. Evan says PI = **Shyam Gollakota** (resume currently says "PI: Wen Cheng" for the lab and misspells "Gollupta" elsewhere — NEEDS RECONCILING, see below). Spring 2026–present.
- **No prior tech internships or jobs.** Non-tech work: Panera Bread (assoc., Jun–Dec 2023, Jun–Aug 2025), Ross (retail, Jun–Sep 2023).
- **Strongest:** Python; heavy experience with coding agents (Cursor, Claude Code, Codex — skills/context mgmt/plugins/MCPs); familiar with databases, HuggingFace Spaces, git/GitHub.
- **Links:** linkedin.com/in/evanhly · github.com/evanly-gh · HF: huggingface.co/evanlyhf · personal site on Vercel (evanly.me).

**Recognition**
- **SD-on-Qwen3.5:** presented at the CSE2 Commons end-of-year presentation (poster). Solo (CSE 493G1/599G1 Deep Learning, Spring 2026). Publishable — Evan thinks it has decent material.
- **RhetBench:** **won the hackathon, solo** (SWECCATHON 2026 — confirm exact name/date/prize).
- **RL-on-HRM-Text:** team of 5; **Evan led the RL portion** (all GPU jobs, training specifics/scripts, data curation). Course project that doubled as research.
- **SLM_Factory:** aiming to submit to conferences soon; no awards yet.
- Existing resume achievements: 2nd place Bellevue College Hackathon 2024; DubHacks Growth Track 2025; Interdisciplinary Honors; Dean's List (Aut 2025, Win 2026).
- Open to writing a paper or blog post if it helps (wants guidance).

**Per-project metrics (from answers)**
- **KleoKlaw:** ~100 real users, pre-revenue, 4 developers, Evan = **Founding Developer**, started **March 2026**. Evan implemented **basically all the ATS integrations** (the core of the app besides frontend + resume refinement).
- **career-ops:** runs it daily; WIP; no offers yet.
- **evanly.me:** live on a Vercel domain; ~1 month to build; no visitor numbers.
- **remember-me:** deployed via Expo Go + downloadable APK (not App Store); 20+ testers. **Team project — Evan was Team Lead, Husky Coding Project (UW RSO).**
- **OpenChinese:** downloadable APK, Evan uses daily; HSK 1–6 (note: repo code showed HSK 1–5 vocab populated, 6–9 empty — RECONCILE); flashcards + tests; ~10 test users.
- **SLM_Factory:** working MVP, refinements ongoing; will publish a paper. **≥ ~1 week of GPU-hours** + ~$100 API credits for testing so far; a key selling point: the pipeline is **cheap — can fine-tune a model for ~$5 in a day**.

**Logistics**
- Deliverable: rewrite resume_ai.tex now; iterative Q&A; apply XYZ method; ML-first framing for a rising-junior internship. One primary resume (ML-leaning); may spin track variants later.

### ⚠️ Open discrepancies to resolve before writing (see Round 5 questions)
1. **remember-me ResNet-50 identity conflict.** Existing resume bullet claims a *fine-tuned ResNet-50 **CelebA multi-label** classifier, 25+ attributes, ~35% F1 gain (BCE/sigmoid)* — but code analysis found that as a **plan** (`CUSTOM_ATTRIBUTE_MODEL_PLAN.md`), not implemented/integrated. The **actually-trained + HF-published** model is a different one: a **SCUT-FBP5500 beauty *regressor*** (single-output regression). Must confirm which is real and where the code/metrics live.
2. **Lab PI attribution:** resume says "Mobile Intelligence Lab, PI: Wen Cheng"; Evan says **Shyam Gollakota**. "Gollupta" is a misspelling of **Gollakota**. Need correct PI + who Wen Cheng is.
3. **TTT-E2E project** (in resume: dual-branch transformer, MAML-style TTT, ELSA emotion 45→63%) — no repo seen. Confirm it's real, get a repo/link, and its relation to the lab/SLM_Factory.
4. **"LLM Hardware Benchmarking" (Ranjay Krishna, GGUF Q4/Q8)** vs **SD-on-Qwen3.5** — are these the same body of work (benchmarking pivoted → speculative decoding) or two projects?

### Round 5/6 answers (2026-08-16) — discrepancies resolved
1. **ResNet-50 = SCUT-FBP5500 beauty regressor** (the CLIP zero-shot was a prior approach; the CelebA multi-label F1 claim was NOT built). Real, self-reported metrics: **MAE ≤ 0.27, Pearson r ≈ 0.88** (vs SOTA r=0.8997, ResNeXt-50, Liang et al. ICPR 2018). Training: timm ResNet-50 (ImageNet), 50 epochs, AdamW, linear warmup + cosine decay, EMA weights, horizontal-flip TTA, 4× RTX 6000 (PyTorch DDP), ~30 min on UW Hyak. Published to HF. → resume bullet rewritten around this (dropped the CelebA F1 claim).
2. **Lab attribution:** Mobile Intelligence Lab = the lab; **Prof. Shyam Gollakota** (faculty) + **Wen Cheng (PhD student)** advise; Evan is lead. **SLM_Factory = the project.** MAM is a *separate* project. "microLLM"/"model compression" are concepts. ("Gollupta" was a typo.)
3. **MAM = the TTT-E2E project** (repo now at `github.com/evanly-gh/MAM`, README pushed `2637997`). Verified real: genuine second-order MAML (via `higher`), dual-branch trainable+frozen module (GPT-2 + Flan-T5), 4-method harness (baseline/ICL/RAG/TTT), BLEU-4/ROUGE-L/GoEmotions/BART-MNLI metrics, RAG retrieval, ctx-scaling code. **⚠️ NOT supported by any committed logs: the "ELSA emotion 45%→63%" number and "<1 GPU-hour" — removed from the resume until Evan produces/commits the run.**
4. **SD-on-Qwen3.5 = the "LLM Hardware Benchmarking" project** (one project; benchmarking → speculative decoding). Was a CSE 493G1 (Ranjay Krishna) course project, solo — per Evan, don't mention it was a class. (Resume lists it as a solo research project; Ranjay Krishna NOT listed as advisor since it was his course, not his research group — confirm preference.)
5. **RhetBench** = SWECCATHON 2026 winner (Overall Winner + Real-World Application Track, solo) — SWECC's AI-agent benchmarking hackathon on the Mesocosm platform (late May–Jun 1 2026). Distinct from Bellevue College (2024) & DubHacks (2025).
6. **RL-on-HRM-Text:** team of 5, Evan led RL (all GPU jobs, training, data curation). Capstone (don't mention class).
7. **KleoKlaw:** 4 ATSes (Greenhouse, Workday, Lever, Ashby); **150,000+ postings ingested, 1,000+ applications submitted**; Founding Developer, 4 devs, ~100 users, started Mar 2026.
8. **evanly.me** live at https://evanly-me.vercel.app/. **Coursework to add:** ML, NLP.
9. **Positioning:** rising junior, Summer-2027 internship, ML-first; emphasize Research & Experience over Projects.

### Resume draft v1 status (resume_ai.tex) — DONE, compiles to 1 page
- Structure: Education → Research & Experience (SLM_Factory research; KleoKlaw founding dev) → Projects (SD-on-Qwen3.5, RL-on-HRM, MAM/TTT-E2E, RememberMe) → Technical Skills → Achievements. Header adds HuggingFace + Portfolio links.
- **Cut to fit 1 page:** RhetBench as a standalone project (kept as an Achievements line instead); the Panera/Ross retail Work Experience section (can re-add if wanted, but pushes to page 2); dropped font to 10pt + compressed template spacing.
- **Open items for Evan to confirm:** (a) do you have real ELSA 45→63% numbers to re-add (+ commit logs)? (b) RL-HRM term — I used "Winter 2026", confirm; (c) add beauty-regressor metrics to the HF model card so they're citable; (d) Wen Cheng full name / advisor phrasing OK? (e) list Ranjay Krishna on SD project or not? (f) KleoKlaw location = Seattle? (g) re-add retail jobs or keep cut?

### Final resume set (2026-08-16) — all compile to exactly 1 page
- **`resume_ai.tex`** — primary, ML-research/general-ML (RL date fixed to Spring 2026; SD project credits Prof. Ranjay Krishna).
- **`resume_swe.tex`** — SWE/Full-Stack (leads with KleoKlaw full-stack + adds OpenChinese, evanly.me, RememberMe; skills web-first).
- **`resume_mlsys.tex`** — ML Systems/Inference/Infra (leads with SD-on-Qwen3.5 + SLM_Factory infra + RL training infra; skills inference/systems-first).
- **`resume_security.tex`** — Security/AppSec (leads with KleoKlaw credential vault + PII-safe automation, career-ops CodeQL hardening, RhetBench adversarial, RememberMe privacy; skills security-first).
- All: 10pt, retail work experience cut, RhetBench as an Achievements line, no unverified ELSA number, ResNet correctly = SCUT-FBP5500 beauty regressor.

**HF model card updated & pushed** (`evanlyhf/scut-fbp5500-beauty`, commit `44c7768`): architecture, metrics (MAE ≤ 0.27, Pearson r ≈ 0.88 vs SOTA 0.8997), full training recipe, usage snippet, and an intended-use/limitations note — so the resume's beauty-regressor metrics are now publicly verifiable.

**Still worth doing (highest-ROI, from research):** (1) turn SD-on-Qwen3.5 into a public writeup + an upstream vLLM/llama.cpp PR (NVIDIA/Microsoft name inference-framework contributions as a stand-out qual); (2) if you re-run MAM/ELSA, commit the logs and re-add the 45→63% number; (3) publish the SD poster / SLM_Factory paper.

*— End of findings. 4 resume variants complete + HF card updated.*

---

## PART I — ATS & Keyword Optimization (research 2026-08-16)

*Goal: make the 4 resumes pass automated screens and the 6-second human scan by leading with recognizable, ATS-matchable keywords — while keeping Evan's real quantified specifics as the backing. Sources at the end of this part.*

### I1. How ATS actually work (mechanics)
- An ATS **strips all formatting** and reads a **linear top-to-bottom, left-to-right text stream**, then maps chunks to fields (name/title/dates/employer/skills). Bad formatting = **silent data loss** (content lands in the wrong field), not usually outright rejection. Newer AI layers (e.g. Greenhouse AI, Sept 2025) read the **parsed text**, so clean parsing gates everything.
- **Systems by strictness:** **Workday** (~33–41%, enterprise/Fortune 500) is the **strictest** — weights **job-title match heavily**, strict on dates, needs contact info in the body. Startups: **Ashby** (fastest-growing), **Greenhouse**, **Lever** (most forgiving but strips bold/italic in recruiter view). Big Five use their own portals. **Format to Workday's rules → safe everywhere.**
- **"75% auto-reject" is disputed** — a 2025 HR.com survey found 92% of recruiters say their ATS does NOT auto-reject on content. Keywords drive **ranking/searchability**, not automatic rejection. But missing hard-skill nouns sinks you in recruiter search.

### I2. Template verdict — Jake's Resume (what we use) is ATS-safe, with 2 watch-items
- ✅ Single column, standard headings, `\input{glyphtounicode}` + `\pdfgentounicode=1` (maps glyphs→Unicode so pdflatex text extracts cleanly), no images/icons. This is *why* it's the standard recommendation.
- ⚠️ **Watch-item 1 — the `tabular*` heading rows** (`\resumeSubheading`/`\resumeProjectHeading` use `tabular*` + `\extracolsep{\fill}`). Usually parses fine (single-row, 2-cell), but it's the one place data isn't a pure linear block. **Mitigation if needed:** replace with a plain `\textbf{Title}, Company \hfill Date` line using `\hfill`.
- ⚠️ **Watch-item 2 — no fontawesome.** Our resumes use plain-text links (good). Never add `\usepackage{fontawesome5}`/`\faIcon` — glyphs garble email/LinkedIn.
- ✅ Compile with **pdflatex** (not Xe/LuaLaTeX). **Mandatory check:** after edits, `pdftotext resume.pdf -` (or Ctrl+A/Ctrl+C into Notepad) and confirm name-first, contact intact, each entry reads Title/Company/Date/Location sensibly, skills legible.
- **Keep a `.docx` fallback** for legacy Taleo/iCIMS-heavy applications.

### I3. Keyword rules
- **Hybrid exact + semantic matching.** Exact match still wins for hard requirements. **Write named tools/langs/frameworks/titles EXACTLY** as the industry does (`React`, `Node.js`, `PostgreSQL`, `PyTorch`, `Kubernetes`); describe activities/outcomes naturally.
- **Mirror each JD's exact terms** (incl. the exact job title near the top — cited as ~10.6× more likely to interview). Target ~70–80% keyword coverage per JD.
- **Pair acronyms + spelled-out on first use:** "Natural Language Processing (NLP)", "Continuous Integration/Continuous Deployment (CI/CD)", "Parameter-Efficient Fine-Tuning (PEFT)".
- **Placement:** each key skill should appear **once in the Skills block** (exact-match credit) **and once in a bullet** (context/credibility). ~2–3 appearances per primary keyword.
- **Don't stuff** — Workday's 2026 update flags density; a "skills-adjacency" check lowers confidence for claims with no supporting nearby terms; white-text is detectable. Only claim what you can defend.

### I4. 6-second human scan → section order
- First pass is a **fit/no-fit gate** hitting name, titles, employers, dates, education, skills alignment, and the **first bullet of the top role**. Recruiters read bullet **openers**, not prose.
- **Student section order that works:** Name/contact → **Education** (grad date, GPA) → **Technical Skills** (high, so tech alignment is visible without scrolling) → **Experience** → **Projects**. Lead every entry's first bullet with a number. (36% of resumes viewed on mobile → single-column + front-loading matter.)
- **Consider moving Technical Skills ABOVE Research/Experience** on our resumes (currently it's near the bottom) so the keyword block is in the top third. ← actionable change.

### I5. XYZ method + buzzword-vs-substance
- Google formula: **"Accomplished [X], as measured by [Y], by doing [Z]."** The **Z (method)** is where exact hard-skill keywords go; X/Y give the quantified outcome. Only ~26% of candidates quantify — doing it is top-tier.
- **Balance rule:** each bullet passes two readers — skimmer sees a bolded number + recognizable tech noun **at the front**; interviewer sees a defensible specific method. Buzzwords are fine when they're the literal name of a tool/technique you used, anchored to a number. They're "fluff" only when unquantified/unsupported.
- The current resumes' failure mode (per Evan): bullets **lead with niche jargon** ("quantization-honest GGUF evaluation…", "preemption-safe harness measuring token-acceptance rate from Prometheus"). Fix = **lead with the recognized umbrella term + number, then the specific**.

### I6. Ranked keyword sets to hit
- **ML/AI (Tier 1, near-universal):** Python, Machine Learning, Deep Learning, **PyTorch**, TensorFlow, SQL, Neural Networks + exact title. (92.8% of ML JDs list Python/TF/PyTorch.)
- **ML/AI (Tier 2, 2026 baseline):** LLMs / Large Language Models, Fine-tuning, RAG, Transformers, Hugging Face, **MLOps**, Docker, Kubernetes, CI/CD, Model Deployment, Model Serving, Cloud (AWS/GCP), Vector Databases (pgvector), Data Pipelines, A/B Testing.
- **ML systems/inference (Tier 3 specialization — Evan's edge):** Inference Optimization, **Quantization (4-bit/8-bit, GPTQ/AWQ/GGUF)**, Model Compression, Knowledge Distillation, GPU/CUDA, Distributed Training (FSDP/DeepSpeed), **vLLM**, TensorRT-LLM, ONNX, KV cache, continuous batching, **speculative decoding**, **LoRA/QLoRA/PEFT**, RLHF, DPO, Prometheus/Grafana, SLURM.
- **SWE/full-stack (Tier 1):** JavaScript, **TypeScript**, **React**, **Node.js**, Python, SQL, Git, **REST/RESTful APIs**, Java. (Tier 2:) PostgreSQL, AWS, Docker, Kubernetes, CI/CD, Agile/Scrum, Next.js, Express, MongoDB, GraphQL, Microservices. Winning combo = **React + Node + TypeScript + PostgreSQL (+ Docker)**.
- **Security/AppSec (Tier 1):** OWASP Top 10, SAST, DAST, SCA, secure coding / code review, threat modeling (STRIDE), vulnerability assessment, secure SDLC/DevSecOps, penetration testing, authentication & authorization (OAuth, JWT). Named tools verbatim: **CodeQL/GitHub Advanced Security**, Semgrep, Snyk, Burp Suite, OWASP ZAP. Emerging: **OWASP Top 10 for LLMs**.

### I7. Jargon → recognized-keyword map for Evan's work (truthful re-labels)
| Real work | Lead with these recognized keywords |
|---|---|
| Speculative decoding on Qwen3.5 | **LLM inference optimization**, increased **throughput** / reduced **latency**, "draft-target speculative decoding", tokens/sec, token-acceptance rate |
| GGUF quantization (llama.cpp, Q4/Q8) | **Model quantization & compression**, "4-bit/8-bit post-training quantization (PTQ)", reduced model footprint, **on-device/edge inference** |
| LoRA fine-tuning | **Parameter-efficient fine-tuning (PEFT/LoRA)**, adapter-based, reduced training cost |
| GRPO/DAPO RL | **RL post-training with verifiable rewards (RLVR)**, "RLHF-style alignment", "policy optimization (GRPO/DAPO)". ⚠️ GRPO is NOT yet a recognized ATS keyword — pair it with RLVR/RLHF/DPO umbrella terms. |
| Agentic LangGraph pipeline | **Agentic workflows / multi-agent orchestration (LangGraph)**, tool-calling, automated data-generation/fine-tuning pipeline |
| On-device deployment | **On-device/edge ML deployment**, model serving, privacy-preserving offline inference |
| vLLM Prometheus harness | **Built evaluation/benchmarking harness**, instrumented latency/throughput (p95/p99), **vLLM**, **Prometheus** monitoring |
| Multi-tenant SMS platform, FastAPI+Postgres | **Full-stack development**, **RESTful APIs**, **Python (FastAPI)**, **relational database (PostgreSQL)**, **multi-tenant SaaS architecture** |
| Playwright automation | **browser automation**, end-to-end automation, **Playwright** |
| Credential vault (PyNaCl) | **authentication & encryption**, **cryptography**, **secrets management**, **secure coding** |
| Postgres queue (SKIP LOCKED, DLQ) | **distributed task queue**, **concurrency control**, **fault tolerance/reliability**, at-least-once processing, **scalability** |
| RN/Expo/Supabase + Gemini fn | **cross-platform mobile (React Native)**, **serverless/edge functions**, **backend-as-a-service**, **LLM/AI integration**, authentication |
| React/Three.js site | **frontend development (React)**, interactive UI / WebGL (Three.js), responsive design |
| career-ops + CodeQL | **security automation**, **static analysis (SAST) via CodeQL**, secure SDLC/DevSecOps, CI/CD security |

### I8. Strong verbs (don't repeat within a role; ~10–12 distinct per page)
- **Build/ship:** Built, Engineered, Architected, Designed, Developed, Implemented, Shipped, Launched, Prototyped.
- **Improve:** Optimized, Reduced, Accelerated, Scaled, Refactored, Migrated, Streamlined.
- **Operate:** Deployed, Automated, Containerized, Integrated, Orchestrated, Instrumented, Benchmarked.
- **ML-specific:** Trained, Fine-tuned, Quantized, Distilled, Productionized.
- **Security:** Hardened, Secured, Encrypted, Remediated, Mitigated, Threat-modeled, Audited.
- **Avoid:** Worked on, Helped, Assisted, Responsible for, Participated in.

### I9. Before → after (the exact fix for our dense bullets)
- ❌ "Built a preemption-safe benchmarking harness measuring token-acceptance rate from vLLM Prometheus metrics."
  ✅ "Built an **LLM inference-benchmarking** harness (**vLLM** + **Prometheus**) measuring speculative-decoding throughput and **p95/p99 latency**, enabling reproducible evaluation across GPU jobs."
- ❌ "Built a transactional Postgres job queue (FOR UPDATE SKIP LOCKED, two-phase claim/finalize, dead-letter recovery)."
  ✅ "Engineered a **fault-tolerant distributed task queue** on **PostgreSQL** (row-level locking + two-phase commit) guaranteeing **at-least-once processing** and automatic failure recovery across concurrent workers."
- ❌ "quantization-honest GGUF evaluation that scores quantized models on the real artifacts they would run on-device."
  ✅ "**model quantization & compression** (GGUF 4-bit) with on-device evaluation, enabling accurate **edge/on-device inference** benchmarking."

### I10. Planned resume changes from this research (to apply to all 4 .tex)
1. **Add the target job title** near the top of each variant (e.g., "Machine Learning Engineer", "Software Engineer — Full Stack", "Application Security Engineer").
2. **Move Technical Skills into the top third** (above Research/Experience) and group by layer, listing exact tool nouns.
3. **Rewrite bullets to lead with recognized keyword + number**, then the specific method (keep the real metrics as backing).
4. **Pair acronyms** (PEFT, RLVR, NLP, CI/CD) on first use.
5. Keep single-column, pdflatex, plain-text links; run the `pdftotext` parse check after edits.

### Part I sources
ATS mechanics/parsing: atscvchecker.pro, resumeoptimizerpro.com (Greenhouse), shashiworks.com, applyarc.com, jobscan.co (formatting/tables), resumemate.io, resumeadapter.com, pin.com (market share), jobaholic.app, leonstaff.com, jobshinobi.com (LaTeX/Jake's ATS), sweresume.app. Keyword/semantic: hireflow.net, passthescan.com, tailorforge.com, copysocial.co, airesume.guru. 6-second scan: inhersight.com, theinterviewguys.com, interviewpal.com, resugrow.com. XYZ: tealhq.com, sweresume.app, wonsulting.com, resumemaster.net. ML keywords/examples: BeamJobs, Teal, Resume Worded, Exponent, ResumeAdapter, Jobscan, resumeoptimizerpro, mirrorcv, 365datascience, skillenai, llm-stats.com. SWE/security keywords/examples: BeamJobs, Enhancv, Teal, Resume Worded, Kickresume, Huntr, Jobscan, ResumeAdapter, CyberInterviewPrep, Velvet Jobs, Nucamp.

### I11. APPLIED (2026-08-16) — all four resumes reworked & verified
I1–I10 applied to `resume_ai`, `resume_swe`, `resume_mlsys`, `resume_security`. Each now: (1) has a target-title headline under the name (Machine Learning Engineer | LLM & Inference Systems / Software Engineer | Full-Stack / Machine Learning Systems Engineer | LLM Inference & Infrastructure / Application Security Engineer | Product Security); (2) Technical Skills moved into the top third (right after Education); (3) bullets rewritten to lead with a recognized keyword + number, niche method pushed to the back; (4) acronyms paired on first use (PEFT/LoRA, RLVR, NLP, CI/CD, SAST, PII, JWT); GRPO/DAPO always umbrella'd under RLVR/RLHF. All compile to **exactly 1 page** with standard/consistent geometry (textheight +1.2in — an over-stretched margin on resume_ai was caught and normalized, then content trimmed properly). **ATS parse-check passed on all four** (`pdftotext`): name first line, headline second, contact/links intact and not garbled, every entry extracts Title/Company/Date sensibly, skills legible, `tabular*` headings did not scramble. Verified facts preserved; nothing fabricated; no retail section. Not committed/pushed (personal working files).

*— End of Part I. All 4 ATS-optimized resume variants complete & verified.*

---

## PART J — resume_ai revision (2026-08-18) + new facts

Applied to `resume_ai.tex` (primary ML resume; other 3 variants NOT yet updated — pending Evan's review). All compile to 1 page.

**New/corrected facts (apply to all variants when propagating):**
- **Title:** "AI Research Intern" (heading), with "Mobile Intelligence Lab, University of Washington | Advised by Prof. Shyam Gollakota & PhD student Wen Cheng" on the line below. **Wen Cheng is a PhD student (does NOT hold a PhD yet)** — never write "(Ph.D.)".
- **GPUs:** SLM_Factory / Mobile Intelligence Lab work = **2× L40S**; RL-on-HRM-Text = **2× H200**. (SD-on-Qwen3.5 = 2× L40S.)
- **SLM_Factory efficiency:** the pipeline produces a fully optimized fine-tuned model for **about $5 and ~one day of compute** (NOT "$5/day").
- **Conferences targeted:** MLSys, MobiCom 2027, MobiSys.
- **KleoKlaw:** heading = "Founding Developer, KleoKlaw" (drop "(Startup)"); include a plain-English first bullet: *"KleoKlaw lets job-seekers apply to jobs automatically by texting a chatbot that finds matching roles, tailors their resume, and submits applications on their behalf."*
- **SD thinking-mode:** legitimate positive finding (SD ~doubles its speedup under thinking mode, up to 5.9× at batch 16, from longer CoT + KV-cache reuse) — NOT an artifact. Repo README corrected (commit `595f6a0`).
- **Bug-fix bullets:** per Evan, mention bug-fixes ONLY for KleoKlaw (a team project), one best case, plain-English: *fixed a bottleneck that had stalled processing at 166,000 backlogged jobs (only ~80 processed), restoring job matching.* Removed the RL "88% of training examples" bug bullet (reframed to "difficulty-matched prompts → ~4× the useful learning signal"). Only report impressive time/scale numbers elsewhere.
- **Header:** removed the Hugging Face link; "Portfolio" → "Portfolio Website". Links now: email, LinkedIn, GitHub, Portfolio Website.
- **Leadership & Awards** (renamed from Achievements, now multiple bullets): (1) **Chief Technical Officer, SWECC** (Software Engineering Career Club, UW), Spring 2026–Present — leads the club's open-source software projects & technical infrastructure; (2) **NCFCA National Championship** — 2nd place in Lincoln-Douglas value debate AND 2nd place in Team Policy debate, 2023–2024 (national homeschool speech & debate league); (3) SWECCATHON 2026 (Overall Winner + Real-World App track, solo), Bellevue College Hackathon 2024 (2nd), DubHacks 2025, Interdisciplinary Honors, Dean's List.
- **Em dashes removed** from prose (replaced with commas/colons/sentences); en-dash date/number ranges kept.
- **MAM/TTT-E2E project was CUT from resume_ai** to keep it to 1 page (it was the only project with no headline metric on the resume; Evan prioritizes experience over projects). Can swap back if Evan prefers dropping something else.

*— End. resume_ai.tex fully revised; propagate the shared changes to resume_swe / resume_mlsys / resume_security on Evan's go-ahead.*
