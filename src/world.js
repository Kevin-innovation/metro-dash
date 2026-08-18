import * as THREE from "three";
import { BUILDING_COLORS, FOG_COLOR, LANES, SEGMENT_COUNT, SEGMENT_LEN } from "./config.js";
import { makeBallast, makeCloud, makeFacade, makeSky, makeWall, makeWood } from "./textures.js";

function hexOf(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Direction the key light comes from; the sun billboard is placed to match. */
const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();
const SUN_DISTANCE = 150;

const BUILDING_COUNT = 24;
const POLE_COUNT = 16;

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
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));

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

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 900),
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
    buildings.push({ mesh, side, h, depth, offset: ((i * 11) % 5) * 4 });
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
    scene.add(pole);
    poles.push(pole);
  }

  return { sky, sunBall, sun, clouds, segments, buildings, poles, quality };
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

export function syncWorld(world, playerZ) {
  const start = Math.floor(playerZ / SEGMENT_LEN) - 2;

  world.segments.forEach((seg, i) => {
    const idx = start + i;
    seg.index = idx;
    seg.group.position.z = idx * SEGMENT_LEN + SEGMENT_LEN / 2;
  });

  world.buildings.forEach((b, i) => {
    const idx = start + Math.floor(i / 2);
    b.mesh.position.z = idx * SEGMENT_LEN + SEGMENT_LEN / 2 + b.offset;
  });

  world.poles.forEach((p, i) => {
    const idx = start + i;
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(side * 4.7, 0, idx * SEGMENT_LEN + 8);
  });

  world.sky.position.z = playerZ;
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
