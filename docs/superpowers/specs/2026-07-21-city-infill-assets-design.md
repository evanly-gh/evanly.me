# City Corner Infill and Asset Expansion

## Goal

Remove the malformed flying hovercars, restore continuous building walls around
the sparse street corner, and expand the scene with overlooked NeoCity,
Quaternius, and robot assets without obstructing roads or substantially
increasing rendering cost.

## Scene Changes

- Remove the `FlyingTraffic` system and its hovercar preloads entirely.
- Preserve the existing two road-facing building rows.
- Add a deterministic corner/infill pass for safe land in the current
  30–84 metre clearance gap between the road-facing rows and backfill district.
- Reject infill that intersects roads, sidewalks, stunt keep-clear zones,
  or an existing building footprint. Under the elevated road, use the existing
  small-building height cap.
- Keep pedestrians on validated sidewalk positions.
- Mix mostly human pedestrians with a restrained selection of small
  robot/maintenance characters. Do not add flying enemies.

## Asset Use

The processed NeoCity set contains 47 pieces. Existing structural pools use most
main towers but omit useful components including `BldgLG_A_BuildingA`, base
sections, concrete barriers, and antenna variants.

- Add `BldgLG_A_BuildingA` to appropriate structural pools.
- Use base sections only as grounded podium/infill modules.
- Use NeoCity antenna variants plus Quaternius `AC`, `AC_Stacked`,
  `Antenna_1`, `Antenna_2`, and selected sign pieces as sparse rooftop or
  facade details.
- Convert `Companion-bot`, `ReconBot`, and `MobileStorageBot` from the robot
  pack to compressed GLB files for restrained sidewalk variety.
- Continue GPU instancing repeated static models.

## Performance and Safety

- Prefer small, low-triangle assets and a limited number of new model families.
- Keep deterministic seeds so screenshots and tests are reproducible.
- Do not lower the global backfill threshold indiscriminately.
- Enforce road and sidewalk clearance at placement time.
- Avoid duplicate building footprints by requiring at least the sum of two
  placement footprint radii plus a two-metre alley between centres.

### Intentional protected-only overlap policy

Turn infill and low-base podiums are protected placements. Each is checked
against every earlier building, and later ordinary backfill is checked against
both protected roles. Ordinary backfill candidates intentionally do not reject
one another: their dense visual overlap predates this work and globally
thinning them would change the established district composition. This overlap
exception never weakens road safety; every building, protected or ordinary,
must independently pass exact projected clearance against every ground road.

## Verification

- Add layout tests proving no building enters a road or sidewalk.
- Add a density regression test covering the exterior turn around
  `x=260..360, z=-40..80`.
- Add a source-level check that flying traffic is no longer mounted.
- Run focused tests, the full test suite, TypeScript build, and live visual
  inspection from an overhead corner view and street level.
