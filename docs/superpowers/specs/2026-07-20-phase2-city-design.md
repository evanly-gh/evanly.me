# Phase 2 — City (Attempt 3)

> Design doc for Phase 2 of Evan Li's scroll-driven cyberpunk portfolio.
> Scope: assemble the **static city landscape** the bike will later ride
> through — route spline, road, building placement from the signed-off KitBash
> pieces, the Shibuya set-piece, ramps/scaffold/bridge, far-field skyline +
> moon, and light traffic/crowds. Verified by flying around with `?freecam`.
>
> **DRAFT — written overnight, pending Evan's review.** Parent context:
> `HANDOFF.md` (route/content/set-pieces are already approved there) and the
> Phase 1 spec/plan. Phase 1 (assets) is complete and committed; this phase is
> gated on Evan's visual sign-off of the assets (`?viewer`).

---

## Goals
1. A **route spline** (ported pure math) mapping scroll‑t → world position +
   orientation, with named zones.
2. A **road** mesh swept along the route (banking through the turn/ramps).
3. **Buildings placed** along the road from the 47 signed-off KitBash pieces,
   forming continuous neon walls, art-directed (not random), with a minimum
   road-clearance clamp.
4. The **set-pieces**: Shibuya 90° crossing, ramp→scaffold→ramp, descent, and
   the finale bridge rising toward a moon.
5. **Far-field skyline** silhouettes + **moon** for depth without full cost.
6. Light **traffic / crowds / metro** dressing.
7. `?freecam` fly-around inspection tool; visual sign-off on the static city.

## Non-goals (deferred)
- Bike-on-route choreography + scroll wiring (Phase 3).
- Camera keys / content-display placement (Phase 4).
- DOM sections, nav, mobile, deploy (Phase 5).
- Final perf pass (Phase 5) — but instancing is designed in from the start here
  because the city is the heaviest scene.

---

## Ported math (framework-agnostic, from `cybersite`, "port the LOGIC")
Per the handoff these are correct + tested; port the math, wrap in R3F hooks.
- `src/world/route.ts` ← cybersite `src/world/route.ts` — waypoint spline,
  semantic‑t → arc-length remap, `sampleRoute(t)`, `roadFrame(t)`, `ZONES`.
  The waypoint coordinates encode the route Evan approved.
- `src/viewer/freecam` ← cybersite `src/viewer/freecam.ts` — PointerLock WASD
  fly-cam + FX toggles, exposed as `?freecam`.
- (Phase 3 will also port `bikePath.ts`, `cameraRig.ts`.)

Do NOT port `cityLayout.ts` / `streets.ts` — the handoff says redo placement
with art-directed results.

## Route + zones (approved; from HANDOFF)
```
ZONE            t-range     path
intro/cruise    0.00–0.12   straight, pure driving
about           0.12–0.28   straight boulevard, About content
buffer/turn     0.28–0.36   90° RIGHT at Shibuya crossing
projects-ramp1  0.36–0.46   ramp up, backflip 1 (2 big projects, slow-mo)
scaffold-ride   0.46–0.52   land on building scaffolding
projects-ramp2  0.52–0.62   ramp off scaffold, backflip 2 (3 small projects)
descend         0.62–0.68   ramp back down to road
research        0.68–0.84   straight ground strip, low cam looking UP
buffer/lift     0.84–0.89   road rises onto bridge
bridge/finale   0.89–1.00   bridge toward moon, camera pulls back
```
Buffer beats between zones so transitions ease, never snap.

---

## Architecture
- Declarative R3F. Each building is a component `<KitPiece name pos rot />`
  reading the manifest; near-identical repeats use `<Instances>` /
  `InstancedMesh` (drei) so the draw-call budget survives a dense city.
- A hand-authored **layout module** `src/world/cityLayout.ts` (new, not the
  ported one): an array of `{ piece, position, rotation, scale, lod }` produced
  by placement helpers that walk `sampleRoute`/`roadFrame` and drop building
  rows flanking the road with a clearance clamp (regression magnet per handoff
  lesson #7 — clamp + test from the start).
- **LOD**: near-camera hero rows use full pieces; far rows use the smaller /
  harder-decimated pieces or flat billboard silhouettes.
- Loading: a proper loading screen (drei `useProgress`) — assets total ~88 MB.

## Repo additions
```
src/world/
  route.ts            # ported spline + ZONES + sampleRoute/roadFrame
  road.ts             # road cross-section + sweep geometry along route
  cityLayout.ts       # NEW hand-authored placement (piece,pos,rot,scale,lod)
  setpieces.ts        # Shibuya crossing, ramps, scaffold, bridge
  skyline.ts          # far-field silhouettes + moon
  props.ts            # traffic / crowds / metro instancing
src/components/three/
  KitPiece.tsx        # loads a manifest piece (useGLTF, DRACO), emissive tune
  City.tsx            # composes route+road+buildings+setpieces+skyline
  Freecam.tsx         # ?freecam fly-around (ported)
src/main.tsx          # add ?freecam / ?city route switches
test/
  route.test.ts       # determinism + monotone arc-length + zone coverage
  clearance.test.ts   # no building intrudes the road corridor
```

## Palette / lighting
Reuse `theme.ts`. City glows use magenta/amber/teal/violet; **cyan stays
bike-reserved**. Bloom/exposure baseline from Phase 1 (`LIGHTING`), retuned in
`?freecam` against the assembled city (bloom interacts nonlinearly — handoff
lesson #3).

## Sign-off gate (end of Phase 2)
Phase 3 does not start until:
1. Route spline deterministic + zones cover t∈[0,1]; tests pass.
2. Road follows the route with correct banking through turn/ramps/bridge.
3. Buildings form continuous art-directed walls; no road intrusions (clamp
   test passes); draw calls within budget via instancing.
4. Shibuya, ramps/scaffold, descent, bridge+moon all read from `?freecam`.
5. Far-field skyline + moon give depth.
6. Evan signs off on the static city in `?freecam`.

## Open items
- Exact building→zone mapping (which of the 47 pieces line each zone) — art
  direction pass in `?freecam`.
- Instancing vs texture-atlas for far-field (perf; may pull KTX2 forward).
- Scaffold geometry: KitBash has no scaffold piece — build procedurally or
  repurpose `BldgSM` structural bits.
