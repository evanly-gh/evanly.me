export const CITY_ZONE_IDS = [
  'route',
  'shibuya',
  'projects',
  'research',
  'finale',
] as const;

export type CityZoneId = typeof CITY_ZONE_IDS[number];

export interface CityZonePlacement {
  position: readonly [number, number, number];
  layoutRole?: string;
}

const STUNT_START_Z = -60;
const RESEARCH_START_Z = -360;
const FINALE_START_Z = -600;
const SHIBUYA_START_X = 150;

export function cityZoneForPlacement(
  placement: CityZonePlacement,
): CityZoneId {
  if (placement.layoutRole === 'about-hero-backdrop') return 'route';
  if (placement.layoutRole?.startsWith('shibuya-')) return 'shibuya';
  if (placement.layoutRole === 'stunt-backdrop') return 'projects';
  if (placement.layoutRole?.startsWith('research-')) return 'research';
  const [x, , z] = placement.position;
  if (z <= FINALE_START_Z) return 'finale';
  if (z <= RESEARCH_START_Z) return 'research';
  if (z <= STUNT_START_Z) return 'projects';
  if (x >= SHIBUYA_START_X) return 'shibuya';
  return 'route';
}

export function partitionCityZones<T extends CityZonePlacement>(
  placements: readonly T[],
): Record<CityZoneId, T[]> {
  const zones = Object.fromEntries(
    CITY_ZONE_IDS.map((id) => [id, [] as T[]]),
  ) as Record<CityZoneId, T[]>;
  for (const placement of placements) {
    zones[cityZoneForPlacement(placement)].push(placement);
  }
  return zones;
}

export function cityLoadingProgress(
  readyZoneIds: readonly CityZoneId[],
) {
  const ready = new Set(readyZoneIds);
  const loaded = CITY_ZONE_IDS.filter((id) => ready.has(id)).length;
  const total = CITY_ZONE_IDS.length;
  return {
    loaded,
    total,
    percent: Math.round((loaded / total) * 100),
    complete: loaded === total,
  };
}

export function cityZonesForSemanticProgress(
  semanticT: number,
): readonly CityZoneId[] {
  if (!Number.isFinite(semanticT)) {
    throw new Error('City loading progress must be finite');
  }
  if (semanticT < 0.2) return ['route'];
  if (semanticT < 0.28) return ['route', 'shibuya'];
  if (semanticT < 0.36) return ['shibuya', 'projects'];
  if (semanticT < 0.69) return ['projects', 'research'];
  return ['research', 'finale'];
}

export function nextCityZone(zone: CityZoneId): CityZoneId | undefined {
  const index = CITY_ZONE_IDS.indexOf(zone);
  return CITY_ZONE_IDS[index + 1];
}

export interface CityZoneLoadControllerOptions {
  scheduleIdle: (callback: () => void) => () => void;
  onActivate: (zones: CityZoneId[]) => void;
}

export interface CityZoneLoadController {
  activeZones(): CityZoneId[];
  progress(semanticT: number): void;
  ready(zone: CityZoneId): void;
  dispose(): void;
}

export function createCityZoneLoadController({
  scheduleIdle,
  onActivate,
}: CityZoneLoadControllerOptions): CityZoneLoadController {
  const active = new Set<CityZoneId>(['route']);
  const scheduled = new Map<CityZoneId, () => void>();

  const activate = (requested: readonly CityZoneId[]) => {
    const added = requested.filter((zone) => !active.has(zone));
    if (added.length === 0) return;
    added.forEach((zone) => active.add(zone));
    onActivate(added);
  };

  return {
    activeZones: () => CITY_ZONE_IDS.filter((zone) => active.has(zone)),
    progress: (semanticT) => {
      activate(cityZonesForSemanticProgress(semanticT));
    },
    ready: (zone) => {
      // Deferred background preload: when a zone finishes loading, idle-schedule
      // the NEXT zone. Because `ready` only fires after a zone's GLBs are
      // decoded, this chains route -> shibuya -> projects -> research -> finale
      // one zone at a time, each starting only once the previous is done and
      // only during an idle callback. The cascade therefore begins *after* the
      // intro is already on screen (route-ready ~7s, well past first paint) and
      // fills the rest of the city in the background while the viewer reads the
      // intro — so scrolling onward finds zones already decoded instead of
      // popping in just-in-time.
      //
      // This is NOT the old eager cascade that caused the ~20s first-load stall:
      // that one raced all zones before first paint. Here the staggering (one
      // per ready event) + idle gating keeps the intro smooth while still
      // proactively warming every zone. Scroll-driven progress() still activates
      // zones on demand (with its one-zone lookahead) if the viewer outruns the
      // background preload; activate() dedupes so the two never double-load.
      const next = nextCityZone(zone);
      if (!next || active.has(next) || scheduled.has(next)) return;
      const cancel = scheduleIdle(() => {
        scheduled.delete(next);
        activate([next]);
      });
      scheduled.set(next, cancel);
    },
    dispose: () => {
      scheduled.forEach((cancel) => cancel());
      scheduled.clear();
    },
  };
}
