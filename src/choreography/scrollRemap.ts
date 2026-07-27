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
export const FLIP_APEX_SCROLL_WEIGHT = 3.5;
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
  [{
    interval: PROJECTS_SEMANTIC_INTERVAL,
    weight: projectsSemanticWeight,
  }],
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
