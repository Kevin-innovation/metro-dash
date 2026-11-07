import * as THREE from "three";
import { approach } from "./collision.js";
import { GRAVITY } from "./config.js";

/**
 * The Christmas skins, as 3D costumes.
 *
 * Three kinds. A sled skin sits the runner on a sled, with reindeer in front
 * while super sneakers run. A dress-up adds clothes to the runner and leaves the
 * stride alone. A mascot hides the runner and moves something else entirely.
 *
 * Every piece here is presentation. The collision test reads the player's x, y
 * and height and never a mesh, so nothing in this file can widen a hitbox, and
 * nothing here writes to any of those numbers.
 *
 * Each is built the first time it is worn, so the other skins never pay for it.
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
/** The Rudolph skin. As tall as the runner it replaces, antlers included. */
const RUDOLPH_SCALE = 1.15;

const BROWN_DEER = { fur: 0x8d5a2b, antler: 0x4e342e, pale: 0xf1e3cf, collar: 0xc62828, bell: 0xfacc15 };

const SLED_STYLES = {
  santa: {
    hat: 0xc62828,
    fur: 0xf8fafc,
    beard: 0xf8fafc,
    belt: 0x1c1917,
    buckle: 0xfacc15,
    body: 0xb91c1c,
    floor: 0x7f1d1d,
    trim: 0xfacc15,
    trimGlow: 0x7a5d00,
    sack: 0x8d6e63,
    parcel: 0x16a34a,
    rein: 0xfacc15,
    deer: BROWN_DEER,
    herd: [[0, REINDEER_Z]],
    dust: 0xdff3ff,
  },
  // Gold on everything, and the only sled with a team of three.
  supersanta: {
    hat: 0xf59e0b,
    fur: 0xfffbeb,
    beard: 0xfffbeb,
    belt: 0x7c2d12,
    buckle: 0xfff7ed,
    body: 0xf59e0b,
    floor: 0xb45309,
    trim: 0xfff1b8,
    trimGlow: 0xb7791f,
    sack: 0x991b1b,
    parcel: 0xffffff,
    rein: 0xfff1b8,
    deer: { fur: 0xb7791f, antler: 0xfacc15, pale: 0xfff7ed, collar: 0x991b1b, bell: 0xfff1b8 },
    herd: [
      [-0.36, REINDEER_Z],
      [0.36, REINDEER_Z],
      [0, REINDEER_Z + 1.15],
    ],
    dust: 0xffe082,
  },
  // Black with one colour only, a hard crimson, so it reads as a threat at a glance.
  blacksanta: {
    hat: 0x18181b,
    fur: 0xdc2626,
    beard: 0xd4d4d8,
    belt: 0x7f1d1d,
    buckle: 0xef4444,
    body: 0x1f1f23,
    floor: 0x09090b,
    trim: 0xdc2626,
    trimGlow: 0x7f1d1d,
    sack: 0x450a0a,
    parcel: 0xdc2626,
    rein: 0xdc2626,
    deer: { fur: 0x27272a, antler: 0x7f1d1d, pale: 0x52525b, collar: 0xdc2626, bell: 0xef4444 },
    herd: [[0, REINDEER_Z]],
    dust: 0xff8a80,
  },
};

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function add(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function makeOutfit(style) {
  const outfit = new THREE.Group();
  const fur = lambert(style.fur);

  // The hat leans back, towards the camera, because the camera is what reads it.
  add(outfit, new THREE.CylinderGeometry(0.225, 0.225, 0.08, 14), fur, 0, 1.02, 0);
  const cone = add(outfit, new THREE.ConeGeometry(0.19, 0.42, 12), lambert(style.hat), 0, 1.24, -0.06);
  cone.rotation.x = -0.4;
  add(outfit, new THREE.SphereGeometry(0.075, 8, 8), fur, 0, 1.42, -0.15);

  // Wider than the face, so it shows around the head from behind.
  const beard = add(outfit, new THREE.SphereGeometry(0.2, 12, 10), lambert(style.beard), 0, 0.76, 0.1);
  beard.scale.set(1.15, 1.15, 0.8);

  // Belt and buckle over the runner's own torso.
  add(outfit, box(0.54, 0.08, 0.38), lambert(style.belt), 0, 0.2, 0);
  add(outfit, box(0.12, 0.1, 0.03), lambert(style.buckle), 0, 0.2, 0.2);

  return outfit;
}

function makeSled(style) {
  const sled = new THREE.Group();
  const body = lambert(style.body);
  const trim = lambert(style.trim, { emissive: style.trimGlow, emissiveIntensity: 0.35 });

  add(sled, box(0.66, 0.08, 1.2), lambert(style.floor), 0, 0.2, 0);
  add(sled, box(0.66, 0.44, 0.08), body, 0, 0.42, -0.58);
  add(sled, box(0.66, 0.1, 0.08), trim, 0, 0.66, -0.58);
  const nose = add(sled, box(0.66, 0.34, 0.08), body, 0, 0.36, 0.62);
  nose.rotation.x = -0.5;

  for (const side of [-1, 1]) {
    add(sled, box(0.07, 0.26, 1.2), body, side * 0.33, 0.3, 0);
    add(sled, box(0.08, 0.04, 1.22), trim, side * 0.33, 0.45, 0);

    add(sled, box(0.06, 0.05, 1.5), trim, side * 0.26, 0.04, 0);
    const tip = add(sled, box(0.06, 0.05, 0.3), trim, side * 0.26, 0.1, 0.85);
    tip.rotation.x = -0.75;
    for (const z of [-0.42, 0.42]) add(sled, box(0.04, 0.14, 0.04), trim, side * 0.26, 0.12, z);
  }

  // The sack, with one parcel showing, behind the rider where the camera sees it.
  const bag = add(sled, new THREE.SphereGeometry(0.3, 10, 8), lambert(style.sack), 0, 0.68, -0.42);
  bag.scale.set(1, 0.95, 0.8);
  const tie = add(sled, new THREE.TorusGeometry(0.09, 0.03, 6, 12), trim, 0, 0.94, -0.42);
  tie.rotation.x = Math.PI / 2;
  add(sled, box(0.16, 0.14, 0.16), lambert(style.parcel), 0.14, 0.96, -0.44).rotation.y = 0.5;

  sled.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return sled;
}

function makeDeer(colours) {
  const group = new THREE.Group();
  const fur = lambert(colours.fur);
  const antlers = lambert(colours.antler);
  const pale = lambert(colours.pale);

  add(group, box(0.34, 0.34, 0.78), fur, 0, 0.68, 0);
  add(group, box(0.1, 0.12, 0.06), pale, 0, 0.8, -0.42);
  add(group, box(0.38, 0.09, 0.14), lambert(colours.collar), 0, 0.84, 0.3);
  add(group, new THREE.SphereGeometry(0.06, 8, 8), lambert(colours.bell), 0, 0.76, 0.4);
  const neck = add(group, box(0.18, 0.42, 0.18), fur, 0, 0.98, 0.36);
  neck.rotation.x = 0.3;

  // The head turns on a pivot, because the camera sits behind and a nose that
  // only ever points away from it is a nose nobody sees.
  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.46);
  group.add(head);
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
    add(antler, box(0.05, 0.56, 0.05), antlers, 0, 0.28, 0);
    for (const [y, length, lean] of [
      [0.2, 0.24, 1.0],
      [0.34, 0.22, -1.0],
      [0.48, 0.2, 0.9],
    ]) {
      const tine = add(antler, box(0.04, length, 0.04), antlers, Math.sin(lean) * length * 0.5, y, 0);
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
    add(leg, box(0.1, 0.08, 0.12), antlers, 0, -0.48, 0.01);
    group.add(leg);
    legs.push(leg);
  }

  return { group, head, legs };
}

function buildSledSkin(p, style) {
  const outfit = makeOutfit(style);
  p.hip.add(outfit);
  const sled = makeSled(style);
  p.root.add(sled);

  const reindeer = new THREE.Group();
  reindeer.visible = false;
  p.root.add(reindeer);
  const herd = style.herd.map(([x, z]) => {
    const deer = makeDeer(style.deer);
    deer.group.position.set(x, 0, z);
    reindeer.add(deer.group);
    return { ...deer, x, z };
  });

  // Reins join the sled to moving reindeer, so they are re-laid every frame.
  const leather = lambert(style.rein);
  const reins = herd.flatMap((deer) =>
    [-1, 1].map((side) => {
      const mesh = add(p.root, box(0.03, 0.03, 1), leather);
      mesh.rotation.order = "YXZ";
      mesh.visible = false;
      return { mesh, side, deer };
    }),
  );

  return {
    kind: "sled",
    on: false,
    style,
    parts: [outfit, sled],
    outfit,
    sled,
    reindeer,
    herd,
    reins,
    pulling: false,
    leap: 0,
    grow: 0,
  };
}

/** A pointed hat, ears and a belt on the runner's own body. */
function buildElf(p) {
  const outfit = new THREE.Group();
  const green = lambert(0x15803d);
  const red = lambert(0xdc2626);
  const gold = lambert(0xfacc15);
  const skin = lambert(0xffdbb4);

  add(outfit, new THREE.CylinderGeometry(0.225, 0.225, 0.08, 14), red, 0, 1.02, 0);
  const cone = add(outfit, new THREE.ConeGeometry(0.19, 0.62, 12), green, 0, 1.3, -0.12);
  cone.rotation.x = -0.65;
  add(outfit, new THREE.SphereGeometry(0.07, 8, 8), gold, 0, 1.52, -0.3);
  for (const side of [-1, 1]) {
    const ear = add(outfit, new THREE.ConeGeometry(0.05, 0.2, 6), skin, side * 0.25, 0.9, 0);
    ear.rotation.z = side * -1.2;
  }
  add(outfit, box(0.54, 0.08, 0.38), lambert(0x1c1917), 0, 0.2, 0);
  add(outfit, box(0.12, 0.1, 0.03), gold, 0, 0.2, 0.2);
  p.hip.add(outfit);
  return { kind: "dress", on: false, parts: [outfit], outfit };
}

function buildSnowman(p) {
  const model = new THREE.Group();
  const snow = lambert(0xf8fafc, { emissive: 0x93c5fd, emissiveIntensity: 0.18 });
  const coal = lambert(0x1f2937);
  const scarf = lambert(0xdc2626);
  const stick = lambert(0x6b4226);
  const mitten = lambert(0x2563eb);

  add(model, new THREE.SphereGeometry(0.44, 14, 10), snow, 0, 0.42, 0);
  add(model, new THREE.SphereGeometry(0.33, 14, 10), snow, 0, 1.0, 0);
  for (const y of [0.92, 1.08]) add(model, new THREE.SphereGeometry(0.04, 6, 6), coal, 0, y, 0.32);

  // The scarf and its tail are what the camera sees from behind.
  const wrap = add(model, new THREE.TorusGeometry(0.2, 0.06, 8, 16), scarf, 0, 1.28, 0);
  wrap.rotation.x = Math.PI / 2;
  const tail = add(model, box(0.13, 0.42, 0.05), scarf, 0.1, 1.08, -0.3);
  add(tail, box(0.135, 0.06, 0.055), lambert(0xfacc15), 0, -0.12, 0);

  const head = new THREE.Group();
  head.position.y = 1.48;
  model.add(head);
  add(head, new THREE.SphereGeometry(0.24, 14, 10), snow);
  for (const side of [-1, 1]) add(head, new THREE.SphereGeometry(0.035, 6, 6), coal, side * 0.09, 0.05, 0.21);
  const carrot = add(head, new THREE.ConeGeometry(0.05, 0.28, 8), lambert(0xf97316), 0, 0, 0.34);
  carrot.rotation.x = Math.PI / 2;
  // A bucket: wider at the top than at the brim, in a metal that reads on white.
  add(head, new THREE.CylinderGeometry(0.21, 0.17, 0.24, 14), lambert(0x475569), 0, 0.3, 0);
  add(head, new THREE.CylinderGeometry(0.215, 0.215, 0.04, 14), lambert(0xcbd5e1), 0, 0.42, 0);
  const handle = add(head, new THREE.TorusGeometry(0.19, 0.012, 6, 16, Math.PI), lambert(0xcbd5e1), 0, 0.3, 0);
  handle.rotation.y = 0.5;

  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 1.08, 0);
    arm.rotation.z = side * -1.0;
    add(arm, box(0.04, 0.46, 0.04), stick, 0, 0.23, 0);
    add(arm, new THREE.SphereGeometry(0.075, 8, 6), mitten, 0, 0.48, 0);
    model.add(arm);
    return arm;
  });

  p.root.add(model);
  return { kind: "mascot", mascot: "snowman", on: false, parts: [model], model, head, arms, scale: 1 };
}

function buildRudolph(p) {
  const deer = makeDeer(BROWN_DEER);
  const model = deer.group;
  // A saddle cloth, so there is colour on the back the camera is looking at.
  add(model, box(0.36, 0.06, 0.4), lambert(0xc62828), 0, 0.87, -0.06);
  add(model, box(0.37, 0.025, 0.42), lambert(0xfacc15), 0, 0.84, -0.06);
  p.root.add(model);
  return { kind: "mascot", mascot: "rudolph", on: false, parts: [model], model, deer, scale: RUDOLPH_SCALE };
}

const BUILD = {
  santa: (p) => buildSledSkin(p, SLED_STYLES.santa),
  supersanta: (p) => buildSledSkin(p, SLED_STYLES.supersanta),
  blacksanta: (p) => buildSledSkin(p, SLED_STYLES.blacksanta),
  elf: buildElf,
  snowman: buildSnowman,
  rudolph: buildRudolph,
};

/** Take the reindeer off the track at once, with nothing left behind. */
function dismiss(c) {
  c.pulling = false;
  c.leap = 0;
  c.grow = 0;
  c.reindeer.visible = false;
  c.reindeer.position.y = 0;
  for (const deer of c.herd) deer.group.rotation.x = 0;
  for (const rein of c.reins) rein.mesh.visible = false;
}

/** Everything on the hip except the flames and any costume. */
function showRunner(p, visible) {
  for (const child of p.hip.children) {
    if (child !== p.jets && !child.userData.costume) child.visible = visible;
  }
}

function takeOff(p, c) {
  c.on = false;
  for (const part of c.parts) part.visible = false;
  if (c.kind === "sled") dismiss(c);
  showRunner(p, true);
  p.board.scale.set(1, 1, 1);
  p.jets.position.set(0, 0, 0);
  p.hip.position.y = 0.86;
  for (const leg of p.legs) leg.children[0].rotation.x = 0;
}

/**
 * Wear the costume for a character id, or none if it has none, and take the last
 * one off. Safe for any id, any number of times.
 */
export function setCostume(p, id) {
  if (p.costume?.on) takeOff(p, p.costume);
  const build = BUILD[id];
  if (!build) return;

  if (!p.costumes[id]) {
    p.costumes[id] = build(p);
    for (const part of p.costumes[id].parts) part.userData.costume = true;
  }
  const c = p.costumes[id];
  p.costume = c;
  c.on = true;
  for (const part of c.parts) part.visible = true;

  if (c.kind === "sled") {
    for (const pack of p.parts.pack) pack.visible = false;
    // A board the sled sits on has to stick out from under it, or the one thing
    // saying "this run has a shield left" is hidden by the sled.
    p.board.scale.set(1.75, 1, 1.6);
    // Behind the sled rather than inside the sack.
    p.jets.position.set(0, -0.18, -0.56);
  } else if (c.kind === "mascot") {
    showRunner(p, false);
    p.board.scale.set(1.5, 1, 1.4);
    p.jets.position.set(0, 0, -0.26);
  }
}

/** Back to the start of a run. The skin stays; the transformation does not. */
export function resetCostume(p) {
  const c = p.costume;
  if (c?.kind === "sled") {
    dismiss(c);
    c.sled.position.y = 0;
    c.sled.rotation.x = 0;
  } else if (c?.kind === "mascot") {
    c.model.rotation.set(0, 0, 0);
    c.model.position.y = 0;
    c.model.scale.setScalar(c.scale);
  }
}

/** Seated, with the same head-down lean the runner's own slide uses. */
function poseRider(p, c) {
  const ducking = p.sliding || p.diving;
  const lean = ducking ? 1.25 : p.flying ? -0.12 : p.jumping ? -0.16 : 0.06;
  p.hip.rotation.x = lean;
  // Sitting, whatever the state; the runner's own bob is a stride, not a sled.
  p.hip.position.y = (ducking ? 0.38 : 0.44) + Math.sin(p.runT * 9) * (p.jumping ? 0 : 0.012);

  const hands = ducking ? -0.5 : p.jumping ? -1.5 : c.pulling ? -1.15 : -0.7;
  p.arms[0].rotation.x = hands;
  p.arms[1].rotation.x = hands;
  // Thighs level whichever way the body is leaning, shins folded into the sled.
  for (const leg of p.legs) {
    leg.rotation.x = -1.45 - lean;
    leg.children[0].rotation.x = 1.25;
  }
}

function layReins(c, lift) {
  const fromY = 0.46 + lift;
  const fromZ = 0.62;
  const toY = 0.86 + c.reindeer.position.y;
  for (const { mesh, side, deer } of c.reins) {
    const fromX = side * 0.14;
    const toX = deer.x + side * 0.1;
    const toZ = deer.z + 0.3;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dz = toZ - fromZ;
    mesh.visible = true;
    mesh.position.set((fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2);
    mesh.scale.z = Math.hypot(dx, dy, dz);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
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

/** Legs and head for one deer, whichever skin it belongs to. */
function gallop(deer, p, speed, phase = 0) {
  const stride = p.runT * (10 + speed * 0.1) + phase;
  const airborne = p.jumping || p.flying;
  deer.legs.forEach((leg, i) => {
    const front = i < 2;
    leg.rotation.x = airborne
      ? (front ? -1.1 : 1.1)
      : Math.sin(stride + (i % 2) * 0.7 + (front ? 0 : Math.PI)) * 0.85;
  });
  deer.head.rotation.y = Math.sin(p.runT * 1.3 + phase) * 0.75;
}

function updateSled(p, c, dt, speed, reindeer, ceiling) {
  const lift = p.boarding ? BOARD_LIFT : 0;
  c.sled.position.y = lift;
  const pitch = p.jumping || p.diving ? THREE.MathUtils.clamp(p.vy * -0.02, -0.3, 0.3) : 0;
  c.sled.rotation.x += (pitch - c.sled.rotation.x) * approach(9, dt);

  if (reindeer && !c.pulling) {
    c.pulling = true;
    c.reindeer.visible = true;
  } else if (!reindeer && c.pulling) {
    dismiss(c);
  }

  poseRider(p, c);
  p.hip.position.y += lift;
  p.shadow.scale.x *= 1.15;
  p.shadow.scale.y *= 1.5;
  if (!c.pulling) return;

  c.grow = Math.min(1, c.grow + dt / REINDEER_GROW_SECONDS);
  // A low crouch going under a gate, so the antlers do not cut through it.
  const crouch = p.sliding ? 0.55 : 1;
  c.reindeer.scale.set(c.grow, c.grow * crouch, c.grow);

  c.leap += (leapTarget(p, ceiling) - c.leap) * approach(18, dt);
  c.reindeer.position.y = c.leap + lift * 0.6;

  c.herd.forEach((deer, i) => {
    deer.group.rotation.x = THREE.MathUtils.clamp(p.vy * -0.035, -0.5, 0.5);
    gallop(deer, p, speed, i * 1.7);
  });
  layReins(c, lift);
}

function updateMascot(p, c, speed) {
  // Under a gate it has to get low, the way the runner's slide does.
  const crouch = p.sliding ? 0.45 : p.diving ? 0.8 : 1;
  c.model.position.y = p.boarding ? BOARD_LIFT : 0;

  if (c.mascot === "rudolph") {
    c.model.scale.set(c.scale, c.scale * crouch, c.scale);
    c.model.rotation.x = THREE.MathUtils.clamp(p.vy * -0.035, -0.5, 0.5);
    gallop(c.deer, p, speed);
    return;
  }

  // The snowman has no legs. It waddles, and stretches as it goes up.
  const airborne = p.jumping || p.flying;
  const stretch = p.jumping ? 1.08 : 1;
  c.model.scale.set(c.scale, c.scale * crouch * stretch, c.scale);
  c.model.rotation.z = airborne || p.sliding ? 0 : Math.sin(p.runT * 9) * 0.07;
  c.head.rotation.y = Math.sin(p.runT * 1.3) * 0.8;
  const wave = airborne ? 0.5 : Math.sin(p.runT * 9) * 0.25;
  c.arms[0].rotation.z = 1.0 + wave;
  c.arms[1].rotation.z = -1.0 + wave;
}

/**
 * Runs after the player's own animation has written its pose, and overwrites
 * whatever the costume holds differently.
 *
 * @param {{ reindeer?: boolean, ceiling?: number|null }} ctx
 */
export function updateCostume(p, dt, speed, { reindeer = false, ceiling = null } = {}) {
  const c = p.costume;
  if (!c?.on || !p.alive) {
    if (c?.pulling) dismiss(c);
    return;
  }
  if (c.kind === "sled") updateSled(p, c, dt, speed, reindeer, ceiling);
  else if (c.kind === "mascot") updateMascot(p, c, speed);
}
