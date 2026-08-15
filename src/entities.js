import * as THREE from "three";
import { BUS_ROOF, LANES, TRAIN_COLORS, TRAIN_ROOF } from "./config.js";

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

export function makeSign() {
  const g = new THREE.Group();
  [-0.92, 0.92].forEach((x) => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), lambert(0x455a64));
    pole.position.set(x, 1.15, 0);
    g.add(pole);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.18), lambert(0x455a64));
  top.position.y = 2.28;
  g.add(top);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 0.16), lambert(0xffeb3b));
  board.position.y = 1.62;
  g.add(board);
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

export function makeMagnet() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38),
    new THREE.MeshLambertMaterial({
      color: 0xb388ff,
      emissive: 0x7c4dff,
      emissiveIntensity: 0.45,
    }),
  );
  gem.position.y = 0.2;
  g.add(gem);
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
};

const SPEC = {
  train: { length: 12, minY: 0, maxY: 2.4, lethal: true, rideable: true, roofY: TRAIN_ROOF },
  bus: { length: 9.2, minY: 0, maxY: 2.15, lethal: true, rideable: true, roofY: BUS_ROOF },
  barrier: { length: 0.5, minY: 0, maxY: 0.92, lethal: true },
  sign: { length: 0.4, minY: 0.95, maxY: 2.4, lethal: true },
  crate: { length: 1.4, minY: 0, maxY: 1.2, lethal: true },
  coin: { length: 0.5, minY: 0, maxY: 3.6, lethal: false },
  magnet: { length: 0.6, minY: 0, maxY: 3.2, lethal: false },
};

export class EntityPool {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.free = { train: [], bus: [], barrier: [], sign: [], crate: [], coin: [], magnet: [] };
  }

  spawn(type, lane, z, y = 0.55) {
    const spec = SPEC[type];
    const pile = this.free[type];
    let mesh = pile.pop();
    if (!mesh) {
      mesh = FACTORIES[type]();
      this.scene.add(mesh);
    }
    mesh.visible = true;
    const x = LANES[lane + 1];
    const lift = type === "coin" || type === "magnet" ? y : 0;
    mesh.position.set(x, lift, z);
    const item = {
      type,
      lane,
      z,
      y: lift,
      length: spec.length,
      minY: spec.minY,
      maxY: spec.maxY,
      lethal: spec.lethal,
      rideable: !!spec.rideable,
      roofY: spec.roofY || 0,
      mesh,
      taken: false,
    };
    this.live.push(item);
    return item;
  }

  release(item) {
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
