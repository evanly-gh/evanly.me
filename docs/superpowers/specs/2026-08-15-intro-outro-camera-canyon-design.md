# Intro / outro / camera+canyon pass — design spec

Date: 2026-08-15
Status: approved, implementing

Five requested changes to the scroll-driven cyberpunk city portfolio, grouped
into three workstreams (ordered low-risk → high-risk).

## WS1 — Camera & canyon tuning (surgical)

### 1a. Longer research canyon before the bridge
The canyon straight currently runs `z = -375 → -600` (~225 m), then a 40 m lift
onto the bridge. Extend the end to `z = -740` (+140 m), preserving the 40 m lift.

Edits (all `-600` canyon-end references move to `-740`, bridge waypoints shift by
the same −140):
- `src/world/researchLayout.ts`: `RESEARCH_ROUTE.endZ` −600→−740; extend `FRONT_Z`
  tower array from 14 → 23 entries (`-378 - i*16` reaches ≈ −730) so the extension
  is not bare; re-check `GATEWAY_FRONT_INDICES` / gateway z's stay sensible.
- `src/world/researchContent.ts`: `RESEARCH_ROUTE_END_Z` −600→−740 (kept in lockstep).
- `src/world/route.ts`: canyon lerp target `-600→-740` (~line 509); `researchEnd`
  waypoint −600→−740; `researchMid` −470→−540 (re-center); `bridgeStart` −640→−780;
  `bridgeEnd` −1600→−1740 (preserve bridge length).
- `src/world/bridgeLayout.ts`: `BRIDGE_CORRIDOR.z1`, `WATER_BASIN.z1`,
  `CITY_GROUND_BOUNDS.z0` −600→−740.
- `src/choreography/scrollRemap.ts`: add a research dwell-weight interval (same
  mechanism as the existing About/Descend weights) so the longer straight does not
  ride *faster* under the same scroll budget. Section boundaries stay put.

### 1b. Camera follows the bike longer after the second jump
After the 2nd-jump landing (t≈0.64) the chase hands off to low canyon-entry frames
by t≈0.703 while FOV whips 54→66 — reads as "rushes ahead / rapid angle switch."
Fix in `src/choreography/productionCameraRig.ts`:
- Add 2–3 more `chaseKey` frames that stay locked behind the bike through ~t=0.71.
- Gentle FOV ramp (cap the per-key delta).
- Push the hard low-canyon dive later (start the absolute `research-entry` frames
  ~0.71 instead of 0.703).
- Widen the descend scroll-dwell window in `scrollRemap.ts` to match.

### 1c. Elevation spike before About
Caused by `intro-about-approach` (t=0.128) bumping the *relative* chase height to 12
(neighbors 10), then dropping into absolute Y=7–9 hold frames. Fix in
`productionCameraRig.ts`: drop that key's height 12→10 and smooth the
relative→absolute Y handoff (t≈0.15→0.166) so effective camera Y is continuous.

## WS2 — Cinematic intro (loading → title → START → drive-in)

State machine in `src/scroll/ScrollExperience.tsx`: `loading → title → driving →
live`. The GSAP scroll runtime is **not created until `live`**, so nothing scrolls
during loading/title.

- **loading**: cyberpunk **pixel loading bar** driven by the existing
  `readyCityZones` / `cityLoadingProgress` signal (replaces the plain `<progress>`).
- **title**: fade in to a **close-up of the bike leaning against a building** near
  the start (facade ≈ (−420, 0, ±17)). Requires (a) a bespoke close-up intro camera
  pose, (b) the bike parked with a lean pose, (c) a **pixel-styled START button** +
  title overlay.
- **bike control**: add `setManualState(pos, quat, pose)` to `BikeRiderHandle`
  (`src/components/three/BikeRider.tsx`) and gate the director's bike adapter
  (`src/components/three/ProductionDirector.tsx`) while intro is active. The bike is
  stateless in `t`, so manual placement is clean. Trails disabled during intro.
- **driving**: on START, a scripted animation drives the bike from the lean spot to
  the exact `t=0` start `(−420,0,0)`, straightening lean + spinning wheels, while the
  camera eases from the close-up to the `t=0` chase pose (`rig.sample(0)`).
- **live**: on arrival, enable scroll; store is already raw 0 / semantic 0 so handoff
  is seamless.

## WS3 — Moon → static page outro + cyberpunk static page

Per the clarified direction: a slow tilt-up off the moon into a banner **identical to
the top of the scrollable HTML page**, then a traditional page scroll.

- **Restyle `src/scroll/NativePortfolio.tsx`** with the cyberpunk-pixel theme
  (pixel/mono type, neon borders, scanline accents) reusing all real `RESUME`
  content; render it **visible** in normal document flow **below** the pinned ride
  (today it is 1px-clipped in immersive mode). New CSS in `ScrollExperience.css`.
- **Finale tilt-up**: extend the finale camera (`productionCameraRig.ts` finale
  pose / `src/world/finaleRender.ts`) so the last window (t≈0.93→1.0) slowly rotates
  and tilts up off the moon toward empty sky.
- **Banner cross-fade**: a DOM hero-banner overlay — the **same markup/CSS as the
  static page hero** — fades in over the canvas during the tilt-up as the canvas
  dims (imperative opacity from the progress store, same pattern as `IntroTitle`).
  When the pin releases at t=1, the user is already at the top of the visible static
  page; because the banner *is* the page hero, the transition is seamless. Then the
  traditional page scrolls normally.

## Ordering & verification
Implement WS1 → WS2 → WS3. Verify each visually via the existing harness
(`?shot=<t>&inspect`, `?city&inspect`, `?gallery`) plus `tsc --noEmit` and
`npm run build` between workstreams. No automated test suite exists.

## Decisions locked (no further questions)
- Canyon extension = +140 m.
- Static page = below the ride in one continuous scroll document (not a route swap).
- Intro start control = pixel-styled START button.
- Outro = slow camera tilt-up into a banner identical to the static page hero.
