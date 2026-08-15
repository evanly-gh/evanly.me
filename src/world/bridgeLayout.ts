import * as THREE from 'three';
import {
  buildRouteSegmentCurve,
  roadFrame,
} from './route';

export const BRIDGE_START_T = 0.84;
export const BRIDGE_END_T = 1;
export const BRIDGE_DECK_HALF_WIDTH = 11;
export const BRIDGE_DECK_THICKNESS = 1.8;
export const HORIZON_END_Z = -2300;
export const WATER_LEVEL = -8;

export interface WorldRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const BRIDGE_CORRIDOR: WorldRect = {
  x0: 160,
  x1: 320,
  z0: -2350,
  z1: -740,
};

export const WATER_BASIN: WorldRect & { y: number } = {
  x0: -1200,
  x1: 1680,
  z0: -2400,
  z1: -740,
  y: WATER_LEVEL,
};

export const CITY_GROUND_BOUNDS: WorldRect & { y: number } = {
  x0: -3000,
  x1: 3000,
  z0: -740,
  z1: 2800,
  y: -0.15,
};

export function rectangleClearance(x: number, z: number, rect: WorldRect): number {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
}

export function bridgeCorridorFootprintClearance(
  x: number,
  z: number,
  radius: number,
): number {
  return rectangleClearance(x, z, BRIDGE_CORRIDOR) - radius;
}

export interface BridgePier {
  u: number;
  position: THREE.Vector3;
  topY: number;
  bottomY: number;
  radius: number;
}

export interface BridgePylon {
  t: number;
  side: -1 | 1;
  base: THREE.Vector3;
  top: THREE.Vector3;
  radius: number;
}

export interface BridgeCable {
  pylonT: number;
  side: -1 | 1;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface BridgeLayout {
  curve: THREE.Curve<THREE.Vector3>;
  deck: {
    halfWidth: number;
    thickness: number;
  };
  edges: Array<{
    offset: number;
    halfWidth: number;
    accent: 'cyan' | 'magenta';
  }>;
  rails: Array<{
    offset: number;
    height: number;
    accent: 'cyan' | 'magenta';
  }>;
  centreLine: {
    halfWidth: number;
    accent: 'amber';
  };
  piers: BridgePier[];
  pylons: BridgePylon[];
  cables: BridgeCable[];
  shoreline: {
    z: number;
    width: number;
  };
  keepClear: WorldRect;
  water: WorldRect & { y: number };
  horizon: {
    curve: THREE.Curve<THREE.Vector3>;
    rideable: false;
    piers: BridgePier[];
  };
}

class ArcLengthBridgeCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly source: THREE.Curve<THREE.Vector3>) {
    super();
  }

  override getPoint(
    t: number,
    optionalTarget = new THREE.Vector3(),
  ): THREE.Vector3 {
    return optionalTarget.copy(this.source.getPointAt(t));
  }

  override getTangent(
    t: number,
    optionalTarget = new THREE.Vector3(),
  ): THREE.Vector3 {
    return optionalTarget.copy(this.source.getTangentAt(t));
  }
}

export function buildBridgeLayout(): BridgeLayout {
  const curve = new ArcLengthBridgeCurve(
    buildRouteSegmentCurve(BRIDGE_START_T, BRIDGE_END_T),
  );
  const routeEnd = curve.getPoint(1);
  const horizonCurve = new THREE.LineCurve3(
    routeEnd.clone(),
    new THREE.Vector3(routeEnd.x, routeEnd.y, HORIZON_END_Z),
  );
  const piers = Array.from({ length: 10 }, (_, index): BridgePier => {
    const u = 0.225 + index * 0.075;
    const position = curve.getPointAt(u);
    return {
      u,
      position,
      topY: position.y - BRIDGE_DECK_THICKNESS,
      bottomY: -22,
      radius: 2.4,
    };
  });

  const pylons: BridgePylon[] = [0.925, 0.965].flatMap((t) => {
    const frame = roadFrame(t);
    return ([1, -1] as const).map((side): BridgePylon => {
      const xz = frame.pos.clone()
        .addScaledVector(frame.binormal, side * (BRIDGE_DECK_HALF_WIDTH + 3.5));
      return {
        t,
        side,
        base: xz.clone().setY(WATER_LEVEL),
        top: xz.clone().setY(frame.pos.y + 64),
        radius: 1.4,
      };
    });
  });

  const cables: BridgeCable[] = pylons.flatMap((pylon) =>
    [-0.032, -0.016, 0.016, 0.032].map((delta): BridgeCable => {
      const anchorT = THREE.MathUtils.clamp(
        pylon.t + delta,
        BRIDGE_START_T,
        BRIDGE_END_T,
      );
      const frame = roadFrame(anchorT);
      return {
        pylonT: pylon.t,
        side: pylon.side,
        start: pylon.top.clone(),
        end: frame.pos.clone()
          .addScaledVector(frame.binormal, pylon.side * (BRIDGE_DECK_HALF_WIDTH + 0.7))
          .addScaledVector(frame.normal, 0.8),
      };
    }));
  const horizonPiers = Array.from({ length: 6 }, (_, index): BridgePier => {
    const u = 0.14 + index * 0.14;
    const position = horizonCurve.getPointAt(u);
    return {
      u,
      position,
      topY: position.y - BRIDGE_DECK_THICKNESS,
      bottomY: -22,
      radius: 2.2,
    };
  });

  return {
    curve,
    deck: {
      halfWidth: BRIDGE_DECK_HALF_WIDTH,
      thickness: BRIDGE_DECK_THICKNESS,
    },
    edges: [
      { offset: BRIDGE_DECK_HALF_WIDTH - 0.45, halfWidth: 0.28, accent: 'cyan' },
      { offset: -(BRIDGE_DECK_HALF_WIDTH - 0.45), halfWidth: 0.28, accent: 'magenta' },
    ],
    rails: [
      { offset: BRIDGE_DECK_HALF_WIDTH + 0.3, height: 1.15, accent: 'cyan' },
      { offset: -(BRIDGE_DECK_HALF_WIDTH + 0.3), height: 1.15, accent: 'magenta' },
    ],
    centreLine: { halfWidth: 0.14, accent: 'amber' },
    piers,
    pylons,
    cables,
    shoreline: {
      z: BRIDGE_CORRIDOR.z1,
      width: BRIDGE_CORRIDOR.x1 - BRIDGE_CORRIDOR.x0,
    },
    keepClear: BRIDGE_CORRIDOR,
    water: WATER_BASIN,
    horizon: {
      curve: horizonCurve,
      rideable: false,
      piers: horizonPiers,
    },
  };
}

export interface MoonViewMetrics {
  distance: number;
  angularDiameterDeg: number;
  alignmentDeg: number;
}

export function measureMoonView(
  viewpoint: THREE.Vector3,
  forward: THREE.Vector3,
  moonPosition: THREE.Vector3,
  moonRadius: number,
): MoonViewMetrics {
  const sightline = moonPosition.clone().sub(viewpoint);
  const distance = sightline.length();
  const angularDiameterDeg = THREE.MathUtils.radToDeg(
    2 * Math.atan2(moonRadius, distance),
  );
  const alignmentDeg = THREE.MathUtils.radToDeg(
    forward.angleTo(sightline.normalize()),
  );
  return { distance, angularDiameterDeg, alignmentDeg };
}
