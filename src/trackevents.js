import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { approach } from "./collision.js";
import {
  AURORA_COIN_BONUS,
  AVALANCHE_COINS,
  AVALANCHE_SPEED,
  Aurora,
  ELF_GIFTS,
  ICE_CLEAR_COINS,
  ICE_LANE_SCALE,
  TRACK_EVENT_CLEAR_SECONDS,
  TRACK_EVENT_LEAD_SECONDS,
  TRACK_EVENT_SECONDS,
  TrackEvents,
} from "./christmas.js";
import { LANE_GAP, laneX } from "./lanes.js";
import { tinted } from "./textures.js";

const ANNOUNCE = {
  elf: "🧝 도둑 요정이 선물 자루를 훔쳐 달아나요!",
  avalanche: "🏔️ 눈사태가 몰려와요! 끝까지 달리세요!",
  ice: "🧊 앞에 빙판이 나타나요! 미끄러워요!",
};
const STARTED = {
  elf: "🎁 요정이 흘리는 선물을 주우세요!",
  avalanche: `⚡ 눈사태 탈출! ${TRACK_EVENT_SECONDS.avalanche}초만 버티세요`,
  ice: `🧊 장애물을 넘으면 코인 +${ICE_CLEAR_COINS}`,
};

/** While the elf runs, only coin lines are dealt, so its gifts are never walled off. */
const CHASE_PATTERNS = ["coins"];
const ELF_DROP_GAP = 1.15;
const ELF_FIRST_DROP = 0.3;
const ELF_LEAVE_SPEED = 42;
/** Far enough ahead that its lane can be read before the gift arrives. */
const ELF_LEAD_SECONDS = 0.5;
const ELF_MIN_AHEAD = 16;
/** Room a gift needs around it, so it never lands inside a train or a barrier. */
const GIFT_CLEARANCE = 4;
const SACK_AHEAD = 26;

/** Where the snow front sits behind the runner: off-frame, closing, and held. */
const WAVE_START = -26;
const WAVE_WARNING = -11;
const WAVE_HELD = -2.5;

/** Built this long and squashed to fit, so the crystals along it stay evenly spread. */
const ICE_LENGTH = 360;
const ICE_HALF_WIDTH = LANE_GAP * 2.5;

const AURORA_AHEAD = 150;
const AURORA_HEIGHT = 58;

const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const selfLit = () => new THREE.MeshBasicMaterial({ vertexColors: true });

/** Self-lit parts have no light to shape them, so the shape is painted on instead. */
function shaded(geometry) {
  const { color, normal } = geometry.attributes;
  for (let i = 0; i < color.count; i++) {
    const k = 0.74 + 0.26 * Math.max(0, normal.getY(i)) + 0.07 * normal.getX(i);
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
  return geometry;
}

const merged = (parts) => new THREE.Mesh(shaded(mergeGeometries(parts)), selfLit());

/**
 * The thief. It runs away from the camera, so what the player mostly looks at is
 * its back, and the back is the bulging red sack that says what it has done.
 */
function makeThiefElf() {
  const g = new THREE.Group();
  const suit = 0x1f8f4e;
  const dark = 0x14532d;
  const skin = 0xffd9b3;
  const body = [
    tinted(new THREE.BoxGeometry(0.5, 0.6, 0.32), suit, 0, 0.95, 0),
    tinted(new THREE.BoxGeometry(0.54, 0.1, 0.36), 0x3f2a14, 0, 0.72, 0),
    tinted(new THREE.BoxGeometry(0.14, 0.12, 0.05), 0xffd54f, 0, 0.72, 0.19),
    tinted(new THREE.SphereGeometry(0.25, 12, 10), skin, 0, 1.46, 0),
    // The mask. A burglar is a burglar at any height.
    tinted(new THREE.BoxGeometry(0.52, 0.1, 0.52), 0x1f2937, 0, 1.5, 0),
    tinted(new THREE.ConeGeometry(0.28, 0.72, 10), suit, 0, 1.9, -0.05),
    tinted(new THREE.CylinderGeometry(0.28, 0.28, 0.09, 12), 0xfff8e1, 0, 1.6, 0),
    tinted(new THREE.SphereGeometry(0.1, 8, 6), 0xef4444, 0, 2.28, -0.05),
    tinted(new THREE.ConeGeometry(0.08, 0.3, 6).rotateZ(Math.PI / 2), skin, 0.36, 1.48, 0),
    tinted(new THREE.ConeGeometry(0.08, 0.3, 6).rotateZ(-Math.PI / 2), skin, -0.36, 1.48, 0),
    // Slung over one shoulder, so the runner it is on can still be seen, in
    // burlap, because a red ball this size is the same thing as a Rudolph nose.
    tinted(new THREE.SphereGeometry(0.46, 14, 12).scale(1, 1.1, 0.9), 0xa9794a, -0.44, 1.12, -0.32),
    tinted(new THREE.SphereGeometry(0.2, 8, 6), 0x8a5f36, -0.2, 0.88, -0.6),
    tinted(new THREE.CylinderGeometry(0.13, 0.2, 0.14, 10), 0xffd54f, -0.44, 1.62, -0.32),
    tinted(new THREE.BoxGeometry(0.24, 0.24, 0.24), 0xef4444, -0.54, 1.8, -0.32),
    tinted(new THREE.BoxGeometry(0.2, 0.2, 0.2), 0x38bdf8, -0.32, 1.82, -0.28),
  ];
  g.add(merged(body));

  const leg = () => {
    const mesh = merged([
      tinted(new THREE.BoxGeometry(0.17, 0.58, 0.18), dark, 0, -0.29, 0),
      tinted(new THREE.BoxGeometry(0.2, 0.14, 0.36), 0xef4444, 0, -0.56, 0.08),
    ]);
    mesh.position.y = 0.68;
    g.add(mesh);
    return mesh;
  };
  g.userData.legs = [leg(), leg()];
  g.userData.legs[0].position.x = -0.14;
  g.userData.legs[1].position.x = 0.14;
  g.scale.setScalar(2.2);
  g.visible = false;
  return g;
}

/**
 * The front of the snow, in a U: low across the track so the runner stays in
 * shot, towering up either side. The camera sits behind the runner, so a straight
 * wall would either be out of frame or standing in front of them.
 */
function makeAvalanche() {
  const parts = [];
  const whites = [0xffffff, 0xf1f7ff, 0xdbeafe];
  for (let i = 0; i < 64; i++) {
    const x = -17 + (34 * i) / 63 + (Math.random() - 0.5);
    const side = Math.min(1, Math.max(0, (Math.abs(x) - 3.5) / 7));
    const top = 0.6 + side * side * 11;
    for (let y = 0; y < top; y += 1.5) {
      const size = 0.75 + side * 1.1 + Math.random() * 0.45;
      const lump = new THREE.DodecahedronGeometry(size, 0).rotateY(Math.random() * 3).rotateX(Math.random() * 3);
      parts.push(tinted(lump, whites[(i + Math.round(y)) % 3], x, y, -Math.random() * 5));
    }
  }
  const wave = merged(parts);
  wave.visible = false;
  return wave;
}

/** A translucent sheet down the road, cracked and glinting, with ice along each side. */
function makeIceSheet() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(105, 200, 255, 0.68)";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  for (let i = 0; i < 16; i++) {
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 4; step++) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, ICE_LENGTH / 14);

  const g = new THREE.Group();
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(ICE_HALF_WIDTH * 2, ICE_LENGTH).rotateX(-Math.PI / 2).translate(0, 0, ICE_LENGTH / 2),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  sheet.renderOrder = 1;
  g.add(sheet);

  const crystals = [];
  for (let z = 0; z < ICE_LENGTH; z += 7) {
    for (const side of [-1, 1]) {
      const height = 0.9 + Math.random() * 1.1;
      const cone = new THREE.ConeGeometry(0.34, height, 5).rotateZ(side * -0.22);
      crystals.push(tinted(cone, z % 14 ? 0xbae6fd : 0xe0f7ff, side * ICE_HALF_WIDTH, height / 2, z));
    }
  }
  g.add(merged(crystals));
  g.position.y = 0.05;
  g.visible = false;
  return g;
}

/** Curtains of light. Additive, so the black along each edge is simply no light. */
function makeAurora() {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const low = new THREE.Color(0x35ffb0);
  const high = new THREE.Color(0xa06bff);
  const colour = new THREE.Color();
  const g = new THREE.Group();
  for (let layer = 0; layer < 3; layer++) {
    const curtain = new THREE.PlaneGeometry(340, 74, 56, 8);
    const position = curtain.attributes.position;
    const colours = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const up = position.getY(i) / 74 + 0.5;
      position.setZ(i, Math.sin(x * 0.028 + layer * 2) * 24 + layer * 14);
      // Vertical rays, and a soft edge top and bottom.
      const rays = 0.55 + 0.45 * Math.sin(x * 0.19 + layer * 1.7);
      // Three of these overlap and add up, so each has to stay well short of white.
      const strength = Math.sin(Math.PI * up) ** 1.6 * rays * 0.34;
      colour.copy(low).lerp(high, up).multiplyScalar(strength);
      colour.toArray(colours, i * 3);
    }
    curtain.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    const mesh = new THREE.Mesh(curtain, material);
    mesh.renderOrder = 2;
    g.add(mesh);
  }
  g.visible = false;
  return g;
}

/**
 * The events on the Christmas track: the rules are in christmas.js, and this is
 * them being staged. Meshes are built the first time each is needed, so a run
 * that never meets the avalanche never pays for one.
 */
export class TrackEventStage {
  constructor(game) {
    this.game = game;
    this.director = new TrackEvents();
    this.aurora = new Aurora();
    this.meshes = {};
    this.auroraGlow = 0;
    this.time = 0;
    this.reset();
  }

  reset() {
    this.endIce();
    this.director = new TrackEvents();
    this.aurora = new Aurora();
    this.auroraGlow = 0;
    this.elfAhead = 0;
    this.elfLane = 0;
    this.elfLeaving = false;
    this.caught = 0;
    this.dropped = 0;
    this.dropIn = 0;
    this.waveAt = WAVE_START;
    this.waveLeaving = false;
    for (const mesh of Object.values(this.meshes)) mesh.visible = false;
  }

  get busy() {
    return this.director.busy || this.aurora.active;
  }

  /** What the spawner should deal instead of its own draw, if anything. */
  get patterns() {
    return this.director.kind === "elf" ? CHASE_PATTERNS : null;
  }

  mesh(name, make) {
    if (!this.meshes[name]) {
      this.meshes[name] = make();
      this.game.scene.add(this.meshes[name]);
    }
    return this.meshes[name];
  }

  /** Everything an event can show, built. See Game#prepareChristmas. */
  prepare() {
    return [
      this.mesh("elf", makeThiefElf),
      this.mesh("wave", makeAvalanche),
      this.mesh("ice", makeIceSheet),
      this.mesh("aurora", makeAurora),
    ];
  }

  canStart() {
    const g = this.game;
    return (
      g.openFor(TRACK_EVENT_CLEAR_SECONDS) && g.run.crowT <= 0 && !g.raid.due(g.runTime) && !this.aurora.active
    );
  }

  /** One step of play. */
  advance(dt) {
    const g = this.game;
    this.advanceAurora(dt);

    const event = this.director.update(dt, g.runTime, this.canStart());
    if (event?.type === "announce") this.announce(event.kind);
    else if (event?.type === "count") {
      g.audio.tick();
      g.screens.showRaid(String(event.value), true);
    } else if (event?.type === "start") this.start(event.kind);
    else if (event?.type === "end") this.end(event.kind);

    if (this.director.phase === "active" && this.director.kind === "elf") this.advanceChase(dt);
  }

  advanceAurora(dt) {
    const g = this.game;
    const change = this.aurora.update(dt, g.run.combo, !this.director.busy && g.raid.phase === "waiting");
    if (change === "start") {
      g.audio.powerup();
      g.screens.showRaid(`🌌 오로라 타임! 코인 ${1 + AURORA_COIN_BONUS}배`);
      this.mesh("aurora", makeAurora);
    } else if (change === "broken") {
      g.screens.showRaid("🌌 콤보가 끊겨 오로라가 사라졌어요");
    } else if (change === "end") {
      g.screens.showRaid("🌌 오로라가 저물었어요");
    }
  }

  announce(kind) {
    const g = this.game;
    g.screens.showRaid(ANNOUNCE[kind]);
    if (kind === "elf") {
      g.audio.bells();
      const elf = this.mesh("elf", makeThiefElf);
      this.elfLane = g.player.lane;
      elf.position.x = laneX(this.elfLane);
      // Comes up from behind the runner and past them, with the sack.
      this.elfAhead = -8;
      this.elfLeaving = false;
      elf.visible = true;
    } else if (kind === "avalanche") {
      g.audio.rumble();
      this.waveAt = WAVE_START;
      this.waveLeaving = false;
      this.mesh("wave", makeAvalanche).visible = true;
    } else {
      g.audio.mission();
      // Laid out ahead, where the runner will be when the count ends.
      const ice = this.mesh("ice", makeIceSheet);
      ice.position.z = g.player.z + g.speed * TRACK_EVENT_LEAD_SECONDS;
      ice.scale.z = (g.speed * TRACK_EVENT_SECONDS.ice) / ICE_LENGTH;
      ice.visible = true;
    }
  }

  start(kind) {
    const g = this.game;
    g.audio.bells();
    g.screens.showRaid(STARTED[kind]);
    if (kind === "elf") {
      this.caught = 0;
      this.dropped = 0;
      this.dropIn = ELF_FIRST_DROP;
    } else if (kind === "avalanche") {
      g.run.setSpeedScale(AVALANCHE_SPEED, TRACK_EVENT_SECONDS.avalanche);
      if (!reducedMotion()) {
        g.fovPunch = Math.max(g.fovPunch, 0.8);
        g.shake = Math.max(g.shake, 0.5);
      }
    } else {
      g.run.onIce = true;
      this.iceLaneScale = g.player.laneScale;
      g.player.laneScale *= ICE_LANE_SCALE;
    }
  }

  end(kind) {
    const g = this.game;
    if (kind === "elf") {
      this.elfLeaving = true;
      if (this.dropped > 0 && this.caught >= this.dropped) {
        g.audio.bells();
        g.screens.showRaid("🎒 다 주웠다! 요정이 자루를 떨어뜨렸어요!");
        g.pool.spawn("elfSack", g.lanes.includes(g.player.lane) ? g.player.lane : g.lanes[0], g.player.z + SACK_AHEAD, 1);
      } else {
        g.screens.showRaid(`🧝 요정이 달아났어요 · 선물 ${this.caught}/${this.dropped}개`);
      }
    } else if (kind === "avalanche") {
      const paid = g.run.addEventCoins(AVALANCHE_COINS);
      g.audio.purchase();
      if (paid > 0) g.screens.flashCoinGain(paid);
      g.screens.showRaid(paid > 0 ? `🏔️ 눈사태 탈출! 코인 +${paid.toLocaleString()}` : "🏔️ 눈사태 탈출!", paid > 0);
      this.waveLeaving = true;
    } else {
      this.endIce();
      g.screens.showRaid("🧊 빙판을 벗어났어요");
    }
  }

  endIce() {
    const g = this.game;
    if (!g.run?.onIce) return;
    g.run.onIce = false;
    g.player.laneScale = this.iceLaneScale;
  }

  laneIsClear(lane, z) {
    return !this.game.pool.live.some(
      (item) =>
        item.lethal && !item.taken && item.lane === lane && Math.abs(item.z - z) < item.length / 2 + GIFT_CLEARANCE,
    );
  }

  /** Drop what it is carrying, then bolt for another lane to make them chase it. */
  advanceChase(dt) {
    if (this.dropped >= ELF_GIFTS) return;
    this.dropIn -= dt;
    if (this.dropIn > 0) return;
    this.dropIn += ELF_DROP_GAP;
    const g = this.game;
    const z = g.player.z + this.elfAhead;
    const lanes = g.lanes.filter((lane) => this.laneIsClear(lane, z));
    if (!lanes.length) return;
    const here = lanes.includes(this.elfLane) ? this.elfLane : lanes[Math.floor(Math.random() * lanes.length)];
    g.pool.spawn("elfGift", here, z - 1, 0.95);
    this.dropped += 1;
    const others = lanes.filter((lane) => lane !== here && Math.abs(lane - here) === 1);
    if (others.length) this.elfLane = others[Math.floor(Math.random() * others.length)];
  }

  onCoin() {
    if (!this.aurora.active) return;
    this.game.run.addEventCoins(AURORA_COIN_BONUS);
  }

  onElfGift(event) {
    const g = this.game;
    this.caught += 1;
    g.audio.mission();
    if (event.gain > 0) g.screens.flashCoinGain(event.gain);
    g.screens.showRaid(`🎁 ${this.caught} / ${ELF_GIFTS}`, true);
  }

  onElfSack(event) {
    const g = this.game;
    g.audio.purchase();
    if (event.gain > 0) g.screens.flashCoinGain(event.gain);
    g.screens.showRaid(`🎒 선물 자루! 코인 +${event.gain.toLocaleString()}`, true);
    if (!reducedMotion()) g.fovPunch = Math.max(g.fovPunch, 0.6);
  }

  onIceClear(gain) {
    if (gain <= 0) return;
    this.game.audio.coin();
    this.game.screens.flashCoinGain(gain);
  }

  /** One rendered frame. Holds still over a pause or a game over. */
  present(dt) {
    const g = this.game;
    if (g.state === "title") {
      for (const mesh of Object.values(this.meshes)) mesh.visible = false;
      return;
    }
    const moving = g.state === "playing" ? dt : 0;
    this.time += moving;
    this.presentElf(moving);
    this.presentWave(moving);
    this.presentIce(moving);
    this.presentAurora(dt);
  }

  presentElf(dt) {
    const elf = this.meshes.elf;
    if (!elf?.visible) return;
    const g = this.game;
    const wanted = Math.max(ELF_MIN_AHEAD, g.speed * ELF_LEAD_SECONDS);
    this.elfAhead = this.elfLeaving
      ? this.elfAhead + ELF_LEAVE_SPEED * dt
      : this.elfAhead + (wanted - this.elfAhead) * approach(1.6, dt);
    if (this.elfAhead > 150) {
      elf.visible = false;
      return;
    }
    elf.position.x += (laneX(this.elfLane) - elf.position.x) * approach(7, dt);
    elf.position.z = g.player.z + this.elfAhead;
    const stride = this.time * 15;
    elf.position.y = Math.abs(Math.sin(stride)) * 0.2;
    elf.rotation.z = (laneX(this.elfLane) - elf.position.x) * -0.09;
    elf.userData.legs[0].rotation.x = Math.sin(stride) * 0.95;
    elf.userData.legs[1].rotation.x = -Math.sin(stride) * 0.95;
    if (dt > 0 && Math.random() < g.quality.particleBudget / 120) {
      g.particles.trail(elf.position.x, 0.25, elf.position.z, { count: 1, colour: 0xffffff, spread: 0.7, back: 0.8 });
    }
  }

  presentWave(dt) {
    const wave = this.meshes.wave;
    if (!wave?.visible) return;
    const g = this.game;
    const hunting = this.director.kind === "avalanche" && this.director.phase === "active";
    const wanted = this.waveLeaving ? WAVE_START - 20 : hunting ? WAVE_HELD : WAVE_WARNING;
    this.waveAt += (wanted - this.waveAt) * approach(this.waveLeaving ? 1.2 : 2.2, dt);
    if (this.waveLeaving && this.waveAt < WAVE_START - 6) {
      wave.visible = false;
      return;
    }
    wave.position.z = g.player.z + this.waveAt;
    wave.position.y = reducedMotion() ? 0 : Math.sin(this.time * 7) * 0.12;
    if (dt > 0 && !reducedMotion() && Math.random() < g.quality.particleBudget / 60) {
      const side = Math.random() < 0.5 ? -1 : 1;
      g.particles.burst(side * (2 + Math.random() * 6), 0.8 + Math.random() * 2, wave.position.z + 1, {
        count: 3,
        colour: 0xffffff,
        speed: 5,
        life: 0.6,
        size: 0.4,
      });
    }
    if (hunting && !reducedMotion()) g.shake = Math.max(g.shake, 0.14);
  }

  presentIce(dt) {
    const ice = this.meshes.ice;
    if (!ice?.visible) return;
    const g = this.game;
    if (g.player.z > ice.position.z + ICE_LENGTH * ice.scale.z + 12) {
      ice.visible = false;
      return;
    }
    if (dt > 0 && g.run.onIce && !g.player.mounted && g.player.y < 0.1) {
      if (Math.random() < g.quality.particleBudget / 50) {
        g.particles.trail(g.player.x, 0.1, g.player.z, { count: 1, colour: 0xe0f7ff, spread: 0.6, back: 0.5 });
      }
    }
  }

  presentAurora(dt) {
    const aurora = this.meshes.aurora;
    if (!aurora) return;
    const g = this.game;
    this.auroraGlow += ((this.aurora.active ? 1 : 0) - this.auroraGlow) * approach(1.8, dt);
    aurora.visible = this.auroraGlow > 0.01;
    if (!aurora.visible) return;
    aurora.position.set(g.player.x * 0.4, AURORA_HEIGHT, g.player.z + AURORA_AHEAD);
    aurora.children[0].material.opacity = this.auroraGlow;
    if (reducedMotion()) return;
    aurora.children.forEach((curtain, i) => {
      curtain.position.x = Math.sin(this.time * 0.35 + i * 2) * 16;
      curtain.scale.y = 1 + Math.sin(this.time * 0.8 + i) * 0.1;
    });
  }
}
