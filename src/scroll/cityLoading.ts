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
      // Eagerly idle-preload ONLY the first zone after `route` (shibuya) so the
      // opening scroll into it is pop-in free. We intentionally do NOT cascade
      // further: earlier this preloaded next-after-next-after-... which pulled
      // and Draco-decoded every zone's GLBs on first load (whole 51 MB set,
      // ~20 s to full-city-ready) with no scrolling. Beyond shibuya, zones load
      // scroll-driven via progress() — which already carries a one-zone
      // lookahead — with procedural shells covering any not-yet-ready zone.
      if (zone !== 'route') return;
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
