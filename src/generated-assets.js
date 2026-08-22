import * as THREE from "three";

/**
 * Image assets are presentation only. The entity's existing Three.js group
 * remains the collision and rideability authority; these planes replace only
 * what the camera sees once their texture has loaded.
 */
const PATHS = {
  coin: "/generated/coin.png",
  barrier: "/generated/barrier.png",
  crate: "/generated/crate.png",
  magnet: "/generated/magnet.png",
  jetpack: "/generated/jetpack.png",
  double: "/generated/double.png",
  sneakers: "/generated/sneakers.png",
  gate: "/generated/gate.png",
  busFront: "/generated/bus-front.png",
  busRear: "/generated/bus-rear.png",
  trainRear: "/generated/train-rear.png",
  facade: "/generated/facade.png",
  wall: "/generated/wall.png",
  ballast: "/generated/ballast.png",
  wood: "/generated/wood.png",
  tunnel: "/generated/tunnel.png",
  streetlight: "/generated/streetlight.png",
  characterParts: "/generated/character-parts.png",
};

const loader = new THREE.TextureLoader();
const textures = new Map();

function textureFor(name) {
  if (!textures.has(name)) {
    const texture = loader.load(PATHS[name]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.set(name, texture);
  }
  return textures.get(name);
}

export function generatedTexture(name) {
  const texture = textureFor(name);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Add a camera-facing image plane without changing the parent group's joints. */
export function addGeneratedPlane(parent, name, width, height, position, onReady) {
  const material = new THREE.MeshBasicMaterial({
    map: textureFor(name),
    transparent: true,
    alphaTest: 0.02,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  plane.position.set(...position);
  plane.visible = false;
  plane.userData.generatedName = name;
  parent.add(plane);

  const image = material.map.image;
  if (image?.complete) {
    plane.visible = true;
    onReady?.(plane);
  } else {
    material.map.addEventListener?.("update", () => {
      if (plane.visible) return;
      plane.visible = true;
      onReady?.(plane);
    });
  }
  return plane;
}

/** Add one cell from a fixed transparent character-part atlas. */
export function addGeneratedTilePlane(
  parent,
  name,
  column,
  row,
  columns,
  rows,
  width,
  height,
  position,
  onReady,
) {
  const texture = loader.load(PATHS[name], (loaded) => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.anisotropy = 4;
    loaded.repeat.set(1 / columns, 1 / rows);
    loaded.offset.set(column / columns, (rows - 1 - row) / rows);
    plane.visible = true;
    onReady?.(plane);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(1 / columns, 1 / rows);
  texture.offset.set(column / columns, (rows - 1 - row) / rows);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  plane.position.set(...position);
  plane.visible = false;
  plane.userData.generatedName = name;
  parent.add(plane);
  return plane;
}

/** Keep the primitive fallback visible until the selected image is ready. */
export function bindGeneratedLayer(parent, fallback, faces) {
  const state = {
    fallback,
    faces,
    active: Object.keys(faces)[0],
  };
  parent.userData.generatedLayer = state;
  for (const plane of Object.values(faces)) plane.visible = false;
  syncGeneratedLayer(parent);
  return state;
}

export function setGeneratedFace(parent, face) {
  const state = parent.userData.generatedLayer;
  if (!state) return;
  state.active = face;
  syncGeneratedLayer(parent);
}

export function refreshGeneratedLayer(parent) {
  syncGeneratedLayer(parent);
}

function syncGeneratedLayer(parent) {
  const state = parent.userData.generatedLayer;
  if (!state) return;
  const active = state.faces[state.active];
  const ready = !!active?.material?.map?.image;
  state.fallback.forEach((child) => (child.visible = !ready));
  for (const [name, plane] of Object.entries(state.faces)) {
    plane.visible = ready && name === state.active;
  }
}
