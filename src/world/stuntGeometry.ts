export interface StuntProtectedRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function deriveRoadBounds({
  centerX,
  halfWidth,
}: {
  centerX: number;
  halfWidth: number;
}): { westEdgeX: number; eastEdgeX: number } {
  return {
    westEdgeX: centerX - halfWidth,
    eastEdgeX: centerX + halfWidth,
  };
}

export function deriveRampExtents({
  baseZ,
  run,
}: {
  baseZ: number;
  run: number;
}): { lipZ: number } {
  return { lipZ: baseZ - run };
}

export function deriveCenteredSpan({
  center,
  length,
}: {
  center: number;
  length: number;
}): { start: number; end: number } {
  return {
    start: center + length / 2,
    end: center - length / 2,
  };
}

const PROJECTS_MAIN_ROAD_PRIMITIVES = {
  centerX: 240,
  halfWidth: 11,
} as const;
export const PROJECTS_MAIN_ROAD = Object.freeze({
  ...PROJECTS_MAIN_ROAD_PRIMITIVES,
  ...deriveRoadBounds(PROJECTS_MAIN_ROAD_PRIMITIVES),
});

const STUNT_SERVICE_ALLEY_PRIMITIVES = {
  centerX: 285,
  halfWidth: 5,
  facadeX: 300,
  buildingMargin: 3.5,
} as const;
export const STUNT_SERVICE_ALLEY = Object.freeze({
  ...STUNT_SERVICE_ALLEY_PRIMITIVES,
  ...deriveRoadBounds(STUNT_SERVICE_ALLEY_PRIMITIVES),
});

export const STUNT_CENTER_X = STUNT_SERVICE_ALLEY.centerX;

const STUNT_RAMP1_PRIMITIVES = {
  baseY: 0,
  baseZ: -68,
  run: 28,
  rise: 12,
  width: 4.2,
} as const;
export const STUNT_RAMP1 = Object.freeze({
  ...STUNT_RAMP1_PRIMITIVES,
  ...deriveRampExtents(STUNT_RAMP1_PRIMITIVES),
});

const STUNT_SCAFFOLD_PRIMITIVES = {
  centerZ: -200,
  deckY: 13,
  length: 120,
  width: 9,
  thickness: 1,
  backdropFacadeX: STUNT_SERVICE_ALLEY.facadeX,
  tieZs: Object.freeze([-156, -180, -204, -228, -252] as const),
} as const;
const scaffoldZ = deriveCenteredSpan({
  center: STUNT_SCAFFOLD_PRIMITIVES.centerZ,
  length: STUNT_SCAFFOLD_PRIMITIVES.length,
});
const scaffoldX = deriveCenteredSpan({
  center: STUNT_CENTER_X,
  length: STUNT_SCAFFOLD_PRIMITIVES.width,
});
export const STUNT_SCAFFOLD = Object.freeze({
  ...STUNT_SCAFFOLD_PRIMITIVES,
  northZ: scaffoldZ.start,
  southZ: scaffoldZ.end,
  innerEdgeX: scaffoldX.end,
  outerEdgeX: scaffoldX.start,
});

const STUNT_RAMP2_PRIMITIVES = {
  baseY: STUNT_SCAFFOLD.deckY,
  baseZ: -228,
  run: 24,
  rise: 10,
  width: 3.8,
} as const;
export const STUNT_RAMP2 = Object.freeze({
  ...STUNT_RAMP2_PRIMITIVES,
  ...deriveRampExtents(STUNT_RAMP2_PRIMITIVES),
});

const PROTECTED_SHOULDER_MARGIN = 4;
const STUNT_KEEP_CLEAR_X0 =
  STUNT_SERVICE_ALLEY.westEdgeX - PROTECTED_SHOULDER_MARGIN;
const PROJECTS_MAIN_ROAD_KEEP_CLEAR_X1 =
  PROJECTS_MAIN_ROAD.eastEdgeX + PROTECTED_SHOULDER_MARGIN;

export const STUNT_CLEARANCE = Object.freeze({
  physicalRoadMargin:
    STUNT_SCAFFOLD.innerEdgeX - PROJECTS_MAIN_ROAD.eastEdgeX,
  protectedShoulderMargin: PROTECTED_SHOULDER_MARGIN,
  serviceFacadeMargin:
    STUNT_SERVICE_ALLEY.facadeX - STUNT_SCAFFOLD.outerEdgeX,
});

export const STUNT_KEEP_CLEAR: Readonly<StuntProtectedRect> = Object.freeze({
  x0: STUNT_KEEP_CLEAR_X0,
  x1: 340,
  z0: -310,
  z1: -55,
});

export const PROJECTS_MAIN_ROAD_KEEP_CLEAR:
Readonly<StuntProtectedRect> = Object.freeze({
  x0: 224,
  x1: PROJECTS_MAIN_ROAD_KEEP_CLEAR_X1,
  z0: -310,
  z1: -55,
});

export const STUNT_CAMERA_SIDE = Object.freeze({
  inspectionX: STUNT_CENTER_X - 84,
  targetX: STUNT_CENTER_X,
  productionX: STUNT_CENTER_X - 76,
  targetMinX: STUNT_CENTER_X - 4,
  targetMaxX: STUNT_CENTER_X + 4,
  keepClear: Object.freeze({
    x0: STUNT_CENTER_X - 97,
    x1: PROJECTS_MAIN_ROAD.eastEdgeX,
    z0: -340,
    z1: -100,
  }) satisfies Readonly<StuntProtectedRect>,
});

export const STUNT_CAMERA_KEEP_CLEAR = STUNT_CAMERA_SIDE.keepClear;
