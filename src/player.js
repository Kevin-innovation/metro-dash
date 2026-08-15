import * as THREE from "three";
import {
  FAST_FALL,
  GRAVITY,
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

export function createPlayer() {
  const root = new THREE.Group();
  root.scale.setScalar(1.22);
  const hip = new THREE.Group();
  hip.position.y = 0.86;
  root.add(hip);

  const torso = box(0.52, 0.52, 0.36, 0x14b8a6);
  torso.position.y = 0.36;
  hip.add(torso);

  const pouch = box(0.36, 0.16, 0.16, 0x0f766e);
  pouch.position.set(0, 0.18, 0.22);
  hip.add(pouch);

  const hood = box(0.38, 0.16, 0.3, 0x0f766e);
  hood.position.set(0, 0.66, -0.04);
  hip.add(hood);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 12),
    new THREE.MeshLambertMaterial({ color: 0xffdbb4 }),
  );
  head.position.y = 0.86;
  hip.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0x1c1917 }),
  );
  hair.position.set(0, 0.94, 0);
  hip.add(hair);

  const streak = box(0.08, 0.18, 0.06, 0xfb923c);
  streak.position.set(0.12, 0.98, 0.12);
  hip.add(streak);

  const pack = box(0.36, 0.34, 0.16, 0xf97316);
  pack.position.set(0, 0.38, -0.26);
  hip.add(pack);

  const arms = [];
  const legs = [];
  [-1, 1].forEach((side) => {
    const upper = box(0.14, 0.32, 0.14, 0x14b8a6);
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
    const stripe = box(0.19, 0.04, 0.1, 0xf97316);
    stripe.position.set(0, 0.02, 0.1);
    shoe.add(stripe);
    legs.push(thigh);
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  return {
    root,
    hip,
    torso,
    head,
    arms,
    legs,
    shadow,
    lane: 0,
    x: 0,
    y: 0,
    z: 0,
    vy: 0,
    jumping: false,
    diving: false,
    sliding: false,
    slideT: 0,
    lean: 0,
    alive: true,
    tumble: 0,
    runT: 0,
    height: PLAYER_HEIGHT,
    mounted: null,
    mounting: false,
    mountT: 0,
    roofY: 0,
  };
}

export function resetPlayer(p, z = 0) {
  p.lane = 0;
  p.x = 0;
  p.y = 0;
  p.z = z;
  p.vy = 0;
  p.jumping = false;
  p.diving = false;
  p.sliding = false;
  p.slideT = 0;
  p.lean = 0;
  p.alive = true;
  p.tumble = 0;
  p.runT = 0;
  p.height = PLAYER_HEIGHT;
  p.mounted = null;
  p.mounting = false;
  p.mountT = 0;
  p.roofY = 0;
  p.hip.rotation.set(0, 0, 0);
  p.hip.position.y = 0.86;
  p.root.rotation.set(0, 0, 0);
}

export function applyAction(p, action, audio) {
  if (!p.alive) return;
  if (action === "left" && p.lane < 1) {
    p.lane += 1;
    audio?.switchLane();
  } else if (action === "right" && p.lane > -1) {
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
    p.vy = JUMP_V;
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

export function updatePlayer(p, dt, speed, ctx = {}) {
  const roofs = ctx.roofs || [];
  const held = ctx.held || {};
  const targetX = LANES[p.lane + 1];
  p.x += (targetX - p.x) * Math.min(1, LANE_LERP * dt);
  p.lean += ((p.x - targetX) * 0.35 - p.lean) * Math.min(1, 12 * dt);

  if (p.alive) p.z += speed * dt;

  if (p.mounting) {
    p.mountT -= dt;
    p.y += (p.roofY - p.y) * Math.min(1, 16 * dt);
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

  p.height = p.sliding ? SLIDE_HEIGHT : PLAYER_HEIGHT;
  p.runT += dt * (0.9 + speed * 0.08);

  p.root.position.set(p.x, p.y, p.z);
  p.root.rotation.z = p.lean;
  p.root.rotation.x = 0;

  animatePlayer(p, speed);
}

function animatePlayer(p, speed) {
  if (!p.alive) {
    p.tumble += 0.18;
    p.root.rotation.x = p.tumble;
    p.root.rotation.z = p.tumble * 0.4;
    p.hip.position.y = 0.7;
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
    p.shadow.scale.setScalar(0.5 + p.y * 0.08);
    return;
  }

  if (p.jumping) {
    p.arms[0].rotation.x = -0.8;
    p.arms[1].rotation.x = -0.8;
    p.legs[0].rotation.x = -0.5;
    p.legs[1].rotation.x = 0.7;
    p.shadow.scale.setScalar(0.55 + p.y * 0.08);
    return;
  }

  const swing = Math.sin(p.runT * (8 + speed * 0.12)) * 0.95;
  p.arms[0].rotation.x = swing;
  p.arms[1].rotation.x = -swing;
  p.legs[0].rotation.x = -swing * 0.95;
  p.legs[1].rotation.x = swing * 0.95;
  p.shadow.scale.setScalar(1);
}
