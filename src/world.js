import * as THREE from "three";
import {
  BUILDING_COLORS,
  FOG_COLOR,
  LANES,
  SEGMENT_COUNT,
  SEGMENT_LEN,
} from "./config.js";
import { makeBallast, makeFacade, makeGraffiti, makeSky, makeWood } from "./textures.js";

function hexOf(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x6ec8ef);
  scene.fog = new THREE.Fog(FOG_COLOR, 42, 160);

  const hemi = new THREE.HemisphereLight(0xb8e0ff, 0x8d6e4a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
  sun.position.set(18, 28, 8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  const skyTex = makeSky();
  skyTex.wrapS = THREE.ClampToEdgeWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }),
  );
  sunBall.position.set(-40, 38, 80);
  scene.add(sunBall);

  const ballastTex = makeBallast();
  ballastTex.repeat.set(3, 8);
  const woodTex = makeWood();
  const graffiti = makeGraffiti();
  graffiti.repeat.set(2, 1);

  const facades = BUILDING_COLORS.map((c, i) => {
    const t = makeFacade(i + 2, hexOf(c));
    t.repeat.set(1, 2);
    return t;
  });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 900),
    new THREE.MeshLambertMaterial({ color: 0x6f8f4a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  scene.add(ground);

  const trackMat = new THREE.MeshLambertMaterial({ map: ballastTex });
  const woodMat = new THREE.MeshLambertMaterial({ map: woodTex });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xffeb3b });
  const wallMat = new THREE.MeshLambertMaterial({ map: graffiti });

  const segments = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.18, SEGMENT_LEN), trackMat);
    floor.position.y = -0.08;
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
        g.add(tie);
      }
    });

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, SEGMENT_LEN), wallMat);
    leftWall.position.set(-5.4, 0.7, 0);
    g.add(leftWall);
    const rightWall = leftWall.clone();
    rightWall.position.x = 5.4;
    g.add(rightWall);

    scene.add(g);
    segments.push({ group: g, index: i });
  }

  const buildings = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const h = 8 + (i % 5) * 3.2;
    const w = 6 + (i % 3);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, SEGMENT_LEN * 0.88),
      new THREE.MeshLambertMaterial({ map: facades[i % facades.length] }),
    );
    mesh.position.set(side * (8.6 + w * 0.35), h / 2 - 0.2, 0);
    scene.add(mesh);
    buildings.push({ mesh, side, h, w });
  }

  const poles = [];
  for (let i = 0; i < 16; i++) {
    const pole = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x455a64 }),
    );
    post.position.y = 2.6;
    pole.add(post);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xfff59d, emissive: 0xffcc80, emissiveIntensity: 0.6 }),
    );
    lamp.position.set(0.35, 4.8, 0);
    pole.add(lamp);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x455a64 }),
    );
    arm.position.set(0.25, 4.85, 0);
    pole.add(arm);
    scene.add(pole);
    poles.push(pole);
  }

  return { sky, segments, buildings, poles };
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
    b.mesh.position.z = idx * SEGMENT_LEN + SEGMENT_LEN / 2;
  });

  world.poles.forEach((p, i) => {
    const idx = start + i;
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(side * 4.7, 0, idx * SEGMENT_LEN + 8);
  });

  world.sky.position.z = playerZ;
}
