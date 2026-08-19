import * as THREE from "three";
import { bendX } from "./track.js";

/**
 * A strip of track that follows the line.
 *
 * The track used to be twelve thirty-metre blocks that were slid along and
 * recycled. That cannot curve: bending a block can only rotate it as a whole,
 * so consecutive blocks meet at an angle and the joints show as a visible kink
 * every thirty metres — a chain of straights, not a curve.
 *
 * A ribbon is one mesh spanning the whole visible distance, sliced finely along
 * Z, whose vertices are moved each frame to sit on the line. It curves smoothly
 * because it is actually curved. It is also far cheaper: one draw call instead
 * of twelve, and a couple of hundred vertices instead of a wall of boxes.
 */

/** Slices along the length. Fine enough that no facet is visible at speed. */
const SLICES = 120;

/**
 * @param {object} spec
 * @param {number} spec.width    across the track
 * @param {number} spec.height   0 for a flat strip, above 0 for an upright slab
 * @param {number} spec.offsetX  lane position, before the bend is applied
 * @param {number} spec.y        height above the deck
 * @param {number} spec.length   how much track it covers
 * @param {number} spec.repeatV  texture repeats per metre along the track
 */
/** Add a ribbon to the scene and hand it back. */
export function addRibbon(scene, mesh) {
  scene.add(mesh);
  return mesh;
}

export function createRibbon(material, spec) {
  const { width, height = 0, length } = spec;
  const geometry = height > 0 ? uprightGeometry(width, height, length) : flatGeometry(width, length);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData = {
    spec,
    base: geometry.getAttribute("position").array.slice(),
    baseUV: geometry.getAttribute("uv")?.array.slice() ?? null,
  };
  return mesh;
}

/** A flat strip lying on the deck, seen from above. */
function flatGeometry(width, length) {
  const geometry = new THREE.PlaneGeometry(width, length, 1, SLICES);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * An upright slab: two faces and a cap, which is all that can be seen of a
 * kerb or a parapet from inside the track.
 */
function uprightGeometry(width, height, length) {
  const geometry = new THREE.BoxGeometry(width, height, length, 1, 1, SLICES);
  return geometry;
}

/**
 * Put the ribbon on the line for the runner's current position.
 *
 * Every vertex keeps its own Z and is pushed sideways by the bend at that Z, so
 * the strip traces the curve rather than approximating it.
 */
export function syncRibbon(mesh, playerZ) {
  const { spec, base } = mesh.userData;
  const position = mesh.geometry.getAttribute("position");
  const array = position.array;
  // Anchored to whole metres so the texture does not crawl as the runner moves.
  const origin = Math.floor(playerZ - spec.behind);

  for (let i = 0; i < array.length; i += 3) {
    const z = origin + base[i + 2] + spec.length / 2;
    array[i] = base[i] + spec.offsetX + bendX(z);
    array[i + 1] = base[i + 1] + spec.y;
    array[i + 2] = z;
  }
  position.needsUpdate = true;

  // The texture is pinned to world Z rather than to the strip, or it slides
  // backwards along the track as the ribbon is dragged forwards.
  const uv = mesh.geometry.getAttribute("uv");
  if (uv && spec.tile) {
    const uvArray = uv.array;
    for (let i = 0, v = 0; i < array.length; i += 3, v += 2) {
      uvArray[v + 1] = array[i + 2] / spec.tile;
    }
    uv.needsUpdate = true;
  }

  mesh.geometry.computeVertexNormals();
}
