export const DEFAULT_CHARACTER = "runner";

/**
 * Playable runners. `palette` slots map onto the tagged meshes in player.js, so
 * a skin change is a recolour rather than a rebuild.
 */
export const CHARACTERS = [
  {
    id: "runner",
    name: "카이",
    cost: 0,
    blurb: "기본 러너",
    palette: { shirt: 0x14b8a6, trim: 0x0f766e, pack: 0xf97316, hair: 0x1c1917, streak: 0xfb923c },
  },
  {
    id: "neon",
    name: "네온",
    cost: 2500,
    blurb: "야광 스프레이 아티스트",
    palette: { shirt: 0x7c4dff, trim: 0x4527a0, pack: 0x00e5ff, hair: 0x311b92, streak: 0x18ffff },
  },
  {
    id: "sunset",
    name: "노을",
    cost: 5000,
    blurb: "막차를 놓친 배달원",
    palette: { shirt: 0xff7043, trim: 0xbf360c, pack: 0xffd54f, hair: 0x4e342e, streak: 0xfff176 },
  },
  {
    id: "mono",
    name: "모노",
    cost: 9000,
    blurb: "경비를 따돌린 그림자",
    palette: { shirt: 0x263238, trim: 0x000000, pack: 0xeceff1, hair: 0x000000, streak: 0xffffff },
  },
];

export const CHARACTER_IDS = CHARACTERS.map((character) => character.id);

export function characterById(id) {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

export function isKnownCharacter(id) {
  return CHARACTER_IDS.includes(id);
}
