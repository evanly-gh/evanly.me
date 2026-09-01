import { ZONES } from '../world/route';
import {
  STUNT_FLIP_TIMINGS,
  type StuntFlipTiming,
} from './stuntTiming';

export interface ScrollRemapKey {
  raw: number;
  semantic: number;
}

export type SemanticInterval = readonly [number, number];

const ORDINARY_WEIGHT = 1;
// Per-scroll pacing of the flip apex. This used to be 3.5 — a deliberate 3.5×
// slow-motion dwell over the middle of each flip — but that made the jump read as
// non-uniform under the finger: the bike advanced normally, crawled at the apex,
// then sped back up. Set to 1 so the whole airborne arc (position AND the linear
// flip rotation) advances at a constant rate per scroll. Bump toward ~1.5 if a
// hint of apex drama is wanted back.
export const FLIP_APEX_SCROLL_WEIGHT = 1;
export const FLIP_APEX_DWELL_FRACTION = 0.4;

export type ScrollZoneMap = Readonly<
  Record<string, readonly [number, number]>
> & {
  readonly ramp1: readonly [number, number];
  readonly ramp2: readonly [number, number];
};

export interface ScrollRemap {
  readonly keys: readonly ScrollRemapKey[];
  readonly apexIntervals: readonly SemanticInterval[];
  remapScroll(raw: number): number;
  rawForSemantic(semanticT: number): number;
}

export interface SemanticScrollWeight {
  interval: SemanticInterval;
  weight: number;
}

function interpolate(
  value: number,
  keys: readonly ScrollRemapKey[],
  input: 'raw' | 'semantic',
  output: 'raw' | 'semantic',
): number {
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped === 0) return 0;
  if (clamped === 1) return 1;

  for (let index = 1; index < keys.length; index += 1) {
    const lower = keys[index - 1];
    const upper = keys[index];
    if (clamped <= upper[input]) {
      const fraction =
        (clamped - lower[input]) / (upper[input] - lower[input]);
      return lower[output] + fraction * (upper[output] - lower[output]);
    }
  }
  return 1;
}

function validateZones(zones: ScrollZoneMap): SemanticInterval[] {
  const ranges = Object.values(zones)
    .map(([start, end]) => [start, end] as const)
    .sort((left, right) => left[0] - right[0]);
  if (ranges.length === 0 || ranges[0][0] !== 0 || ranges.at(-1)?.[1] !== 1) {
    throw new Error('Scroll zones must tile exact endpoints 0 and 1');
  }
  for (let index = 0; index < ranges.length; index += 1) {
    const [start, end] = ranges[index];
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > 1 ||
      start >= end
    ) {
      throw new Error(`Invalid scroll zone ${start}..${end}`);
    }
    if (index > 0 && start !== ranges[index - 1][1]) {
      throw new Error('Scroll zones must tile [0,1] contiguously');
    }
  }
  return ranges;
}

function apexInterval(
  zone: SemanticInterval,
  timing?: Readonly<StuntFlipTiming>,
): SemanticInterval {
  if (timing) {
    const halfDwell = (
      timing.landing - timing.lip
    ) * FLIP_APEX_DWELL_FRACTION / 2;
    return Object.freeze([
      Math.max(timing.lip, timing.apex - halfDwell),
      Math.min(timing.landing, timing.apex + halfDwell),
    ]);
  }
  const [start, end] = zone;
  const midpoint = (start + end) / 2;
  const halfDwell = (end - start) * FLIP_APEX_DWELL_FRACTION / 2;
  return Object.freeze([midpoint - halfDwell, midpoint + halfDwell]);
}

export function buildScrollRemap(
  zones: ScrollZoneMap,
  flipTimings?: readonly [
    Readonly<StuntFlipTiming>,
    Readonly<StuntFlipTiming>,
  ],
  semanticWeights: readonly SemanticScrollWeight[] = [],
): ScrollRemap {
  const zoneRanges = validateZones(zones);
  for (const { interval: [start, end], weight } of semanticWeights) {
    if (
      !Number.isFinite(start)
      || !Number.isFinite(end)
      || !Number.isFinite(weight)
      || start < 0
      || end > 1
      || start >= end
      || weight <= 0
    ) {
      throw new Error('Semantic scroll weights must be finite positive intervals');
    }
  }
  const apexIntervals = Object.freeze([
    apexInterval(zones.ramp1, flipTimings?.[0]),
    apexInterval(zones.ramp2, flipTimings?.[1]),
  ]);
  const boundaries = [...new Set([
    ...zoneRanges.flat(),
    ...apexIntervals.flat(),
    ...semanticWeights.flatMap(({ interval }) => interval),
  ])].sort((left, right) => left - right);
  const segments = boundaries.slice(1).map((end, index) => {
    const start = boundaries[index];
    const midpoint = (start + end) / 2;
    const isApex = apexIntervals.some(
      ([apexStart, apexEnd]) =>
        midpoint >= apexStart && midpoint <= apexEnd,
    );
    return {
      start,
      end,
      weight: (isApex ? FLIP_APEX_SCROLL_WEIGHT : ORDINARY_WEIGHT)
        * semanticWeights.reduce(
          (weight, weighted) =>
            midpoint >= weighted.interval[0] && midpoint <= weighted.interval[1]
              ? weight * weighted.weight
              : weight,
          1,
        ),
    };
  });
  const totalWeight = segments.reduce(
    (total, segment) =>
      total + (segment.end - segment.start) * segment.weight,
    0,
  );
  let raw = 0;
  const mutableKeys: ScrollRemapKey[] = [{ raw: 0, semantic: 0 }];
  for (const segment of segments) {
    raw += ((segment.end - segment.start) * segment.weight) / totalWeight;
    mutableKeys.push({ raw, semantic: segment.end });
  }
  mutableKeys[mutableKeys.length - 1] = { raw: 1, semantic: 1 };
  const keys: readonly ScrollRemapKey[] = Object.freeze(
    mutableKeys.map((key) => Object.freeze(key)),
  );

  return Object.freeze({
    keys,
    apexIntervals,
    remapScroll(rawProgress: number): number {
      if (!Number.isFinite(rawProgress)) {
        throw new Error('Raw scroll progress must be finite');
      }
      return interpolate(rawProgress, keys, 'raw', 'semantic');
    },
    rawForSemantic(semanticT: number): number {
      if (!Number.isFinite(semanticT)) {
        throw new Error('Semantic progress must be finite');
      }
      return interpolate(semanticT, keys, 'semantic', 'raw');
    },
  });
}

function assertScrollZoneMap(
  zones: Readonly<Record<string, readonly [number, number]>>,
): asserts zones is ScrollZoneMap {
  if (zones.ramp1 === undefined || zones.ramp2 === undefined) {
    throw new Error('Scroll zones must define ramp1 and ramp2');
  }
}

assertScrollZoneMap(ZONES);
const PROJECTS_SEMANTIC_INTERVAL = Object.freeze([0.36, 0.69] as const);
// Give the About beat (intro cut → locked billboard hold → swing to Shibuya) a
// heavier scroll allocation so it dwells longer under the finger instead of
// blowing past in ~3 wheel notches.
const ABOUT_SEMANTIC_INTERVAL = Object.freeze([0.12, 0.28] as const);
const ABOUT_SEMANTIC_WEIGHT = 3;
// The 2nd-jump landing → descend → research-entry handoff swings the camera from
// the side hero cam to a behind-the-bike chase. Give it extra scroll dwell so the
// swing plays out as a slow sweep under the finger (not a snap), and so a fast
// scroll can't skip past the bike between the two angles.
const DESCEND_SEMANTIC_INTERVAL = Object.freeze([0.63, 0.72] as const);
const DESCEND_SEMANTIC_WEIGHT = 3;
// The research canyon straight (t 0.70→0.84) was lengthened ~1.6× in world space
// (endZ -600 → -740). Give that t-range proportionally more scroll so the ride
// through the longer canyon keeps the same on-screen speed instead of speeding up.
const RESEARCH_SEMANTIC_INTERVAL = Object.freeze([0.70, 0.84] as const);
const RESEARCH_SEMANTIC_WEIGHT = 1.6;
// The ramp lead-in (t 0.84→0.885) swings the camera from the research side-view
// around to the straight-on moon look in one eased segment (see the research-bridge
// keys in productionCameraRig). At ordinary weight that ~90° swing gets only ~0.017
// of raw scroll — it snaps side→forward the instant the bike hits the ramp. Give it
// heavy dwell, exactly like DESCEND above, so the same swing plays out as a slow
// sweep under the finger instead of a sudden snap.
const LIFT_SEMANTIC_INTERVAL = Object.freeze([0.84, 0.86] as const);
const LIFT_SEMANTIC_WEIGHT = 3;
const BASELINE_PINNED_TRAVEL_VH = 700;
const CURRENT_PINNED_TRAVEL_VH = 1350;
const LEGACY_SCROLL_REMAP = buildScrollRemap(ZONES, STUNT_FLIP_TIMINGS);
const legacyProjectsRawDistance =
  LEGACY_SCROLL_REMAP.rawForSemantic(PROJECTS_SEMANTIC_INTERVAL[1])
  - LEGACY_SCROLL_REMAP.rawForSemantic(PROJECTS_SEMANTIC_INTERVAL[0]);
const targetProjectsRawDistance =
  legacyProjectsRawDistance * 2
  * BASELINE_PINNED_TRAVEL_VH / CURRENT_PINNED_TRAVEL_VH;
const projectsSemanticWeight =
  targetProjectsRawDistance * (1 - legacyProjectsRawDistance)
  / (legacyProjectsRawDistance * (1 - targetProjectsRawDistance));
const CURRENT_SCROLL_REMAP = buildScrollRemap(
  ZONES,
  STUNT_FLIP_TIMINGS,
  [
    {
      interval: PROJECTS_SEMANTIC_INTERVAL,
      weight: projectsSemanticWeight,
    },
    {
      interval: ABOUT_SEMANTIC_INTERVAL,
      weight: ABOUT_SEMANTIC_WEIGHT,
    },
    {
      interval: DESCEND_SEMANTIC_INTERVAL,
      weight: DESCEND_SEMANTIC_WEIGHT,
    },
    {
      interval: RESEARCH_SEMANTIC_INTERVAL,
      weight: RESEARCH_SEMANTIC_WEIGHT,
    },
    {
      interval: LIFT_SEMANTIC_INTERVAL,
      weight: LIFT_SEMANTIC_WEIGHT,
    },
  ],
);
const currentProjectsRawDistance =
  CURRENT_SCROLL_REMAP.rawForSemantic(PROJECTS_SEMANTIC_INTERVAL[1])
  - CURRENT_SCROLL_REMAP.rawForSemantic(PROJECTS_SEMANTIC_INTERVAL[0]);

export const PROJECTS_NORMALIZED_SCROLL_ALLOCATION_RATIO =
  currentProjectsRawDistance / legacyProjectsRawDistance;
export const PROJECTS_RAW_SCROLL_ALLOCATION_RATIO =
  PROJECTS_NORMALIZED_SCROLL_ALLOCATION_RATIO
  * CURRENT_PINNED_TRAVEL_VH / BASELINE_PINNED_TRAVEL_VH;

export const SCROLL_REMAP_KEYS = CURRENT_SCROLL_REMAP.keys;
export const FLIP_APEX_INTERVALS = CURRENT_SCROLL_REMAP.apexIntervals;

export function remapScroll(raw: number): number {
  return CURRENT_SCROLL_REMAP.remapScroll(raw);
}

export function rawForSemantic(semanticT: number): number {
  return CURRENT_SCROLL_REMAP.rawForSemantic(semanticT);
}

export function previousRawForSemantic(semanticT: number): number {
  return LEGACY_SCROLL_REMAP.rawForSemantic(semanticT);
}
