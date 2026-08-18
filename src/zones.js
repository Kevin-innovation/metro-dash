/**
 * Where the run is, minute by minute.
 *
 * Before this the whole run looked identical from the first second to the last:
 * the phase table changed speed, pressure and the music, but the sky, the light
 * and the scenery never moved. Two hundred seconds of the same picture reads as
 * one long corridor however fast it gets.
 *
 * A zone is presentation plus one rule. The rule is deliberately expressed as a
 * *bias on what the spawner picks*, not as new physics — the tunnel's low
 * ceiling is the existing slide gate, which already cannot be jumped and is
 * already covered by the collision tests.
 *
 * Pure and free of Three.js so it can be unit tested; game.js turns the numbers
 * into lights and fog.
 */

/** Seconds a zone takes to fade into the next one. */
export const ZONE_FADE = 4;

/**
 * @typedef {object} Zone
 * @property {string} id
 * @property {number} from      seconds into the run
 * @property {string} name      shown on the phase chip
 * @property {number[]} sky     [top, bottom] gradient
 * @property {number} fogColor
 * @property {number[]} fog     [near, far] as a multiplier of the quality tier
 * @property {number} ground
 * @property {number} hemiSky
 * @property {number} hemiGround
 * @property {number} hemi      intensity
 * @property {number} sun       intensity
 * @property {number} ambient   intensity
 * @property {number|null} ceiling  height of the tunnel roof, or null for open sky
 * @property {number} wall      side-wall brightness, 0 for none
 * @property {number} slideBias extra weight on slide-under patterns, 0..1
 */

/**
 * The zones, in order. `from` matches the pace phases so the picture changes on
 * the same beat as the speed does.
 */
export const ZONES = [
  {
    id: "surface",
    from: 0,
    name: "지상",
    sky: [0x8fc6e6, 0xd9eefb],
    fogColor: 0xbfe0f2,
    fog: [1, 1],
    ground: 0x63705a,
    hemiSky: 0xd6ecff,
    hemiGround: 0x8f7d63,
    hemi: 1.25,
    sun: 1.35,
    ambient: 0.38,
    ceiling: null,
    wall: 0,
    slideBias: 0,
  },
  {
    id: "tunnel",
    from: 34,
    name: "터널",
    // Almost no sky to see; what light there is comes off the walls.
    sky: [0x141c26, 0x1b242f],
    fogColor: 0x10161e,
    // Sight lines close right in, which is most of what makes a tunnel a tunnel.
    fog: [0.55, 0.42],
    ground: 0x2a2f36,
    hemiSky: 0x5a6b7d,
    hemiGround: 0x14181d,
    hemi: 0.62,
    sun: 0.25,
    ambient: 0.44,
    ceiling: 4.6,
    wall: 0.85,
    // The ceiling has to mean something, so the tunnel leans on slide gates.
    slideBias: 0.5,
  },
  {
    id: "station",
    from: 56,
    name: "역 구내",
    sky: [0x2c3644, 0x46596d],
    fogColor: 0x3b4a5c,
    fog: [0.8, 0.72],
    ground: 0x4a4f57,
    hemiSky: 0xbcd2e8,
    hemiGround: 0x494f57,
    hemi: 0.95,
    sun: 0.7,
    ambient: 0.45,
    ceiling: 7.4,
    // Nearly closed: a half-height wall under a roof reads as a mistake, and a
    // station concourse is a room.
    wall: 0.92,
    slideBias: 0.15,
  },
  {
    id: "viaduct",
    from: 84,
    name: "고가",
    // Back out into the open, and higher than before — the release after the
    // tunnel is the point of putting one here.
    sky: [0x63a8e0, 0xcfe9fa],
    fogColor: 0xc3e2f5,
    fog: [1.15, 1.25],
    ground: 0x55606b,
    hemiSky: 0xe4f2ff,
    hemiGround: 0x7f8a96,
    hemi: 1.35,
    sun: 1.5,
    ambient: 0.42,
    ceiling: null,
    wall: 0,
    slideBias: 0.05,
  },
  {
    id: "night",
    from: 130,
    name: "야간",
    sky: [0x0b1220, 0x1d2b45],
    fogColor: 0x121b2c,
    fog: [0.85, 0.8],
    ground: 0x2b313c,
    hemiSky: 0x4a5f86,
    hemiGround: 0x101520,
    hemi: 0.7,
    sun: 0.45,
    ambient: 0.34,
    ceiling: null,
    wall: 0,
    slideBias: 0.1,
  },
];

/** The zone in force at `t` seconds. */
export function zoneAt(t) {
  let current = ZONES[0];
  for (const zone of ZONES) if (t >= zone.from) current = zone;
  return current;
}

/** The zone after `zone`, or the same one at the end of the list. */
export function nextZone(zone) {
  const i = ZONES.indexOf(zone);
  return i >= 0 && i < ZONES.length - 1 ? ZONES[i + 1] : zone;
}

/**
 * Where the run sits between two zones.
 *
 * The change is spread over ZONE_FADE seconds *before* the boundary, so the
 * light is already shifting as the tunnel mouth comes into view rather than
 * snapping the moment the runner crosses a line.
 *
 * @returns {{ from: Zone, to: Zone, k: number }} k is 0 at `from`, 1 at `to`
 */
export function zoneBlend(t) {
  const current = zoneAt(t);
  const next = nextZone(current);
  if (next === current) return { from: current, to: current, k: 0 };

  const start = next.from - ZONE_FADE;
  if (t <= start) return { from: current, to: next, k: 0 };
  return { from: current, to: next, k: Math.min(1, (t - start) / ZONE_FADE) };
}

/** Linear blend of two numbers. */
export function mix(a, b, k) {
  return a + (b - a) * k;
}

/**
 * Blend two packed 0xRRGGBB colours.
 *
 * Per channel rather than on the packed integer, which would run the blue
 * channel into the green one.
 */
export function mixColor(a, b, k) {
  const ch = (c, shift) => (c >> shift) & 0xff;
  const r = Math.round(mix(ch(a, 16), ch(b, 16), k));
  const g = Math.round(mix(ch(a, 8), ch(b, 8), k));
  const bl = Math.round(mix(ch(a, 0), ch(b, 0), k));
  return (r << 16) | (g << 8) | bl;
}

/**
 * The look at time `t`, already blended — everything game.js needs to set.
 *
 * `ceiling` is null whenever either side of the blend is open sky, so the roof
 * mesh is simply hidden rather than sliding down through the runner.
 */
export function lookAt(t) {
  const { from, to, k } = zoneBlend(t);
  const both = from.ceiling !== null && to.ceiling !== null;

  return {
    id: k > 0.5 ? to.id : from.id,
    name: k > 0.5 ? to.name : from.name,
    sky: [mixColor(from.sky[0], to.sky[0], k), mixColor(from.sky[1], to.sky[1], k)],
    fogColor: mixColor(from.fogColor, to.fogColor, k),
    fog: [mix(from.fog[0], to.fog[0], k), mix(from.fog[1], to.fog[1], k)],
    ground: mixColor(from.ground, to.ground, k),
    hemiSky: mixColor(from.hemiSky, to.hemiSky, k),
    hemiGround: mixColor(from.hemiGround, to.hemiGround, k),
    hemi: mix(from.hemi, to.hemi, k),
    sun: mix(from.sun, to.sun, k),
    ambient: mix(from.ambient, to.ambient, k),
    ceiling: both ? mix(from.ceiling, to.ceiling, k) : null,
    // Faded in on its own so the walls arrive with the roof rather than after.
    wall: mix(from.wall, to.wall, k),
    slideBias: mix(from.slideBias, to.slideBias, k),
  };
}
