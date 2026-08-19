import * as THREE from "three";
import { BUILDING_COLORS, FOG_COLOR, LANES, SEGMENT_COUNT, SEGMENT_LEN } from "./config.js";
import { makeBallast, makeCloud, makeFacade, makeSky, makeWall, makeWood } from "./textures.js";
import { OPEN_CEILING } from "./zones.js";

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
  // Wide enough to fill the view. A narrow roof reads as a dark bar hanging in
  // front of the skyline rather than as a ceiling over the track.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, TUNNEL_LEN), roofMat);
  shell.add(roof);
  const walls = [-1, 1].map((side) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, TUNNEL_LEN), shellMat);
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

  const ballastTex = makeBallast();
  ballastTex.repeat.set(3, 8);
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

  const segments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const g = new THREE.Group();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, SEGMENT_LEN), trackMat);
    floor.position.y = -0.08;
    floor.receiveShadow = quality.shadows;
    g.add(floor);

    LANES.forEach((x) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, SEGMENT_LEN), lineMat);
      line.position.set(x, 0.02, 0);
      g.add(line);
      [-0.38, 0.38].forEach((ox) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, SEGMENT_LEN), railMat);
        rail.position.set(x + ox, 0.05, 0);
        g.add(rail);
      });
      const ties = 10;
      for (let t = 0; t < ties; t++) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.28), woodMat);
        tie.position.set(x, 0.01, -SEGMENT_LEN / 2 + 1.4 + t * (SEGMENT_LEN / ties));
        tie.receiveShadow = quality.shadows;
        g.add(tie);
      }
    });

    [-1, 1].forEach((side) => {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, SEGMENT_LEN), kerbMat);
      kerb.position.set(side * 4.5, 0.05, 0);
      kerb.receiveShadow = quality.shadows;
      g.add(kerb);

      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, SEGMENT_LEN), wallMat);
      wall.position.set(side * 5.5, 1.2, 0);
      wall.receiveShadow = quality.shadows;
      g.add(wall);
    });

    scene.add(g);
    segments.push({ group: g, index: i });
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

  return {
    scene, sky, sunBall, sun, hemi, ambient, ground, clouds,
    shell, roof, walls, lamps,
    segments, buildings, poles, quality,
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
  shell.visible = look.ceiling !== null || look.wall > 0.02;
  // Written every frame, visible or not. Skipping the update while hidden left
  // stale positions behind, so the first frame the shell reappeared showed the
  // roof and walls wherever they happened to be last time.
  world.roof.visible = look.ceiling !== null;
  world.roof.position.y = look.ceiling ?? OPEN_CEILING;
  // Walls fade in by sinking, so the shell arrives rather than blinking on.
  world.walls.forEach((wall) => (wall.position.y = 3.4 - (1 - look.wall) * 9));
  world.lamps.forEach((lamp) => (lamp.visible = look.wall > 0.3));
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
  return world;
}
