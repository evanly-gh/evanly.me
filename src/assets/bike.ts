import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../theme';
import type { Rng } from './rng';

/**
 * Task 16 — the PROTAGONIST: black-suited courier on a Tron-style light cycle
 * (GTA "Shotaro" reference). Forward = +X, up = +Y, +Z = rider's right.
 *
 * Palette rule (INVERTED for this asset): tron-cyan belongs to the bike/rider —
 * this is the only asset allowed to glow cyan. Suit is matte near-black with
 * thin cyan seam piping.
 *
 * Hierarchy: root → chassisTilt(lean, pivot at ground line)
 *                 → pitchPivot(pitch, pivot at bike center y≈0.66)
 *                 → { bikeBody, riderRig }
 *
 * Draw calls (budget ≤ 8): merged static bike mesh with 4 material groups
 * (dark metal / cyan glow / white-cyan headlight / red tail) + 2 spinning hub
 * discs + rider SkinnedMesh with 2 groups (matte suit / cyan piping) = 8.
 *
 * The rider is a single SkinnedMesh: 11 rigid-bound bones. Hands/feet stay
 * locked to grips/pegs through every pose because arms and legs are solved
 * with analytic two-bone IK against fixed grip/peg targets each pose() call.
 */

/** Pose inputs — angles in RADIANS. */
export interface BikePose {
  /** Roll about the forward axis; ±35° is the choreography range. +lean = toward rider's right (+Z). */
  lean: number;
  /** Rotation about the lateral axis. Full rotation allowed (backflips); +pitch = nose up. */
  pitch: number;
  /** 0 = race tuck, 1 = standing-ish; interpolates spine/elbow/knee via IK. */
  crouch: number;
  /** Accumulated wheel rotation (radians); spins both hoop hub discs (hoop rims are static). */
  wheelSpin: number;
}

export interface BikeAsset {
  group: THREE.Group;
  pose(p: BikePose): void;
  /** Simplified merged bike+rider (~300 tris), neutral pose, for the sandevistan trail. */
  ghostGeometry: THREE.BufferGeometry;
}

// ---------------------------------------------------------------------------
// Dimensions (1 unit = 1 m)
// ---------------------------------------------------------------------------

// TRON: Legacy light-cycle proportions, rebuilt from the 4-angle reference:
// two ENORMOUS near-equal hubless wheels wrapped in a bright cyan ring, joined
// by a long, low blade body. A single bright cyan light-beam spears the full
// length at axle height. Total length ≈ 2*(AXLE_X + WHEEL_OUTER) ≈ 2.9m.
export const BIKE_WHEEL_CENTERLINE_RADIUS = 0.475;
export const BIKE_WHEEL_TIRE_RADIUS = 0.12;
export const BIKE_WHEEL_OUTER_RADIUS =
  BIKE_WHEEL_CENTERLINE_RADIUS + BIKE_WHEEL_TIRE_RADIUS;
export const BIKE_WHEEL_AXLE_HEIGHT = BIKE_WHEEL_OUTER_RADIUS;
export const BIKE_WHEELBASE_HALF = 1.05;
export const BIKE_PITCH_PIVOT_Y = 0.6;
export const BIKE_WHEEL_RADIAL_SEGMENTS = 16;
export const BIKE_WHEEL_TUBULAR_SEGMENTS = 38;
const WHEEL_R = BIKE_WHEEL_CENTERLINE_RADIUS;
const WHEEL_TUBE = BIKE_WHEEL_TIRE_RADIUS;
const AXLE_X = BIKE_WHEELBASE_HALF;
const AXLE_Y = BIKE_WHEEL_AXLE_HEIGHT;
const BODY_HALF_W = 0.24; // half-width of the central body (thicker overall)
const PITCH_PIVOT_Y = BIKE_PITCH_PIVOT_Y;

const LEAN_MAX = THREE.MathUtils.degToRad(35);

// Rider rig
const ARM_A = 0.3; // upper arm
const ARM_B = 0.3; // forearm
const LEG_A = 0.4; // thigh
const LEG_B = 0.1; // calf
const SHOULDER_UP = 0.32; // shoulder offset above spine bone, along spine
const SHOULDER_OUT = 0.185;
const SPINE_UP = 0.1; // spine bone above hips bone

// Contact points (bikeBody/riderRig local space, ground at y=0). Rider sits ON
// TOP of the spine (not inside it): hands forward/up on the bars, feet back on
// pegs set OUTSIDE the body width so legs don't clip the fenders.
// Seat sits in the shell's mid dip (top ≈ AXLE_Y+0.34). Hands reach forward/up
// to the bars above the front hump; feet rest on pegs set OUTSIDE the shell
// width so the legs straddle the body instead of clipping into it.
const GRIP = new THREE.Vector3(0.7, 0.98, 0.19);
const PEG = new THREE.Vector3(-0.44, 0.72, 0.32);
const ANKLE_LIFT = 0.05; // ankle sits just above the peg

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

interface Part {
  geom: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  mat: number;
  bone?: number;
}

function xform(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1)
  );
}

/**
 * Merges parts into one geometry with ONE material group per material (parts
 * are sorted by material and contiguous runs coalesced) — unlike a naive
 * group-per-part merge this keeps the draw-call count equal to the number of
 * distinct materials, which is what the ≤8-call budget is measured against.
 * Optionally emits rigid skinIndex/skinWeight attributes (bone per part).
 */
function mergeParts(parts: Part[], skinned: boolean): THREE.BufferGeometry {
  const sorted = [...parts].sort((a, b) => a.mat - b.mat);
  const geoms: THREE.BufferGeometry[] = [];
  const runs: Array<{ mat: number; count: number }> = [];

  for (const p of sorted) {
    let g = p.geom.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(p.matrix);
    const n = g.getAttribute('position').count;
    if (skinned) {
      const idx = new Uint16Array(n * 4);
      const wgt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = p.bone ?? 0;
        wgt[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));
    }
    geoms.push(g);
    const last = runs[runs.length - 1];
    if (last && last.mat === p.mat) last.count += n;
    else runs.push({ mat: p.mat, count: n });
  }

  const merged = mergeGeometries(geoms);
  if (!merged) throw new Error('bike: geometry merge failed');
  merged.clearGroups();
  let start = 0;
  for (const r of runs) {
    merged.addGroup(start, r.count, r.mat);
    start += r.count;
  }
  return merged;
}

/** Thin emissive strip (box) between two side-profile points at depth z. */
function strip(
  p1: [number, number],
  p2: [number, number],
  z: number,
  thick = 0.02,
  depth = 0.014
): { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  return {
    geom: new THREE.BoxGeometry(len, thick, depth),
    matrix: xform((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, z, 0, 0, Math.atan2(dy, dx))
  };
}

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Analytic two-bone IK. Returns unit directions for the upper and lower
 * segments; the reach is clamped so the chain end always lands exactly on the
 * (possibly clamped) target — this is what keeps hands welded to the bars and
 * feet to the pegs through the whole crouch/lean envelope.
 */
function solveTwoBone(
  root: THREE.Vector3,
  target: THREE.Vector3,
  a: number,
  b: number,
  pole: THREE.Vector3
): { upper: THREE.Vector3; lower: THREE.Vector3 } {
  const t = target.clone().sub(root);
  const d = THREE.MathUtils.clamp(t.length(), Math.abs(a - b) + 0.01, a + b - 0.005);
  const th = t.lengthSq() > 1e-10 ? t.normalize() : new THREE.Vector3(1, 0, 0);

  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);

  let side = pole.clone().sub(th.clone().multiplyScalar(pole.dot(th)));
  if (side.lengthSq() < 1e-8) {
    side = new THREE.Vector3(0, 0, 1).sub(th.clone().multiplyScalar(th.z));
  }
  side.normalize();

  const upper = th.clone().multiplyScalar(cosA).add(side.multiplyScalar(sinA));
  const mid = root.clone().add(upper.clone().multiplyScalar(a));
  const end = root.clone().add(th.multiplyScalar(d));
  const lower = end.sub(mid).normalize();
  return { upper, lower };
}

/** Quaternion rotating the bind direction (DOWN for limbs) onto a world dir. */
function aim(from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(from, to);
}

// ---------------------------------------------------------------------------
// Bike body (static merged mesh)
// ---------------------------------------------------------------------------

// Rough side silhouette (for the low-poly ghost trail only): belly → nose →
// cockpit crest → seat dip → rear-cowl dome → tail.
const PROFILE: Array<[number, number]> = [
  [-1.1, 0.45],
  [0.0, 0.42],
  [0.9, 0.5],
  [1.1, 0.62], // nose
  [0.55, 0.82],
  [0.38, 0.9], // cockpit crest
  [0.1, 0.72],
  [-0.1, 0.7], // seat dip
  [-0.55, 0.9],
  [-0.82, 0.96], // rear-cowl dome
  [-1.2, 0.78],
  [-1.28, 0.55]
];

const M = { metal: 0, glow: 1, head: 2, tail: 3, core: 4, seat: 5 } as const;

/**
 * TRON: Legacy light-cycle, rebuilt from the 4-view orthographic reference.
 * Forward = +X. Material channels: metal (dark glossy body), glow (cyan
 * seams/piping/spine/beam), head (unused slot), tail (red brake accents), core
 * (BRIGHTEST cyan — the wheel-face rings), seat (matte-black cushions).
 *
 * Reference read, front (+X) → rear (-X):
 *   - ONE angular continuous shell (faceted panels, softly-rounded edges — not
 *     a smooth peanut) with two hollow wheel wells and an open engine bay
 *   - two hubless wheels, fat bright-cyan face rings, seen through the wells
 *   - a bright cyan SPINE stripe down the top centre + cyan rails on the flanks
 *   - a thin cyan BEAM blade at hub height spearing past both wheels
 *   - an X-shaped engine cross-brace + hub in the open central bay
 *   - matte seat cushions on the top deck
 *   - a red diamond brake light on the tail (no headlight)
 */
function buildBikeStatic(rng: Rng): Part[] {
  const parts: Part[] = [];
  const add = (geom: THREE.BufferGeometry, matrix: THREE.Matrix4, mat: number): void => {
    parts.push({ geom, matrix, mat });
  };
  void rng;

  const HW = BODY_HALF_W;

  // Extrude a side-profile Shape to the body width. A large multi-segment bevel
  // gives the body a ROUNDED cross-section — smooth curved sides, not a flat
  // block slab with hard square edges.
  const extrudeSide = (shape: THREE.Shape, mat: number, halfW = HW, bevel = 0.05): void => {
    add(new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.02, halfW * 2 - bevel * 2), bevelEnabled: bevel > 0,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5
    }), xform(0, 0, -halfW + bevel), mat);
  };

  // A cyan seam laid as short strips along a poly-line on both flanks.
  const seamLine = (pts: Array<[number, number]>, halfW = HW, thick = 0.02, glow = M.glow): void => {
    for (const z of [1, -1]) {
      for (let i = 0; i < pts.length - 1; i++) {
        parts.push({ ...strip(pts[i], pts[i + 1], z * (halfW + 0.012), thick, 0.022), mat: glow });
      }
    }
  };

  const AY = AXLE_Y;

  // Smooth closed Shape through points (Catmull-Rom); closing edge is the
  // straight segment from the last point back to the first.
  const smooth = (pts: Array<[number, number]>): THREE.Shape => {
    const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const sh = new THREE.Shape();
    sh.moveTo(v[0].x, v[0].y);
    sh.splineThru(v.slice(1));
    sh.closePath();
    return sh;
  };
  // =========================================================================
  // WHEELS — big EXPOSED open rings with a THICK dark tyre. On each face, from
  // the rim inward: a dark outer band, the THICK bright cyan glowing rim, a dark
  // band, then a thinner inner cyan ring, then the open hollow centre (no
  // spokes). Radial thicknesses traced from the reference.
  // =========================================================================
  for (const s of [1, -1] as const) {
    const ax = s * AXLE_X;
    // FAT dark tyre. Lower tubular-segment counts give the rings a faceted,
    // TEXTURED look (fairly round, not a perfect smooth circle).
    add(new THREE.TorusGeometry(
      WHEEL_R,
      WHEEL_TUBE,
      BIKE_WHEEL_RADIAL_SEGMENTS,
      BIKE_WHEEL_TUBULAR_SEGMENTS,
    ), xform(ax, AY, 0), M.metal);
    for (const z of [1, -1]) {
      const fz = z * (WHEEL_TUBE - 0.03);
      // thick BRIGHT cyan rim on the outer face (dark tyre shows outside & inside it)
      add(new THREE.TorusGeometry(WHEEL_R - 0.05, 0.055, 12, 42), xform(ax, AY, fz), M.core);
      // thinner inner cyan ring nearer the hub
      add(new THREE.TorusGeometry(WHEEL_R - 0.17, 0.028, 9, 34),
        xform(ax, AY, z * (WHEEL_TUBE - 0.055)), M.glow);
    }
    // small dark hub cap
    add(new THREE.CylinderGeometry(0.06, 0.06, WHEEL_TUBE * 1.3, 14),
      xform(ax, AY, 0, Math.PI / 2, 0, 0), M.metal);
  }
  // small red accent arc low-front on the front wheel (reference detail)
  for (const z of [1, -1]) {
    add(new THREE.TorusGeometry(WHEEL_R - 0.19, 0.016, 6, 20, 1.0),
      xform(AXLE_X, AY, z * (WHEEL_TUBE - 0.055), 0, 0, -2.35), M.tail);
  }

  // =========================================================================
  // CENTRAL BODY — the long LOW blade between the wheels: a thin spar at each
  // hub rising to a low tank/seat, with an ANGLED open gap underneath. Smooth
  // and round (only the engine plates are angular).
  // =========================================================================
  extrudeSide(smooth([
    [0.9, 0.34],           // front-bottom (closing edge = angled belly)
    [0.98, AY + 0.02],     // front spar (thin, at the hub)
    [0.5, AY + 0.26],      // low tank hump
    [0.08, AY + 0.2],      // seat
    [-0.52, AY + 0.28],    // rise
    [-0.98, AY + 0.02],    // rear spar (thin, at the hub)
    [-0.98, 0.46]          // rear-bottom (closing belly slants down to front)
  ]), M.metal, HW, 0.08);

  // =========================================================================
  // COWLS — a compact rounded cowl hugging each wheel top with a steep front,
  // ending AT the wheel (no beak poking past it). Front +, rear −.
  // =========================================================================
  for (const fx of [1, -1] as const) {
    extrudeSide(smooth([
      [fx * 0.7, AY + 0.14],
      [fx * 0.92, AY + 0.42],
      [fx * 1.05, AY + 0.47],   // rounded peak, near wheel-top height
      [fx * 1.22, AY + 0.4],
      [fx * 1.34, AY + 0.14],   // steep front drop
      [fx * 1.34, AY - 0.06],
      [fx * 1.08, AY + 0.0],
      [fx * 0.85, AY + 0.04]
    ]), M.metal, HW * 0.92, 0.07);
  }

  // =========================================================================
  // ENGINE PLATES — sleek DARK overlapping angular panels on the mid flanks +
  // a small central hub. Dark and minimal (only a thin cyan seam accent).
  // =========================================================================
  for (const zside of [1, -1]) {
    const zc = zside * (HW - 0.01);
    add(new THREE.BoxGeometry(0.92, 0.32, 0.05), xform(-0.02, AY + 0.04, zc, 0, 0, 0.05), M.metal);
    add(new THREE.BoxGeometry(0.5, 0.22, 0.06), xform(0.2, AY - 0.04, zc, 0, 0, -0.16), M.metal);
    add(new THREE.BoxGeometry(0.46, 0.2, 0.06), xform(-0.3, AY - 0.0, zc, 0, 0, 0.18), M.metal);
    add(new THREE.BoxGeometry(0.6, 0.014, 0.07), xform(0.04, AY + 0.15, zc, 0, 0, 0.05), M.glow);
  }
  add(new THREE.CylinderGeometry(0.08, 0.08, 2 * (HW - 0.005), 20),
    xform(0, AY + 0.02, 0, Math.PI / 2, 0, 0), M.metal);
  for (const z of [1, -1]) {
    add(new THREE.TorusGeometry(0.05, 0.012, 8, 22), xform(0, AY + 0.02, z * (HW - 0.005)), M.glow);
  }

  // =========================================================================
  // CYAN PIPING — traced in SEPARATE segments so no single line sweeps into a
  // wing: (a) each cowl hump, (b) each short beak blade, (c) the central tank
  // top, (d) the central blade's lower angled edge. No beam across the wheels.
  // =========================================================================
  for (const fx of [1, -1] as const) {
    // cowl hump only (no beak)
    seamLine([
      [fx * 0.72, AY + 0.16], [fx * 0.92, AY + 0.42], [fx * 1.05, AY + 0.47],
      [fx * 1.22, AY + 0.4], [fx * 1.34, AY + 0.16]
    ], HW, 0.014);
  }
  // central tank top
  seamLine([[0.62, AY + 0.28], [0.08, AY + 0.22], [-0.62, AY + 0.3]], HW, 0.014);
  // central blade lower (angled) edge
  seamLine([[0.88, 0.36], [-0.94, 0.48]], HW, 0.017);

  // =========================================================================
  // ELEVATED TOP STRIP — a raised glowing rail proud of the low tank/seat ridge
  // (the reference's bright top strip).
  // =========================================================================
  {
    const crown: Array<[number, number]> = [
      [0.55, AY + 0.28], [0.25, AY + 0.23], [0.08, AY + 0.21],
      [-0.26, AY + 0.25], [-0.55, AY + 0.3]
    ];
    for (let i = 0; i < crown.length - 1; i++) {
      const a = crown[i], b = crown[i + 1];
      parts.push({ ...strip([a[0], a[1] + 0.02], [b[0], b[1] + 0.02], 0, 0.05, 0.08), mat: M.metal });
      parts.push({ ...strip([a[0], a[1] + 0.055], [b[0], b[1] + 0.055], 0, 0.03, 0.05), mat: M.glow });
    }
  }

  // =========================================================================
  // SEAT CUSHIONS — two matte-black pads nestled on the tank/seat top.
  // =========================================================================
  add(new THREE.BoxGeometry(0.3, 0.06, 0.24), xform(0.28, AY + 0.36, 0), M.seat);
  add(new THREE.BoxGeometry(0.28, 0.07, 0.26), xform(-0.05, AY + 0.31, 0), M.seat);

  // =========================================================================
  // HANDLEBARS — low clip-ons at the grip target, cyan grip rings.
  // =========================================================================
  add(new THREE.CylinderGeometry(0.015, 0.015, GRIP.z * 2 + 0.06, 10),
    xform(GRIP.x, GRIP.y, 0, Math.PI / 2, 0, 0), M.metal);
  for (const z of [1, -1]) {
    add(new THREE.CylinderGeometry(0.026, 0.024, 0.1, 12),
      xform(GRIP.x, GRIP.y, z * (GRIP.z + 0.02), Math.PI / 2, 0, 0), M.metal);
    add(new THREE.TorusGeometry(0.027, 0.008, 6, 16),
      xform(GRIP.x - 0.05, GRIP.y, z * (GRIP.z + 0.02), 0, Math.PI / 2, 0), M.glow);
  }

  // =========================================================================
  // REAR BRAKE LIGHT — a red diamond OUTLINE (inverted-shield) on the tail,
  // in the YZ plane facing back. Built from thin red bars.
  // =========================================================================
  {
    const tx = -AXLE_X - 0.31; // on the rear cowl, within the wheel (not poking past)
    // diamond corners in (y, z): top, right, bottom-point, left
    const d: Array<[number, number]> = [[0.78, 0], [0.66, 0.11], [0.5, 0], [0.66, -0.11]];
    for (let i = 0; i < d.length; i++) {
      const [y0, z0] = d[i];
      const [y1, z1] = d[(i + 1) % d.length];
      const dy = y1 - y0, dz = z1 - z0;
      const len = Math.hypot(dy, dz);
      add(new THREE.BoxGeometry(0.03, len, 0.018),
        xform(tx, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(dz, dy), 0, 0), M.tail);
    }
  }

  // =========================================================================
  // FOOTPEGS — dark, set just outside the body width.
  // =========================================================================
  for (const z of [1, -1]) {
    add(new THREE.BoxGeometry(0.07, 0.03, 0.1),
      xform(PEG.x, PEG.y - 0.02, z * (PEG.z + 0.03)), M.metal);
  }

  return parts;
}

/**
 * Minimal hubless centre: just a tiny dark cap so the wheel's open centre stays
 * empty (no spokes, per the reference). Spins with wheelSpin but reads as clean.
 */
function buildHubGeometry(): THREE.BufferGeometry {
  return mergeParts([
    {
      geom: new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16),
      matrix: xform(0, 0, 0, Math.PI / 2, 0, 0),
      mat: 0
    }
  ], false);
}

// ---------------------------------------------------------------------------
// Rider (single SkinnedMesh, rigid-bound bones, 2 material groups)
// ---------------------------------------------------------------------------

// Bone indices
const B = {
  hips: 0,
  spine: 1,
  head: 2,
  shL: 3,
  foL: 4,
  shR: 5,
  foR: 6,
  thL: 7,
  caL: 8,
  thR: 9,
  caR: 10
} as const;

const RM = { suit: 0, pipe: 1 } as const;

/**
 * Rider geometry in bind pose: hips bone at rig origin, torso straight up,
 * arms hanging straight down from the shoulders, legs straight down. Never
 * rendered as-is — pose() immediately solves the riding posture.
 */
function buildRiderParts(): Part[] {
  const p: Part[] = [];
  const S = RM.suit;
  const C = RM.pipe;
  const HEAD_Y = SPINE_UP + 0.38; // head bone world y (bind) = 0.48

  // --- small builders (each part is rigid-bound to exactly one bone) ---
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: number, bone: number, rz = 0): void => {
    p.push({ geom: new THREE.BoxGeometry(w, h, d), matrix: xform(x, y, z, 0, 0, rz), mat, bone });
  };
  // tapered limb/torso segment (cylinder, Y axis)
  const tube = (rt: number, rb: number, h: number, x: number, y: number, z: number, mat: number, bone: number): void => {
    p.push({ geom: new THREE.CylinderGeometry(rt, rb, h, 16), matrix: xform(x, y, z), mat, bone });
  };
  const ball = (r: number, sx: number, syc: number, szc: number, x: number, y: number, z: number, mat: number, bone: number): void => {
    p.push({ geom: new THREE.SphereGeometry(r, 18, 14), matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, syc, szc)), mat, bone });
  };
  // cyan ring: 'v' encircles a vertical part, 'x' faces +X (chest disc)
  const ring = (r: number, t: number, x: number, y: number, z: number, bone: number, axis: 'v' | 'x' = 'v'): void => {
    const rot: [number, number, number] = axis === 'v' ? [Math.PI / 2, 0, 0] : [0, Math.PI / 2, 0];
    p.push({ geom: new THREE.TorusGeometry(r, t, 8, 22), matrix: xform(x, y, z, rot[0], rot[1], rot[2]), mat: C, bone });
  };
  // cyan piping line (thin box), optionally tilted about Z
  const seam = (h: number, x: number, y: number, z: number, bone: number, rz = 0): void => {
    p.push({ geom: new THREE.BoxGeometry(0.011, h, 0.012), matrix: xform(x, y, z, 0, 0, rz), mat: C, bone });
  };

  // ===================== PELVIS (hips) =====================
  // A tapered cylinder whose TOP radius matches the torso's waist radius so the
  // waist reads as one continuous form (no blocky offset).
  tube(0.1, 0.125, 0.24, 0, 0.04, 0, S, B.hips);          // waist → hips
  ring(0.122, 0.011, 0, 0.12, 0, B.hips);                 // belt
  for (const s2 of [1, -1]) seam(0.12, 0.088, -0.02, s2 * 0.07, B.hips, s2 * 0.4); // hip diagonals

  // ===================== TORSO / VEST (spine) =====================
  tube(0.15, 0.1, 0.36, 0, 0.34, 0, S, B.spine);          // chest → waist (meets pelvis at r=0.1)
  tube(0.075, 0.09, 0.07, 0, 0.54, 0, S, B.spine);        // collar base
  // cyan vest trim
  ring(0.083, 0.009, 0, 0.54, 0, B.spine);                // collar
  for (const s2 of [1, -1]) seam(0.24, 0.13, 0.42, s2 * 0.05, B.spine, s2 * 0.4); // V-neck lapels
  seam(0.34, 0.135, 0.32, 0, B.spine);                    // center zip
  for (const s2 of [1, -1]) seam(0.3, 0.03, 0.34, s2 * 0.128, B.spine);           // side seams
  ring(0.03, 0.008, 0.14, 0.45, 0, B.spine, 'x');         // chest disc
  seam(0.26, -0.14, 0.34, 0, B.spine);                    // back spine line

  // ===================== HEAD / HELMET (clean: dome + visor only) =====================
  tube(0.045, 0.055, 0.09, 0, HEAD_Y - 0.05, 0, S, B.head);          // neck
  ball(0.112, 0.97, 1.16, 1.0, 0, HEAD_Y + 0.1, -0.004, S, B.head);  // clean ovoid helmet
  p.push({ geom: new THREE.SphereGeometry(0.118, 26, 6, 0, Math.PI * 2, 1.16, 0.3), matrix: xform(0, HEAD_Y + 0.11, 0, 0, 0, -0.14), mat: C, bone: B.head }); // visor band
  box(0.14, 0.012, 0.012, 0, HEAD_Y + 0.235, 0, C, B.head);          // single thin crown line

  // ===================== ARMS =====================
  for (const [sh, fo, s] of [[B.shL, B.foL, 1], [B.shR, B.foR, -1]] as const) {
    const sy = SPINE_UP + SHOULDER_UP; // 0.42
    const sz = s * SHOULDER_OUT;       // ±0.185
    ball(0.058, 1, 1, 1, 0, sy + 0.03, sz, S, sh);           // shoulder
    tube(0.05, 0.042, ARM_A, 0, sy - ARM_A / 2, sz, S, sh);   // upper arm
    const ey = sy - ARM_A;             // 0.12
    tube(0.042, 0.034, ARM_B, 0, ey - ARM_B / 2, sz, S, fo);  // forearm
    ball(0.05, 1.15, 1, 1, 0.012, ey - ARM_B - 0.02, sz, S, fo); // hand (fist)
    ring(0.058, 0.008, 0, sy - 0.04, sz, sh);                // shoulder ring
    seam(0.22, 0, sy - ARM_A / 2, sz + s * 0.048, sh);       // outer upper-arm
    ring(0.048, 0.008, 0, ey - 0.02, sz, fo);                // elbow
    seam(0.2, 0, ey - ARM_B / 2, sz + s * 0.043, fo);        // outer forearm
    ring(0.04, 0.007, 0, ey - ARM_B + 0.01, sz, fo);         // wrist
  }

  // ===================== LEGS (pants + boots) =====================
  for (const [th, ca, s] of [[B.thL, B.caL, 1], [B.thR, B.caR, -1]] as const) {
    const hz = s * 0.1;
    tube(0.082, 0.062, LEG_A, 0, -0.02 - LEG_A / 2, hz, S, th);           // thigh
    const ky = -0.02 - LEG_A;          // -0.42
    tube(0.062, 0.048, LEG_B - 0.04, 0, ky - (LEG_B - 0.04) / 2, hz, S, ca); // shin
    ball(0.055, 1, 1, 1, 0.015, ky, hz, S, ca);                          // knee
    tube(0.055, 0.06, 0.09, 0, ky - LEG_B + 0.045, hz, S, ca);           // boot ankle
    box(0.17, 0.07, 0.095, 0.055, ky - LEG_B + 0.005, hz, S, ca);        // foot (forward +x)
    ring(0.078, 0.008, 0, -0.06, hz, th);                    // hip ring
    seam(0.26, 0, -0.02 - LEG_A / 2, hz + s * 0.07, th);     // outer thigh
    seam(0.24, 0.066, -0.02 - LEG_A / 2, hz, th);            // front thigh
    ring(0.06, 0.008, 0.012, ky - 0.02, hz, ca);             // knee
    seam(0.2, 0.05, ky - LEG_B / 2 + 0.02, hz, ca);          // front shin
    ring(0.05, 0.007, 0, ky - LEG_B + 0.03, hz, ca);         // ankle
  }

  return p;
}

interface RiderRig {
  rig: THREE.Group;
  bones: THREE.Bone[];
}

function buildRider(suitMat: THREE.Material, pipeMat: THREE.Material): RiderRig {
  const bones: THREE.Bone[] = Array.from({ length: 11 }, () => new THREE.Bone());
  const pos: Array<[number, number, number, number]> = [
    // [parent, x, y, z] — parent -1 = root
    [-1, 0, 0, 0], // hips
    [B.hips, 0, SPINE_UP, 0], // spine
    [B.spine, 0, 0.38, 0], // head
    [B.spine, 0, SHOULDER_UP, SHOULDER_OUT], // shL
    [B.shL, 0, -ARM_A, 0], // foL
    [B.spine, 0, SHOULDER_UP, -SHOULDER_OUT], // shR
    [B.shR, 0, -ARM_A, 0], // foR
    [B.hips, 0, -0.02, 0.1], // thL
    [B.thL, 0, -LEG_A, 0], // caL
    [B.hips, 0, -0.02, -0.1], // thR
    [B.thR, 0, -LEG_A, 0] // caR
  ];
  pos.forEach(([parent, x, y, z], i) => {
    bones[i].position.set(x, y, z);
    if (parent >= 0) bones[parent].add(bones[i]);
  });

  // debug/test anchors at the chain ends (hand = forearm end, foot = calf end)
  const mk = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): void => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
  };
  mk('handL', bones[B.foL], 0, -ARM_B, 0);
  mk('handR', bones[B.foR], 0, -ARM_B, 0);
  mk('footL', bones[B.caL], 0, -LEG_B, 0);
  mk('footR', bones[B.caR], 0, -LEG_B, 0);

  const geom = mergeParts(buildRiderParts(), true);
  // Bind-pose bbox has legs hanging to y≈-0.9; the posed rider lives around
  // y 0.3..1.6. Hand-author bounds so Box3.setFromObject (viewer framing)
  // doesn't think the rider dangles below the ground.
  geom.boundingBox = new THREE.Box3(new THREE.Vector3(-0.7, 0.25, -0.5), new THREE.Vector3(0.7, 1.7, 0.5));
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.1);

  const mesh = new THREE.SkinnedMesh(geom, [suitMat, pipeMat]);
  mesh.frustumCulled = false;
  mesh.name = 'riderMesh';

  const rig = new THREE.Group();
  rig.name = 'riderRig';
  rig.add(bones[B.hips]);
  rig.add(mesh);
  rig.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  return { rig, bones };
}

// ---------------------------------------------------------------------------
// Ghost geometry (~300 tris, neutral tuck pose, merged bike+rider silhouette)
// ---------------------------------------------------------------------------

function buildGhostGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const add = (geom: THREE.BufferGeometry, matrix: THREE.Matrix4): void => {
    parts.push({ geom, matrix, mat: 0 });
  };

  // Wheel hoops share the canonical bike XY wheel plane; their axle is local Z.
  // Match the canonical tire's 38 ring samples so echo contact history does
  // not drift vertically from the rendered bike/ribbon.
  for (const s of [1, -1]) {
    add(
      new THREE.TorusGeometry(WHEEL_R, WHEEL_TUBE, 4, 38),
      xform(s * AXLE_X, AXLE_Y, 0)
    );
  }

  // Body spar: side-view profile extruded in Z (readable from the side).
  const shape = new THREE.Shape(PROFILE.map(([x, y]) => new THREE.Vector2(x, y)));
  add(new THREE.ExtrudeGeometry(shape, { depth: BODY_HALF_W * 2, bevelEnabled: false }), xform(0, 0, -BODY_HALF_W));

  // Body volume box — gives the ghost a recognisable block mass from any cardinal
  // angle, especially from behind (the finale chase-from-behind camera view).
  // 12 triangles only; sits over the bike body profile centroid.
  add(new THREE.BoxGeometry(1.8, 0.5, 0.22), xform(0.28, 0.76, 0));

  // Rider silhouette in tuck: pelvis+torso, helmet, arm slabs, leg slabs.
  // BoxGeometry and IcosahedronGeometry are inherently 3-D so they read from any angle.
  add(new THREE.BoxGeometry(0.3, 0.44, 0.32), xform(-0.06, 1.02, 0, 0, 0, -0.9));
  add(new THREE.IcosahedronGeometry(0.13, 0), xform(0.2, 1.24, 0));
  for (const s of [1, -1]) {
    add(new THREE.BoxGeometry(0.34, 0.09, 0.09), xform(0.16, 1.02, s * 0.2, 0, 0, -0.5));
    add(new THREE.BoxGeometry(0.1, 0.42, 0.12), xform(-0.16, 0.62, s * 0.14, 0, 0, 0.35));
  }

  const merged = mergeParts(parts, false);
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// buildBike
// ---------------------------------------------------------------------------

export function buildBike(rng: Rng): BikeAsset {
  // Materials — cyan is derived from theme; the red tail is signalMagenta
  // pulled toward pure red (no red token exists in the palette).
  const cyan = new THREE.Color(COLORS.tronCyan);
  const headlightColor = new THREE.Color(COLORS.tronCyan).lerp(new THREE.Color(COLORS.moonlight), 0.55);
  const tailRed = new THREE.Color(COLORS.signalMagenta);
  tailRed.g *= 0.4;
  tailRed.b *= 0.15;

  // Body: dark, glossy near-black metal like the reference — high metalness +
  // low roughness so the Environment gives it those hard specular highlights.
  // A slight blue-grey base keeps it from crushing to pure black in shadow.
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x161a22,
    metalness: 0.85,
    roughness: 0.28
  });
  // Cyan seam piping — medium glow tracing the panel edges.
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x02191d,
    emissive: cyan,
    emissiveIntensity: 1.6
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x0a1416,
    emissive: headlightColor,
    emissiveIntensity: 2.0,
    side: THREE.DoubleSide
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x120608,
    emissive: tailRed,
    emissiveIntensity: 1.6
  });
  // Core: the BRIGHTEST cyan — the huge wheel rings and the full-length under-
  // beam, the two elements that dominate the reference silhouette.
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x03252b,
    emissive: cyan,
    emissiveIntensity: 2.6,
    side: THREE.DoubleSide
  });
  // Seat cushions — matte near-black, no gloss (reads as padding, not panel).
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x0c0e14,
    metalness: 0.1,
    roughness: 0.95
  });
  // Rider suit: matte near-black to match the bike's dark theme; the cyan
  // circuit lines (pipe) define the silhouette against it.
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x0d0f15,
    metalness: 0.35,
    roughness: 0.6
  });
  // Rider piping glows brighter than the bike channels so the body's contours
  // (spine, limbs, helmet visor) pop against the chassis.
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x021014,
    emissive: cyan,
    emissiveIntensity: 1.6
  });

  // --- hierarchy ---
  const group = new THREE.Group();
  group.name = 'bike';
  const chassisTilt = new THREE.Group();
  chassisTilt.name = 'chassisTilt';
  group.add(chassisTilt);
  const pitchPivot = new THREE.Group();
  pitchPivot.name = 'pitchPivot';
  pitchPivot.position.y = PITCH_PIVOT_Y;
  chassisTilt.add(pitchPivot);

  const bikeBody = new THREE.Group();
  bikeBody.name = 'bikeBody';
  bikeBody.position.y = -PITCH_PIVOT_Y;
  pitchPivot.add(bikeBody);

  // static merged bike (6 material groups)
  const staticMesh = new THREE.Mesh(mergeParts(buildBikeStatic(rng), false), [
    metalMat,
    glowMat,
    headMat,
    tailMat,
    coreMat,
    seatMat
  ]);
  staticMesh.name = 'bikeStatic';
  bikeBody.add(staticMesh);

  // spinning hub discs (1 draw call each)
  const hubGeom = buildHubGeometry();
  const hubF = new THREE.Mesh(hubGeom, metalMat);
  hubF.name = 'hubFront';
  hubF.position.set(AXLE_X, AXLE_Y, 0);
  const hubR = new THREE.Mesh(hubGeom, metalMat);
  hubR.name = 'hubRear';
  hubR.position.set(-AXLE_X, AXLE_Y, 0);
  bikeBody.add(hubF, hubR);

  // headlight anchor for light pools
  const headAnchor = new THREE.Object3D();
  headAnchor.name = 'headAnchor';
  headAnchor.position.set(1.15, 0.7, 0);
  bikeBody.add(headAnchor);
  group.userData.headAnchor = headAnchor;

  // grip/peg target anchors (tests verify hands/feet stay locked to these)
  for (const [name, v] of [
    ['gripL', new THREE.Vector3(GRIP.x, GRIP.y, GRIP.z)],
    ['gripR', new THREE.Vector3(GRIP.x, GRIP.y, -GRIP.z)],
    ['ankleL', new THREE.Vector3(PEG.x, PEG.y + ANKLE_LIFT, PEG.z)],
    ['ankleR', new THREE.Vector3(PEG.x, PEG.y + ANKLE_LIFT, -PEG.z)]
  ] as const) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.copy(v);
    bikeBody.add(o);
  }

  // rider (2 draw calls)
  const { rig, bones } = buildRider(suitMat, pipeMat);
  rig.position.y = -PITCH_PIVOT_Y;
  pitchPivot.add(rig);

  // --- pose ---
  const tmpQ = new THREE.Quaternion();

  function poseRider(lean: number, crouch: number): void {
    const c = THREE.MathUtils.clamp(crouch, 0, 1);
    const leanN = THREE.MathUtils.clamp(lean / LEAN_MAX, -1, 1);

    // hips: seated ON TOP of the shell's mid seat-dip (shell top ≈ AXLE_Y+0.34
    // ≈ 0.965), raised so the pelvis rides above the surface, not through it.
    const hip = new THREE.Vector3(
      THREE.MathUtils.lerp(-0.06, 0.02, c),
      THREE.MathUtils.lerp(1.0, 1.12, c),
      0.1 * leanN
    );
    bones[B.hips].position.copy(hip);
    bones[B.hips].quaternion.identity();

    // spine: near-horizontal prone pitch 82°(tuck)→36°(standing), rolled into
    // the turn (inside shoulder dips).
    const a = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(82, 36, c));
    const dip = THREE.MathUtils.degToRad(9) * leanN;
    const spineQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), dip)
      .multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a));
    bones[B.spine].quaternion.copy(spineQ);

    // head: pitched less than the spine so the visor looks down the road
    const headQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), dip * 0.6)
      .multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a * 0.35));
    bones[B.head].quaternion.copy(spineQ.clone().invert().multiply(headQ));

    // world-space joint roots
    const spineW = hip.clone().add(new THREE.Vector3(0, SPINE_UP, 0));

    for (const [sh, fo, th, ca, s] of [
      [B.shL, B.foL, B.thL, B.caL, 1],
      [B.shR, B.foR, B.thR, B.caR, -1]
    ] as const) {
      // arm IK: shoulder → grip
      const shoulderW = spineW
        .clone()
        .add(new THREE.Vector3(0, SHOULDER_UP, s * SHOULDER_OUT).applyQuaternion(spineQ));
      const grip = new THREE.Vector3(GRIP.x, GRIP.y, s * GRIP.z);
      const arm = solveTwoBone(shoulderW, grip, ARM_A, ARM_B, new THREE.Vector3(-0.2, -1, s * 0.7));
      const shQ = aim(DOWN, arm.upper);
      bones[sh].quaternion.copy(spineQ.clone().invert().multiply(shQ));
      bones[fo].quaternion.copy(shQ.clone().invert().multiply(aim(DOWN, arm.lower)));

      // leg IK: hip joint → ankle above peg; knees bend forward
      const hipJointW = hip.clone().add(new THREE.Vector3(0, -0.02, s * 0.1));
      const ankle = new THREE.Vector3(PEG.x, PEG.y + ANKLE_LIFT, s * PEG.z);
      const leg = solveTwoBone(hipJointW, ankle, LEG_A, LEG_B, new THREE.Vector3(1, 0.3, 0));
      const thQ = aim(DOWN, leg.upper);
      bones[th].quaternion.copy(thQ);
      bones[ca].quaternion.copy(thQ.clone().invert().multiply(aim(DOWN, leg.lower)));
    }
  }

  function pose(p: BikePose): void {
    chassisTilt.rotation.x = p.lean;
    pitchPivot.rotation.z = p.pitch;
    hubF.rotation.z = -p.wheelSpin;
    hubR.rotation.z = -p.wheelSpin;
    poseRider(p.lean, p.crouch);
  }

  // neutral riding pose: near-prone racing tuck like the TRON reference —
  // chest low over the console, arms stretched forward to the bars, legs back.
  pose({ lean: 0, pitch: 0, crouch: 0.0, wheelSpin: 0 });

  return { group, pose, ghostGeometry: buildGhostGeometry() };
}
