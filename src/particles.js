import * as THREE from "three";

/**
 * One pooled particle field for the whole game.
 *
 * Every burst draws from a single `THREE.Points`, so effects cost one draw call
 * no matter how many are on screen. Particles live in flat typed arrays and are
 * recycled round-robin — nothing is allocated once the pool is built.
 */

export const GRAVITY = -13;

/** Ring-buffer bookkeeping, kept separate so it can be reasoned about directly. */
export class ParticleStore {
  constructor(capacity) {
    this.capacity = capacity;
    /** Slots currently in use. Lower quality tiers shrink this, not `capacity`. */
    this.budget = capacity;
    this.cursor = 0;
    this.live = 0;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.cr = new Float32Array(capacity);
    this.cg = new Float32Array(capacity);
    this.cb = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
  }

  /**
   * Shrink or grow the working set. Slots outside the budget are retired so a
   * quality downgrade takes effect immediately rather than at the next burst.
   */
  setBudget(budget) {
    this.budget = Math.max(8, Math.min(this.capacity, Math.floor(budget)));
    for (let i = this.budget; i < this.capacity; i++) this.life[i] = 0;
    if (this.cursor >= this.budget) this.cursor = 0;
  }

  /**
   * Claim the next slot. The cursor wraps at the budget, not the capacity, so a
   * reduced budget still issues every slot it has instead of handing back
   * out-of-range indices that the caller would have to discard.
   */
  allocate() {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.budget;
    if (this.life[index] <= 0) this.live += 1;
    return index;
  }

  spawn(index, { x, y, z, vx, vy, vz, life, size, colour, drag = 1.6, gravity = GRAVITY }) {
    this.px[index] = x;
    this.py[index] = y;
    this.pz[index] = z;
    this.vx[index] = vx;
    this.vy[index] = vy;
    this.vz[index] = vz;
    this.life[index] = life;
    this.maxLife[index] = life;
    this.size[index] = size;
    this.cr[index] = colour[0];
    this.cg[index] = colour[1];
    this.cb[index] = colour[2];
    this.drag[index] = drag;
    this.gravity[index] = gravity;
  }

  /** Integrate one frame. Returns the number still alive. */
  step(dt) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        continue;
      }
      const damp = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= damp;
      this.vz[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.gravity[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      live += 1;
    }
    this.live = live;
    return live;
  }

  clear() {
    this.life.fill(0);
    this.live = 0;
    this.cursor = 0;
  }
}

const hexToRgb = (hex) => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

function sparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class ParticleField {
  constructor(scene, capacity = 260) {
    this.store = new ParticleStore(capacity);
    this.budget = capacity;

    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(capacity * 3);
    this.colours = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colours, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));

    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.34,
        map: sparkTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Lower budgets simply use fewer slots; the buffers stay allocated. */
  setBudget(budget) {
    this.store.setBudget(budget);
    this.budget = this.store.budget;
  }

  emit(count, make) {
    const total = Math.min(count, this.budget);
    for (let i = 0; i < total; i++) {
      this.store.spawn(this.store.allocate(), make(i, total));
    }
  }

  burst(x, y, z, { count = 12, colour = 0xffd24a, speed = 4, spread = 1, life = 0.5, size = 0.3, gravity = GRAVITY, drag = 1.6 } = {}) {
    const rgb = hexToRgb(colour);
    this.emit(count, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const power = speed * (0.5 + Math.random() * 0.7);
      return {
        x: x + (Math.random() - 0.5) * spread * 0.4,
        y: y + (Math.random() - 0.5) * spread * 0.4,
        z: z + (Math.random() - 0.5) * spread * 0.4,
        vx: Math.sin(phi) * Math.cos(theta) * power,
        vy: Math.abs(Math.cos(phi)) * power * 0.9 + 1.5,
        vz: Math.sin(phi) * Math.sin(theta) * power,
        life: life * (0.7 + Math.random() * 0.6),
        size,
        colour: rgb,
        gravity,
        drag,
      };
    });
  }

  /** Flat ring of dust, used when the runner lands. */
  dust(x, y, z, { count = 10, colour = 0xd8c9a8, speed = 3.4 } = {}) {
    const rgb = hexToRgb(colour);
    this.emit(count, (i, total) => {
      const theta = (i / total) * Math.PI * 2 + Math.random() * 0.6;
      const power = speed * (0.6 + Math.random() * 0.5);
      return {
        x,
        y: y + 0.06,
        z,
        vx: Math.cos(theta) * power,
        vy: 0.9 + Math.random() * 0.8,
        vz: Math.sin(theta) * power * 0.5,
        life: 0.34 + Math.random() * 0.2,
        size: 0.42,
        colour: rgb,
        gravity: -4,
        drag: 3.4,
      };
    });
  }

  /** Trail left behind a moving source, e.g. the jetpack exhaust. */
  trail(x, y, z, { count = 3, colour = 0xffb74d, spread = 0.22, back = 0.4 } = {}) {
    const rgb = hexToRgb(colour);
    this.emit(count, () => ({
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      z: z - back - Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -1.6 - Math.random() * 1.4,
      vz: -3 - Math.random() * 2,
      life: 0.26 + Math.random() * 0.16,
      size: 0.5,
      colour: rgb,
      gravity: 0,
      drag: 2.2,
    }));
  }

  update(dt) {
    if (dt <= 0) return;
    const store = this.store;
    store.step(dt);

    let written = 0;
    for (let i = 0; i < store.capacity; i++) {
      if (store.life[i] <= 0) continue;
      const o = written * 3;
      this.positions[o] = store.px[i];
      this.positions[o + 1] = store.py[i];
      this.positions[o + 2] = store.pz[i];
      // Fade out by dimming rather than by alpha: additive blending makes a
      // dimming spark read as "burning out" instead of "vanishing".
      const fade = store.life[i] / store.maxLife[i];
      const glow = fade * fade;
      this.colours[o] = store.cr[i] * glow;
      this.colours[o + 1] = store.cg[i] * glow;
      this.colours[o + 2] = store.cb[i] * glow;
      this.sizes[written] = store.size[i] * (0.5 + fade * 0.8);
      written += 1;
    }

    this.points.geometry.setDrawRange(0, written);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;
  }

  clear() {
    this.store.clear();
    this.points.geometry.setDrawRange(0, 0);
  }
}
