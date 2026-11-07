import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { wornCosmetic } from "./cosmetics.js";
import { setCoinColour } from "./entities.js";
import { tinted } from "./textures.js";
import { shaded } from "./trackevents.js";

const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

const TRAIL_ROWS = 26;
const TRAIL_STEP = 0.5;
const TRAIL_GAUGE = 0.27;
const TRAIL_WIDTH = 0.1;
const TRAIL_HEIGHT = 0.13;
/** A groove in the snow, for anyone who has not bought a colour. */
const GROOVE = { colour: 0x3c5070, alpha: 0.5 };
const COLOURED_ALPHA = 0.85;

/** Sits on the head node, so it follows a slide and a jump with no extra work. */
const HAT_BUILDERS = {
  "hat-antlers": () => {
    const parts = [];
    for (const side of [-1, 1]) {
      parts.push(tinted(new THREE.CylinderGeometry(0.025, 0.04, 0.34, 6).rotateZ(side * -0.45), 0xa9794a, side * 0.17, 0.14, 0));
      parts.push(tinted(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 6).rotateZ(side * -1.1), 0xa9794a, side * 0.26, 0.22, 0));
      parts.push(tinted(new THREE.CylinderGeometry(0.02, 0.03, 0.14, 6).rotateZ(side * 0.25), 0xa9794a, side * 0.2, 0.32, 0));
    }
    return parts;
  },
  "hat-ribbon": () => [
    tinted(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.75, 0.5), 0xef4444, -0.13, 0.08, 0),
    tinted(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.75, 0.5), 0xef4444, 0.13, 0.08, 0),
    tinted(new THREE.SphereGeometry(0.06, 8, 6), 0xb91c1c, 0, 0.08, 0),
  ],
  "hat-star": () => [
    tinted(new THREE.OctahedronGeometry(0.2), 0xffd54f, 0, 0.3, 0),
    tinted(new THREE.OctahedronGeometry(0.15).rotateY(Math.PI / 4).rotateZ(Math.PI / 4), 0xfff3b0, 0, 0.3, 0),
    tinted(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 6), 0x92651a, 0, 0.09, 0),
  ],
  "hat-pine": () => [
    tinted(new THREE.ConeGeometry(0.2, 0.26, 8), 0x1f8f4e, 0, 0.13, 0),
    tinted(new THREE.ConeGeometry(0.15, 0.22, 8), 0x22a35a, 0, 0.29, 0),
    tinted(new THREE.ConeGeometry(0.09, 0.18, 8), 0x2fbf6e, 0, 0.43, 0),
    tinted(new THREE.OctahedronGeometry(0.05), 0xffd54f, 0, 0.55, 0),
    tinted(new THREE.SphereGeometry(0.03, 6, 5), 0xef4444, 0.12, 0.13, 0.09),
    tinted(new THREE.SphereGeometry(0.03, 6, 5), 0x38bdf8, -0.11, 0.2, 0.07),
  ],
  "hat-snowman": () => [
    tinted(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), 0x1f2937, 0, 0.03, 0),
    tinted(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 16), 0x111827, 0, 0.2, 0),
    tinted(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 16), 0xef4444, 0, 0.08, 0),
  ],
  "hat-halo": () => [tinted(new THREE.TorusGeometry(0.2, 0.03, 8, 22).rotateX(Math.PI / 2), 0xfff3b0, 0, 0.26, 0)],
  "hat-crown": () => {
    const parts = [tinted(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), 0xffc933, 0, 0.07, 0)];
    for (let i = 0; i < 6; i++) {
      const turn = (i / 6) * Math.PI * 2;
      parts.push(tinted(new THREE.ConeGeometry(0.055, 0.15, 5), 0xffd54f, Math.cos(turn) * 0.18, 0.19, Math.sin(turn) * 0.18));
      parts.push(tinted(new THREE.OctahedronGeometry(0.03), i % 2 ? 0xef4444 : 0x38bdf8, Math.cos(turn) * 0.2, 0.08, Math.sin(turn) * 0.2));
    }
    return parts;
  },
};
/** Above the skull, from the head node's own origin. */
const HAT_LIFT = 0.2;

function makeTrail() {
  const vertices = TRAIL_ROWS * 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(vertices * 4), 4));
  const index = [];
  for (let row = 0; row < TRAIL_ROWS - 1; row++) {
    for (const v of [0, 2]) {
      const a = row * 4 + v;
      const b = a + 4;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(
    geometry,
    // Not tone mapped, or the scene's exposure washes every colour out towards cream.
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
}

/** Puts what the player has bought on the runner and on the track. */
export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.hats = {};
    this.trailX = new Array(TRAIL_ROWS).fill(0);
    this.trailGround = new Array(TRAIL_ROWS).fill(false);
    this.trailRow = null;
    this.trail = makeTrail();
    game.scene.add(this.trail);
    const [deck, glow] = game.player.board.children;
    this.boardPlain = { deck: deck.material.color.getHex(), glow: glow.material.color.getHex() };
    this.apply();
  }

  worn(slot) {
    return wornCosmetic(this.game.store.data, slot);
  }

  /** Called whenever what is worn may have changed. Never during a run. */
  apply() {
    this.applyHat();
    this.applyBoard();
    this.applyTrail();
    setCoinColour(this.worn("coin")?.colour ?? null);
  }

  applyHat() {
    const id = this.worn("hat")?.id;
    for (const hat of Object.values(this.hats)) hat.visible = false;
    if (!id) return;
    if (!this.hats[id]) {
      const hat = new THREE.Mesh(
        shaded(mergeGeometries(HAT_BUILDERS[id]())),
        new THREE.MeshBasicMaterial({ vertexColors: true }),
      );
      hat.position.y = HAT_LIFT;
      this.game.player.head.add(hat);
      this.hats[id] = hat;
    }
    this.hats[id].visible = true;
  }

  applyBoard() {
    const { christmas, player } = this.game;
    const [deck, glow] = player.board.children;
    const worn = this.worn("board")?.colour;
    deck.material.color.set(worn ?? (christmas ? 0x38bdf8 : this.boardPlain.deck));
    glow.material.color.setHex(christmas ? 0xffffff : this.boardPlain.glow);
    deck.scale.set(christmas ? 1.15 : 1, 1, christmas ? 1.45 : 1);
  }

  /** A colour per row, fading out towards the far end. */
  applyTrail() {
    const worn = this.worn("trail");
    const colour = new THREE.Color();
    const peak = worn ? COLOURED_ALPHA : GROOVE.alpha;
    const paint = this.trail.geometry.attributes.color;
    for (let row = 0; row < TRAIL_ROWS; row++) {
      // Round the wheel three times, because only the nearest stretch is on screen.
      if (worn?.rainbow) colour.setHSL(((row * 3) / TRAIL_ROWS) % 1, 0.95, 0.58);
      else colour.set(worn?.colour ?? GROOVE.colour);
      const alpha = peak * (1 - row / TRAIL_ROWS);
      for (let v = 0; v < 4; v++) paint.setXYZW(row * 4 + v, colour.r, colour.g, colour.b, alpha);
    }
    paint.needsUpdate = true;
  }

  /** @returns {object|undefined} how a coin should sound, if something was bought */
  coinVoice() {
    return this.worn("chime")?.voice;
  }

  onLanding() {
    const { christmas, particles, player: p } = this.game;
    const worn = this.worn("burst");
    if (worn?.rainbow) {
      if (!reducedMotion()) particles.rainbow(p.x, 0.3, p.z, { count: 22, speed: 5, life: 0.5 });
    } else if (worn) {
      particles.burst(p.x, 0.15, p.z, { count: 16, colour: new THREE.Color(worn.colour).getHex(), speed: 4.6, life: 0.5, size: 0.32, gravity: -5 });
    } else if (christmas) {
      particles.burst(p.x, 0.15, p.z, { count: 12, colour: 0xf4faff, speed: 4.2, life: 0.45, size: 0.3, gravity: -5 });
    }
  }

  /** One rendered frame. */
  present(dt) {
    const g = this.game;
    if (g.state !== "playing") {
      if (g.state === "title") this.trail.visible = false;
      return;
    }
    const worn = this.worn("trail");
    this.trail.visible = Boolean(worn) || g.christmas;
    if (this.trail.visible) this.presentTrail();

    const aura = this.worn("aura");
    if (aura && !reducedMotion() && Math.random() < g.quality.particleBudget * dt * 0.35) {
      const p = g.player;
      const colour = aura.id === "aura-aurora"
        ? new THREE.Color().setHSL(0.42 + Math.sin(g.runTime) * 0.14, 0.85, 0.65).getHex()
        : new THREE.Color(aura.colour).getHex();
      g.particles.trail(p.x, p.y + 0.3 + Math.random() * 1.1, p.z - 0.3, { count: 1, colour, spread: 0.9, back: 0.7 });
    }
  }

  presentTrail() {
    const p = this.game.player;
    const grounded = !p.flying && !p.mounted && p.y < 0.08;
    const row = Math.floor(p.z / TRAIL_STEP);
    if (row === this.trailRow) return;
    const moved = this.trailRow === null ? TRAIL_ROWS : Math.min(TRAIL_ROWS, Math.max(1, row - this.trailRow));
    this.trailRow = row;
    for (let i = 0; i < moved; i++) {
      this.trailX.pop();
      this.trailX.unshift(p.x);
      this.trailGround.pop();
      this.trailGround.unshift(grounded);
    }
    const position = this.trail.geometry.attributes.position;
    for (let i = 0; i < TRAIL_ROWS; i++) {
      const z = (row - i) * TRAIL_STEP;
      const half = this.trailGround[i] ? TRAIL_WIDTH : 0;
      const x = this.trailX[i];
      const base = i * 4;
      position.setXYZ(base, x - TRAIL_GAUGE - half, TRAIL_HEIGHT, z);
      position.setXYZ(base + 1, x - TRAIL_GAUGE + half, TRAIL_HEIGHT, z);
      position.setXYZ(base + 2, x + TRAIL_GAUGE - half, TRAIL_HEIGHT, z);
      position.setXYZ(base + 3, x + TRAIL_GAUGE + half, TRAIL_HEIGHT, z);
    }
    position.needsUpdate = true;
  }
}
