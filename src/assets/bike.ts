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

// TRON Legacy light-cycle proportions, tuned to the promo photo: the wheels
// are ENORMOUS (their tops reach almost the full bike height) and the body is a
// thin blade threaded between them with lots of open air above the spine.
// Photo proportions: big wheels but a real gap between them (~1 wheel-diameter
// of body sits between the tires). Total length ~2.9 (wheelbase 2.0 + 2 radii).
const WHEEL_R = 0.55; // torus centerline radius
const WHEEL_TUBE = 0.085; // tube radius → outer 0.635
const WHEEL_OUTER = WHEEL_R + WHEEL_TUBE; // 0.635 → axle height so tire kisses y=0
const AXLE_X = 1.0; // axles far apart → gap between tires ≈ 2*(1.0-0.635)=0.73
const AXLE_Y = WHEEL_OUTER;
const BODY_HALF_W = 0.22; // wider body so the bike has real girth (was too thin)
const PITCH_PIVOT_Y = 0.63;

const LEAN_MAX = THREE.MathUtils.degToRad(35);

// Rider rig
const ARM_A = 0.3; // upper arm
const ARM_B = 0.3; // forearm
const LEG_A = 0.4; // thigh
const LEG_B = 0.44; // calf
const SHOULDER_UP = 0.32; // shoulder offset above spine bone, along spine
const SHOULDER_OUT = 0.185;
const SPINE_UP = 0.1; // spine bone above hips bone

// Contact points (bikeBody/riderRig local space, ground at y=0). Rider sits ON
// TOP of the spine (not inside it): hands forward/up on the bars, feet back on
// pegs set OUTSIDE the body width so legs don't clip the fenders.
const GRIP = new THREE.Vector3(0.72, 0.92, 0.16);
const PEG = new THREE.Vector3(-0.4, 0.66, 0.26);
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

// Dagger side profile (CCW): belly → nose tip → console peak → seat trough →
// tail cowl kick-up → rear underside.
const PROFILE: Array<[number, number]> = [
  [-0.4, 0.54],
  [-0.1, 0.52],
  [0.45, 0.55],
  [0.95, 0.62],
  [1.18, 0.7], // dagger nose tip
  [0.75, 0.95],
  [0.42, 1.0], // console peak
  [0.15, 0.82],
  [-0.1, 0.78], // rider trough (seat)
  [-0.35, 0.92], // tail cowl hump
  [-0.62, 0.8], // tail tip
  [-0.55, 0.62]
];


const M = { metal: 0, glow: 1, head: 2, tail: 3, core: 4 } as const;

/**
 * TRON: Legacy light-cycle, rebuilt from the reference photo. Forward = +X.
 * Key reference features, front (+X) to rear (-X):
 *   - two huge hubless wheels of near-equal size on a long low wheelbase
 *   - each wheel wrapped by a black fender/fairing over the top, with a bright
 *     white light-band on the tire circumference + inner rim glow
 *   - a low horizontal chassis beam linking the wheels at ~axle height
 *   - a bright engine core (the brightest non-wheel mass) low and central
 *   - a swept front cowl rising from the front wheel to low clip-on bars
 *   - a short rear tail cowl over the back wheel with a red tail light
 * Palette: matte near-black body, thin cyan seam piping, white wheel bands.
 */
function buildBikeStatic(rng: Rng): Part[] {
  const parts: Part[] = [];
  const add = (geom: THREE.BufferGeometry, matrix: THREE.Matrix4, mat: number): void => {
    parts.push({ geom, matrix, mat });
  };

  void rng;

  // =========================================================================
  // ONE CONTINUOUS SCULPTED BODY (the key change): a single side-profile
  // silhouette extruded to width, flowing front-wheel → low spine → rear
  // haunch, enclosing the middle so there's no see-through gap. Built as a
  // closed polygon in X (fwd) / Y (up), traced clockwise from the front nose.
  // Reference: long, low, near-level top line; body top ≈ wheel top.
  // =========================================================================
  // Blade body: a low faceted mass — a downward-thrusting front fairing over the
  // front wheel, a thin spine, and a big sharp rear haunch over the rear wheel.
  // Crest stays below wheel-top so open air shows above the thin spine.
  // Two chunky faceted masses (front fairing + rear haunch) joined by a thin
  // high spine. Open air ABOVE the spine and BELOW the body between the wheels,
  // exactly like the photo. Traced clockwise from the low front nose.
  const SPINE_TOP = AXLE_Y + 0.16;
  const SPINE_BOT = AXLE_Y + 0.06;   // spine underside sits ABOVE axle → open air below
  // The smooth fender DOMES (built in the wheel loop) now provide the over-wheel
  // mass, so the BODY is just the connecting blade: a low nose, a thin spine, and
  // a low tail. Keeps the top near-level (no competing tents over the wheels).
  const BODY: Array<[number, number]> = [
    // ---- front nose (low, reaches toward the front wheel) ----
    [AXLE_X + WHEEL_R * 0.5, AXLE_Y - 0.14],           // nose tip, low & forward
    [AXLE_X - 0.06, SPINE_TOP + 0.06],
    // ---- THIN SPINE across the middle (near level) ----
    [AXLE_X - 0.5, SPINE_TOP + 0.02],
    [-AXLE_X + 0.72, SPINE_TOP + 0.02],
    // ---- low tail reaching toward the rear wheel ----
    [-AXLE_X + 0.06, SPINE_TOP + 0.06],
    [-AXLE_X - WHEEL_R * 0.5, AXLE_Y - 0.14],          // tail tip, low
    // ---- underside return (thin, above axle → wheels show through below) ----
    [-AXLE_X + 0.2, SPINE_BOT - 0.02],
    [0.0, SPINE_BOT - 0.06],
    [AXLE_X - 0.2, SPINE_BOT - 0.02],
    [AXLE_X + 0.34, AXLE_Y - 0.10]
  ];
  {
    const shape = new THREE.Shape(BODY.map(([x, y]) => new THREE.Vector2(x, y)));
    // NO bevel — hard knife-edge facets like the reference.
    add(new THREE.ExtrudeGeometry(shape, { depth: BODY_HALF_W * 2, bevelEnabled: false }),
      xform(0, 0, -BODY_HALF_W), M.metal);
  }
  // thin cyan seams — sparse, mostly following the spine's long lines.
  const seamZ = BODY_HALF_W + 0.02;
  const topContour = BODY.slice(0, 6); // nose tip → tail tip (upper edge)
  for (const z of [1, -1]) {
    for (let i = 0; i < topContour.length - 1; i++) {
      const s = strip(topContour[i], topContour[i + 1], z * seamZ, 0.012, 0.02);
      parts.push({ ...s, mat: M.glow });
    }
    // one long lower spine accent line running the full length
    const lower: Array<[number, number]> = [
      [AXLE_X + 0.2, AXLE_Y - 0.08],
      [-AXLE_X - 0.1, AXLE_Y - 0.04]
    ];
    const s = strip(lower[0], lower[1], z * seamZ, 0.012, 0.02);
    parts.push({ ...s, mat: M.glow });
  }

  // =========================================================================
  // WHEELS — hubless tires with a thin bright rim-band + cyan inner rings.
  // The body (above) already provides the fender mass wrapping each wheel.
  // =========================================================================
  for (const s of [1, -1] as const) {
    const ax = s * AXLE_X;
    const inward = -s; // toward the body center
    // matte tire
    add(new THREE.TorusGeometry(WHEEL_R, WHEEL_TUBE, 16, 48),
      xform(ax, AXLE_Y, 0), M.metal);
    // thin bright rim-band on each side face — the signature TRON glow ring
    for (const z of [1, -1]) {
      add(new THREE.TorusGeometry(WHEEL_R + 0.004, 0.02, 8, 56),
        xform(ax, AXLE_Y, z * (WHEEL_TUBE - 0.012)), M.head);
    }
    // cyan inner rim rings (through the hubless center)
    add(new THREE.TorusGeometry(WHEEL_R - WHEEL_TUBE - 0.02, 0.014, 6, 48),
      xform(ax, AXLE_Y, 0), M.glow);
    add(new THREE.TorusGeometry(WHEEL_R - WHEEL_TUBE - 0.12, 0.01, 6, 48),
      xform(ax, AXLE_Y, 0), M.glow);
    // faint red brake glow at the hub, both faces
    for (const z of [1, -1]) {
      add(new THREE.TorusGeometry(0.12, 0.009, 6, 24),
        xform(ax, AXLE_Y, z * 0.03), M.tail);
    }

    // WHEEL MELD — a thin curved fender SHELL hugging the top ~third of the tire
    // (a partial torus following the tread), full body-width so wheel+body read
    // as one block. It does NOT balloon: the big glowing wheel ring stays fully
    // visible below it. A short wedge blends the fender into the spine.
    // Torus arc: authored in XY starting at +X; rotate about Z to center the
    // covered arc on top. Cover ~110° over the crown.
    const coverArc = Math.PI * 0.62;
    const fenderPhi = Math.PI / 2 - coverArc / 2;  // center the arc on +Y (top)
    const fenderMat = new THREE.Matrix4()
      .makeTranslation(ax, AXLE_Y, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(fenderPhi));
    // shell: partial torus slightly larger than the tire, flattened in Z to
    // full body width so it caps the wheel sides.
    add(new THREE.TorusGeometry(WHEEL_OUTER + 0.02, 0.11, 10, 28, coverArc),
      new THREE.Matrix4().compose(
        new THREE.Vector3(ax, AXLE_Y, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, fenderPhi)),
        new THREE.Vector3(1, 1, BODY_HALF_W / 0.11 * 1.9)  // scale tube to body width
      ), M.metal);
    void fenderMat;
    // short wedge blending the fender crown into the spine
    const blend: Array<[number, number]> = [
      [ax - inward * (WHEEL_R * 0.1), AXLE_Y + 0.42],
      [ax - inward * (WHEEL_R * 0.6), AXLE_Y + 0.22],
      [ax - inward * (WHEEL_R * 0.75), AXLE_Y - 0.02],
      [ax - inward * (WHEEL_R * 0.2), AXLE_Y - 0.04]
    ];
    const bShape = new THREE.Shape(blend.map(([x, y]) => new THREE.Vector2(x, y)));
    add(new THREE.ExtrudeGeometry(bShape, { depth: BODY_HALF_W * 2, bevelEnabled: false }),
      xform(0, 0, -BODY_HALF_W), M.metal);
    // cyan seam along the fender crown (both flanks)
    for (const z of [1, -1]) {
      const arcPt = (t: number, r: number): [number, number] => {
        const a = fenderPhi + coverArc * t;
        return [ax + Math.cos(a) * r, AXLE_Y + Math.sin(a) * r];
      };
      const M2 = 6;
      for (let i = 0; i < M2; i++) {
        const fa = strip(arcPt(i / M2, WHEEL_OUTER + 0.14), arcPt((i + 1) / M2, WHEEL_OUTER + 0.14),
          z * (BODY_HALF_W + 0.02), 0.012, 0.02);
        parts.push({ ...fa, mat: M.glow });
      }
    }
  }

  // =========================================================================
  // FRONT FORK + LOW BARS — thin struts from the front fairing to low grips.
  // =========================================================================
  const barX = GRIP.x, barY = GRIP.y;
  add(new THREE.CylinderGeometry(0.018, 0.018, GRIP.z * 2 + 0.1, 10),
    xform(barX, barY, 0, Math.PI / 2, 0, 0), M.metal);
  for (const z of [1, -1]) {
    // fork strut from front fairing down-forward to the grip
    const fork = strip([AXLE_X - 0.1, AXLE_Y + 0.12], [barX, barY], z * 0.09, 0.03, 0.05);
    parts.push({ ...fork, mat: M.metal });
    // glowing grip cap
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.045, 12),
      xform(barX, barY, z * (GRIP.z + 0.04), Math.PI / 2, 0, 0), M.glow);
  }

  // =========================================================================
  // HEADLIGHT slit (front) + RED TAIL bar (rear).
  // =========================================================================
  add(new THREE.BoxGeometry(0.05, 0.04, 0.18),
    xform(AXLE_X + 0.28, AXLE_Y + 0.06, 0), M.head);
  add(new THREE.BoxGeometry(0.03, 0.05, 0.2),
    xform(-AXLE_X - 0.34, AXLE_Y + 0.02, 0), M.tail);

  // =========================================================================
  // FOOTPEGS — rear-set pegs the rider's feet rest on.
  // =========================================================================
  for (const z of [1, -1]) {
    add(new THREE.BoxGeometry(0.06, 0.03, 0.09),
      xform(PEG.x, PEG.y - 0.02, z * (PEG.z + 0.04)), M.metal);
  }

  return parts;
}

/** Spoke-less hub disc (spins with wheelSpin): disc + turbine blades + cap. */
function buildHubGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    {
      geom: new THREE.CylinderGeometry(0.4, 0.4, 0.045, 28),
      matrix: xform(0, 0, 0, Math.PI / 2, 0, 0),
      mat: 0
    },
    {
      geom: new THREE.CylinderGeometry(0.09, 0.09, 0.075, 14),
      matrix: xform(0, 0, 0, Math.PI / 2, 0, 0),
      mat: 0
    }
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({
      geom: new THREE.BoxGeometry(0.24, 0.05, 0.062),
      matrix: xform(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0, 0, 0, a + 0.35),
      mat: 0
    });
  }
  return mergeParts(parts, false);
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
  const HEAD_Y = SPINE_UP + 0.38; // head bone world y (bind)

  // pelvis (rounded)
  p.push({ geom: new THREE.SphereGeometry(0.13, 16, 12), matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.04, 0), new THREE.Quaternion(), new THREE.Vector3(0.85, 0.7, 1)), mat: RM.suit, bone: B.hips });
  // torso: rounded lower abdomen + tapered chest (capsule reads as a human
  // trunk, not stacked slabs). Scaled to keep the athletic taper.
  p.push({ geom: new THREE.CapsuleGeometry(0.12, 0.14, 6, 16), matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.25, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 0.82)), mat: RM.suit, bone: B.spine });
  // chest: broader at the shoulders, tapering to the waist
  p.push({ geom: new THREE.SphereGeometry(0.15, 18, 14), matrix: new THREE.Matrix4().compose(new THREE.Vector3(0.02, 0.42, 0), new THREE.Quaternion(), new THREE.Vector3(0.95, 0.85, 1.05)), mat: RM.suit, bone: B.spine });
  // spine ridge plate (back armor hump)
  p.push({ geom: new THREE.BoxGeometry(0.05, 0.26, 0.14), matrix: xform(-0.13, 0.32, 0), mat: RM.suit, bone: B.spine });

  // helmet: sphere + chin guard + low fin
  p.push({ geom: new THREE.SphereGeometry(0.115, 20, 14), matrix: xform(0, HEAD_Y + 0.135, 0), mat: RM.suit, bone: B.head });
  p.push({ geom: new THREE.BoxGeometry(0.1, 0.06, 0.13), matrix: xform(0.065, HEAD_Y + 0.07, 0), mat: RM.suit, bone: B.head });
  p.push({ geom: new THREE.BoxGeometry(0.16, 0.05, 0.014), matrix: xform(-0.045, HEAD_Y + 0.225, 0), mat: RM.suit, bone: B.head });
  // cyan visor stripe wrap (band of the helmet sphere, slightly proud)
  p.push({
    geom: new THREE.SphereGeometry(0.121, 24, 4, 0, Math.PI * 2, 1.22, 0.34),
    matrix: xform(0, HEAD_Y + 0.135, 0, 0, 0, -0.1),
    mat: RM.pipe,
    bone: B.head
  });

  // collar seam ring
  p.push({
    geom: new THREE.TorusGeometry(0.085, 0.01, 6, 18),
    matrix: xform(0, 0.5, 0, Math.PI / 2, 0, 0),
    mat: RM.pipe,
    bone: B.spine
  });
  // chest center seam
  p.push({ geom: new THREE.BoxGeometry(0.012, 0.38, 0.016), matrix: xform(0.135, 0.3, 0), mat: RM.pipe, bone: B.spine });

  // chest sigil "EL" (tiny mono, boxes on the chest plate)
  const sig = (w: number, h: number, y: number, z: number): Part => ({
    geom: new THREE.BoxGeometry(0.008, h, w),
    matrix: xform(0.146, 0.4 + y, z),
    mat: RM.pipe,
    bone: B.spine
  });
  // E (strokes) at z=+0.045, L at z=-0.005 — reads left→right when viewed from +X
  p.push(sig(0.008, 0.05, 0, 0.062)); // E vertical
  p.push(sig(0.026, 0.007, 0.022, 0.048)); // E top
  p.push(sig(0.02, 0.007, 0, 0.051)); // E mid
  p.push(sig(0.026, 0.007, -0.022, 0.048)); // E bottom
  p.push(sig(0.008, 0.05, 0, 0.02)); // L vertical
  p.push(sig(0.024, 0.007, -0.022, 0.005)); // L bottom

  for (const [sh, fo, th, ca, s] of [
    [B.shL, B.foL, B.thL, B.caL, 1],
    [B.shR, B.foR, B.thR, B.caR, -1]
  ] as const) {
    const sy = SPINE_UP + SHOULDER_UP; // shoulder bind world y = 0.42
    const sz = s * SHOULDER_OUT;
    // shoulder cap + cyan pauldron accent dot
    p.push({ geom: new THREE.SphereGeometry(0.068, 12, 8), matrix: xform(0, sy, sz), mat: RM.suit, bone: sh });
    p.push({ geom: new THREE.BoxGeometry(0.03, 0.012, 0.05), matrix: xform(0, sy + 0.06, sz + s * 0.02), mat: RM.pipe, bone: sh });
    // upper arm + seam
    p.push({ geom: new THREE.CapsuleGeometry(0.052, 0.2, 4, 10), matrix: xform(0, sy - 0.15, sz), mat: RM.suit, bone: sh });
    p.push({ geom: new THREE.BoxGeometry(0.012, 0.24, 0.012), matrix: xform(0, sy - 0.15, sz + s * 0.052), mat: RM.pipe, bone: sh });
    // forearm + hand + seam
    const ey = sy - ARM_A; // elbow bind y
    p.push({ geom: new THREE.CapsuleGeometry(0.047, 0.2, 4, 10), matrix: xform(0, ey - 0.15, sz), mat: RM.suit, bone: fo });
    p.push({ geom: new THREE.BoxGeometry(0.065, 0.1, 0.07), matrix: xform(0.01, ey - 0.315, sz), mat: RM.suit, bone: fo });
    p.push({ geom: new THREE.BoxGeometry(0.012, 0.2, 0.012), matrix: xform(0, ey - 0.13, sz + s * 0.048), mat: RM.pipe, bone: fo });
    // forearm gauntlet cuff (cyan ring near the wrist)
    p.push({ geom: new THREE.TorusGeometry(0.052, 0.008, 6, 14), matrix: xform(0, ey - 0.25, sz, 0, 0, Math.PI / 2), mat: RM.pipe, bone: fo });

    const hz = s * 0.1; // hip joint z
    // thigh + seam
    p.push({ geom: new THREE.CapsuleGeometry(0.074, 0.26, 4, 10), matrix: xform(0, -0.22, hz), mat: RM.suit, bone: th });
    p.push({ geom: new THREE.BoxGeometry(0.012, 0.3, 0.012), matrix: xform(0, -0.2, hz + s * 0.072), mat: RM.pipe, bone: th });
    // calf + boot + buckles + knee pad
    const ky = -0.02 - LEG_A; // knee bind y
    p.push({ geom: new THREE.CapsuleGeometry(0.058, 0.3, 4, 10), matrix: xform(0, ky - 0.21, hz), mat: RM.suit, bone: ca });
    // armored knee pad (suit) with a cyan cap dot (pipe) at the top of the calf bone
    p.push({ geom: new THREE.BoxGeometry(0.1, 0.09, 0.1), matrix: xform(0.03, ky - 0.02, hz), mat: RM.suit, bone: ca });
    p.push({ geom: new THREE.BoxGeometry(0.02, 0.03, 0.03), matrix: xform(0.085, ky - 0.02, hz), mat: RM.pipe, bone: ca });
    p.push({ geom: new THREE.BoxGeometry(0.24, 0.09, 0.095), matrix: xform(0.055, ky - LEG_B + 0.01, hz), mat: RM.suit, bone: ca });
    for (const bx of [0.02, 0.09]) {
      p.push({
        geom: new THREE.BoxGeometry(0.018, 0.02, 0.012),
        matrix: xform(bx, ky - LEG_B + 0.035, hz + s * 0.052),
        mat: RM.pipe,
        bone: ca
      });
    }
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

  // Wheel hoops — rotated 90 degrees around the Y axis so the torus ring lies in
  // the YZ plane (perpendicular to the bike's forward axis +X). This makes the
  // wheels appear as circles when the camera looks from behind or in front
  // (the typical finale chase angle). Without this rotation the default XY-plane
  // torus renders as a thin sliver from the ±X directions.
  // Keep radialSegments=4, tubularSegments=10 to stay within the 400-tri budget.
  for (const s of [1, -1]) {
    add(
      new THREE.TorusGeometry(WHEEL_R, WHEEL_TUBE, 4, 10),
      xform(s * AXLE_X, AXLE_Y, 0, 0, Math.PI / 2, 0)
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

  // Dark body that still READS as a lit surface (not a black void): moderate
  // metalness + a lighter-than-pitch base so key/fill light reveals the facets.
  // The reference is near-black but shown under strong studio light; this
  // approximates that so the sculpted panels are visible, not just the seams.
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2a3242,
    metalness: 0.55,
    roughness: 0.42
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x021014,
    emissive: cyan,
    emissiveIntensity: 1.0
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x0a1416,
    emissive: headlightColor,
    emissiveIntensity: 1.5,
    side: THREE.DoubleSide
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x120608,
    emissive: tailRed,
    emissiveIntensity: 0.9
  });
  // Engine core: warm amber glow — the bike's one non-cyan light, the bright
  // reactor mass hanging under the chassis in the reference.
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x140a02,
    emissive: new THREE.Color(0xffb347),
    emissiveIntensity: 1.7,
    side: THREE.DoubleSide
  });
  // Rider suit is a distinctly lighter, warmer grey than the near-black bike
  // metal so the figure reads as its own silhouette instead of melding in.
  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f4d,
    metalness: 0.25,
    roughness: 0.7
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

  // static merged bike (5 material groups)
  const staticMesh = new THREE.Mesh(mergeParts(buildBikeStatic(rng), false), [
    metalMat,
    glowMat,
    headMat,
    tailMat,
    coreMat
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

    // hips: seated in the central spine dip, ON TOP of the body (raised so the
    // torso rides above the spine crest, not clipping through it).
    const hip = new THREE.Vector3(
      THREE.MathUtils.lerp(-0.14, -0.05, c),
      THREE.MathUtils.lerp(0.9, 1.1, c),
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
