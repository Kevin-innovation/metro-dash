import * as THREE from "three";
import { BUILDING_COLORS, FOG_COLOR, MAX_SPEED, SEGMENT_COUNT, SEGMENT_LEN, START_SPEED } from "./config.js";
import { LANE_WIDTHS, laneSet, laneX } from "./lanes.js";
import { makeBallast, makeCloud, makeFacade, makeSky, makeWall, makeWood } from "./textures.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OPEN_CEILING, mixColor } from "./zones.js";
import { chuseokAt } from "./chuseok.js";

const BALLAST_REPEAT = [3, 8];
const WALL_REPEAT = [4, 1];

function hexOf(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Direction the key light comes from; the sun billboard is placed to match. */
const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();
const SUN_DISTANCE = 150;

const BUILDING_COUNT = 24;
const POLE_COUNT = 16;
const POLE_SPACING = 30;
const CHUSEOK_DECOR_COUNT = 16;
const CHUSEOK_DECOR_SPACING = 36;
const CHRISTMAS_TREE_COUNT = 16;
const CHRISTMAS_TREE_SPACING = 36;
const SNOW_GROUND = 0xdfe8f1;
/** Metres outside the road's edge. Clears the wall at every road width. */
const TREE_MARGIN = 3.4;

/**
 * Scenery is recycled a full cycle at a time so a piece only ever jumps while
 * it is behind the camera. Deriving its position from the current segment index
 * instead made every building hop forward together each time the index ticked,
 * which read as a stutter in the skyline.
 */
const BUILDING_CYCLE = (BUILDING_COUNT / 2) * SEGMENT_LEN;
const POLE_CYCLE = POLE_COUNT * POLE_SPACING;
const CHUSEOK_DECOR_CYCLE = CHUSEOK_DECOR_COUNT * CHUSEOK_DECOR_SPACING;
const CHRISTMAS_TREE_CYCLE = CHRISTMAS_TREE_COUNT * CHRISTMAS_TREE_SPACING;
/** How far behind the camera a piece must be before it may be moved. */
const RECYCLE_BEHIND = 48;

/** Long enough to reach past the fog in every quality tier. */
const TUNNEL_LEN = 420;
const TUNNEL_LAMPS = 28;
/** Chosen so the lamps tile the shell exactly and the cycle has no seam. */
const LAMP_SPACING = TUNNEL_LEN / TUNNEL_LAMPS;
/** Height of the opening in the tunnel mouth. Clears the jetpack's altitude. */
const MOUTH_TOP = 8.4;
/**
 * How long before a section starts that its mouth appears.
 *
 * Longer than the light fade, so the thing arrives before the world dims — the
 * point is that the darkness has a cause and the cause is visible first.
 */
const MOUTH_LEAD_SECONDS = 7;

/** How much of the shell sits behind the runner. */
const TUNNEL_BEHIND = 60;

/** Tall enough that the foot of the wall is always below the track. */
const WALL_HEIGHT = 18;

/** Thickness of the roof slab. The zone's ceiling is its *underside*. */
const ROOF_THICKNESS = 0.6;

function recycle(item, cycle, playerZ) {
  const floor = playerZ - RECYCLE_BEHIND;
  // Loops rather than a single add so a reset back to the start of the track
  // (returning to the title screen) re-seats everything in one pass.
  while (item.z < floor) item.z += cycle;
  while (item.z > floor + cycle) item.z -= cycle;
  return item.z;
}

/**
 * The widest the road can get, which is what the track is actually built for.
 *
 * Taken from the ladder rather than written as a number, so widening the ladder
 * cannot leave a lane with no rails under it.
 */
const WIDEST_ROAD = laneSet(Math.max(3, ...LANE_WIDTHS));

/** Metres of ballast either side of the outermost lane. */
const ROAD_MARGIN = 2;
/** Where the geometry was cut: three lanes, 8.4m of floor. */
const BASE_HALF_WIDTH = 4.2;

/**
 * Reshape the road for a set of lanes.
 *
 * Everything is driven off the eased half-width rather than off the lane list
 * directly, which is what lets a change be a change rather than a cut: the
 * floor, the kerbs and the walls slide outwards, and a lane becomes visible at
 * the moment the wall clears it. Toggling the rails on the score instead would
 * pop a whole lane of track into existence beside the runner while the wall was
 * still travelling out to meet it.
 *
 * @param {object} world
 * @param {number[]} lanes
 * @param {number} dt seconds, or 0 to snap (a new run, not a change)
 */
export function shapeRoad(world, lanes, dt = 0) {
  if (!world?.segments?.length || !lanes?.length) return;
  const lo = laneX(Math.min(...lanes));
  const hi = laneX(Math.max(...lanes));
  const wantCentre = (lo + hi) / 2;
  const wantHalf = (hi - lo) / 2 + ROAD_MARGIN;

  if (dt <= 0 || world.roadHalf == null) {
    world.roadCentre = wantCentre;
    world.roadHalf = wantHalf;
  } else {
    // Slow enough to read as the road opening, quick enough to be finished
    // before the layouts built for the new width arrive.
    const k = 1 - Math.exp(-2.4 * dt);
    world.roadCentre += (wantCentre - world.roadCentre) * k;
    world.roadHalf += (wantHalf - world.roadHalf) * k;
  }

  const centre = world.roadCentre;
  const half = world.roadHalf;
  for (const segment of world.segments) {
    segment.floor.position.x = centre;
    segment.floor.scale.x = half / BASE_HALF_WIDTH;
    for (const { mesh, side } of segment.kerbs) mesh.position.x = centre + side * (half + 0.3);
    for (const { mesh, side } of segment.walls) mesh.position.x = centre + side * (half + 1.3);
    for (const [lane, part] of segment.laneParts) {
      // Inside the kerb, with a lane's worth of ballast to spare, so a lane is
      // never half under the wall.
      part.visible = Math.abs(laneX(lane) - centre) <= half - 1;
    }
  }
}

export function createWorld(scene, quality) {
  scene.background = new THREE.Color(0x8fc6e6);
  // Opened at the run's top speed so the first frame is never short-sighted;
  // applyLook rewrites both ends every frame from the speed actually running.
  scene.fog = new THREE.Fog(
    FOG_COLOR,
    quality.fogSeconds[0] * MAX_SPEED,
    quality.fogSeconds[1] * MAX_SPEED,
  );

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x8f7d63, 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3dc, 1.35);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  sun.castShadow = quality.shadows;
  configureShadow(sun, quality);
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.38);
  scene.add(ambient);

  const skyTex = makeSky();
  skyTex.wrapS = THREE.ClampToEdgeWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  // Sun billboard sits in the light's own direction so highlights agree with it.
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(7, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }),
  );
  scene.add(sunBall);

  const clouds = makeClouds(scene);

  // The tunnel shell. Present from the start and simply hidden above ground:
  // building it on demand would stall the frame the tunnel mouth appears on.
  // It travels with the runner like the ground does, so it never runs out.
  const shell = new THREE.Group();
  const shellMat = new THREE.MeshLambertMaterial({ color: 0x39404a });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a525e, emissive: 0x1a1f26 });
  // Wide enough to fill the view. A narrow roof reads as a dark bar hanging in
  // front of the skyline rather than as a ceiling over the track.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(26, ROOF_THICKNESS, TUNNEL_LEN), roofMat);
  shell.add(roof);
  const walls = [-1, 1].map((side) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_HEIGHT, TUNNEL_LEN), shellMat);
    wall.position.set(side * 7.2, 3.4, 0);
    shell.add(wall);
    return wall;
  });
  // Strip lights along the wall, which is what actually sells an interior —
  // a plain dark box just reads as fog.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a4 });
  const lamps = [];
  for (let i = 0; i < TUNNEL_LAMPS; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.2), lampMat);
    lamp.position.set(i % 2 ? 6.7 : -6.7, 4.2, 0);
    lamp.userData.slot = i;
    shell.add(lamp);
    lamps.push(lamp);
  }
  shell.visible = false;
  scene.add(shell);

  // The tunnel mouth.
  //
  // A frame standing across the track, placed at the world position where the
  // section begins and then left alone: the runner closes on it at running
  // speed, which is what makes the tunnel something you arrive at rather than
  // something that switches on around you. Hidden until there is one to arrive
  // at.
  const mouth = new THREE.Group();
  const faceMat = new THREE.MeshLambertMaterial({ color: 0x2b3138 });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 1.4), faceMat);
  lintel.position.y = MOUTH_TOP + 3.5;
  mouth.add(lintel);
  [-1, 1].forEach((side) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(5.4, MOUTH_TOP + 7, 1.4), faceMat);
    pier.position.set(side * 9.4, (MOUTH_TOP + 7) / 2, 0);
    mouth.add(pier);
  });
  // A lit rim along the opening, so the mouth is legible against a bright sky
  // instead of reading as a dark smear on the horizon.
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffcf6a });
  const rim = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.42, 1.6), rimMat);
  rim.position.y = MOUTH_TOP;
  mouth.add(rim);
  [-1, 1].forEach((side) => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.42, MOUTH_TOP, 1.6), rimMat);
    edge.position.set(side * 6.6, MOUTH_TOP / 2, 0);
    mouth.add(edge);
  });
  mouth.visible = false;
  scene.add(mouth);

  const ballastTex = makeBallast();
  ballastTex.repeat.set(BALLAST_REPEAT[0], BALLAST_REPEAT[1]);
  const woodTex = makeWood();
  const wallTex = makeWall();
  wallTex.repeat.set(WALL_REPEAT[0], WALL_REPEAT[1]);

  const facades = BUILDING_COLORS.map((c, i) => {
    const t = makeFacade(i + 2, hexOf(c));
    t.repeat.set(1, 1);
    return t;
  });

  // Travels with the runner. It is a flat, untextured plane, so sliding it is
  // invisible — whereas leaving it at the origin meant the world simply ran out
  // of ground partway through a run and the skyline was left floating.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 620),
    new THREE.MeshLambertMaterial({ color: 0x63705a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = quality.shadows;
  scene.add(ground);

  const trackMat = new THREE.MeshLambertMaterial({ map: ballastTex });
  const woodMat = new THREE.MeshLambertMaterial({ map: woodTex });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xa8b4bd });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xf2d64b });
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });

  const segments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const g = new THREE.Group();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, SEGMENT_LEN), trackMat);
    floor.position.y = -0.08;
    floor.receiveShadow = quality.shadows;
    g.add(floor);

    // Track is laid for every lane the road can ever have, not for the three it
    // starts with, and the ones that are not in play are simply hidden. A lane
    // is a dozen meshes; building them when the road widened would mean
    // allocating geometry in the middle of a run, at the exact moment the frame
    // budget is already being spent on the change itself.
    const laneParts = new Map();
    WIDEST_ROAD.forEach((lane) => {
      const x = laneX(lane);
      const part = new THREE.Group();
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, SEGMENT_LEN), lineMat);
      line.position.set(x, 0.02, 0);
      part.add(line);
      [-0.38, 0.38].forEach((ox) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, SEGMENT_LEN), railMat);
        rail.position.set(x + ox, 0.05, 0);
        part.add(rail);
      });
      const ties = 10;
      for (let t = 0; t < ties; t++) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.28), woodMat);
        tie.position.set(x, 0.01, -SEGMENT_LEN / 2 + 1.4 + t * (SEGMENT_LEN / ties));
        tie.receiveShadow = quality.shadows;
        part.add(tie);
      }
      g.add(part);
      laneParts.set(lane, part);
    });

    const kerbs = [];
    const walls = [];
    [-1, 1].forEach((side) => {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, SEGMENT_LEN), kerbMat);
      kerb.position.set(side * 4.5, 0.05, 0);
      kerb.receiveShadow = quality.shadows;
      g.add(kerb);
      kerbs.push({ mesh: kerb, side });

      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, SEGMENT_LEN), wallMat);
      wall.position.set(side * 5.5, 1.2, 0);
      wall.receiveShadow = quality.shadows;
      g.add(wall);
      walls.push({ mesh: wall, side });
    });

    scene.add(g);
    segments.push({ group: g, index: i, floor, laneParts, kerbs, walls });
  }

  // Skyline: paired towers per slot, with height and depth variety so the
  // repeat is not readable while running.
  const buildings = [];
  for (let i = 0; i < BUILDING_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const slot = Math.floor(i / 2);
    const h = 9 + ((slot * 7) % 5) * 4.5 + ((i * 3) % 4) * 2;
    const w = 7 + ((i * 5) % 4) * 1.6;
    const depth = SEGMENT_LEN * (0.5 + ((i * 3) % 3) * 0.16);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      new THREE.MeshLambertMaterial({ map: facades[i % facades.length] }),
    );
    // Set well back from the track: the skyline frames the run, it does not
    // wall it in, and the lane ahead has to stay the brightest thing on screen.
    mesh.position.set(side * (14 + w * 0.5 + ((i * 7) % 3) * 2.6), h / 2 - 0.2, 0);
    mesh.castShadow = false;
    scene.add(mesh);
    // Each building owns a persistent Z and is recycled a whole cycle at a
    // time, rather than being re-derived from the current segment index.
    buildings.push({ mesh, side, h, depth, z: slot * SEGMENT_LEN + ((i * 11) % 5) * 4 });
  }

  const poles = [];
  for (let i = 0; i < POLE_COUNT; i++) {
    const pole = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 5.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x3f4a52 }),
    );
    post.position.y = 2.7;
    post.castShadow = quality.shadows;
    pole.add(post);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xfff59d, emissive: 0xffcc80, emissiveIntensity: 0.6 }),
    );
    lamp.position.set(0.35, 4.95, 0);
    pole.add(lamp);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x3f4a52 }),
    );
    arm.position.set(0.25, 5, 0);
    pole.add(arm);
    pole.position.x = (i % 2 === 0 ? -1 : 1) * 4.7;
    scene.add(pole);
    poles.push({ group: pole, z: i * POLE_SPACING });
  }

  // Lightweight roadside season dressing. It owns no lights and casts no
  // shadows. Basic materials keep the lanterns self-lit and avoid compiling
  // an extra shadow-receiving shader on lower-end mobile GPUs.
  const decorations = [];
  for (let i = 0; i < CHUSEOK_DECOR_COUNT; i++) {
    const group = new THREE.Group();
    const side = i % 2 === 0 ? -1 : 1;
    const postMat = new THREE.MeshBasicMaterial({ color: 0x4a3a31 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.8, 6), postMat);
    post.position.y = 1.9;
    group.add(post);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), postMat);
    cross.position.set(side * -0.35, 3.55, 0);
    group.add(cross);

    const warm = new THREE.MeshBasicMaterial({ color: 0xffd878 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2d73b9 });
    const red = new THREE.MeshBasicMaterial({ color: 0xd9504f });
    if (i % 3 === 0) {
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.58, 10), warm);
      lantern.position.set(side * -0.72, 3.12, 0);
      group.add(lantern);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.34), blue);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.34), red);
      top.position.set(side * -0.72, 3.28, 0);
      bottom.position.set(side * -0.72, 2.92, 0);
      group.add(top, bottom);
    }
    group.position.x = side * 8.6;
    group.visible = chuseokAt() && i < (quality.decorationCount ?? 0);
    scene.add(group);
    decorations.push({ group, z: i * CHUSEOK_DECOR_SPACING, index: i });
  }

  return {
    scene, sky, sunBall, sun, hemi, ambient, ground, clouds,
    shell, roof, walls, lamps, mouth,
    segments, buildings, poles, decorations, quality,
    materials: { track: trackMat, wood: woodMat, rail: railMat, line: lineMat, wall: wallMat, kerb: kerbMat },
    plain: { ballast: ballastTex, wood: woodTex, wall: wallTex, facades },
    christmas: false,
    trees: [],
  };
}

/** Vertex colours, so a whole tree can be one mesh and so one draw call. */
function tinted(geometry, hex, x = 0, y = 0, z = 0) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.translate(x, y, z);
  const colour = new THREE.Color(hex);
  const colours = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) colour.toArray(colours, i);
  flat.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return flat;
}

/**
 * The roadside trees.
 *
 * Self-lit, no shadows and two meshes each however many cones and bulbs are in
 * them. Built the first time the event is on, so a normal run allocates nothing.
 */
function makeChristmasTrees(scene) {
  const treeGeometry = mergeGeometries([
    tinted(new THREE.CylinderGeometry(0.16, 0.2, 0.8, 6), 0x5d4037, 0, 0.4, 0),
    tinted(new THREE.ConeGeometry(1.2, 1.5, 8), 0x1b5e20, 0, 1.45, 0),
    tinted(new THREE.ConeGeometry(0.95, 1.3, 8), 0x2e7d32, 0, 2.3, 0),
    tinted(new THREE.ConeGeometry(0.66, 1.1, 8), 0x388e3c, 0, 3.05, 0),
    tinted(new THREE.OctahedronGeometry(0.2), 0xffd54f, 0, 3.72, 0),
  ]);
  const bulbColours = [0xff5252, 0xffd54f, 0x4fc3f7, 0xff80ab];
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    const turn = i * 1.9;
    const y = 0.95 + (i / 13) * 2.3;
    const radius = 1.14 * (1 - (y - 0.7) / 3);
    bulbs.push(
      tinted(new THREE.IcosahedronGeometry(0.085), bulbColours[i % 4], Math.cos(turn) * radius, y, Math.sin(turn) * radius),
    );
  }
  const bulbGeometry = mergeGeometries(bulbs);
  const treeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const bulbMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

  const trees = [];
  for (let index = 0; index < CHRISTMAS_TREE_COUNT; index++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(treeGeometry, treeMaterial));
    group.add(new THREE.Mesh(bulbGeometry, bulbMaterial));
    group.scale.setScalar(0.92 + ((index * 5) % 4) * 0.1);
    scene.add(group);
    trees.push({ group, index, side: index % 2 === 0 ? -1 : 1, z: index * CHRISTMAS_TREE_SPACING, bulbMaterial });
  }
  return trees;
}

/** Evenly through the cycle at whatever the tier allows, rather than bunched. */
function treeAllowed(index, quality) {
  const count = quality.decorationCount ?? 0;
  if (count <= 0) return false;
  return Math.floor(((index + 1) * count) / CHRISTMAS_TREE_COUNT) > Math.floor((index * count) / CHRISTMAS_TREE_COUNT);
}

/**
 * Dress the world for Christmas, or take it off again.
 *
 * Only surfaces change. Rails and lane lines stay separate meshes above the
 * floor, so snow can never cover them, and they darken here because the pale
 * steel that read well on brown ballast disappears against white. Obstacles are
 * not touched at all.
 */
export function setWorldChristmas(world, on) {
  if (world.christmas === on) return;
  world.christmas = on;

  if (on && !world.snowy) {
    const ballast = makeBallast(true);
    ballast.repeat.set(BALLAST_REPEAT[0], BALLAST_REPEAT[1]);
    const wall = makeWall(true);
    wall.repeat.set(WALL_REPEAT[0], WALL_REPEAT[1]);
    world.snowy = {
      ballast,
      wall,
      wood: makeWood(true),
      facades: BUILDING_COLORS.map((c, i) => makeFacade(i + 2, hexOf(c), true)),
    };
    world.trees = makeChristmasTrees(world.scene);
    world.twinkle = !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  const look = on ? world.snowy : world.plain;
  const { track, wood, rail, line, wall, kerb } = world.materials;
  track.map = look.ballast;
  wood.map = look.wood;
  wall.map = look.wall;
  world.buildings.forEach((building, i) => {
    building.mesh.material.map = look.facades[i % look.facades.length];
  });
  rail.color.setHex(on ? 0x36414b : 0xa8b4bd);
  line.color.setHex(on ? 0xd99a00 : 0xf2d64b);
  kerb.color.setHex(on ? 0xdfe9f2 : 0x8a8f96);
  for (const tree of world.trees) tree.group.visible = on && treeAllowed(tree.index, world.quality);
}

function configureShadow(sun, quality) {
  const cam = sun.shadow.camera;
  // A tight box around the runner: the shadow map only ever needs to cover the
  // stretch of track that is actually on screen, and a small box keeps the
  // texels dense enough for the runner's own shadow to stay crisp.
  cam.left = -18;
  cam.right = 18;
  cam.top = 22;
  cam.bottom = -22;
  cam.near = 1;
  cam.far = 140;
  cam.updateProjectionMatrix();
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.035;
}

function makeClouds(scene) {
  const texture = makeCloud();
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const scale = 26 + ((i * 7) % 5) * 9;
    const sprite = new THREE.Mesh(
      new THREE.PlaneGeometry(scale, scale * 0.45),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        fog: false,
      }),
    );
    sprite.position.set(
      (i % 2 === 0 ? -1 : 1) * (30 + ((i * 5) % 4) * 22),
      34 + ((i * 3) % 4) * 11,
      0,
    );
    sprite.renderOrder = -1;
    scene.add(sprite);
    clouds.push({ mesh: sprite, drift: 60 + ((i * 13) % 5) * 26, offset: ((i * 17) % 7) * 40 });
  }
  return clouds;
}

/**
 * Put the world into a zone's clothes.
 *
 * Called every frame with an already-blended look, so nothing here decides
 * anything — zones.js owns the timing and this just paints.
 *
 * @param {number} speed metres a second the run is actually travelling at. The
 *   fog is a number of *seconds* of track — see QUALITY_PROFILES — so this is
 *   what turns it into the metres THREE.Fog wants. Floored at the run's opening
 *   speed: the title screen drifts along at a fraction of it, and a fog that
 *   shrank to match would close the world in around a runner who is standing
 *   still.
 */
export function applyLookAtSpeed(world, look, quality, speed) {
  world.sky.material.map = skyFor(world, look.sky);
  world.sky.material.needsUpdate = true;

  world.scene.fog.color.setHex(look.fogColor);
  const metres = Math.max(START_SPEED, Number(speed) || 0);
  world.scene.fog.near = quality.fogSeconds[0] * metres * look.fog[0];
  world.scene.fog.far = quality.fogSeconds[1] * metres * look.fog[1];
  world.scene.background.setHex(look.sky[1]);

  world.ground.material.color.setHex(world.christmas ? mixColor(look.ground, SNOW_GROUND, 0.6) : look.ground);
  world.hemi.color.setHex(look.hemiSky);
  world.hemi.groundColor.setHex(look.hemiGround);
  world.hemi.intensity = look.hemi;
  world.sun.intensity = look.sun;
  world.ambient.intensity = look.ambient;
  // The sun disc has no business hanging in a tunnel roof.
  world.sunBall.visible = look.ceiling === null;
  world.clouds.forEach((cloud) => (cloud.mesh.visible = look.ceiling === null));

  const shell = world.shell;
  // The whole shell lives or dies with the roof. Fading the walls in separately
  // meant they rose out of the ground while the roof was already overhead, and
  // the sky poured in through the gap between the two — which is what made a
  // jump inside a tunnel look like leaving it.
  shell.visible = look.ceiling !== null;
  world.roof.visible = shell.visible;
  if (shell.visible) {
    // Sat so its *underside* is at the zone's ceiling. Placing the slab's centre
    // there put its lower half below the stated ceiling, and a runner cleared to
    // exactly that height ended up with their head inside the geometry — which
    // is what "the head vanishes into the roof" was.
    world.roof.position.y = look.ceiling + ROOF_THICKNESS / 2;
    // Hung from the roof rather than standing on the ground, so the seal holds
    // at every height the roof passes through.
    world.walls.forEach(
      (wall) => (wall.position.y = look.ceiling - WALL_HEIGHT / 2 + ROOF_THICKNESS + 0.4),
    );
    world.lamps.forEach((lamp) => (lamp.visible = look.wall > 0.3));
    world.lamps.forEach((lamp) => (lamp.position.y = look.ceiling - 1.4));
  }
}

/**
 * Put the tunnel mouth where the section begins, and leave it there.
 *
 * Placed once, from the runner's position and speed at the moment the section
 * comes into range, and then never moved: recomputing it every frame would
 * make it drift as the speed changed, and a landmark that slides around is not
 * a landmark. Hidden again once it is safely behind.
 *
 * @param {{ at: number, seconds: number }|null} ahead from `nextCeilingAt`
 * @param {number} playerZ
 * @param {number} speed
 */
export function placeMouth(world, ahead, playerZ, speed) {
  const mouth = world.mouth;
  if (!mouth) return;

  if (!ahead || ahead.seconds > MOUTH_LEAD_SECONDS) {
    // Far off, or there is no roofed section next. Forget any earlier placing
    // so the following one is measured fresh.
    if (!ahead) world.mouthZ = null;
    mouth.visible = false;
    return;
  }

  if (world.mouthZ == null) world.mouthZ = playerZ + Math.max(20, speed * ahead.seconds);
  mouth.position.z = world.mouthZ;
  // Kept until it is a good way behind, so it is still there to be looked back
  // at rather than blinking out the instant it is passed.
  mouth.visible = world.mouthZ > playerZ - 30;
  if (!mouth.visible) world.mouthZ = null;
}

/**
 * Regenerate the sky gradient only when the colours actually change.
 *
 * Rebuilding a canvas texture every frame would cost more than everything else
 * in this file put together.
 */
function skyFor(world, colors) {
  const key = `${colors[0]}|${colors[1]}`;
  if (world.skyKey === key) return world.sky.material.map;
  world.skyKey = key;
  world.skyTex?.dispose();
  world.skyTex = makeSky(colors[0], colors[1]);
  world.skyTex.wrapS = THREE.ClampToEdgeWrapping;
  world.skyTex.wrapT = THREE.ClampToEdgeWrapping;
  return world.skyTex;
}

export function syncWorld(world, playerZ) {
  const start = Math.floor(playerZ / SEGMENT_LEN) - 2;

  world.segments.forEach((seg, i) => {
    const idx = start + i;
    seg.index = idx;
    seg.group.position.z = idx * SEGMENT_LEN + SEGMENT_LEN / 2;
  });

  for (const building of world.buildings) {
    building.mesh.position.z = recycle(building, BUILDING_CYCLE, playerZ);
  }

  for (const pole of world.poles) {
    pole.group.position.z = recycle(pole, POLE_CYCLE, playerZ);
  }

  const eventOn = chuseokAt();
  for (const decoration of world.decorations ?? []) {
    decoration.group.position.z = recycle(decoration, CHUSEOK_DECOR_CYCLE, playerZ);
    decoration.group.visible =
      eventOn && decoration.index < (world.quality.decorationCount ?? 0);
  }

  if (world.christmas) {
    const edge = (world.roadHalf ?? BASE_HALF_WIDTH) + TREE_MARGIN;
    for (const tree of world.trees) {
      tree.group.position.z = recycle(tree, CHRISTMAS_TREE_CYCLE, playerZ);
      tree.group.position.x = (world.roadCentre ?? 0) + tree.side * edge;
    }
    if (world.twinkle && world.trees.length) {
      world.trees[0].bulbMaterial.color.setScalar(0.72 + Math.sin(playerZ * 0.09) * 0.28);
    }
  }

  world.sky.position.z = playerZ;
  world.ground.position.z = playerZ;
  world.shell.position.z = playerZ + TUNNEL_LEN / 2 - TUNNEL_BEHIND;
  // Lamps slide backwards through the shell so they read as passing by rather
  // than travelling along with the runner.
  for (const lamp of world.lamps) {
    // Wrapped within the shell's own length, so a lamp leaving the back appears
    // again at the front. Anything else and they march off past the fog and the
    // tunnel goes dark.
    const base = lamp.userData.slot * LAMP_SPACING - playerZ;
    lamp.position.z = ((base % TUNNEL_LEN) + TUNNEL_LEN) % TUNNEL_LEN - TUNNEL_LEN / 2;
  }
  world.sunBall.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE).setZ(playerZ + SUN_DISTANCE * 0.5);

  for (const cloud of world.clouds) {
    cloud.mesh.position.z = playerZ + 120 + cloud.offset;
  }

  // Keep the shadow frustum travelling with the runner, otherwise shadows fade
  // out a few segments into the run.
  const sun = world.sun;
  sun.target.position.set(0, 0, playerZ + 6);
  sun.target.updateMatrixWorld();
  sun.position.copy(SUN_DIR).multiplyScalar(60).setZ(playerZ + 6 + SUN_DIR.z * 60);
}

/** Re-apply a quality tier to an existing world without rebuilding it. */
export function applyWorldQuality(world, quality) {
  world.quality = quality;
  world.sun.castShadow = quality.shadows;
  configureShadow(world.sun, quality);
  for (const decoration of world.decorations ?? []) {
    decoration.group.visible =
      chuseokAt() && decoration.index < (quality.decorationCount ?? 0);
  }
  for (const tree of world.trees ?? []) {
    tree.group.visible = world.christmas && treeAllowed(tree.index, quality);
  }
  return world;
}
