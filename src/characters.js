export const DEFAULT_CHARACTER = "runner";

/**
 * Playable runners.
 *
 * `palette` slots map onto the tagged meshes in player.js, so a skin change is
 * a recolour rather than a rebuild.
 *
 * `perk` is what makes the choice a choice. Four identical runners in different
 * colours gave nobody a reason to spend nine thousand coins, so each one now
 * changes one number — and only one, kept small enough that the board still
 * ranks players rather than purchases. The default runner keeps none of them,
 * which is what the others are measured against.
 */
export const CHARACTERS = [
  {
    id: "runner",
    name: "카이",
    cost: 0,
    blurb: "기본 러너 · 특성 없음",
    perk: {},
    palette: { shirt: 0x14b8a6, trim: 0x0f766e, pack: 0xf97316, hair: 0x1c1917, streak: 0xfb923c },
  },
  {
    id: "neon",
    name: "네온",
    cost: 2500,
    blurb: "야광 스프레이 아티스트 · 자석 범위 +25%",
    perk: { magnetRange: 1.25 },
    palette: { shirt: 0x7c4dff, trim: 0x4527a0, pack: 0x00e5ff, hair: 0x311b92, streak: 0x18ffff },
  },
  {
    id: "sunset",
    name: "노을",
    cost: 5000,
    blurb: "막차를 놓친 배달원 · 슬라이드 +30%",
    perk: { slideTime: 1.3 },
    palette: { shirt: 0xff7043, trim: 0xbf360c, pack: 0xffd54f, hair: 0x4e342e, streak: 0xfff176 },
  },
  {
    id: "mono",
    name: "모노",
    cost: 9000,
    blurb: "경비를 따돌린 그림자 · 매 판 호버보드 1개",
    perk: { startBoard: true },
    palette: { shirt: 0x263238, trim: 0x000000, pack: 0xeceff1, hair: 0x000000, streak: 0xffffff },
  },
];

export const CHARACTER_IDS = CHARACTERS.map((character) => character.id);

export function characterById(id) {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}

/** The perks of the equipped character, safe to read for any id. */
export function perkFor(id) {
  return characterById(id).perk ?? {};
}

export function isKnownCharacter(id) {
  return CHARACTER_IDS.includes(id);
}
