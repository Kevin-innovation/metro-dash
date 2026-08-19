import * as THREE from "three";
import { approach } from "./collision.js";
import {
  FAST_FALL,
  GRAVITY,
  JETPACK_ALTITUDE,
  JETPACK_CLIMB,
  JUMP_V,
  LANE_LERP,
  LANES,
  MOUNT_TIME,
  PLAYER_HEIGHT,
  SLIDE_HEIGHT,
  SLIDE_TIME,
} from "./config.js";

function box(w, h, d, color, extra = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...extra }),
  );
  mesh.castShadow = false;
  return mesh;
}

const DEFAULT_PALETTE = {
  shirt: 0x14b8a6,
  trim: 0x0f766e,
  pack: 0xf97316,
  hair: 0x1c1917,
  streak: 0xfb923c,
};

export function createPlayer(palette = DEFAULT_PALETTE) {
  const skin = { ...DEFAULT_PALETTE, ...palette };
  const root = new THREE.Group();
  root.scale.setScalar(1.22);
  const hip = new THREE.Group();
  hip.position.y = 0.86;
  root.add(hip);

  // Kept on the player so a shop skin change can recolour without a rebuild.
  const parts = { shirt: [], trim: [], pack: [], hair: [], streak: [] };
  const tag = (mesh, slot) => {
    parts[slot].push(mesh);
    return mesh;
  };

  const torso = tag(box(0.52, 0.52, 0.36, skin.shirt), "shirt");
  torso.position.y = 0.36;
  hip.add(torso);

  const pouch = tag(box(0.36, 0.16, 0.16, skin.trim), "trim");
  pouch.position.set(0, 0.18, 0.22);
  hip.add(pouch);

  const hood = tag(box(0.38, 0.16, 0.3, skin.trim), "trim");
  hood.position.set(0, 0.66, -0.04);
  hip.add(hood);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0xffdbb4 }),
  );
  head.position.y = 0.86;
  hip.add(head);

  const hair = tag(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshLambertMaterial({ color: skin.hair }),
    ),
    "hair",
  );
  hair.position.set(0, 0.94, 0);
  hip.add(hair);

  const streak = tag(box(0.08, 0.18, 0.06, skin.streak), "streak");
  streak.position.set(0.12, 0.98, 0.12);
  hip.add(streak);

  const pack = tag(box(0.36, 0.34, 0.16, skin.pack), "pack");
  pack.position.set(0, 0.38, -0.26);
  hip.add(pack);

  // Jetpack thruster, hidden until the power-up is running.
  const jets = new THREE.Group();
  jets.visible = false;
  [-0.14, 0.14].forEach((x) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xffca28, transparent: true, opacity: 0.9 }),
    );
    flame.rotation.x = Math.PI;
    flame.position.set(x, 0.08, -0.3);
    jets.add(flame);
  });
  hip.add(jets);

  // Hoverboard, hidden until one is deployed.
  const board = new THREE.Group();
  board.visible = false;
  const deck = box(0.52, 0.08, 1.05, 0xff3d71, { emissive: 0x7c1d3a, emissiveIntensity: 0.4 });
  deck.position.y = 0.1;
  board.add(deck);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1.15),
    new THREE.MeshBasicMaterial({ color: 0x40c4ff, transparent: true, opacity: 0.45 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  board.add(glow);
  root.add(board);

  const arms = [];
  const legs = [];
  [-1, 1].forEach((side) => {
    const upper = tag(box(0.14, 0.32, 0.14, skin.shirt), "shirt");
    upper.position.set(0.34 * side, 0.42, 0);
    hip.add(upper);
    const lower = box(0.12, 0.28, 0.12, 0xffdbb4);
    lower.position.y = -0.28;
    upper.add(lower);
    const hand = box(0.12, 0.1, 0.12, 0xffdbb4);
    hand.position.y = -0.18;
    lower.add(hand);
    arms.push(upper);

    const thigh = box(0.18, 0.34, 0.18, 0x1e293b);
    thigh.position.set(0.13 * side, 0, 0);
    hip.add(thigh);
    const shin = box(0.16, 0.32, 0.16, 0x1e293b);
    shin.position.y = -0.3;
    thigh.add(shin);
    const shoe = box(0.18, 0.1, 0.28, 0xf8fafc);
    shoe.position.set(0, -0.2, 0.04);
    shin.add(shoe);
    const stripe = tag(box(0.19, 0.04, 0.1, skin.streak), "streak");
    stripe.position.set(0, 0.02, 0.1);
    shoe.add(stripe);
    legs.push(thigh);
  });

  // Contact blob. Deliberately NOT parented to the runner: it has to stay on
  // the deck while the body rises, which is what actually communicates jump
  // height. The caller adds it to the scene alongside `root`.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;

  hip.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  return {
    root,
    hip,
    torso,
    head,
    arms,
    legs,
    shadow,
    jets,
    board,
    parts,
    lane: 0,
    /** Lane the runner most recently left, and how long ago, for late dodges. */
    laneFrom: 0,
    laneChangeT: Infinity,
    x: 0,
    y: 0,
    z: 0,
    // Snapshot taken at the start of each simulation step; the swept collision
    // test needs the interval the player travelled, not just where it ended up.
    prevX: 0,
    prevY: 0,
    prevZ: 0,
    prevHeight: PLAYER_HEIGHT,
    vy: 0,
    jumping: false,
    diving: false,
    sliding: false,
    slideT: 0,
    lean: 0,
    alive: true,
    tumble: 0,
    /** Seconds since the crash, so the death beat can end instead of looping. */
    deathT: 0,
    runT: 0,
    height: PLAYER_HEIGHT,
    mounted: null,
    mounting: false,
    mountT: 0,
    roofY: 0,
    /** Jetpack cruise mode: gravity and ground obstacles stop mattering. */
    flying: false,
    /** Hoverboard deployed — absorbs the next crash. */
    boarding: false,
  };
}

/** Recolour the runner in place when a different character is equipped. */
export function applySkin(p, palette) {
  const skin = { ...DEFAULT_PALETTE, ...palette };
  for (const [slot, meshes] of Object.entries(p.parts)) {
    for (const mesh of meshes) mesh.material.color.setHex(skin[slot]);
  }
}

export function resetPlayer(p, z = 0) {
  p.lane = 0;
  p.laneFrom = 0;
  p.laneChangeT = Infinity;
  p.x = 0;
  p.y = 0;
  p.z = z;
  p.prevX = 0;
  p.prevY = 0;
  p.prevZ = z;
  p.prevHeight = PLAYER_HEIGHT;
  p.vy = 0;
  p.jumping = false;
  p.diving = false;
  p.sliding = false;
  p.slideT = 0;
  p.lean = 0;
  p.alive = true;
  p.tumble = 0;
  p.deathT = 0;
  p.runT = 0;
  p.height = PLAYER_HEIGHT;
  p.mounted = null;
  p.mounting = false;
  p.mountT = 0;
  p.roofY = 0;
  p.flying = false;
  p.boarding = false;
  p.hip.rotation.set(0, 0, 0);
  p.hip.position.y = 0.86;
  p.root.rotation.set(0, 0, 0);
  p.jets.visible = false;
  p.board.visible = false;
  p.root.visible = true;
  p.shadow.visible = true;
  p.shadow.scale.setScalar(1);
  p.shadow.material.opacity = 0.3;
}

export function applyAction(p, action, audio, opts = {}) {
  if (!p.alive) return;
  // The jetpack flies the whole line; ground moves would only fight it.
  if (p.flying && action !== "left" && action !== "right") return;

  const jumpBoost = opts.jumpMultiplier ?? 1;

  if (action === "left" && p.lane < 1) {
    p.laneFrom = p.lane;
    p.laneChangeT = 0;
    p.lane += 1;
    audio?.switchLane();
  } else if (action === "right" && p.lane > -1) {
    p.laneFrom = p.lane;
    p.laneChangeT = 0;
    p.lane -= 1;
    audio?.switchLane();
  } else if (action === "jump" && !p.jumping && !p.mounting) {
    if (p.sliding) {
      p.sliding = false;
      p.slideT = 0;
    }
    p.mounted = null;
    p.roofY = 0;
    p.jumping = true;
    p.diving = false;
    p.vy = JUMP_V * jumpBoost;
    audio?.jump();
  } else if (action === "slide") {
    if (p.mounting) return;
    if (p.jumping || p.y > 0.12) {
      p.diving = true;
      p.sliding = false;
      p.vy = Math.min(p.vy, -12);
      audio?.slam();
    } else if (p.mounted) {
      p.mounted = null;
      p.roofY = 0;
      p.jumping = true;
      p.diving = true;
      p.vy = -8;
      audio?.slam();
    } else if (!p.sliding) {
      p.sliding = true;
      p.slideT = SLIDE_TIME;
      audio?.slide();
    }
  }
}

export function mountPlayer(p, item, hop = false) {
  p.mounted = item;
  p.roofY = item.roofY;
  p.jumping = false;
  p.diving = false;
  p.sliding = false;
  p.vy = 0;
  if (hop) {
    p.mounting = false;
    p.mountT = 0;
    p.y = item.roofY;
  } else {
    p.mounting = true;
    p.mountT = MOUNT_TIME;
  }
}

export function bestRoof(p, roofs, x = p.x) {
  let best = null;
  let bestD = 1.12;
  for (const r of roofs) {
    if (Math.abs(p.z - r.z) > r.length * 0.47) continue;
    const d = Math.abs(x - r.x);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Headroom kept between the runner's feet and a ceiling overhead.
 *
 * `p.y` is the position of the *feet*, so this has to cover the whole runner —
 * and then some. Under a roof, everything above the camera's eye line is roof:
 * a head higher than the lens is not clipped, it is simply *behind the
 * ceiling*, which on screen is indistinguishable from vanishing through it.
 * So the gap has to leave room for the camera to ride above the head too.
 */
export const CEILING_CLEARANCE = PLAYER_HEIGHT + 0.65;

export function updatePlayer(p, dt, speed, ctx = {}) {
  const roofs = ctx.roofs || [];
  const held = ctx.held || {};
  const flying = !!ctx.flying;

  p.prevX = p.x;
  p.prevY = p.y;
  p.prevZ = p.z;
  p.prevHeight = p.height;
  if (!p.alive) p.deathT += dt;

  p.laneChangeT += dt;
  const targetX = LANES[p.lane + 1];
  p.x += (targetX - p.x) * approach(LANE_LERP, dt);
  p.lean += ((p.x - targetX) * 0.35 - p.lean) * approach(12, dt);

  if (p.alive) p.z += speed * dt;

  if (flying) {
    enterFlight(p);
    p.y += (JETPACK_ALTITUDE - p.y) * approach(JETPACK_CLIMB, dt);
  } else if (p.flying) {
    // Jetpack just expired — drop back down under normal gravity.
    p.flying = false;
    p.jumping = true;
    p.diving = false;
    p.vy = 0;
    p.jets.visible = false;
  }

  if (!flying) {
    if (p.mounting) {
      p.mountT -= dt;
      p.y += (p.roofY - p.y) * approach(16, dt);
      p.vy = 0;
      if (p.mountT <= 0) {
        p.mounting = false;
        p.y = p.roofY;
      }
    } else if (p.mounted && !p.jumping && !p.diving) {
      const roof = bestRoof(p, roofs) || bestRoof(p, roofs, targetX);
      if (roof) {
        if (roof.item !== p.mounted) {
          mountPlayer(p, roof.item, true);
          ctx.onMount?.(roof.item, true);
        } else {
          p.y = roof.roofY;
          p.roofY = roof.roofY;
        }
      } else {
        p.mounted = null;
        p.roofY = 0;
        p.jumping = true;
        p.vy = 0.4;
      }
    } else if (p.jumping || p.diving || p.y > 0) {
      const g = p.diving ? GRAVITY * 2.15 : GRAVITY;
      p.vy += g * dt;
      if (p.diving) p.vy = Math.min(p.vy, FAST_FALL * 0.35);
      p.y += p.vy * dt;

      const rising = p.vy > 2.2;
      const roof = rising ? null : bestRoof(p, roofs);
      if (roof && p.y >= roof.roofY - 0.55 && p.vy <= 5) {
        const hop = !!p.mounted && p.mounted !== roof.item;
        mountPlayer(p, roof.item, hop);
        ctx.onMount?.(roof.item, hop);
      } else if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.jumping = false;
        const wasDive = p.diving;
        p.diving = false;
        p.mounted = null;
        p.roofY = 0;
        if (held.slide || wasDive) {
          p.sliding = true;
          p.slideT = SLIDE_TIME;
        }
      }
    }

    if (p.sliding) {
      p.slideT -= dt;
      if (p.slideT <= 0) p.sliding = false;
    }
  }

  // A roof overhead is a hard stop. Without this a super-sneaker jump — and a
  // jetpack far more so — carries the runner straight through the tunnel
  // ceiling and out over the top of the world.
  if (ctx.ceiling != null) {
    const limit = Math.max(0, ctx.ceiling - CEILING_CLEARANCE);
    if (p.y > limit) {
      p.y = limit;
      // Rising into it stops the climb; falling is left alone so the runner
      // still comes back down normally.
      if (p.vy > 0) p.vy = 0;
    }
  }

  p.height = p.sliding ? SLIDE_HEIGHT : PLAYER_HEIGHT;
  p.runT += dt * (0.9 + speed * 0.08);

  p.root.position.set(p.x, p.y, p.z);
  p.root.rotation.z = p.lean;
  p.root.rotation.x = 0;
  p.board.visible = p.boarding && p.alive;

  // Blob stays on the deck; height is read from how small and faint it gets.
  p.shadow.position.set(p.x, 0.03, p.z);
  p.shadow.material.opacity = Math.max(0.05, 0.3 - p.y * 0.045);
  p.shadow.visible = p.alive;

  animatePlayer(p, speed);
}

function enterFlight(p) {
  if (!p.flying) {
    p.flying = true;
    p.jets.visible = true;
  }
  p.jumping = false;
  p.diving = false;
  p.sliding = false;
  p.slideT = 0;
  p.mounted = null;
  p.mounting = false;
  p.roofY = 0;
  p.vy = 0;
}

/** The higher the runner, the smaller the contact blob on the deck. */
function blobScale(y) {
  return 1 / (1 + Math.max(0, y) * 0.32);
}

/**
 * A crash is a short, readable beat — a tumble that eases to a stop and then
 * the runner is gone. Left spinning, the body reads as a stuck animation behind
 * the game-over card rather than as an impact.
 */
const DEATH_TUMBLE_TIME = 0.4;

function animatePlayer(p, speed) {
  if (!p.alive) {
    const t = Math.min(1, p.deathT / DEATH_TUMBLE_TIME);
    p.tumble += (1 - t) * 0.36;
    p.root.rotation.x = p.tumble;
    p.root.rotation.z = p.tumble * 0.4;
    p.hip.position.y = 0.7;
    p.root.visible = t < 1;
    return;
  }

  if (p.flying) {
    p.hip.rotation.x = -0.22;
    p.hip.position.y = 0.86 + Math.sin(p.runT * 6) * 0.05;
    p.arms[0].rotation.x = 0.9;
    p.arms[1].rotation.x = 0.9;
    p.legs[0].rotation.x = 0.25;
    p.legs[1].rotation.x = 0.12;
    const flicker = 0.75 + Math.sin(p.runT * 40) * 0.25;
    p.jets.children.forEach((flame) => flame.scale.set(1, flicker, 1));
    p.shadow.scale.setScalar(0.32);
    return;
  }

  if (p.mounting) {
    const k = 1 - p.mountT / MOUNT_TIME;
    p.hip.rotation.x = -0.55 + k * 0.65;
    p.hip.position.y = 0.55 + k * 0.32;
    p.arms[0].rotation.x = -1.3 + k * 0.6;
    p.arms[1].rotation.x = -1.1 + k * 0.5;
    p.legs[0].rotation.x = -0.9 + k * 0.7;
    p.legs[1].rotation.x = 0.95 - k * 0.6;
    p.shadow.scale.setScalar(0.7);
    return;
  }

  if (p.sliding) {
    p.hip.rotation.x = 1.25;
    p.hip.position.y = 0.38;
    p.arms[0].rotation.x = -0.5;
    p.arms[1].rotation.x = -0.5;
    p.legs[0].rotation.x = 0.2;
    p.legs[1].rotation.x = 0.35;
    p.shadow.scale.set(1.3, 0.8, 1);
    return;
  }

  p.hip.rotation.x = 0.08;
  p.hip.position.y = 0.86 + Math.sin(p.runT * 10) * 0.03;

  if (p.diving) {
    p.hip.rotation.x = 0.85;
    p.hip.position.y = 0.7;
    p.arms[0].rotation.x = 0.6;
    p.arms[1].rotation.x = 0.6;
    p.legs[0].rotation.x = 0.15;
    p.legs[1].rotation.x = 0.25;
    p.shadow.scale.setScalar(blobScale(p.y));
    return;
  }

  if (p.jumping) {
    p.arms[0].rotation.x = -0.8;
    p.arms[1].rotation.x = -0.8;
    p.legs[0].rotation.x = -0.5;
    p.legs[1].rotation.x = 0.7;
    p.shadow.scale.setScalar(blobScale(p.y));
    return;
  }

  if (p.boarding) {
    // Riding the board: knees bent, feet planted, no run cycle.
    p.hip.rotation.x = 0.14;
    p.arms[0].rotation.x = -0.35;
    p.arms[1].rotation.x = 0.35;
    p.legs[0].rotation.x = 0.18;
    p.legs[1].rotation.x = -0.18;
    p.shadow.scale.setScalar(1.15);
    return;
  }

  const swing = Math.sin(p.runT * (8 + speed * 0.12)) * 0.95;
  p.arms[0].rotation.x = swing;
  p.arms[1].rotation.x = -swing;
  p.legs[0].rotation.x = -swing * 0.95;
  p.legs[1].rotation.x = swing * 0.95;
  p.shadow.scale.setScalar(1);
}
