import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sampleRoute } from '../src/world/route';
import { ROADS, buildCurveRibbon } from '../src/world/roads';
import {
  shibuyaPlazaClearance,
  shibuyaPlazaContains,
} from '../src/world/intersections';

const TURN_START = 0.28;
const TURN_APEX = 0.32;
const TURN_END = 0.36;

function nearestRoadFrame(target: THREE.Vector3): {
  distance: number;
  tangent: THREE.Vector3;
} {
  const curve = ROADS[0].curve;
  let bestDistance = Infinity;
  let bestU = 0;
  for (let i = 0; i <= 4000; i++) {
    const u = i / 4000;
    const point = curve.getPointAt(u);
    const distance = Math.hypot(point.x - target.x, point.z - target.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestU = u;
    }
  }
  const coarseStep = 1 / 4000;
  const start = Math.max(0, bestU - coarseStep);
  const end = Math.min(1, bestU + coarseStep);
  for (let i = 0; i <= 1000; i++) {
    const u = THREE.MathUtils.lerp(start, end, i / 1000);
    const point = curve.getPointAt(u);
    const distance = Math.hypot(point.x - target.x, point.z - target.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestU = u;
    }
  }
  return {
    distance: bestDistance,
    tangent: curve.getTangentAt(bestU).setY(0).normalize(),
  };
}

describe('bike route and rendered road alignment', () => {
  it('uses the route projection as the main-road source', () => {
    expect(ROADS[0].source).toBe('route-ground-projection');
  });

  it('keeps rendered road centres and tangents aligned through Shibuya', () => {
    const ribbon = buildCurveRibbon(ROADS[0].curve, ROADS[0].halfWidth, { steps: 400 });
    const positions = ribbon.getAttribute('position');
    let maxRenderedMismatch = 0;
    let maxCurveMismatch = 0;
    let maxTangentAngle = 0;
    let worstTangent: unknown;

    for (let i = 0; i <= 40; i++) {
      const t = TURN_START + (TURN_END - TURN_START) * (i / 40);
      const bike = sampleRoute(t);
      const bikeTangent = bike.tangent.clone().setY(0).normalize();
      const nearest = nearestRoadFrame(bike.pos);
      maxCurveMismatch = Math.max(maxCurveMismatch, nearest.distance);
      const tangentAngle = Math.acos(
        THREE.MathUtils.clamp(nearest.tangent.dot(bikeTangent), -1, 1),
      );
      if (tangentAngle > maxTangentAngle) {
        maxTangentAngle = tangentAngle;
        worstTangent = {
          t,
          bike: bike.pos.toArray(),
          bikeTangent: bikeTangent.toArray(),
          roadTangent: nearest.tangent.toArray(),
          distance: nearest.distance,
        };
      }

      let renderedMismatch = Infinity;
      for (let vertex = 0; vertex < positions.count; vertex += 2) {
        const centerX = (positions.getX(vertex) + positions.getX(vertex + 1)) / 2;
        const centerZ = (positions.getZ(vertex) + positions.getZ(vertex + 1)) / 2;
        renderedMismatch = Math.min(
          renderedMismatch,
          Math.hypot(centerX - bike.pos.x, centerZ - bike.pos.z),
        );
      }
      maxRenderedMismatch = Math.max(maxRenderedMismatch, renderedMismatch);
    }

    expect(maxCurveMismatch).toBeLessThan(0.35);
    expect(maxRenderedMismatch).toBeLessThan(2.25);
    expect(maxTangentAngle, JSON.stringify(worstTangent)).toBeLessThan(
      THREE.MathUtils.degToRad(2),
    );
  });

  it('bounds the outward bulge while preserving semantic turn endpoints', () => {
    expect(sampleRoute(TURN_START).pos.distanceTo(new THREE.Vector3(160, 0, 0))).toBeLessThan(0.05);
    expect(sampleRoute(TURN_APEX).pos.distanceTo(new THREE.Vector3(240, 0, 0))).toBeLessThan(0.05);
    expect(sampleRoute(TURN_END).pos.distanceTo(new THREE.Vector3(250, 0, -70))).toBeLessThan(0.05);

    let northwardBulge = 0;
    let eastwardBulge = 0;
    for (let i = 0; i <= 200; i++) {
      const t = TURN_START + (TURN_END - TURN_START) * (i / 200);
      const point = sampleRoute(t).pos;
      northwardBulge = Math.max(northwardBulge, point.z);
      eastwardBulge = Math.max(eastwardBulge, point.x - 250);
    }

    expect(northwardBulge).toBeLessThanOrEqual(0.25);
    expect(eastwardBulge).toBeLessThanOrEqual(0.25);
  });

  it('clips main-road infrastructure ribbon segments outside the shared plaza', () => {
    const road = ROADS[0];
    const specifications = [
      { halfWidth: 0.3, offset: road.halfWidth - 0.4 },
      { halfWidth: 0.3, offset: -(road.halfWidth - 0.4) },
      { halfWidth: 0.14, offset: 0 },
      { halfWidth: 4.5, offset: road.halfWidth + 4.5 },
      { halfWidth: 4.5, offset: -(road.halfWidth + 4.5) },
      { halfWidth: 0.4, offset: road.halfWidth + 0.4 },
      { halfWidth: 0.4, offset: -(road.halfWidth + 0.4) },
    ];

    for (const specification of specifications) {
      const geometry = buildCurveRibbon(road.curve, specification.halfWidth, {
        offset: specification.offset,
        clip: shibuyaPlazaContains,
      });
      const positions = geometry.getAttribute('position');
      const index = geometry.getIndex();
      expect(index).not.toBeNull();
      for (let i = 0; i < index!.count; i += 3) {
        const triangle = [0, 1, 2].map((corner) => {
          const vertex = index!.getX(i + corner);
          return new THREE.Vector3(
            positions.getX(vertex),
            positions.getY(vertex),
            positions.getZ(vertex),
          );
        });
        for (let edge = 0; edge < 3; edge++) {
          const a = triangle[edge];
          const b = triangle[(edge + 1) % 3];
          for (let sample = 0; sample <= 10; sample++) {
            const point = a.clone().lerp(b, sample / 10);
            expect(
              shibuyaPlazaClearance(point.x, point.z),
              JSON.stringify({ specification, triangle }),
            ).toBeGreaterThanOrEqual(-1e-5);
          }
        }
      }
    }
  });

  it('terminates both side-road curves at the plaza boundary and extends outward', () => {
    for (const road of [ROADS[3], ROADS[4]]) {
      const endpoint = road.curve.getPointAt(0);
      expect(shibuyaPlazaClearance(endpoint.x, endpoint.z)).toBeCloseTo(0, 6);
      for (let i = 1; i <= 20; i++) {
        const point = road.curve.getPointAt(i / 20);
        expect(shibuyaPlazaClearance(point.x, point.z)).toBeGreaterThan(0);
      }
    }
  });
});
