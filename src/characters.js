export const DEFAULT_CHARACTER = "runner";

/**
 * Playable runners.
 *
 * `palette` slots map onto the tagged meshes in player.js, so a skin change is
 * a recolour rather than a rebuild.
 *
 * `perk` is what makes the choice a choice, and it is two things rather than
 * one.
 *
 * Every runner used to change exactly one number, and each of those numbers was
 * sideways: a wider magnet, a longer slide, a bigger mission payout. All real,
 * none of them visible in the thing a player actually watches — the score going
 * up. Sixty thousand coins bought a runner that felt identical to the free one
 * for the whole of a run, and the only way to find out it had done anything was
 * to go and read the shop again.
 *
 * So each paid runner now carries a signature perk *and* a plain one: a score
 * multiplier, a coin multiplier, or both, climbing with the price. The
 * signature is still what the runner is for; the multiplier is what makes
 * paying for it land in the first ten seconds.
 *
 * `scoreBonus` multiplies everything the run scores, so it is bounded on the
 * server the same way the combo and the power-up are — see MAX_MULTIPLIER in
 * leaderboard-rules.js. Nothing may be added here that is not folded in there.
 *
 * Ordered by price, because that is the order the shop draws them in and a
 * list where the fifth runner costs more than the sixth reads as a bug.
 *
 * None of them buys survival — 허수아비 shortens the crow but cannot stop it.
 * The one thing that stops something is the antidote, and that is a consumable
 * bought for a single run rather than a permanent property of a skin.
 *
 * 모노 used to hand out a free hoverboard every
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
    blurb: "야광 스프레이 아티스트 · 자석 범위 +25% · 점수 +5%",
    perk: { magnetRange: 1.25, scoreBonus: 1.05 },
    palette: { shirt: 0x7c4dff, trim: 0x4527a0, pack: 0x00e5ff, hair: 0x311b92, streak: 0x18ffff },
  },
  {
    id: "sunset",
    name: "노을",
    cost: 5000,
    blurb: "막차를 놓친 배달원 · 슬라이드 +30% · 점수 +8%",
    perk: { slideTime: 1.3, scoreBonus: 1.08 },
    palette: { shirt: 0xff7043, trim: 0xbf360c, pack: 0xffd54f, hair: 0x4e342e, streak: 0xfff176 },
  },
  {
    id: "mono",
    name: "모노",
    cost: 9000,
    blurb: "경비를 따돌린 그림자 · 코인 +20% · 점수 +10%",
    perk: { coinBonus: 1.2, scoreBonus: 1.1 },
    palette: { shirt: 0x263238, trim: 0x000000, pack: 0xeceff1, hair: 0x000000, streak: 0xffffff },
  },
  {
    id: "driver",
    name: "기관사",
    cost: 14000,
    blurb: "막차를 몰던 사람 · 출석 보상 2배 · 코인 +15% · 점수 +12%",
    perk: { streakBonus: 2, coinBonus: 1.15, scoreBonus: 1.12 },
    palette: { shirt: 0x1e3a5f, trim: 0x0d1b2a, pack: 0xffc107, hair: 0x2b2b2b, streak: 0xffd54f },
  },
  {
    id: "nightshift",
    name: "야근러",
    cost: 20000,
    blurb: "아직 퇴근 못 한 사람 · 미션 보상 +30% · 코인 +15% · 점수 +14%",
    perk: { missionBonus: 1.3, coinBonus: 1.15, scoreBonus: 1.14 },
    palette: { shirt: 0x37474f, trim: 0x1c262b, pack: 0xaeea00, hair: 0x263238, streak: 0xc6ff00 },
  },
  {
    id: "sweeper",
    name: "환경미화원",
    cost: 24000,
    blurb: "첫차보다 먼저 나오는 사람 · 호버보드 +40% · 코인 +20% · 점수 +16%",
    perk: { boardTime: 1.4, coinBonus: 1.2, scoreBonus: 1.16 },
    palette: { shirt: 0x84cc16, trim: 0x3f6212, pack: 0xf8fafc, hair: 0x292524, streak: 0xbef264 },
  },
  {
    id: "legend",
    name: "전설",
    cost: 30000,
    blurb: "이름만 남은 러너 · 코인 +35% · 점수 +20%",
    perk: { coinBonus: 1.35, scoreBonus: 1.2 },
    palette: { shirt: 0x1a1a1a, trim: 0x000000, pack: 0xd50000, hair: 0x000000, streak: 0xff1744 },
  },
  {
    id: "athlete",
    name: "육상부",
    cost: 40000,
    blurb: "방과 후 트랙을 도는 사람 · 콤보 유지 +50% · 점수 +22%",
    perk: { comboWindow: 1.5, scoreBonus: 1.22 },
    palette: { shirt: 0x0ea5e9, trim: 0x075985, pack: 0xf43f5e, hair: 0x0c0a09, streak: 0xfef08a },
  },
  {
    id: "attendant",
    name: "역무원",
    cost: 60000,
    blurb: "이 노선을 제일 잘 아는 사람 · XP +25% · 코인 +25% · 점수 +25%",
    perk: { xpBonus: 1.25, coinBonus: 1.25, scoreBonus: 1.25 },
    palette: { shirt: 0x1e40af, trim: 0x172554, pack: 0xe2e8f0, hair: 0x1c1917, streak: 0x60a5fa },
  },
  {
    id: "scarecrow",
    name: "허수아비",
    // The dearest thing in the shop. Every other perk makes a good run better;
    // this one is the only answer to the thing that takes a run away from you,
    // and something bought to stop being hurt is worth more than something
    // bought to score faster.
    cost: 75000,
    blurb: "새를 쫓는 일을 하던 사람 · 까마귀 -30% · 흐림 -50% · 코인 +25% · 점수 +30%",
    // Two crow numbers rather than one, and deliberately so: this is the
    // character bought *because of* the crow, and shortening it alone would
    // still leave the screen as dark as it ever was for as long as it lasted.
    //
    // And the highest score multiplier in the shop on top of them, because a
    // runner sold entirely on damage limitation is a runner nobody buys until
    // they are already losing runs to the thing it protects against. The most
    // expensive skin in the game has to be the best skin in the game on a run
    // where nothing goes wrong, or its price is a tax on being unlucky.
    perk: { crowTime: 0.7, crowVeil: 0.5, coinBonus: 1.25, scoreBonus: 1.3 },
    palette: { shirt: 0xb45309, trim: 0x78350f, pack: 0xfde68a, hair: 0x422006, streak: 0xfbbf24 },
  },
];

export const CHARACTER_IDS = CHARACTERS.map((character) => character.id);

/**
 * The best score multiplier any runner can carry.
 *
 * Derived rather than written down, so a runner added with a bigger number
 * raises the server's ceiling with it instead of having its owner's runs
 * quietly refused by the leaderboard.
 */
export const MAX_CHARACTER_SCORE_BONUS = CHARACTERS.reduce(
  (best, character) => Math.max(best, character.perk?.scoreBonus ?? 1),
  1,
);

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
