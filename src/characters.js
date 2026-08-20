export const DEFAULT_CHARACTER = "runner";

/**
 * Playable runners.
 *
 * `palette` slots map onto the tagged meshes in player.js, so a skin change is
 * a recolour rather than a rebuild.
 *
 * `perk` is what makes the choice a choice. Four identical runners in different
 * colours gave nobody a reason to spend nine thousand coins, so each one now
 * changes one number — and only one.
 *
 * None of them buys survival. 모노 used to hand out a free hoverboard every
 * run: nine thousand coins for a three-hundred-and-fifty coin item, forever,
 * which paid for itself in twenty-six runs and was an extra life every run
 * after that. On a board where classes are compared, the top of the table would
 * have measured who had saved up. The hoverboard stays a thing you buy for the
 * run you are about to play, and the perks move coins around instead.
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
    blurb: "경비를 따돌린 그림자 · 코인 획득 +20%",
    perk: { coinBonus: 1.2 },
    palette: { shirt: 0x263238, trim: 0x000000, pack: 0xeceff1, hair: 0x000000, streak: 0xffffff },
  },
  {
    id: "driver",
    name: "기관사",
    cost: 14000,
    blurb: "막차를 몰던 사람 · 연속 출석 보상 2배",
    perk: { streakBonus: 2 },
    palette: { shirt: 0x1e3a5f, trim: 0x0d1b2a, pack: 0xffc107, hair: 0x2b2b2b, streak: 0xffd54f },
  },
  {
    id: "nightshift",
    name: "야근러",
    cost: 20000,
    blurb: "아직 퇴근 못 한 사람 · 미션 보상 +30%",
    perk: { missionBonus: 1.3 },
    palette: { shirt: 0x37474f, trim: 0x1c262b, pack: 0xaeea00, hair: 0x263238, streak: 0xc6ff00 },
  },
  {
    id: "legend",
    name: "전설",
    cost: 30000,
    blurb: "이름만 남은 러너 · 코인 획득 +35%",
    perk: { coinBonus: 1.35 },
    palette: { shirt: 0x1a1a1a, trim: 0x000000, pack: 0xd50000, hair: 0x000000, streak: 0xff1744 },
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
