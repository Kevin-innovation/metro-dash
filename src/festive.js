import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { approach } from "./collision.js";
import { JOURNEY, NORTH_POLE_COINS, NORTH_POLE_METRES, cityLight, journeyStage } from "./christmas.js";
import { tinted } from "./textures.js";
import { shaded } from "./trackevents.js";

const reducedMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
const selfLit = () => new THREE.MeshBasicMaterial({ vertexColors: true });
const merged = (parts) => new THREE.Mesh(shaded(mergeGeometries(parts)), selfLit());

/** Eased, so the city comes up and goes down rather than switching. */
const LIGHT_EASE = 3.2;
const SKY_EASE = 0.35;

const TRAIL_ROWS = 26;
const TRAIL_STEP = 0.5;
const TRAIL_GAUGE = 0.27;
const TRAIL_WIDTH = 0.1;
const TRAIL_HEIGHT = 0.13;

/** Both built longer than the shell by a tile, so sliding back one tile has no seam. */
const CAVE_TILE = 18;
const MARKET_TILE = 30;
const MARKET_FLOOR = 1.9;
const SHELL_LENGTH = 420;

const CAVE_LOOK = { wall: 0x2a6a94, roof: 0x8cc4e4, lamp: 0x8fe3ff };
const MARKET_LOOK = { wall: 0x5a3626, roof: 0x3a241b, lamp: 0xffd98a };

const ARRIVAL_TEXT = { forest: "🌲 눈 덮인 숲에 들어섰어요", arctic: "🧊 북극 들판이에요! 조금만 더!" };

/** Unit tall from the ground up, and stretched to whatever building it stands in for. */
function pineGeometry() {
  const parts = [tinted(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 6), 0x3b2a1e, 0, 0.1, 0)];
  [
    [0.5, 0.42, 0.34, 0x123a2a],
    [0.4, 0.36, 0.58, 0x17492f],
    [0.28, 0.3, 0.8, 0x1d5738],
  ].forEach(([radius, height, y, colour]) => {
    parts.push(tinted(new THREE.ConeGeometry(radius, height, 8), colour, 0, y, 0));
    parts.push(tinted(new THREE.ConeGeometry(radius * 0.58, height * 0.5, 8), 0xf2f8ff, 0, y + height * 0.25, 0));
  });
  return shaded(mergeGeometries(parts));
}

/** A jagged ice mountain, same deal. */
function bergGeometry() {
  const parts = [
    tinted(new THREE.ConeGeometry(0.62, 1, 6), 0xbfe6f7, 0, 0.5, 0),
    tinted(new THREE.ConeGeometry(0.34, 0.7, 5), 0xe8f7ff, 0.34, 0.35, 0.12),
    tinted(new THREE.ConeGeometry(0.28, 0.5, 5), 0x9fd5ee, -0.36, 0.25, -0.1),
    tinted(new THREE.ConeGeometry(0.26, 0.24, 6), 0xffffff, 0, 0.88, 0),
  ];
  return shaded(mergeGeometries(parts));
}

/** Icicles, long by the walls and short over the lanes so none reads as an obstacle. */
function makeIceCave() {
  const parts = [];
  for (let z = -SHELL_LENGTH / 2 - CAVE_TILE; z < SHELL_LENGTH / 2 + CAVE_TILE; z += CAVE_TILE) {
    for (let i = 0; i < 9; i++) {
      const x = -6.4 + i * 1.6;
      const lane = Math.abs(x) < 4;
      const length = lane ? 0.22 + ((i * 7) % 3) * 0.05 : 0.7 + ((i * 5) % 3) * 0.3;
      const cone = new THREE.ConeGeometry(0.13 + length * 0.07, length, 5).rotateX(Math.PI);
      parts.push(tinted(cone, i % 2 ? 0xd8f3ff : 0xa7dcf5, x, -length / 2, z + (i * 5) % CAVE_TILE));
    }
    for (const side of [-1, 1]) {
      const crystal = new THREE.ConeGeometry(0.42, 1.8, 5);
      parts.push(tinted(crystal, 0x7cc8ee, side * 6.5, -3.5, z + 5));
    }
  }
  return merged(parts);
}

/** Stalls along both walls, and strings of bulbs across the roof. */
function makeMarket() {
  const parts = [];
  const canopies = [
    [0xc62828, 0xfff3e0],
    [0x1f7a3f, 0xfff3e0],
  ];
  let stall = 0;
  for (let z = -SHELL_LENGTH / 2 - MARKET_TILE; z < SHELL_LENGTH / 2 + MARKET_TILE; z += MARKET_TILE) {
    for (const side of [-1, 1]) {
      const [stripe, plain] = canopies[stall++ % 2];
      const x = side * 6.2;
      // Up on the concourse behind the trackside wall, or only the awning shows.
      parts.push(tinted(new THREE.BoxGeometry(1.5, 1.1, 5), 0x8a5a33, x, MARKET_FLOOR + 0.55, z));
      parts.push(tinted(new THREE.BoxGeometry(1.6, 0.12, 5.2), 0xe8cfa3, x, MARKET_FLOOR + 1.16, z));
      parts.push(tinted(new THREE.BoxGeometry(0.1, 2.2, 0.1), 0x3a2416, x - side * 0.7, MARKET_FLOOR + 2.2, z - 2.4));
      parts.push(tinted(new THREE.BoxGeometry(0.1, 2.2, 0.1), 0x3a2416, x - side * 0.7, MARKET_FLOOR + 2.2, z + 2.4));
      for (let i = 0; i < 5; i++) {
        const stripeBox = new THREE.BoxGeometry(2, 0.1, 1).rotateZ(side * 0.32);
        parts.push(tinted(stripeBox, i % 2 ? stripe : plain, x, MARKET_FLOOR + 3.3, z - 2 + i));
      }
      // Goods on the counter, and a lit stack of gifts.
      for (let i = 0; i < 4; i++) {
        const colour = [0xffd54f, 0xef4444, 0x38bdf8, 0x4ade80][i];
        parts.push(tinted(new THREE.BoxGeometry(0.42, 0.42, 0.42), colour, x, MARKET_FLOOR + 1.44, z - 1.5 + i));
      }
    }
    // A string of bulbs over the road, sagging in the middle.
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 - 0.5;
      const colour = [0xff5252, 0xffd54f, 0x4fc3f7, 0x7fe08a][i % 4];
      parts.push(tinted(new THREE.IcosahedronGeometry(0.11), colour, t * 13, 7.6 + t * t * 3.2, z + 12));
    }
  }
  return new THREE.Mesh(mergeGeometries(parts), selfLit());
}

function makeSign() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  g.add(
    merged([
      tinted(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 8), 0xf1f5f9, 0, 1.8, 0),
      tinted(new THREE.CylinderGeometry(0.105, 0.105, 0.5, 8), 0xdc2626, 0, 0.9, 0),
      tinted(new THREE.CylinderGeometry(0.105, 0.105, 0.5, 8), 0xdc2626, 0, 2.2, 0),
      tinted(new THREE.SphereGeometry(0.2, 8, 6), 0xffd54f, 0, 3.7, 0),
    ]),
  );
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map }));
  // Faces back along the track, towards the runner coming at it.
  board.rotation.y = Math.PI;
  board.position.y = 3;
  g.add(board);
  g.scale.setScalar(1.5);
  g.visible = false;
  g.userData.canvas = canvas;
  g.userData.map = map;
  return g;
}

function paintSign(sign, remaining) {
  const ctx = sign.userData.canvas.getContext("2d");
  ctx.fillStyle = "#14532d";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#ffd54f";
  ctx.lineWidth = 7;
  ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = '700 30px "Jua", sans-serif';
  ctx.fillText(remaining > 0 ? "북극까지" : "여기는", 128, 50);
  ctx.fillStyle = "#ffd54f";
  ctx.font = '700 44px "Jua", sans-serif';
  ctx.fillText(remaining > 0 ? `${remaining.toLocaleString()}m` : "북극!", 128, 100);
  sign.userData.map.needsUpdate = true;
}

/** Under whoever has no sled of their own, while the jetpack is running. */
function makeFlyingSleigh() {
  const mesh = merged([
    tinted(new THREE.BoxGeometry(0.8, 0.34, 1.5), 0xb91c1c, 0, 0.3, 0),
    tinted(new THREE.BoxGeometry(0.84, 0.1, 1.54), 0xffd54f, 0, 0.5, 0),
    tinted(new THREE.BoxGeometry(0.8, 0.5, 0.14), 0x991b1b, 0, 0.6, -0.72),
    tinted(new THREE.BoxGeometry(0.08, 0.08, 1.8), 0xffd54f, -0.34, 0.06, 0.1),
    tinted(new THREE.BoxGeometry(0.08, 0.08, 1.8), 0xffd54f, 0.34, 0.06, 0.1),
    tinted(new THREE.BoxGeometry(0.08, 0.24, 0.08), 0xffd54f, -0.34, 0.15, 0.5),
    tinted(new THREE.BoxGeometry(0.08, 0.24, 0.08), 0xffd54f, 0.34, 0.15, 0.5),
  ]);
  mesh.visible = false;
  return mesh;
}

function makeTrail() {
  const vertices = TRAIL_ROWS * 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  const colours = new Float32Array(vertices * 3);
  for (let row = 0; row < TRAIL_ROWS; row++) {
    // Multiplied into the snow: darkest at the runner, and gone by the far end.
    const shade = 1 - (1 - row / TRAIL_ROWS) * 0.62;
    for (let v = 0; v < 4; v++) colours.fill(shade, (row * 4 + v) * 3, (row * 4 + v) * 3 + 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
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
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
}

/**
 * Everything that makes the ordinary run feel like Christmas, as opposed to the
 * events in trackevents.js that interrupt it. Built whole when the event first
 * switches on, and only ever shown or hidden during a run, so none of it can cost
 * a frame at the moment it appears.
 */
export class FestiveStage {
  constructor(game) {
    this.game = game;
    this.built = false;
    this.on = false;
    this.reset();
  }

  reset() {
    this.light = 0.3;
    this.stageIndex = 0;
    this.arrived = false;
    this.nextMark = 0;
    this.shellZone = null;
    this.trailX = new Array(TRAIL_ROWS).fill(0);
    this.trailGround = new Array(TRAIL_ROWS).fill(false);
    this.trailRow = null;
    const world = this.game.world;
    if (!this.built) return;
    world.journey = { index: 0, k: 0 };
    this.parts.sign.visible = false;
    this.parts.trail.visible = false;
    this.game.trackEvents.skyAurora = false;
    for (const building of world.buildings) this.dressBuilding(building, 0);
  }

  /** @returns {THREE.Object3D[]} what has to be uploaded before the first run */
  build() {
    if (this.built) return [];
    const { scene, world } = this.game;
    this.built = true;
    const pine = pineGeometry();
    const berg = bergGeometry();
    const scenery = selfLit();
    this.scenery = { forest: pine, arctic: berg };
    for (const building of world.buildings) {
      const alt = new THREE.Mesh(pine, scenery);
      alt.position.x = building.mesh.position.x;
      alt.visible = false;
      scene.add(alt);
      building.alt = alt;
      building.width = building.mesh.geometry.parameters.width;
    }
    world.onBuildingWrap = (building) => this.dressBuilding(building, this.stageIndex);

    const ice = makeIceCave();
    const market = makeMarket();
    world.shell.add(ice, market);
    ice.visible = false;
    market.visible = false;
    this.parts = { ice, market, sign: makeSign(), sleigh: makeFlyingSleigh(), trail: makeTrail() };
    scene.add(this.parts.sign, this.parts.trail);
    this.game.player.root.add(this.parts.sleigh);
    this.shellPlain = {
      wall: world.walls[0].material.color.getHex(),
      roof: world.roof.material.color.getHex(),
      lamp: world.lamps[0].material.color.getHex(),
    };
    const board = this.game.player.board.children;
    this.boardPlain = { deck: board[0].material.color.getHex(), glow: board[1].material.color.getHex() };

    // The shapes the buildings can turn into, to go up to the GPU with the rest.
    const forest = new THREE.Mesh(pine, scenery);
    const arctic = new THREE.Mesh(berg, scenery);
    forest.visible = arctic.visible = false;
    scene.add(forest, arctic);
    world.journey = { index: 0, k: 0 };
    return [forest, arctic, world.shell, world.mouth, this.parts.sign, this.parts.sleigh, this.parts.trail];
  }

  /** Switch the look of what is shared with the ordinary game. */
  setChristmas(on) {
    this.on = on;
    if (!this.built) return;
    const { world, player } = this.game;
    const [deck, glow] = player.board.children;
    deck.material.color.setHex(on ? 0x38bdf8 : this.boardPlain.deck);
    glow.material.color.setHex(on ? 0xffffff : this.boardPlain.glow);
    deck.scale.set(on ? 1.15 : 1, 1, on ? 1.45 : 1);
    if (!on) {
      world.walls[0].material.color.setHex(this.shellPlain.wall);
      world.roof.material.color.setHex(this.shellPlain.roof);
      world.lamps[0].material.color.setHex(this.shellPlain.lamp);
      world.materials.wall.emissiveIntensity = 1;
      world.treeGlow = 1;
      this.parts.ice.visible = false;
      this.parts.market.visible = false;
      this.parts.sleigh.visible = false;
      this.parts.trail.visible = false;
      this.parts.sign.visible = false;
      for (const building of world.buildings) this.dressBuilding(building, 0);
    }
    this.shellZone = null;
  }

  /** Done only as a building goes round behind the camera, so nothing pops. */
  dressBuilding(building, index) {
    const id = JOURNEY[index].id;
    const city = id === "city";
    building.mesh.visible = city;
    if (building.rooftop) {
      building.rooftop.visible = city && this.on && this.game.world.quality.decorationCount > 5;
    }
    building.alt.visible = !city;
    if (city) return;
    building.alt.geometry = this.scenery[id];
    if (id === "forest") {
      building.alt.scale.set(building.width * 1.4, 16 + building.h * 0.9, building.width * 1.4);
    } else {
      building.alt.scale.set(building.width * 2.2, 6 + building.h * 0.7, building.depth);
    }
  }

  /** One step of play. */
  advance() {
    const g = this.game;
    const distance = g.run.distance;

    const index = journeyStage(distance);
    if (index !== this.stageIndex) {
      this.stageIndex = index;
      g.world.journey = { index, k: g.world.journey?.k ?? 0, from: g.world.journey?.index ?? 0 };
      const id = JOURNEY[index].id;
      g.audio.mission();
      g.screens.showRaid(ARRIVAL_TEXT[id]);
      if (id === "arctic") g.trackEvents.skyAurora = true;
    }

    if (!this.arrived && distance >= NORTH_POLE_METRES) {
      this.arrived = true;
      const paid = g.run.addEventCoins(NORTH_POLE_COINS);
      g.audio.bells();
      g.screens.showRaid(`🎅 북극 도착! 코인 +${paid.toLocaleString()}`, true);
      if (paid > 0) g.screens.flashCoinGain(paid);
      if (!reducedMotion()) g.particles.rainbow(g.player.x, g.player.y + 2, g.player.z + 6);
    }

    if (distance >= this.nextMark) this.placeSign(distance);
  }

  /** The next thousand-metre post, painted once while it is still out of sight. */
  placeSign(distance) {
    const g = this.game;
    this.nextMark = (Math.floor(distance / 1000) + 1) * 1000;
    const { sign } = this.parts;
    if (this.nextMark > NORTH_POLE_METRES) {
      sign.visible = false;
      this.nextMark = Infinity;
      return;
    }
    paintSign(sign, NORTH_POLE_METRES - this.nextMark);
    sign.position.set((g.world.roadCentre ?? 0) + (g.world.roadHalf ?? 4.2) + 1.6, 0, g.player.z + this.nextMark - distance);
    sign.visible = true;
  }

  onLanding() {
    const p = this.game.player;
    this.game.particles.burst(p.x, 0.15, p.z, { count: 12, colour: 0xf4faff, speed: 4.2, life: 0.45, size: 0.3, gravity: -5 });
  }

  /** One rendered frame. */
  present(dt) {
    if (!this.built || !this.on) return;
    const g = this.game;
    // Back on the title the run is over: the city, not wherever it got to.
    if (g.state === "title" && this.stageIndex !== 0) this.reset();
    this.presentLight(dt);
    this.presentJourney(dt);
    this.presentShell();
    if (g.state !== "playing") return;
    this.presentSnow(dt);
    this.presentSleigh();
  }

  presentLight(dt) {
    const g = this.game;
    const world = g.world;
    const wanted = g.state === "playing" ? g.run.combo : 8;
    // One figure eased, then read three ways, so the three never drift apart.
    this.light += (wanted - this.light) * approach(LIGHT_EASE, dt);
    const { walls, towers, trees } = cityLight(this.light);
    world.materials.wall.emissiveIntensity = 0.2 + walls * 1.5;
    for (const material of world.snowy.towers) material.color.setScalar(0.42 + towers * 1.28);
    world.treeGlow = 0.35 + trees * 1.6;
    if (world.trees?.length && !world.twinkle) world.trees[0].bulbMaterial.color.setScalar(world.treeGlow * 0.8);
  }

  presentJourney(dt) {
    const { journey } = this.game.world;
    if (journey) journey.k = Math.min(1, journey.index === 0 ? 0 : journey.k + (1 - journey.k) * approach(SKY_EASE, dt));
  }

  /** The tunnel and the station get their own clothes, and drift past like the lamps. */
  presentShell() {
    const g = this.game;
    const { world } = g;
    const look = g.lookNow();
    if (look.ceiling === null) return;
    const id = look.id === "station" ? "station" : "tunnel";
    if (id !== this.shellZone) {
      this.shellZone = id;
      const skin = id === "station" ? MARKET_LOOK : CAVE_LOOK;
      world.walls[0].material.color.setHex(skin.wall);
      world.roof.material.color.setHex(skin.roof);
      world.lamps[0].material.color.setHex(skin.lamp);
      this.parts.ice.visible = id === "tunnel";
      this.parts.market.visible = id === "station";
      if (g.state === "playing") g.screens.showRaid(id === "station" ? "🎄 크리스마스 마켓" : "🧊 얼음 동굴");
    }
    const z = g.player.z;
    this.parts.ice.position.set(0, look.ceiling, -(z % CAVE_TILE));
    this.parts.market.position.z = -(z % MARKET_TILE);
  }

  presentSnow(dt) {
    const g = this.game;
    const p = g.player;
    const grounded = !p.flying && !p.mounted && p.y < 0.08;

    if (grounded && p.sliding && !reducedMotion() && Math.random() < g.quality.particleBudget * dt * 0.45) {
      g.particles.burst(p.x + (Math.random() - 0.5) * 0.7, 0.12, p.z - 0.3, { count: 2, colour: 0xf4faff, speed: 3.4, life: 0.32, size: 0.24, gravity: -5 });
    }

    const trail = this.parts.trail;
    trail.visible = true;
    const row = Math.floor(p.z / TRAIL_STEP);
    if (row !== this.trailRow) {
      const moved = this.trailRow === null ? TRAIL_ROWS : Math.min(TRAIL_ROWS, row - this.trailRow);
      this.trailRow = row;
      for (let i = 0; i < moved; i++) {
        this.trailX.pop();
        this.trailX.unshift(p.x);
        this.trailGround.pop();
        this.trailGround.unshift(grounded);
      }
      const position = trail.geometry.attributes.position;
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

  /** Its own sled goes under a costume that has one; everyone else gets this. */
  presentSleigh() {
    const g = this.game;
    const p = g.player;
    const flying = g.run.powerupActive("jetpack");
    this.parts.sleigh.visible = flying && !(p.costume?.on && p.costume.kind === "sled");
    p.jets.visible = false;
    if (flying && !reducedMotion() && Math.random() < g.quality.particleBudget / 200) {
      g.particles.trail(p.x, p.y + 0.2, p.z - 0.8, { count: 1, colour: 0xffe082, spread: 0.6, back: 0.8 });
    }
  }
}
