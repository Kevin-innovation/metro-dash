import * as THREE from "three";
import {
  BUS_ROOF,
  LANES,
  SIGN_BOARD_BOTTOM,
  SIGN_BOARD_TOP,
  SIGN_TOP,
  TRAIN_COLORS,
} from "./config.js";
import { SPEC } from "./specs.js";

const BUS_COLORS = [0xffc107, 0x26c6da, 0xef5350, 0x66bb6a];

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export function makeTrain(color = 0xff5252) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.15, 11.5), lambert(color));
  body.position.y = 1.22;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.18, 11.52), lambert(0xffffff));
  stripe.position.y = 1.55;
  g.add(stripe);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 11.2), lambert(0x37474f));
  roof.position.y = 2.38;
  g.add(roof);
  [-4.2, -1.4, 1.4, 4.2].forEach((z) => {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.55, 1.4),
      lambert(0x81d4fa, { emissive: 0x224466, emissiveIntensity: 0.25 }),
    );
    win.position.set(0, 1.75, z);
    g.add(win);
  });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.2), lambert(0x263238));
  nose.position.set(0, 1.55, 5.85);
  g.add(nose);
  [-0.45, 0.45].forEach((x) => {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.08),
      lambert(0xfff59d, { emissive: 0xffcc80, emissiveIntensity: 0.8 }),
    );
    light.position.set(x, 0.85, 5.82);
    g.add(light);
  });
  return g;
}

export function makeBus(color = 0xffc107) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.78, 8.8), lambert(color));
  body.position.y = 1.12;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.12, 8.5), lambert(0x455a64));
  roof.position.y = BUS_ROOF;
  g.add(roof);
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 8.2), lambert(0x263238));
  railL.position.set(-0.8, BUS_ROOF + 0.12, 0);
  g.add(railL);
  const railR = railL.clone();
  railR.position.x = 0.8;
  g.add(railR);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 8.82), lambert(0xffffff));
  stripe.position.y = 0.72;
  g.add(stripe);
  [-2.6, 0, 2.6].forEach((z) => {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.76, 0.62, 1.7),
      lambert(0x81d4fa, { emissive: 0x224466, emissiveIntensity: 0.28 }),
    );
    win.position.set(0, 1.45, z);
    g.add(win);
  });
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.72, 0.12),
    lambert(0xb3e5fc, { emissive: 0x447799, emissiveIntensity: 0.2 }),
  );
  glass.position.set(0, 1.48, 4.42);
  g.add(glass);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 0.18), lambert(0x263238));
  bumper.position.set(0, 0.42, 4.45);
  g.add(bumper);
  [-0.5, 0.5].forEach((x) => {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.08),
      lambert(0xfff59d, { emissive: 0xffcc80, emissiveIntensity: 0.85 }),
    );
    light.position.set(x, 0.62, 4.48);
    light.userData.headlight = true;
    g.add(light);
  });
  [
    [-0.72, -2.8],
    [0.72, -2.8],
    [-0.72, 2.8],
    [0.72, 2.8],
  ].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), lambert(0x212121));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.32, z);
    g.add(wheel);
  });
  return g;
}

export function makeBarrier() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.82, 0.38), lambert(0xff6d00));
  bar.position.y = 0.5;
  g.add(bar);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 0.4), lambert(0xfff8e1));
  stripe.position.y = 0.5;
  g.add(stripe);
  [-0.7, 0.7].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), lambert(0x37474f));
    leg.position.set(x, 0.2, 0);
    g.add(leg);
  });
  return g;
}

/**
 * Low-clearance gate. The structure runs all the way up past every reachable
 * jump apex (including super sneakers), so the only way through is the crawl
 * gap at the bottom — and the silhouette has to say that at a glance.
 */
export function makeSign() {
  const g = new THREE.Group();

  [-0.94, 0.94].forEach((x) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, SIGN_TOP, 0.18), lambert(0x37474f));
    pole.position.set(x, SIGN_TOP / 2, 0);
    g.add(pole);
  });

  // Concrete slab filling everything above the warning board. Light enough to
  // stay a structure at distance rather than a black hole in the lane.
  const slabHeight = SIGN_TOP - SIGN_BOARD_TOP;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.86, slabHeight, 0.2), lambert(0x93a4ad));
  slab.position.y = SIGN_BOARD_TOP + slabHeight / 2;
  g.add(slab);

  const rib = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.24), lambert(0x5c7079));
  rib.position.y = SIGN_BOARD_TOP + slabHeight * 0.55;
  g.add(rib);

  const capBeam = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 0.26), lambert(0x263238));
  capBeam.position.y = SIGN_TOP - 0.11;
  g.add(capBeam);

  // Yellow warning board sits right above the crawl gap.
  const boardHeight = SIGN_BOARD_TOP - SIGN_BOARD_BOTTOM;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, boardHeight, 0.22), lambert(0xffeb3b));
  board.position.y = (SIGN_BOARD_TOP + SIGN_BOARD_BOTTOM) / 2;
  g.add(board);

  [-0.5, 0, 0.5].forEach((x) => {
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.28, boardHeight * 0.7, 0.26), lambert(0x263238));
    chevron.position.set(x, (SIGN_BOARD_TOP + SIGN_BOARD_BOTTOM) / 2, 0);
    chevron.rotation.z = 0.5;
    g.add(chevron);
  });

  // Hazard lip marking the bottom edge of the gap.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.14, 0.28), lambert(0xff6d00));
  lip.position.y = SIGN_BOARD_BOTTOM + 0.07;
  g.add(lip);

  return g;
}

export function makeCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.15, 1.35), lambert(0xc48a3a));
  box.position.y = 0.58;
  g.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.47, 0.12, 1.37), lambert(0x6d4c41));
  band.position.y = 0.58;
  g.add(band);
  return g;
}

export function makeCoin() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.09, 18),
    new THREE.MeshLambertMaterial({
      color: 0xffd54f,
      emissive: 0xaa7700,
      emissiveIntensity: 0.35,
    }),
  );
  mesh.rotation.z = Math.PI / 2;
  return mesh;
}

/** Shared shell for every power-up pickup: a glowing gem on a tinted disc. */
function powerupShell(color, emissive) {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.05, 8, 20),
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.7 }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.2;
  g.add(halo);
  return g;
}

export function makeMagnet() {
  const g = powerupShell(0xb388ff, 0x7c4dff);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38),
    new THREE.MeshLambertMaterial({ color: 0xb388ff, emissive: 0x7c4dff, emissiveIntensity: 0.45 }),
  );
  gem.position.y = 0.2;
  g.add(gem);
  return g;
}

export function makeJetpack() {
  const g = powerupShell(0xff7a3c, 0xff3d00);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a3c, emissive: 0xbf360c, emissiveIntensity: 0.4 }),
  );
  body.position.y = 0.28;
  g.add(body);
  const nozzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.24, 10),
    new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xff6d00, emissiveIntensity: 0.8 }),
  );
  nozzle.rotation.x = Math.PI;
  nozzle.position.y = -0.1;
  g.add(nozzle);
  return g;
}

export function makeDouble() {
  const g = powerupShell(0xffd24a, 0xffab00);
  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 1),
    new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0xffab00, emissiveIntensity: 0.65 }),
  );
  star.position.y = 0.22;
  star.scale.set(1, 1.35, 1);
  g.add(star);
  return g;
}

export function makeSneakers() {
  const g = powerupShell(0x14d4b8, 0x00897b);
  const shoe = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.16, 0.46),
    new THREE.MeshLambertMaterial({ color: 0xf8fafc, emissive: 0x14d4b8, emissiveIntensity: 0.3 }),
  );
  shoe.position.y = 0.24;
  g.add(shoe);
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x14d4b8, emissive: 0x00897b, emissiveIntensity: 0.7 }),
  );
  wing.position.set(0, 0.34, -0.1);
  g.add(wing);
  return g;
}

const FACTORIES = {
  train: () => makeTrain(TRAIN_COLORS[(Math.random() * TRAIN_COLORS.length) | 0]),
  bus: () => makeBus(BUS_COLORS[(Math.random() * BUS_COLORS.length) | 0]),
  barrier: makeBarrier,
  sign: makeSign,
  crate: makeCrate,
  coin: makeCoin,
  magnet: makeMagnet,
  jetpack: makeJetpack,
  double: makeDouble,
  sneakers: makeSneakers,
};

/**
 * The pursuer.
 *
 * Deliberately not another train: it has to read as *someone chasing you* at a
 * glance and from behind, so it is a figure on a vehicle with a light aimed at
 * the runner's back.
 */
export function makeChaser() {
  const g = new THREE.Group();

  const cart = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.7, 3.0),
    new THREE.MeshLambertMaterial({ color: 0x46566b, emissive: 0x141b25 }),
  );
  cart.position.y = 0.55;
  g.add(cart);

  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.5, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x33404f, emissive: 0x11161d }),
  );
  cage.position.set(0, 1.6, -0.5);
  g.add(cage);

  const rider = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.0, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x2c5a8c, emissive: 0x0d1a29 }),
  );
  rider.position.set(0, 1.75, 0.6);
  g.add(rider);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xf0c9a0 }),
  );
  head.position.set(0, 2.5, 0.6);
  g.add(head);

  // The searchlight is what makes it legible in a dark tunnel, where the body
  // itself is barely visible.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 4.5, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 1.9, 3.0);
  g.add(beam);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }),
  );
  lamp.position.set(0, 1.9, 1.0);
  g.add(lamp);

  // Two spinning lights, the universal shorthand for "being chased".
  const beacons = [-0.62, 0.62].map((x, i) => {
    const beacon = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.34, 0.3),
      new THREE.MeshBasicMaterial({ color: i ? 0x3d7dff : 0xff3d5a, fog: false }),
    );
    beacon.position.set(x, 2.5, -0.5);
    g.add(beacon);
    return beacon;
  });

  g.userData = { beam, lamp, beacons };
  return g;
}

export { SPEC };

export class EntityPool {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.free = {};
    for (const type of Object.keys(FACTORIES)) this.free[type] = [];
  }

  spawn(type, lane, z, y = 0.55) {
    const spec = SPEC[type];
    const pile = this.free[type];
    let mesh = pile.pop();
    if (!mesh) {
      mesh = FACTORIES[type]();
      // Only solid obstacles cast; coins and pickups would just add noise.
      if (spec.lethal) {
        mesh.traverse((child) => {
          if (child.isMesh) child.castShadow = true;
        });
      }
      this.scene.add(mesh);
    }
    mesh.visible = true;
    const x = LANES[lane + 1];
    // Pickups float at the requested height; obstacles always sit on the deck.
    const lift = spec.lethal ? 0 : y;
    mesh.position.set(x, lift, z);
    const item = {
      type,
      lane,
      z,
      powerup: spec.powerup ?? null,
      /** Set once the runner has passed it, so near misses only score once. */
      scored: false,
      // Position at the start of the current simulation step, so the swept
      // collision test can account for obstacles that move (oncoming buses).
      prevZ: z,
      y: lift,
      length: spec.length,
      depth: spec.depth,
      minY: spec.minY,
      maxY: spec.maxY,
      lethal: spec.lethal,
      rideable: !!spec.rideable,
      roofY: spec.roofY || 0,
      moving: false,
      vz: 0,
      warned: false,
      mesh,
      taken: false,
    };
    setBusFacing(item, false);
    this.live.push(item);
    return item;
  }

  release(item) {
    item.moving = false;
    item.vz = 0;
    item.warned = false;
    item.scored = false;
    setBusFacing(item, false);
    item.mesh.visible = false;
    this.free[item.type].push(item.mesh);
  }

  prune(behindZ) {
    const keep = [];
    for (const item of this.live) {
      if (item.taken || item.z < behindZ) this.release(item);
      else keep.push(item);
    }
    this.live = keep;
  }

  clear() {
    for (const item of this.live) this.release(item);
    this.live = [];
  }
}

export function setBusFacing(item, oncoming) {
  if (!item?.mesh || item.type !== "bus") return;
  item.mesh.rotation.y = oncoming ? Math.PI : 0;
  item.mesh.traverse((child) => {
    if (!child.userData?.headlight || !child.material) return;
    child.material.emissiveIntensity = oncoming ? 1.8 : 0.85;
    child.scale.setScalar(oncoming ? 1.35 : 1);
  });
}

export function makeOncoming(item, speed) {
  item.moving = true;
  item.vz = -Math.abs(speed);
  item.warned = false;
  setBusFacing(item, true);
  return item;
}
