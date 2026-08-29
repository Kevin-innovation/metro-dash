import * as THREE from "three";
import { CROW_TIME } from "./config.js";

/**
 * The crow egg's payload.
 *
 * The egg is an ordinary pickup (spawned by the pool, see entities.js) but the
 * bird it hatches is not: it rides the runner rather than the track, so it
 * lives here alongside the jetpack flames and the hoverboard in player.js
 * rather than in the entity pool.
 *
 * Everything about how bad it feels is in one place — the flight, the pecking,
 * and the curve that drives both the haze in the world and the veil over it.
 */
export const CROW = {
  id: "crow",
  name: "까마귀",
  icon: "🐦‍⬛",
  colour: "#c2410c",
  blurb: "까마귀가 달라붙어 앞이 잘 안 보입니다",
  seconds: CROW_TIME,
};

/** Seconds the veil takes to close in, and to lift again at the end. */
const FADE_IN = 0.32;
const FADE_OUT = 0.75;
/** Seconds between pecks. */
const PECK_PERIOD = 0.42;
/** How far to either side of the runner's head the bird swings, in metres. */
const SWAY = 0.92;

/**
 * How strong the effect is right now, 0-1.
 *
 * Both the 3D gloom and the DOM veil read this one number, so the world and
 * the overlay can never disagree about how dark it is. It ramps in fast — a
 * penalty has to land — and lets go slowly, so vision returns as a relief
 * rather than as a switch.
 *
 * @param {number} remaining seconds of crow left
 * @param {number} [total] the full duration this instance was granted
 */
export function crowVeil(remaining, total = CROW_TIME) {
  if (!(remaining > 0)) return 0;
  const elapsed = Math.max(0, total - remaining);
  const rising = Math.min(1, elapsed / FADE_IN);
  const falling = Math.min(1, remaining / FADE_OUT);
  return Math.max(0, Math.min(1, Math.min(rising, falling)));
}

const box = (w, h, d, color) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));

/**
 * A blocky crow, built to the same rules as everything else on screen: boxes,
 * flat colour, one warm accent so it reads against a dark body.
 */
export function makeCrow() {
  const root = new THREE.Group();
  root.visible = false;

  // Pitched as a whole when it lunges, so the body, head and beak stay one
  // shape instead of the beak swinging off on its own.
  const body = new THREE.Group();
  root.add(body);

  // Not actually black. A true-black bird in front of a world this thing has
  // just darkened is a hole in the frame, not a crow — the whole plumage is
  // lifted a couple of steps and given an emissive floor so it stays a legible
  // silhouette against the runner's own dark jacket.
  const feathers = { color: 0x39424f, emissive: 0x11161e, emissiveIntensity: 0.55 };
  const plume = (w, h, d) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial(feathers));

  const trunk = plume(0.34, 0.32, 0.62);
  body.add(trunk);

  const tail = box(0.22, 0.08, 0.44, 0x2a323d);
  tail.position.set(0, 0.02, -0.48);
  tail.rotation.x = -0.22;
  body.add(tail);

  const head = plume(0.27, 0.25, 0.27);
  head.position.set(0, 0.16, 0.36);
  body.add(head);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0x92400e, emissiveIntensity: 0.6 }),
  );
  // Cones point up; this one points down the track at the back of a neck.
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.11, 0.61);
  body.add(beak);

  // Lit rather than shaded. These are the two points the eye actually finds in
  // a dark frame, and they are what turns the shape into a bird looking at you.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffe66d }),
    );
    eye.position.set(0.1 * side, 0.23, 0.47);
    body.add(eye);
  }

  // Wings are hinged at the shoulder, so flapping is one rotation each rather
  // than two meshes being moved in sympathy.
  const wings = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0.14 * side, 0.12, 0.02);
    const wing = box(0.62, 0.06, 0.44, 0x4a5464);
    wing.position.x = 0.32 * side;
    hinge.add(wing);
    body.add(hinge);
    wings.push(hinge);
  }

  root.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  return { root, body, wings, t: 0, sway: 0 };
}

/**
 * Fly the crow for one frame.
 *
 * It sits between the camera and the runner on purpose: the point of the egg
 * is that something is in your way, and a bird tucked neatly behind the
 * runner's head would be a decoration rather than a penalty. It still keeps
 * clear of the lane the runner is reading — the sway is around the shoulder,
 * not across the middle of the track.
 *
 * @param {ReturnType<makeCrow>} crow
 * @param {number} dt
 * @param {{x:number,y:number,z:number}} player
 * @param {number} remaining seconds of crow left; 0 parks the bird
 * @param {number} [total]
 */
export function updateCrow(crow, dt, player, remaining, total = CROW_TIME) {
  const veil = crowVeil(remaining, total);
  if (!(remaining > 0) && veil <= 0) {
    crow.root.visible = false;
    crow.t = 0;
    return;
  }

  crow.root.visible = true;
  crow.t += dt;
  const t = crow.t;

  // Arrival and departure both ride the veil, so the bird is never on screen
  // at full size while the world is still clear.
  const presence = veil;

  // A peck is a quick lunge and a slower recovery: the snap is the half of it
  // that reads, so it gets a fifth of the cycle.
  const phase = (t % PECK_PERIOD) / PECK_PERIOD;
  const lunge = phase < 0.22 ? phase / 0.22 : Math.max(0, 1 - (phase - 0.22) / 0.78);
  const peck = lunge * lunge * (3 - 2 * lunge);

  // Swings from shoulder to shoulder rather than hovering on the centre line.
  // Two things come out of the width: it only ever blocks one side of the
  // frame at a time, so a lane can still be read; and because it keeps turning
  // to face the head it is seen in profile, which is the only angle a bird is
  // recognisable from. Parked behind the runner it is a dark lump with its
  // beak pointing away from the camera.
  crow.sway += (Math.sin(t * 2.3) * SWAY - crow.sway) * Math.min(1, dt * 6);

  const back = 1.3 - peck * 0.66;
  // High enough that the body is silhouetted against the sky between pecks and
  // only drops onto the runner's shoulders on the strike itself.
  const lift = 2.28 - peck * 0.6;
  crow.root.position.set(
    player.x + crow.sway + Math.sin(t * 5.1) * 0.05,
    player.y + lift * presence + (1 - presence) * 3.4,
    player.z - back,
  );

  // Aimed at the back of the runner's head from wherever it currently is, and
  // dipped as it strikes. Aimed fully rather than half-way: a bird that only
  // suggests where it is looking reads as a prop being slid around.
  crow.body.rotation.x = -0.18 + peck * 0.8;
  crow.body.rotation.y = Math.atan2(-crow.sway, 0.85);
  crow.root.scale.setScalar(0.4 + presence * 0.6);

  // Fast while lunging, loose while it holds station — a bird beating hard to
  // stay with something running at fifty metres a second.
  const flap = Math.sin(t * (17 + peck * 12)) * (0.55 + peck * 0.5);
  crow.wings[0].rotation.z = -flap;
  crow.wings[1].rotation.z = flap;
}

/**
 * Haze and dim the world itself while the crow is on.
 *
 * Done in the fog and the lights rather than only as an overlay, for two
 * reasons: it costs nothing (both are already uniforms the shaders read every
 * frame), and it survives the low quality tier, where the blur on the overlay
 * is switched off. Applied straight after applyLook, which has just written
 * the zone's own values, so this reads as the zone getting murkier rather than
 * as a separate layer.
 *
 * @param {object} world
 * @param {number} veil 0-1 from crowVeil
 */
export function applyCrowGloom(world, veil) {
  if (veil <= 0) return;
  const fog = world.scene.fog;
  // Pulled in to a bit over the runner's own shoulder: far enough that the
  // next obstacle still resolves in time to be dodged, close enough that
  // reading the whole track ahead stops being free.
  fog.near = fog.near * (1 - veil * 0.72);
  fog.far = fog.far * (1 - veil * 0.66);
  fog.color.lerp(GLOOM, veil * 0.72);
  world.scene.background.lerp(GLOOM, veil * 0.6);

  world.hemi.intensity *= 1 - veil * 0.45;
  world.sun.intensity *= 1 - veil * 0.5;
  world.ambient.intensity *= 1 - veil * 0.35;
}

/** The colour everything is dragged toward: a cold, sooty dusk. */
const GLOOM = new THREE.Color(0x161b24);
