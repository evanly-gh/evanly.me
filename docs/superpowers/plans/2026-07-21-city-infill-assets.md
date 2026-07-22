# City Infill and Asset Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove malformed flying traffic, rebuild the sparse turn as a continuous building canyon, and add curated NeoCity and robot/Quaternius variety.

**Architecture:** Keep city and crowd placement deterministic and testable in pure world-layout modules. Render repeated GLB assets through the existing instancing path, while keeping characters as cloned scene objects. Add only targeted turn samples and curated models instead of globally increasing density.

**Tech Stack:** TypeScript, React Three Fiber, Three.js, Vitest, obj2gltf, glTF Transform, DRACO, WebP.

## Global Constraints

- Preserve all existing uncommitted road-clearance and elevated-highway fixes.
- No road or sidewalk intersections.
- Keep the stunt `KEEP_CLEAR` region empty.
- Use deterministic seeds.
- Do not add flying enemies or replacement flying traffic.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Remove malformed flying traffic

**Files:**
- Modify: `src/components/three/City.tsx`
- Test: `test/cityScene.test.ts`

**Interfaces:**
- Consumes: the `City` scene component.
- Produces: a city scene with no `FlyingTraffic`, `FlyCar`, or hovercar preload.

- [ ] **Step 1: Write the failing source regression test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const citySource = readFileSync(
  new URL('../src/components/three/City.tsx', import.meta.url),
  'utf8',
);

describe('City scene', () => {
  it('does not mount malformed flying traffic', () => {
    expect(citySource).not.toContain('function FlyingTraffic');
    expect(citySource).not.toContain('<FlyingTraffic');
    expect(citySource).not.toContain('veh_coupe.glb');
  });
});
```

- [ ] **Step 2: Run the test and confirm the current traffic fails it**

Run: `npm test -- test/cityScene.test.ts`

Expected: FAIL because `City.tsx` still contains `FlyingTraffic`.

- [ ] **Step 3: Remove the traffic implementation**

Delete `V3`, `VEHICLES`, `FlyCar`, `FlyingTraffic`, their preload calls, and the
`<FlyingTraffic />` scene mount. Keep pedestrian and street-dressing code.

- [ ] **Step 4: Verify the regression test**

Run: `npm test -- test/cityScene.test.ts`

Expected: PASS.

---

### Task 2: Add curve-aware turn infill with layout regression tests

**Files:**
- Modify: `src/world/cityLayout.ts`
- Test: `test/cityLayout.test.ts`

**Interfaces:**
- Produces: `placementCenter(p: Placement): { x: number; z: number }`.
- Produces: `buildCityLayout(seed?: number): Placement[]` with at least eight
  rendered centres in `x=260..360, z=-40..80`.

- [ ] **Step 1: Write failing deterministic, clearance, and density tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildCityLayout, placementCenter } from '../src/world/cityLayout';
import { groundRoadClearance, keepClear } from '../src/world/roads';

describe('city layout', () => {
  it('is deterministic', () => {
    expect(buildCityLayout(20260720)).toEqual(buildCityLayout(20260720));
  });

  it('keeps every building outside roads and sidewalks', () => {
    for (const p of buildCityLayout()) {
      const c = placementCenter(p);
      const foot = p.foot ?? 0;
      expect(groundRoadClearance(c.x, c.z)).toBeGreaterThanOrEqual(foot + 10);
      expect(keepClear(c.x, c.z)).toBe(false);
    }
  });

  it('fills the exterior of the main turn', () => {
    const corner = buildCityLayout()
      .map(placementCenter)
      .filter((p) => p.x >= 260 && p.x <= 360 && p.z >= -40 && p.z <= 80);
    expect(corner.length).toBeGreaterThanOrEqual(8);
  });

  it('uses the overlooked BuildingA tower section', () => {
    expect(buildCityLayout().some((p) =>
      p.file.endsWith('KB3D_NEC_BldgLG_A_BuildingA.glb'),
    )).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm the corner-density assertion fails**

Run: `npm test -- test/cityLayout.test.ts`

Expected: FAIL with corner count `4`, below the required `8`.

- [ ] **Step 3: Export the rendered-centre helper**

```ts
export function placementCenter(p: Placement): { x: number; z: number } {
  const foot = p.foot ?? 0;
  return {
    x: p.position[0] + (p.outDir?.[0] ?? 0) * foot,
    z: p.position[2] + (p.outDir?.[1] ?? 0) * foot,
  };
}
```

- [ ] **Step 4: Add the unused narrow tower to the medium pool**

Add `${P}BldgLG_A_BuildingA` to `MID`. It is approximately
`13 × 42 × 18 m`, making it suitable for filling tight turn gaps.

- [ ] **Step 5: Add a collision-aware dense turn pass**

After the normal front row, resample the road at 8 m spacing. Restrict candidates
to road samples around the turn (`x=190..285`, `z=-65..35`), use a 10 m
footprint and the existing `anchorA`, and attempt both road sides without random
skips. Before appending, reject a candidate if its rendered centre is within
`candidateFoot + existingFoot + 2` metres of an existing centre. Retain
`groundRoadClearance >= foot + SIDEWALK + GAP` and `keepClear === false`.

```ts
const overlaps = (cx: number, cz: number, foot: number): boolean =>
  out.some((existing) => {
    const c = placementCenter(existing);
    return Math.hypot(cx - c.x, cz - c.z) <
      foot + (existing.foot ?? 0) + 2;
  });

for (const e of groundRoadEdgePoints(8)) {
  const atTurn = e.pos.x >= 190 && e.pos.x <= 285 &&
    e.pos.z >= -65 && e.pos.z <= 35;
  if (!atTurn) continue;
  for (const side of [1, -1] as const) {
    place(e.pos, e.bin, e.tan, side, e.hw, anchorA, MID, 10, true);
  }
}
```

Extend the local `place` helper with an `avoidOverlap = false` parameter and use
`overlaps()` only for this pass.

- [ ] **Step 6: Run focused and full layout tests**

Run: `npm test -- test/cityLayout.test.ts test/route.test.ts`

Expected: PASS with at least eight corner buildings and no clearance failures.

---

### Task 3: Expand the offline asset processor

**Files:**
- Modify: `tools/process-props.mjs`
- Modify: `test/pipeline.test.ts`
- Generate locally: `public/models/props/robot_companion.glb`
- Generate locally: `public/models/props/robot_recon.glb`
- Generate locally: `public/models/props/robot_storage.glb`
- Generate locally: `public/models/props/quat_ac.glb`
- Generate locally: `public/models/props/quat_ac_stacked.glb`
- Generate locally: `public/models/props/quat_antenna_1.glb`
- Generate locally: `public/models/props/quat_antenna_2.glb`
- Generate locally: `public/models/props/quat_sign_1.glb`
- Generate locally: `public/models/props/quat_sign_3.glb`

**Interfaces:**
- Produces: `public/models/props/manifest.json` entries for nine curated assets.
- Keeps: `ped_char`.
- Removes: hovercar jobs from future processor runs.

- [ ] **Step 1: Add a failing processor-registry test**

Append to `test/pipeline.test.ts`:

```ts
const propProcessor = readFileSync(
  new URL('../tools/process-props.mjs', import.meta.url),
  'utf8',
);

it('registers curated ground characters and service props only', () => {
  for (const name of [
    'robot_companion',
    'robot_recon',
    'robot_storage',
    'quat_ac',
    'quat_ac_stacked',
    'quat_antenna_1',
    'quat_antenna_2',
    'quat_sign_1',
    'quat_sign_3',
  ]) {
    expect(propProcessor).toContain(`name: '${name}'`);
  }
  expect(propProcessor).not.toContain(`name: 'veh_coupe'`);
  expect(propProcessor).not.toContain(`name: 'veh_sedan'`);
});
```

- [ ] **Step 2: Run the test and confirm missing jobs fail it**

Run: `npm test -- test/pipeline.test.ts`

Expected: FAIL on `robot_companion`.

- [ ] **Step 3: Replace vehicle jobs with curated OBJ and glTF jobs**

Use exact source paths below:

```js
const ROBOTS = path.join(CY, 'Cyber Robots');
const PLATFORM = path.join(QUAT, 'Platforms');

const JOBS = [
  { name: 'ped_char', obj: path.join(QUAT, 'Character', 'Character.obj') },
  { name: 'robot_companion', obj: path.join(ROBOTS, 'Companion-bot', 'Package', 'Companion-bot.obj') },
  { name: 'robot_recon', obj: path.join(ROBOTS, 'ReconBot', 'Package', 'ReconBot.obj') },
  { name: 'robot_storage', obj: path.join(ROBOTS, 'MobileStorageBot', 'Package', 'MobileStorageBot.obj') },
  { name: 'quat_ac', gltf: path.join(PLATFORM, 'AC.gltf') },
  { name: 'quat_ac_stacked', gltf: path.join(PLATFORM, 'AC_Stacked.gltf') },
  { name: 'quat_antenna_1', gltf: path.join(PLATFORM, 'Antenna_1.gltf') },
  { name: 'quat_antenna_2', gltf: path.join(PLATFORM, 'Antenna_2.gltf') },
  { name: 'quat_sign_1', gltf: path.join(PLATFORM, 'Sign_1.gltf') },
  { name: 'quat_sign_3', gltf: path.join(PLATFORM, 'Sign_3.gltf') },
];
```

For glTF jobs, load with `io.read(job.gltf)`; for OBJ jobs, keep the existing
`obj2gltf` path. Run the same prune, weld, dedup, WebP, and DRACO transforms.

- [ ] **Step 4: Verify the registry test**

Run: `npm test -- test/pipeline.test.ts`

Expected: PASS.

- [ ] **Step 5: Generate and validate the assets**

Run: `node tools/process-props.mjs --res=512`

Expected: ten successful outputs including `ped_char`; no output may be `0 KB`
or report `FAILED`.

Run:

```powershell
Get-Content public/models/props/manifest.json
Get-ChildItem public/models/props/*.glb | Select-Object Name,Length
```

Expected: all nine new files exist and are larger than 2 KB.

---

### Task 4: Extract deterministic mixed crowd placement

**Files:**
- Create: `src/world/crowdLayout.ts`
- Create: `test/crowdLayout.test.ts`
- Modify: `src/components/three/City.tsx`

**Interfaces:**
- Produces: `buildCrowdLayout(seed?: number): CrowdLayout`.
- `CrowdLayout` contains `humans: CrowdSpot[]` and `robots: RobotSpot[]`.
- `RobotSpot.file` is one of the three converted robot GLBs.

- [ ] **Step 1: Write failing crowd-layout tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildCrowdLayout } from '../src/world/crowdLayout';
import { groundRoadClearance } from '../src/world/roads';

describe('crowd layout', () => {
  it('is deterministic and keeps everyone on sidewalks', () => {
    const a = buildCrowdLayout(4242);
    expect(a).toEqual(buildCrowdLayout(4242));
    for (const p of [...a.humans, ...a.robots]) {
      expect(groundRoadClearance(p.x, p.z)).toBeGreaterThanOrEqual(1);
      expect(groundRoadClearance(p.x, p.z)).toBeLessThanOrEqual(9);
    }
  });

  it('keeps robots a restrained minority', () => {
    const { humans, robots } = buildCrowdLayout();
    expect(robots.length).toBeGreaterThanOrEqual(6);
    expect(robots.length).toBeLessThan(humans.length / 4);
    expect(new Set(robots.map((p) => p.file)).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `npm test -- test/crowdLayout.test.ts`

Expected: FAIL because `src/world/crowdLayout.ts` does not exist.

- [ ] **Step 3: Move sidewalk placement into the pure module**

Define:

```ts
export interface CrowdSpot { x: number; z: number; r: number }
export interface RobotSpot extends CrowdSpot { file: string }
export interface CrowdLayout {
  humans: CrowdSpot[];
  robots: RobotSpot[];
}

export const ROBOT_FILES = [
  'props/robot_companion.glb',
  'props/robot_recon.glb',
  'props/robot_storage.glb',
] as const;
```

Move the current 6 m sidewalk sampling into `buildCrowdLayout`. Keep candidates
only where clearance is `1..9`. Assign approximately one robot for every twelve
accepted human candidates, cycling deterministically through all three files.

- [ ] **Step 4: Render humans and robots**

Update `Pedestrians` to consume `buildCrowdLayout()`. Retain the current human
material and height normalization. Add a `RobotCharacter` child component that
loads one `RobotSpot.file`, clones the scene, normalizes it to `1.2–1.8 m`, and
uses dark metallic materials with restrained cyan or amber emissive accents.
Preload the three `ROBOT_FILES`. Do not animate or place robots in roads.

- [ ] **Step 5: Verify crowd tests**

Run: `npm test -- test/crowdLayout.test.ts`

Expected: PASS.

---

### Task 5: Add overlooked building and service assets

**Files:**
- Modify: `src/world/cityLayout.ts`
- Modify: `test/cityLayout.test.ts`

**Interfaces:**
- `buildCityLayout` uses `BldgLG_A_BuildingA`.
- `buildCityLayout` uses NeoCity base sections as occasional low-rise podiums.
- `buildProps` returns sparse `props/quat_*` service placements beyond the
  sidewalk.

- [ ] **Step 1: Add a failing service-asset test**

```ts
import { buildProps } from '../src/world/cityLayout';

it('uses curated Quaternius service assets behind sidewalks', () => {
  const service = buildProps().filter((p) => p.file.startsWith('props/quat_'));
  expect(new Set(service.map((p) => p.file))).toEqual(new Set([
    'props/quat_ac.glb',
    'props/quat_ac_stacked.glb',
    'props/quat_antenna_1.glb',
    'props/quat_antenna_2.glb',
    'props/quat_sign_1.glb',
    'props/quat_sign_3.glb',
  ]));
  for (const p of service) {
    expect(groundRoadClearance(p.position[0], p.position[2]))
      .toBeGreaterThanOrEqual(10);
  }
});

it('uses NeoCity base sections as low-rise podiums', () => {
  const files = new Set(buildCityLayout().map((p) => p.file));
  expect(files.has('neocity/KB3D_NEC_BldgLG_C_Base.glb')).toBe(true);
  expect(files.has('neocity/KB3D_NEC_BldgMD_A_Base.glb')).toBe(true);
});
```

- [ ] **Step 2: Run the test and confirm no `quat_*` props exist**

Run: `npm test -- test/cityLayout.test.ts`

Expected: FAIL with an empty service-file set.

- [ ] **Step 3: Add a sparse service-placement pass**

Create a full-path pool:

```ts
const SERVICE = [
  'props/quat_ac.glb',
  'props/quat_ac_stacked.glb',
  'props/quat_antenna_1.glb',
  'props/quat_antenna_2.glb',
  'props/quat_sign_1.glb',
  'props/quat_sign_3.glb',
];
```

Add a `LOW_RISE` pool containing `BldgLG_C_Base` and `BldgMD_A_Base`; select it
for 10% of safe backfill placements with the existing `FILL_FOOT` cap.

Sample ground-road edges every 48 m, skip 65% deterministically, and place each
accepted item at `hw + 11.5..14 m` so it sits behind the sidewalk near a
building facade. Require `groundRoadClearance >= 10` and `keepClear === false`.
Cycle through the six service files before repeating so every asset appears.

- [ ] **Step 4: Verify city-layout tests**

Run: `npm test -- test/cityLayout.test.ts`

Expected: PASS.

---

### Task 6: Full verification and visual review

**Files:**
- Verify: all files above.

- [ ] **Step 1: Run lints on edited TypeScript files**

Use IDE lint diagnostics for:

```text
src/components/three/City.tsx
src/world/cityLayout.ts
src/world/crowdLayout.ts
test/cityScene.test.ts
test/cityLayout.test.ts
test/crowdLayout.test.ts
test/pipeline.test.ts
```

Expected: no new diagnostics.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 4: Verify the live scene**

Open `http://localhost:5173/?freecam` and inspect:

1. Overhead exterior turn: continuous building wall around
   `x=260..360, z=-40..80`.
2. Street level: no building, person, robot, AC, or antenna enters a lane.
3. Crowd: humans dominate; three robot types appear sparsely on sidewalks.
4. Sky: no hovercars or stingray-shaped geometry remains.
5. Stunt and elevated-road zones: previous clearance fixes remain intact.

- [ ] **Step 5: Review the final diff without committing**

Run: `git status --short` and
`git diff -- src/components/three/City.tsx src/world/cityLayout.ts src/world/crowdLayout.ts tools/process-props.mjs test`.

Expected: only scoped source, tests, generated-local assets, and approved docs
are changed. Do not commit unless the user asks.
