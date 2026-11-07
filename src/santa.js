import * as THREE from "three";
import { approach } from "./collision.js";
import { GRAVITY } from "./config.js";

/**
 * The Santa skin: an outfit on the existing runner, a sled under it, and a
 * reindeer in front of it while super sneakers run.
 *
 * Every piece here is presentation. The collision test reads the player's x, y
 * and height and never a mesh, so nothing in this file can widen a hitbox, and
 * nothing here writes to any of those numbers.
 *
 * Built the first time it is worn, so the other skins never pay for it.
 */

/** Where the reindeer stands, ahead of the sled, in the runner's own scale. */
const REINDEER_Z = 1.55;
/** How far ahead of the sled's arc the reindeer flies, in seconds. */
const LEAP_LEAD = 0.1;
const LEAP_MAX = 1.1;
/** Metres the sled and its rider ride up to clear a deployed hoverboard. */
const BOARD_LIFT = 0.16;
/** Top of the antlers. Kept under a roof the runner has been stopped beneath. */
const REINDEER_HEIGHT = 2.3;
const REINDEER_GROW_SECONDS = 0.18;

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function makeOutfit() {
  const outfit = new THREE.Group();
  const red = lambert(0xc62828);
  const white = lambert(0xf8fafc);

  // The hat leans back, towards the camera, because the camera is what reads it.
  add(outfit, new THREE.CylinderGeometry(0.225, 0.225, 0.08, 14), white, 0, 1.02, 0);
  const cone = add(outfit, new THREE.ConeGeometry(0.19, 0.42, 12), red, 0, 1.24, -0.06);
  cone.rotation.x = -0.4;
  add(outfit, new THREE.SphereGeometry(0.075, 8, 8), white, 0, 1.42, -0.15);

  // Wider than the face, so it shows around the head from behind.
  const beard = add(outfit, new THREE.SphereGeometry(0.2, 12, 10), white, 0, 0.76, 0.1);
  beard.scale.set(1.15, 1.15, 0.8);

  // Belt and buckle over the runner's own torso.
  add(outfit, box(0.54, 0.08, 0.38), lambert(0x1c1917), 0, 0.2, 0);
  add(outfit, box(0.12, 0.1, 0.03), lambert(0xfacc15), 0, 0.2, 0.2);

  return outfit;
}

function makeSled() {
  const sled = new THREE.Group();
  const red = lambert(0xb91c1c);
  const gold = lambert(0xfacc15, { emissive: 0x7a5d00, emissiveIntensity: 0.35 });
  const sack = lambert(0x8d6e63);

  add(sled, box(0.66, 0.08, 1.2), lambert(0x7f1d1d), 0, 0.2, 0);
  add(sled, box(0.66, 0.44, 0.08), red, 0, 0.42, -0.58);
  add(sled, box(0.66, 0.1, 0.08), gold, 0, 0.66, -0.58);
  const nose = add(sled, box(0.66, 0.34, 0.08), red, 0, 0.36, 0.62);
  nose.rotation.x = -0.5;

  for (const side of [-1, 1]) {
    add(sled, box(0.07, 0.26, 1.2), red, side * 0.33, 0.3, 0);
    add(sled, box(0.08, 0.04, 1.22), gold, side * 0.33, 0.45, 0);

    add(sled, box(0.06, 0.05, 1.5), gold, side * 0.26, 0.04, 0);
    const tip = add(sled, box(0.06, 0.05, 0.3), gold, side * 0.26, 0.1, 0.85);
    tip.rotation.x = -0.75;
    for (const z of [-0.42, 0.42]) add(sled, box(0.04, 0.14, 0.04), gold, side * 0.26, 0.12, z);
  }

  // The sack, with one parcel showing, behind the rider where the camera sees it.
  const bag = add(sled, new THREE.SphereGeometry(0.3, 10, 8), sack, 0, 0.68, -0.42);
  bag.scale.set(1, 0.95, 0.8);
  const tie = add(sled, new THREE.TorusGeometry(0.09, 0.03, 6, 12), gold, 0, 0.94, -0.42);
  tie.rotation.x = Math.PI / 2;
  add(sled, box(0.16, 0.14, 0.16), lambert(0x16a34a), 0.14, 0.96, -0.44).rotation.y = 0.5;

  sled.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return sled;
}

function makeReindeer() {
  const reindeer = new THREE.Group();
  reindeer.position.z = REINDEER_Z;
  const fur = lambert(0x8d5a2b);
  const dark = lambert(0x4e342e);
  const pale = lambert(0xf1e3cf);

  add(reindeer, box(0.34, 0.34, 0.78), fur, 0, 0.68, 0);
  add(reindeer, box(0.1, 0.12, 0.06), pale, 0, 0.8, -0.42);
  add(reindeer, box(0.38, 0.09, 0.14), lambert(0xc62828), 0, 0.84, 0.3);
  add(reindeer, new THREE.SphereGeometry(0.06, 8, 8), lambert(0xfacc15), 0, 0.76, 0.4);
  const neck = add(reindeer, box(0.18, 0.42, 0.18), fur, 0, 0.98, 0.36);
  neck.rotation.x = 0.3;

  // The head turns on a pivot, because the camera sits behind and a nose that
  // only ever points away from it is a nose nobody sees.
  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.46);
  reindeer.add(head);
  add(head, box(0.22, 0.2, 0.3), fur, 0, 0, 0.06);
  add(head, box(0.15, 0.13, 0.16), pale, 0, -0.03, 0.27);
  add(head, new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff1744 }), 0, -0.01, 0.37);
  const glow = add(
    head,
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.32, depthWrite: false }),
    0,
    -0.01,
    0.37,
  );
  glow.renderOrder = 1;

  for (const side of [-1, 1]) {
    const ear = add(head, box(0.14, 0.05, 0.07), fur, side * 0.16, 0.08, -0.04);
    ear.rotation.z = side * 0.4;

    // Big and branching: this is the silhouette the camera actually gets.
    const antler = new THREE.Group();
    antler.position.set(side * 0.08, 0.1, -0.04);
    antler.rotation.z = side * -0.5;
    head.add(antler);
    add(antler, box(0.05, 0.56, 0.05), dark, 0, 0.28, 0);
    for (const [y, length, lean] of [
      [0.2, 0.24, 1.0],
      [0.34, 0.22, -1.0],
      [0.48, 0.2, 0.9],
    ]) {
      const tine = add(antler, box(0.04, length, 0.04), dark, Math.sin(lean) * length * 0.5, y, 0);
      tine.rotation.z = -lean;
    }
  }

  const legs = [];
  for (const [x, z] of [
    [-0.12, 0.3],
    [0.12, 0.3],
    [-0.12, -0.3],
    [0.12, -0.3],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.54, z);
    add(leg, box(0.09, 0.46, 0.09), fur, 0, -0.23, 0);
    add(leg, box(0.1, 0.08, 0.12), dark, 0, -0.48, 0.01);
    reindeer.add(leg);
    legs.push(leg);
  }

  return { reindeer, head, legs };
}

function buildSanta(p) {
  const outfit = makeOutfit();
  p.hip.add(outfit);
  const sled = makeSled();
  p.root.add(sled);

  const { reindeer, head, legs } = makeReindeer();
  reindeer.visible = false;
  p.root.add(reindeer);

  // Reins join the sled to a moving reindeer, so they are re-laid every frame.
  const leather = lambert(0xfacc15);
  const reins = [-1, 1].map((side) => {
    const rein = add(p.root, box(0.03, 0.03, 1), leather, side * 0.14, 0, 0);
    rein.visible = false;
    return rein;
  });

  return { on: false, outfit, sled, reindeer, head, legs, reins, pulling: false, leap: 0, grow: 0 };
}

/** Take the reindeer off the track at once, with nothing left behind. */
function dismiss(s) {
  s.pulling = false;
  s.leap = 0;
  s.grow = 0;
  s.reindeer.visible = false;
  s.reindeer.position.y = 0;
  s.reindeer.rotation.x = 0;
  for (const rein of s.reins) rein.visible = false;
}

/** Put the Santa skin on or take it off. Safe for any skin, any number of times. */
export function setSanta(p, on) {
  if (on && !p.santa) p.santa = buildSanta(p);
  const s = p.santa;
  if (!s) return;

  s.on = on;
  s.outfit.visible = on;
  s.sled.visible = on;
  dismiss(s);

  for (const pack of p.parts.pack) pack.visible = !on;
  // A board the sled sits on has to stick out from under it, or the one thing
  // saying "this run has a shield left" is hidden by the sled.
  p.board.scale.set(on ? 1.75 : 1, 1, on ? 1.6 : 1);
  // Behind the sled rather than inside the sack.
  p.jets.position.set(0, on ? -0.18 : 0, on ? -0.56 : 0);

  if (!on) {
    p.hip.position.y = 0.86;
    for (const leg of p.legs) leg.children[0].rotation.x = 0;
  }
}

/** Back to the start of a run. The skin stays; the transformation does not. */
export function resetSanta(p) {
  const s = p.santa;
  if (!s) return;
  dismiss(s);
  s.sled.position.y = 0;
  s.sled.rotation.x = 0;
}

/** Seated, with the same head-down lean the runner's own slide uses. */
function poseRider(p, s) {
  const ducking = p.sliding || p.diving;
  const lean = ducking ? 1.25 : p.flying ? -0.12 : p.jumping ? -0.16 : 0.06;
  p.hip.rotation.x = lean;
  // Sitting, whatever the state; the runner's own bob is a stride, not a sled.
  p.hip.position.y = (ducking ? 0.38 : 0.44) + Math.sin(p.runT * 9) * (p.jumping ? 0 : 0.012);

  const hands = ducking ? -0.5 : p.jumping ? -1.5 : s.pulling ? -1.15 : -0.7;
  p.arms[0].rotation.x = hands;
  p.arms[1].rotation.x = hands;
  // Thighs level whichever way the body is leaning, shins folded into the sled.
  for (const leg of p.legs) {
    leg.rotation.x = -1.45 - lean;
    leg.children[0].rotation.x = 1.25;
  }
}

function layReins(s, lift) {
  const fromY = 0.46 + lift;
  const fromZ = 0.62;
  const toY = 0.86 + s.reindeer.position.y;
  const toZ = REINDEER_Z + 0.3;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  for (const rein of s.reins) {
    rein.visible = true;
    rein.position.y = (fromY + toY) / 2;
    rein.position.z = (fromZ + toZ) / 2;
    rein.scale.z = Math.hypot(dy, dz);
    rein.rotation.x = -Math.atan2(dy, dz);
  }
}

/**
 * The reindeer flies the same arc a tenth of a second early, so it reads as
 * leaping first and hauling the sled up after it. Height is taken from the
 * arc's own velocity rather than simulated, so it cannot drift from the jump.
 */
function leapTarget(p, ceiling) {
  const airborne = !p.flying && !p.mounted && (p.jumping || p.y > 0);
  if (!airborne) return 0;
  const ahead = p.vy * LEAP_LEAD + 0.5 * GRAVITY * LEAP_LEAD * LEAP_LEAD;
  const high = ceiling == null ? LEAP_MAX : Math.max(0, Math.min(LEAP_MAX, ceiling - p.y - REINDEER_HEIGHT));
  return THREE.MathUtils.clamp(ahead, -Math.min(LEAP_MAX, p.y), high);
}

/**
 * Runs after the player's own animation has written its pose, and overwrites
 * the parts a seated rider holds differently.
 *
 * @param {{ reindeer?: boolean, ceiling?: number|null }} ctx
 */
export function updateSanta(p, dt, speed, { reindeer = false, ceiling = null } = {}) {
  const s = p.santa;
  if (!s?.on || !p.alive) {
    if (s?.pulling) dismiss(s);
    return;
  }

  const lift = p.boarding ? BOARD_LIFT : 0;
  s.sled.position.y = lift;
  const pitch = p.jumping || p.diving ? THREE.MathUtils.clamp(p.vy * -0.02, -0.3, 0.3) : 0;
  s.sled.rotation.x += (pitch - s.sled.rotation.x) * approach(9, dt);

  if (reindeer && !s.pulling) {
    s.pulling = true;
    s.reindeer.visible = true;
  } else if (!reindeer && s.pulling) {
    dismiss(s);
  }

  poseRider(p, s);
  p.hip.position.y += lift;
  p.shadow.scale.x *= 1.15;
  p.shadow.scale.y *= 1.5;
  if (!s.pulling) return;

  s.grow = Math.min(1, s.grow + dt / REINDEER_GROW_SECONDS);
  // A low crouch going under a gate, so the antlers do not cut through it.
  const crouch = p.sliding ? 0.55 : 1;
  s.reindeer.scale.set(s.grow, s.grow * crouch, s.grow);

  s.leap += (leapTarget(p, ceiling) - s.leap) * approach(18, dt);
  s.reindeer.position.y = s.leap + lift * 0.6;
  s.reindeer.rotation.x = THREE.MathUtils.clamp(p.vy * -0.035, -0.5, 0.5);

  const stride = p.runT * (10 + speed * 0.1);
  const airborne = p.jumping || p.flying;
  s.legs.forEach((leg, i) => {
    const front = i < 2;
    leg.rotation.x = airborne
      ? (front ? -1.1 : 1.1)
      : Math.sin(stride + (i % 2) * 0.7 + (front ? 0 : Math.PI)) * 0.85;
  });
  s.head.rotation.y = Math.sin(p.runT * 1.3) * 0.75;

  layReins(s, lift);
}
