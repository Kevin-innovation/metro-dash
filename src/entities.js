import * as THREE from "three";
import { BUS_ROOF, SIGN_BOARD_BOTTOM, SIGN_BOARD_TOP, SIGN_TOP, TRAIN_COLORS } from "./config.js";
import { laneX } from "./lanes.js";
import { SPEC } from "./specs.js";
import { makeCandyStripes, makeContainerSkin, tinted } from "./textures.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chuseokAt } from "./chuseok.js";

const BUS_COLORS = [0xffc107, 0x26c6da, 0xef5350, 0x66bb6a];

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

export function makeTrain(color = 0xff5252, windows = null) {
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
      windows ?? lambert(0x81d4fa, { emissive: 0x224466, emissiveIntensity: 0.25 }),
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

  // The back of the train, for the same reason as the bus: this is the end the
  // player actually runs at, and it was a blank wall of colour.
  const rearWindow = new THREE.Mesh(
    new THREE.BoxGeometry(1.62, 0.6, 0.2),
    lambert(0x44647c, { emissive: 0x14212b, emissiveIntensity: 0.22 }),
  );
  rearWindow.position.set(0, 1.72, -5.78);
  g.add(rearWindow);

  [-0.45, 0.45].forEach((x) => {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.08),
      lambert(0xff5c5c, { emissive: 0xd50000, emissiveIntensity: 0.9 }),
    );
    tail.position.set(x, 0.85, -5.82);
    g.add(tail);
  });

  const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), lambert(0x263238));
  // Kept inside the 12m footprint the pattern table reasons about.
  coupler.position.set(0, 0.55, -5.85);
  g.add(coupler);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.16), lambert(0x263238));
  skirt.position.set(0, 0.32, -5.8);
  g.add(skirt);
  return g;
}

export function makeBus(color = 0xffc107, windows = null) {
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
      windows ?? lambert(0x81d4fa, { emissive: 0x224466, emissiveIntensity: 0.28 }),
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
  // The back of the bus.
  //
  // Every detail above sits on the front face, which the player only ever sees
  // on an oncoming bus. A bus travelling the same way is met from behind, and
  // from behind it was a plain coloured box — indistinguishable from a freight
  // container, which is exactly how it read in play. So the rear gets its own
  // window, lights, plate and bumper.
  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.66, 0.12),
    lambert(0x4a6b80, { emissive: 0x14212b, emissiveIntensity: 0.25 }),
  );
  rearGlass.position.set(0, 1.5, -4.42);
  g.add(rearGlass);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.18), lambert(0x263238));
  rearBumper.position.set(0, 0.4, -4.45);
  g.add(rearBumper);

  // Red at the back, white at the front: the one cue that says at a glance
  // whether this thing is running away from you or straight at you.
  [-0.6, 0.6].forEach((x) => {
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.2, 0.08),
      lambert(0xff5c5c, { emissive: 0xd50000, emissiveIntensity: 0.9 }),
    );
    tail.position.set(x, 0.78, -4.46);
    g.add(tail);
  });

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.06), lambert(0xeceff1));
  plate.position.set(0, 0.78, -4.46);
  g.add(plate);

  // Seam down the middle of the rear doors, so the face has a scale to read.
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.06), lambert(0x37474f));
  seam.position.set(0, 1.02, -4.44);
  g.add(seam);

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

/**
 * Freight container.
 *
 * Deliberately nothing like a bus. The buses are bright, pastel and glassy —
 * amber, cyan, red, green — so the container takes the colours a bus never
 * wears (rust, marine teal, deep navy), wears corrugated steel instead of flat
 * paint, and carries a yellow hazard stripe along the top edge, which is the
 * part the player is about to jump over.
 */
const CONTAINER_COLORS = [0xe0651f, 0x1e9aa4, 0x3f6ea8];

/**
 * Shared once for every container ever pooled. Geometry and materials are the
 * expensive half of an entity; the meshes that reference them are cheap.
 */
let containerParts = null;
function container() {
  if (containerParts) return containerParts;
  const skin = makeContainerSkin();
  containerParts = {
    skin,
    shell: new THREE.BoxGeometry(1.45, 1.15, 1.35),
    post: new THREE.BoxGeometry(0.11, 1.19, 0.11),
    stripe: new THREE.BoxGeometry(1.32, 0.05, 0.3),
    // Corner castings: the pale steel is what separates the silhouette from the
    // dark road behind it once the body colour goes dark.
    postMat: lambert(0x9fb0bb),
    stripeMat: lambert(0xffd400, { emissive: 0x6b5200, emissiveIntensity: 0.35 }),
  };
  return containerParts;
}

export function makeCrate() {
  const parts = container();
  const g = new THREE.Group();

  const colour = CONTAINER_COLORS[(Math.random() * CONTAINER_COLORS.length) | 0];
  const shell = new THREE.Mesh(parts.shell, lambert(colour, { map: parts.skin }));
  shell.position.y = 0.575;
  g.add(shell);

  [
    [-0.7, -0.65],
    [0.7, -0.65],
    [-0.7, 0.65],
    [0.7, 0.65],
  ].forEach(([x, z]) => {
    const post = new THREE.Mesh(parts.post, parts.postMat);
    post.position.set(x, 0.595, z);
    g.add(post);
  });

  const stripe = new THREE.Mesh(parts.stripe, parts.stripeMat);
  stripe.position.y = 1.175;
  g.add(stripe);
  return g;
}

export function makeCoin() {
  const songpyeon = chuseokAt() ? eventTexture("/assets/events/chuseok/songpyeon.png") : null;
  if (songpyeon) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.64),
      new THREE.MeshBasicMaterial({
        map: songpyeon,
        transparent: true,
        alphaTest: 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 1;
    return mesh;
  }
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

let noseParts = null;

/**
 * The Christmas coin: Rudolph's nose.
 *
 * One mesh with its shading in the vertex colours, and one geometry and material
 * shared by every coin, because a coin line is the thing there are most of on
 * screen. Self-lit, as a nose that glows should be, so it stays red in a tunnel.
 */
export function makeNoseCoin() {
  if (!noseParts) {
    const red = new THREE.Color();
    const body = new THREE.SphereGeometry(0.33, 12, 10).toNonIndexed();
    const shine = new THREE.SphereGeometry(0.075, 6, 5).toNonIndexed();
    shine.translate(0.15, 0.2, 0.18);
    const paint = (geometry, colourAt) => {
      const normals = geometry.attributes.normal;
      const colours = new Float32Array(normals.count * 3);
      for (let i = 0; i < normals.count; i++) colourAt(normals.getY(i)).toArray(colours, i * 3);
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    };
    paint(body, (up) => red.setRGB(0.62 + up * 0.38, 0.03 + Math.max(0, up) * 0.1, 0.05));
    paint(shine, () => red.setRGB(1, 0.86, 0.86));
    noseParts = {
      geometry: mergeGeometries([body, shine]),
      material: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
  }
  return new THREE.Mesh(noseParts.geometry, noseParts.material);
}

/**
 * The Christmas crow egg: a snowball, and taking it brings the blizzard down.
 *
 * It is white on a white floor, which a trap cannot afford, so the underside is
 * painted a strong ice blue and two dark rings of wind turn around it. Self-lit,
 * like the gift, so it reads the same in a tunnel and through the white-out.
 */
export function makeSnowball() {
  const g = new THREE.Group();
  const shade = new THREE.Color();
  const body = new THREE.SphereGeometry(0.44, 12, 10);
  const normals = body.attributes.normal;
  const colours = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const up = (normals.getY(i) + 1) / 2;
    shade.setRGB(0.22 + up * 0.78, 0.45 + up * 0.55, 0.85 + up * 0.15).toArray(colours, i * 3);
  }
  body.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.add(new THREE.Mesh(body, new THREE.MeshBasicMaterial({ vertexColors: true })));

  const wind = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });
  for (const [x, z, r] of [
    [1.25, 0.25, 0.6],
    [1.9, -0.3, 0.68],
  ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 24), wind);
    ring.rotation.set(x, 0, z);
    g.add(ring);
  }
  return g;
}

const eventTextures = new Map();

/** Browser-only asset load. Unit tests keep the procedural mesh fallback. */
function eventTexture(path) {
  if (typeof document === "undefined") return null;
  if (eventTextures.has(path)) return eventTextures.get(path);
  const texture = new THREE.TextureLoader().load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  eventTextures.set(path, texture);
  return texture;
}

export function makeChuseokMoon() {
  const texture = eventTexture("/assets/events/chuseok/full-moon-rabbit.png");
  const group = new THREE.Group();

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.045, 8, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  group.add(halo);

  if (texture) {
    const moon = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 1.52),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.03,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    moon.renderOrder = 2;
    group.add(moon);
  } else {
    // A generated asset should never make the game fail to boot. The fallback
    // keeps the pickup playable and unmistakably moon-shaped.
    group.add(
      new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 28),
        new THREE.MeshBasicMaterial({ color: 0xffe59a, side: THREE.DoubleSide }),
      ),
    );
  }

  return group;
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

export function makeFocus() {
  const g = powerupShell(0xfbbf24, 0xf59e0b);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xfde68a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
  });
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.12), mat);
  upper.position.set(0.07, 0.5, 0);
  upper.rotation.z = 0.48;
  g.add(upper);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.12), mat);
  lower.position.set(-0.07, 0.18, 0);
  lower.rotation.z = -0.52;
  g.add(lower);
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

/**
 * The crow egg: the one pickup you are meant to leave alone.
 *
 * Built on the same halo shell as the power-ups so it is unmistakably a thing
 * you can take, then coloured against every one of them — they are all bright
 * and saturated, this is soot with a warning ring — because a trap that is not
 * legible at draw distance is not a trap, it is a coin flip. The bird it
 * hatches lives in crow.js; this is only the shell on the track.
 */
export function makeCrowEgg() {
  const g = powerupShell(0xff5a3c, 0xb91c1c);
  const egg = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0x2b3340, emissive: 0x141821, emissiveIntensity: 0.5 }),
  );
  // Squashed at the equator and drawn out at the top: a sphere reads as a ball
  // and a ball reads as a coin.
  egg.scale.set(1, 1.34, 1);
  egg.position.y = 0.22;
  g.add(egg);

  // Speckles, which is what makes it an egg rather than a dark pebble.
  for (const [x, y, z] of [
    [0.1, 0.3, 0.16],
    [-0.13, 0.2, 0.1],
    [0.04, 0.12, -0.19],
    [-0.06, 0.36, -0.1],
  ]) {
    const fleck = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshLambertMaterial({ color: 0x0d1016 }),
    );
    fleck.position.set(x, y, z);
    g.add(fleck);
  }

  // A single black feather stuck through the ring: the only cue on the track
  // that says which bird this belongs to.
  const feather = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.3, 0.11),
    new THREE.MeshLambertMaterial({ color: 0x0b0e13 }),
  );
  feather.position.set(0.2, 0.42, -0.06);
  feather.rotation.z = 0.55;
  g.add(feather);

  return g;
}

/**
 * The diamond: the one pickup that pays nothing by itself.
 *
 * Three of them stop the run and spin the wheel, so a single diamond is a
 * promise rather than a reward — which is exactly the shape it has to read as
 * on the track. Everything else out there is either obviously good (a bright
 * gem in a coloured ring) or obviously bad (soot and a warning stripe), and a
 * player decides in about a fifth of a second at fifty metres per second.
 *
 * The first version was a pale gem on the shared power-up halo, and at speed it
 * was the super sneakers: same single flat ring, same near-white body, same
 * cyan-ish cast. Two pickups that need different decisions cannot look like
 * each other from forty metres.
 *
 * So it shares nothing with them now. Three things do the work, in the order
 * the eye gets them:
 *
 *   Size — half again as large as anything else on the track.
 *   Light — MeshBasicMaterial, which ignores the lights entirely and so stays
 *     at full brightness through a tunnel, through dusk, and through the
 *     crow's gloom. Every power-up is Lambert and dims with the world; this one
 *     does not, which is a difference you read before you read a shape.
 *   Silhouette — two rings crossed at right angles instead of one flat halo.
 *     The power-ups all wear the same disc seen edge-on; a cage is a different
 *     outline at any distance and from any angle.
 */
export function makeDiamond() {
  const g = new THREE.Group();

  // Lit, but with an emissive floor so high it barely matters — bright through
  // a tunnel and through the crow's gloom, and still shaded enough that the
  // eight facets read as facets. Fully unlit was brighter and turned the stone
  // into a flat white triangle: every face the same value, no form at all.
  const facets = new THREE.MeshLambertMaterial({
    color: 0xf2fbff,
    emissive: 0x9fdcff,
    emissiveIntensity: 0.95,
  });
  // A brilliant cut is a shallow crown over a deep pavilion. The asymmetry is
  // what stops this reading as the magnet's octahedron at a different size.
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.3, 8), facets);
  crown.position.y = 0.52;
  g.add(crown);

  const pavilion = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.62, 8), facets);
  pavilion.rotation.x = Math.PI;
  pavilion.position.y = 0.06;
  g.add(pavilion);

  // The girdle, a shade cooler so the two halves separate rather than reading
  // as one white lump.
  const girdle = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.05, 6, 18),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc }),
  );
  girdle.rotation.x = Math.PI / 2;
  girdle.position.y = 0.37;
  g.add(girdle);

  // The cage: two rings at right angles. This is the silhouette, and it is the
  // part that is not a power-up.
  for (const [rx, rz] of [
    [Math.PI / 2, 0],
    [0, 0],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.045, 6, 26),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
    );
    ring.rotation.set(rx, 0, rz);
    ring.position.y = 0.37;
    g.add(ring);
  }

  // Four sparks on the ring's axis. Small, unlit, and the thing that catches
  // the eye first while the whole group is turning.
  for (const [x, y, z] of [
    [0, 1.16, 0],
    [0, -0.42, 0],
    [0.9, 0.37, 0],
    [-0.9, 0.37, 0],
  ]) {
    const spark = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.11, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    spark.position.set(x, y, z);
    spark.rotation.set(0.6, 0.6, 0);
    g.add(spark);
  }

  return g;
}

/**
 * The Christmas gift, standing in for the diamond.
 *
 * Same job and the same tricks: half again as large as anything else out there,
 * and an emissive floor so it stays bright through a tunnel and the crow's gloom.
 */
export function makeGift() {
  const g = new THREE.Group();
  const paper = new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0xb71c1c, emissiveIntensity: 0.7 });
  const ribbon = new THREE.MeshLambertMaterial({ color: 0xffe082, emissive: 0xffb300, emissiveIntensity: 0.75 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 0.92), paper);
  body.position.y = 0.16;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.2, 1.02), paper);
  lid.position.y = 0.6;
  g.add(lid);

  // Two bands crossed over the box. Slightly proud of it, so they do not fight
  // the paper for the same depth.
  for (const [w, d] of [
    [1.05, 0.2],
    [0.2, 1.05],
  ]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.96, d), ribbon);
    band.position.y = 0.26;
    g.add(band);
  }

  // The bow: two loops and a knot. This is the silhouette at a distance.
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 6, 14), ribbon);
    loop.position.set(side * 0.2, 0.86, 0);
    loop.rotation.z = side * 0.45;
    g.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), ribbon);
  knot.position.y = 0.8;
  g.add(knot);

  return g;
}

/**
 * How long a vehicle's mesh is drawn, against the length its SPEC claims.
 *
 * The two builders lay their parts out around a body modelled at the lengths
 * these vehicles used to be, and the roof window the game is balanced on is a
 * fraction of the SPEC figure — so the moment they disagree, the bus a player
 * is standing on is not the bus they can see.
 *
 * Applied in `spawn` rather than in the factory, which is where the first
 * attempt put it and where it silently did nothing: the pool hands the same
 * mesh back out, and `spawn` resets the scale on every reuse. So the first bus
 * of a run was the right length and every bus after it was a fourteen-metre
 * collision box drawn nine metres long — an invisible wall in front of a
 * vehicle that looked clear.
 *
 * Every part of both builders is a box laid out along Z, so nothing here is a
 * circle being turned into an ellipse.
 */
const MODELLED_LENGTH = { train: 12, bus: 9.2 };

/** The Z scale a freshly spawned mesh of this type rests at. */
export function restingScaleZ(type) {
  const modelled = MODELLED_LENGTH[type];
  return modelled ? SPEC[type].length / modelled : 1;
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
  focus: makeFocus,
  sneakers: makeSneakers,
  crowEgg: makeCrowEgg,
  diamond: makeDiamond,
  gift: makeGift,
  chuseokMoon: makeChuseokMoon,
};

const bulbColours = [0xff4d4d, 0xffd54f, 0x4ade80, 0x60a5fa];
const festiveMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true });
let festiveLook = null;

/** Parts shared by every Christmas obstacle ever pooled. */
function festive() {
  if (festiveLook) return festiveLook;
  // Stripes are a canvas, so unit tests get the same shapes in plain white.
  const candy = (repeatX, repeatY) => {
    if (typeof document === "undefined") return lambert(0xffffff);
    const map = makeCandyStripes();
    map.repeat.set(repeatX, repeatY);
    return lambert(0xffffff, { map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.4 });
  };
  festiveLook = {
    material: festiveMaterial(),
    // Lit from inside, so a vehicle is the easiest thing to read on a dark road.
    windows: lambert(0xffe7ad, { emissive: 0xffb74d, emissiveIntensity: 0.85 }),
    candy: candy(3, 1),
    candyPole: candy(0.5, 3.4),
  };
  return festiveLook;
}

/** A wreath with a bow, as parts to merge. Faces along Z. */
function wreathParts(x, y, z, radius = 0.3) {
  return [
    tinted(new THREE.TorusGeometry(radius, radius * 0.32, 6, 14), 0x166534, x, y, z),
    tinted(new THREE.BoxGeometry(radius * 0.7, radius * 0.42, 0.05), 0xdc2626, x, y - radius, z),
  ];
}

/** Snow along a roof and a string of lights under each eave, as parts to merge. */
function roofParts({ width, length, roofTop, eave, bulbs }) {
  const parts = [tinted(new THREE.BoxGeometry(width, 0.06, length), 0xeef4fb, 0, roofTop + 0.03, 0)];
  for (const side of [-1, 1]) {
    for (let i = 0; i < bulbs; i++) {
      const z = -length / 2 + ((i + 0.5) / bulbs) * length;
      parts.push(tinted(new THREE.SphereGeometry(0.075, 6, 5), bulbColours[i % 4], side * (width / 2 + 0.13), eave, z));
    }
  }
  return parts;
}

const TRAIN_TRIM = () =>
  mergeGeometries([
    ...roofParts({ width: 1.66, length: 11.1, roofTop: 2.46, eave: 2.2, bulbs: 22 }),
    ...wreathParts(0, 1.72, -5.93),
    ...wreathParts(0, 1.72, 5.98),
  ]);
const BUS_TRIM = () =>
  mergeGeometries([
    ...roofParts({ width: 1.5, length: 8.2, roofTop: BUS_ROOF + 0.06, eave: BUS_ROOF - 0.14, bulbs: 16 }),
    ...wreathParts(0, 1.5, -4.55),
    ...wreathParts(0, 1.5, 4.55),
  ]);
let trainTrim = null;
let busTrim = null;

const CHRISTMAS_TRAINS = [0xb91c1c, 0x166534, 0xe8e4d8, 0x7f1d1d];
const CHRISTMAS_BUSES = [0xdc2626, 0x15803d, 0xf1ece0, 0xb91c1c];

function makeChristmasTrain() {
  const look = festive();
  const colour = CHRISTMAS_TRAINS[(Math.random() * CHRISTMAS_TRAINS.length) | 0];
  const g = makeTrain(colour, look.windows);
  trainTrim ??= TRAIN_TRIM();
  g.add(new THREE.Mesh(trainTrim, look.material));
  return g;
}

function makeChristmasBus() {
  const look = festive();
  const colour = CHRISTMAS_BUSES[(Math.random() * CHRISTMAS_BUSES.length) | 0];
  const g = makeBus(colour, look.windows);
  busTrim ??= BUS_TRIM();
  g.add(new THREE.Mesh(busTrim, look.material));
  return g;
}

/** The barricade as one long candy cane, hooked at both ends. Same height. */
function makeCandyBarrier() {
  const look = festive();
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.82, 0.38), look.candy);
  bar.position.y = 0.5;
  g.add(bar);
  for (const side of [-1, 1]) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 12, Math.PI), look.candyPole);
    hook.position.set(side * 0.82, 0.93, 0);
    g.add(hook);
  }
  return g;
}

let gateTrim = null;

/**
 * The gate keeps its yellow board, which is the one thing it must never lose:
 * that is what says "slide". Candy-cane posts, snow and a wreath go around it.
 */
function makeChristmasGate() {
  const look = festive();
  const g = makeSign();
  for (const x of [-0.94, 0.94]) {
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.2, SIGN_TOP, 0.22), look.candyPole);
    wrap.position.set(x, SIGN_TOP / 2, 0);
    g.add(wrap);
  }
  if (!gateTrim) {
    const bulbs = [];
    for (let i = 0; i < 9; i++) {
      for (const z of [-0.16, 0.16]) {
        bulbs.push(
          tinted(new THREE.SphereGeometry(0.06, 6, 5), bulbColours[i % 4], -0.8 + i * 0.2, SIGN_BOARD_TOP + 0.08, z),
        );
      }
    }
    gateTrim = mergeGeometries([
      tinted(new THREE.BoxGeometry(2.2, 0.14, 0.34), 0xeef4fb, 0, SIGN_TOP + 0.05, 0),
      ...wreathParts(0, SIGN_BOARD_TOP + 1.1, -0.14, 0.42),
      ...wreathParts(0, SIGN_BOARD_TOP + 1.1, 0.14, 0.42),
      ...bulbs,
    ]);
  }
  g.add(new THREE.Mesh(gateTrim, look.material));
  return g;
}

let cookieHouse = null;
let cookieMan = null;
const cookieMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a1f0a, emissiveIntensity: 0.7 });
let cookieLit = null;

/** The container's footprint and height, in gingerbread. One mesh, shared. */
function gingerbreadHouse() {
  if (cookieHouse) return cookieHouse;
  const dough = 0xb06a32;
  const icing = 0xfff7ed;
  const parts = [
    tinted(new THREE.BoxGeometry(1.4, 0.78, 1.3), dough, 0, 0.39, 0),
    // The roof: two iced slopes meeting on a ridge along Z.
    ...[-1, 1].flatMap((side) => {
      const slope = new THREE.BoxGeometry(0.84, 0.09, 1.44);
      slope.rotateZ(side * -0.62);
      const frosting = new THREE.BoxGeometry(0.88, 0.04, 1.48);
      frosting.translate(0, 0.06, 0);
      frosting.rotateZ(side * -0.62);
      return [tinted(slope, 0x7c4420, side * 0.35, 0.99, 0), tinted(frosting, icing, side * 0.35, 0.99, 0)];
    }),
  ];
  // The door and windows on both ends, because it can be met from either side.
  for (const face of [-1, 1]) {
    const z = face * 0.66;
    parts.push(
      tinted(new THREE.BoxGeometry(0.34, 0.5, 0.03), 0xdc2626, 0, 0.25, z),
      tinted(new THREE.SphereGeometry(0.03, 5, 4), 0xfacc15, 0.1, 0.27, z + face * 0.02),
      tinted(new THREE.BoxGeometry(1.4, 0.05, 0.03), icing, 0, 0.76, z),
    );
    for (const x of [-0.46, 0.46]) {
      parts.push(
        tinted(new THREE.BoxGeometry(0.28, 0.26, 0.03), 0xfde047, x, 0.44, z),
        tinted(new THREE.BoxGeometry(0.03, 0.26, 0.04), icing, x, 0.44, z),
        tinted(new THREE.BoxGeometry(0.28, 0.03, 0.04), icing, x, 0.44, z),
      );
    }
  }
  // Gumdrops along the ridge and the eaves.
  [0xef4444, 0x22c55e, 0xfacc15, 0x3b82f6, 0xec4899].forEach((colour, i) => {
    const z = -0.56 + i * 0.28;
    parts.push(tinted(new THREE.SphereGeometry(0.075, 6, 5), colour, 0, 1.24, z));
    for (const side of [-1, 1]) {
      parts.push(tinted(new THREE.SphereGeometry(0.05, 5, 4), colour, side * 0.66, 0.84, z));
    }
  });
  cookieHouse = mergeGeometries(parts);
  return cookieHouse;
}

/**
 * A gingerbread man on a slab of chocolate. The slab fills the container's
 * footprint, so the thing still looks as deep as what it is to run into.
 */
function gingerbreadMan() {
  if (cookieMan) return cookieMan;
  const dough = 0xb06a32;
  const icing = 0xfff7ed;
  const parts = [
    tinted(new THREE.BoxGeometry(1.45, 0.34, 1.35), 0x4a2511, 0, 0.17, 0),
    tinted(new THREE.BoxGeometry(1.47, 0.05, 1.37), icing, 0, 0.34, 0),
    tinted(new THREE.SphereGeometry(0.2, 10, 8), dough, 0, 1.07, 0),
    tinted(new THREE.BoxGeometry(0.34, 0.42, 0.14), dough, 0, 0.72, 0),
    tinted(new THREE.BoxGeometry(0.98, 0.14, 0.14), dough, 0, 0.84, 0),
    tinted(new THREE.BoxGeometry(0.14, 0.26, 0.14), dough, -0.11, 0.48, 0),
    tinted(new THREE.BoxGeometry(0.14, 0.26, 0.14), dough, 0.11, 0.48, 0),
  ];
  for (const face of [-1, 1]) {
    const z = face * 0.08;
    parts.push(
      tinted(new THREE.SphereGeometry(0.035, 5, 4), 0xef4444, 0, 0.8, z),
      tinted(new THREE.SphereGeometry(0.035, 5, 4), 0x22c55e, 0, 0.66, z),
      tinted(new THREE.BoxGeometry(0.04, 0.14, 0.02), icing, -0.42, 0.84, z),
      tinted(new THREE.BoxGeometry(0.04, 0.14, 0.02), icing, 0.42, 0.84, z),
      tinted(new THREE.BoxGeometry(0.16, 0.025, 0.02), icing, 0, 1.0, face * 0.19),
    );
  }
  cookieMan = mergeGeometries(parts);
  return cookieMan;
}

/** The jump-over obstacle. Two houses for every cookie man. */
function makeGingerbreadCrate() {
  cookieLit ??= cookieMaterial();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(Math.random() < 0.65 ? gingerbreadHouse() : gingerbreadMan(), cookieLit));
  return g;
}

/**
 * Same entity and same rules, drawn differently while the event is on. Nothing
 * here touches SPEC, so nothing about a hitbox can change with the costume.
 */
const CHRISTMAS_FACTORIES = {
  coin: makeNoseCoin,
  crowEgg: makeSnowball,
  train: makeChristmasTrain,
  bus: makeChristmasBus,
  barrier: makeCandyBarrier,
  sign: makeChristmasGate,
  crate: makeGingerbreadCrate,
};

export { SPEC };

export class EntityPool {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.free = {};
    this.christmas = false;
    for (const type of Object.keys(FACTORIES)) this.free[type] = [];
  }

  /** Change look between runs. Parked meshes in the old look must not come back. */
  setChristmas(on) {
    if (this.christmas === on) return;
    this.clear();
    for (const type of Object.keys(CHRISTMAS_FACTORIES)) {
      for (const mesh of this.free[type]) this.scene.remove(mesh);
      this.free[type] = [];
    }
    this.christmas = on;
  }

  spawn(type, lane, z, y = 0.55) {
    const spec = SPEC[type];
    const pile = this.free[type];
    let mesh = pile.pop();
    if (!mesh) {
      mesh = ((this.christmas && CHRISTMAS_FACTORIES[type]) || FACTORIES[type])();
      // Only solid obstacles cast; coins and pickups would just add noise.
      if (spec.lethal) {
        mesh.traverse((child) => {
          if (child.isMesh) child.castShadow = true;
        });
      }
      this.scene.add(mesh);
    }
    mesh.visible = true;
    // Reset, because the pool hands the same mesh back. The diamond is drawn
    // with a pulsing scale, and one returned to the pool mid-pulse would come
    // back out at whatever size it happened to be parked at.
    //
    // To the type's own resting size, not to one. A vehicle is drawn shorter
    // than its collision box and stretched to match; setting every axis to one
    // here was undoing that on every reuse, which left the first bus of a run
    // correct and every one after it a wall you could not see.
    mesh.scale.set(1, 1, restingScaleZ(type));
    const x = laneX(lane);
    // Pickups float at the requested height; obstacles always sit on the deck.
    const lift = spec.lethal ? 0 : y;
    mesh.position.set(x, lift, z);
    const item = {
      type,
      lane,
      z,
      powerup: spec.powerup ?? null,
      /** Non-null on a pickup that hurts to take. See crow.js. */
      hazard: spec.hazard ?? null,
      /** Non-null on a pickup that is collected toward something. See slots.js. */
      token: spec.token ?? null,
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
