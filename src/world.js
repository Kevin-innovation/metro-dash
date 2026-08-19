import * as THREE from "three";
import { BUILDING_COLORS, FOG_COLOR, LANES, SEGMENT_COUNT, SEGMENT_LEN } from "./config.js";
import { makeBallast, makeCloud, makeFacade, makeSky, makeWall, makeWood } from "./textures.js";
import { OPEN_CEILING } from "./zones.js";
import { addRibbon, createRibbon, syncRibbon } from "./ribbon.js";
import { bendX } from "./track.js";

function hexOf(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Direction the key light comes from; the sun billboard is placed to match. */
const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();
const SUN_DISTANCE = 150;

const BUILDING_COUNT = 24;
const POLE_COUNT = 16;
const POLE_SPACING = 30;

/**
 * Scenery is recycled a full cycle at a time so a piece only ever jumps while
 * it is behind the camera. Deriving its position from the current segment index
 * instead made every building hop forward together each time the index ticked,
 * which read as a stutter in the skyline.
 */
const BUILDING_CYCLE = (BUILDING_COUNT / 2) * SEGMENT_LEN;
const POLE_CYCLE = POLE_COUNT * POLE_SPACING;
/** How far behind the camera a piece must be before it may be moved. */
const RECYCLE_BEHIND = 48;

/** Long enough to reach past the fog in every quality tier. */
const TUNNEL_LEN = 420;
const TUNNEL_LAMPS = 28;
/** Chosen so the lamps tile the shell exactly and the cycle has no seam. */
const LAMP_SPACING = TUNNEL_LEN / TUNNEL_LAMPS;
/** How much of the shell sits behind the runner. */
const TUNNEL_BEHIND = 60;

/** How much track the ribbons span, and how much of it sits behind the runner. */
const TRACK_LEN = SEGMENT_COUNT * SEGMENT_LEN;
const TRACK_BEHIND = 40;
/** Sleepers laid across the visible stretch, per lane. */
const TIES_PER_LANE = 46;
const TIE_SPACING = 2.6;

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

export function createWorld(scene, quality) {
  scene.background = new THREE.Color(0x8fc6e6);
  scene.fog = new THREE.Fog(FOG_COLOR, quality.fog[0], quality.fog[1]);

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
  // Ribbons like the track itself, for the same reason: a straight tunnel over
  // a curving line puts the track through the wall within a few seconds.
  // Wide enough to fill the view — a narrow roof reads as a dark bar hanging in
  // front of the skyline rather than as a ceiling over the track.
  const roof = createRibbon(roofMat, {
    width: 26,
    height: ROOF_THICKNESS,
    offsetX: 0,
    y: 0,
    length: TUNNEL_LEN,
    behind: TUNNEL_BEHIND,
  });
  shell.add(roof);
  const walls = [-1, 1].map((side) => {
    const wall = createRibbon(shellMat, {
      width: 0.6,
      height: WALL_HEIGHT,
      offsetX: side * 7.2,
      y: 3.4,
      length: TUNNEL_LEN,
      behind: TUNNEL_BEHIND,
    });
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
    lamp.userData = { slot: i, side: i % 2 ? 6.7 : -6.7 };
    shell.add(lamp);
    lamps.push(lamp);
  }
  shell.visible = false;
  scene.add(shell);

  const ballastTex = makeBallast();
  // Across only: the length repeat comes from the world-Z mapping in the ribbon.
  ballastTex.repeat.set(3, 1);
  const woodTex = makeWood();
  const wallTex = makeWall();
  wallTex.repeat.set(4, 1);

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

  // The track, as continuous strips rather than a chain of blocks.
  //
  // Blocks cannot curve: bending one can only turn it as a whole, so the joints
  // between them show as a kink every thirty metres. A ribbon spans the entire
  // visible distance and has its vertices moved onto the line every frame, so
  // it is genuinely curved — and it costs one draw call where the blocks cost
  // more than five hundred.
  const strip = (material, spec) =>
    addRibbon(scene, createRibbon(material, { length: TRACK_LEN, behind: TRACK_BEHIND, ...spec }));

  const ribbons = [strip(trackMat, { width: 8.4, offsetX: 0, y: 0.01, shadow: true, tile: 6 })];
  for (const x of LANES) {
    ribbons.push(strip(lineMat, { width: 0.09, offsetX: x, y: 0.03 }));
    for (const ox of [-0.38, 0.38]) {
      ribbons.push(strip(railMat, { width: 0.1, offsetX: x + ox, y: 0.09 }));
    }
  }
  for (const side of [-1, 1]) {
    ribbons.push(strip(kerbMat, { width: 0.5, height: 0.3, offsetX: side * 4.5, y: 0.15, shadow: true }));
    ribbons.push(strip(wallMat, { width: 0.4, height: 2.4, offsetX: side * 5.5, y: 1.2, shadow: true }));
  }
  for (const ribbon of ribbons) ribbon.receiveShadow = ribbon.userData.spec.shadow && quality.shadows;

  // Sleepers stay individual: each is under a third of a metre long, so placing
  // them one by one costs nothing in smoothness.
  const ties = [];
  for (const x of LANES) {
    for (let i = 0; i < TIES_PER_LANE; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.28), woodMat);
      tie.receiveShadow = quality.shadows;
      tie.userData = { lane: x, slot: i };
      scene.add(tie);
      ties.push(tie);
    }
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
    buildings.push({
      mesh,
      side,
      h,
      depth,
      baseX: mesh.position.x,
      z: slot * SEGMENT_LEN + ((i * 11) % 5) * 4,
    });
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
    poles.push({ group: pole, baseX: pole.position.x, z: i * POLE_SPACING });
  }

  return {
    scene, sky, sunBall, sun, hemi, ambient, ground, clouds,
    shell, roof, walls, lamps,
    ribbons, ties, buildings, poles, quality,
  };
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
 */
export function applyLook(world, look, quality) {
  world.sky.material.map = skyFor(world, look.sky);
  world.sky.material.needsUpdate = true;

  world.scene.fog.color.setHex(look.fogColor);
  world.scene.fog.near = quality.fog[0] * look.fog[0];
  world.scene.fog.far = quality.fog[1] * look.fog[1];
  world.scene.background.setHex(look.sky[1]);

  world.ground.material.color.setHex(look.ground);
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
    world.roof.userData.spec.y = look.ceiling + ROOF_THICKNESS / 2;
    // Hung from the roof rather than standing on the ground, so the seal holds
    // at every height the roof passes through.
    world.walls.forEach((wall) => {
      wall.userData.spec.y = look.ceiling - WALL_HEIGHT / 2 + ROOF_THICKNESS + 0.4;
    });
    world.lamps.forEach((lamp) => (lamp.visible = look.wall > 0.3));
    world.lamps.forEach((lamp) => (lamp.position.y = look.ceiling - 1.4));
    world.lampSide = 6.7;
  }
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
  for (const ribbon of world.ribbons) syncRibbon(ribbon, playerZ);

  // Sleepers march backwards through their span so they read as passing by.
  const tieSpan = TIES_PER_LANE * TIE_SPACING;
  for (const tie of world.ties) {
    const base = tie.userData.slot * TIE_SPACING - playerZ;
    const z = playerZ + (((base % tieSpan) + tieSpan) % tieSpan) - TRACK_BEHIND;
    tie.position.set(tie.userData.lane + bendX(z), 0.01, z);
  }

  for (const building of world.buildings) {
    const z = recycle(building, BUILDING_CYCLE, playerZ);
    building.mesh.position.z = z;
    // Scenery follows the line too, or the track walks out through the city.
    building.mesh.position.x = building.baseX + bendX(z);
  }

  for (const pole of world.poles) {
    const z = recycle(pole, POLE_CYCLE, playerZ);
    pole.group.position.z = z;
    pole.group.position.x = pole.baseX + bendX(z);
  }

  world.sky.position.z = playerZ;
  world.ground.position.z = playerZ;
  if (world.shell.visible) {
    syncRibbon(world.roof, playerZ);
    for (const wall of world.walls) syncRibbon(wall, playerZ);
  }
  // Lamps slide backwards through the shell so they read as passing by rather
  // than travelling along with the runner.
  for (const lamp of world.lamps) {
    // Wrapped within the shell's own length, so a lamp leaving the back appears
    // again at the front. Anything else and they march off past the fog and the
    // tunnel goes dark.
    const base = lamp.userData.slot * LAMP_SPACING - playerZ;
    const z = playerZ + ((base % TUNNEL_LEN) + TUNNEL_LEN) % TUNNEL_LEN - TUNNEL_BEHIND;
    lamp.position.z = z;
    lamp.position.x = lamp.userData.side + bendX(z);
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
  return world;
}
