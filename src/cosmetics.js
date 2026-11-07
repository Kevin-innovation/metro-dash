/**
 * Things to spend coins on once the characters are bought.
 *
 * Looks and sounds only. None of it touches a hitbox, a score or a timer, so the
 * board stays a measure of playing and no purchase is ever worth having to win.
 * Pure, because the save, the shop and the tests all read it.
 */

export const COSMETIC_SLOTS = [
  { id: "hat", name: "머리 장식", icon: "👑" },
  { id: "trail", name: "썰매 자국", icon: "🛷" },
  { id: "aura", name: "달리기 오라", icon: "✨" },
  { id: "burst", name: "착지 효과", icon: "💥" },
  { id: "coin", name: "코인 색", icon: "🔴" },
  { id: "chime", name: "코인 소리", icon: "🔔" },
  { id: "board", name: "호버보드", icon: "🛹" },
];

const item = (slot, id, name, cost, extra) => ({ id: `${slot}-${id}`, slot, name, cost, ...extra });

export const COSMETICS = [
  item("hat", "antlers", "사슴뿔", 3000, { icon: "🦌", colour: "#a9794a" }),
  item("hat", "ribbon", "빨간 리본", 3000, { icon: "🎀", colour: "#ef4444" }),
  item("hat", "star", "트리 꼭대기 별", 6000, { icon: "⭐", colour: "#ffd54f" }),
  item("hat", "pine", "꼬마 트리", 8000, { icon: "🎄", colour: "#22a35a" }),
  item("hat", "snowman", "눈사람 모자", 10000, { icon: "⛄", colour: "#e8f4ff" }),
  item("hat", "halo", "천사 고리", 20000, { icon: "😇", colour: "#fff3b0" }),
  item("hat", "crown", "황금 왕관", 40000, { icon: "👑", colour: "#ffc933" }),

  item("trail", "ice", "얼음빛", 2000, { colour: "#7dd3fc" }),
  item("trail", "mint", "민트", 2000, { colour: "#5eead4" }),
  item("trail", "rose", "장밋빛", 3000, { colour: "#fb7185" }),
  item("trail", "violet", "보랏빛", 3000, { colour: "#a78bfa" }),
  item("trail", "gold", "금빛", 8000, { colour: "#ffd54f" }),
  item("trail", "flame", "불꽃", 12000, { colour: "#ff7a3c" }),
  item("trail", "snow", "눈부신 흰빛", 12000, { colour: "#ffffff" }),
  item("trail", "rainbow", "무지개", 50000, { colour: "#ff5a8a", rainbow: true }),

  item("aura", "snow", "눈꽃", 4000, { icon: "❄️", colour: "#e0f2fe" }),
  item("aura", "ember", "불씨", 6000, { icon: "🔥", colour: "#ff8a4c" }),
  item("aura", "firefly", "반딧불", 6000, { icon: "🪲", colour: "#bef264" }),
  item("aura", "petal", "꽃잎", 8000, { icon: "🌸", colour: "#f9a8d4" }),
  item("aura", "gold", "금가루", 20000, { icon: "✨", colour: "#ffd54f" }),
  item("aura", "aurora", "오로라", 45000, { icon: "🌌", colour: "#5eead4" }),

  item("burst", "gold", "금빛 충격", 3000, { colour: "#ffd54f" }),
  item("burst", "ice", "얼음 조각", 3000, { colour: "#7dd3fc" }),
  item("burst", "rose", "분홍 폭죽", 5000, { colour: "#f472b6" }),
  item("burst", "leaf", "초록 잎", 5000, { colour: "#4ade80" }),
  item("burst", "flame", "불꽃 착지", 12000, { colour: "#ff7a3c" }),
  item("burst", "rainbow", "무지개 폭죽", 35000, { colour: "#a78bfa", rainbow: true }),

  item("coin", "gold", "황금 코", 4000, { colour: "#ffc933" }),
  item("coin", "ice", "얼음 코", 4000, { colour: "#7dd3fc" }),
  item("coin", "mint", "민트 코", 4000, { colour: "#5eead4" }),
  item("coin", "pink", "분홍 코", 6000, { colour: "#f472b6" }),
  item("coin", "violet", "보라 코", 6000, { colour: "#a78bfa" }),
  item("coin", "white", "진주 코", 15000, { colour: "#f8fafc" }),

  item("chime", "bell", "썰매 방울", 3000, { icon: "🔔", voice: { type: "sine", gain: 0.36, seconds: 0.26, partial: 3 } }),
  item("chime", "marimba", "실로폰", 3000, { icon: "🎵", voice: { type: "sine", gain: 0.42, seconds: 0.12, partial: 4 } }),
  item("chime", "musicbox", "오르골", 8000, { icon: "🎶", voice: { type: "triangle", gain: 0.26, seconds: 0.3, partial: 2 } }),
  item("chime", "chip", "8비트", 8000, { icon: "👾", voice: { type: "square", gain: 0.11, seconds: 0.09, partial: 0 } }),
  item("chime", "harp", "하프", 15000, { icon: "🎼", voice: { type: "triangle", gain: 0.3, seconds: 0.42, partial: 4 } }),

  item("board", "mint", "민트 보드", 3000, { colour: "#5eead4" }),
  item("board", "red", "산타 레드", 3000, { colour: "#ef4444" }),
  item("board", "violet", "보라 보드", 5000, { colour: "#a78bfa" }),
  item("board", "black", "블랙 보드", 8000, { colour: "#334155" }),
  item("board", "gold", "황금 보드", 25000, { colour: "#ffc933" }),
  item("board", "white", "순백 보드", 25000, { colour: "#f8fafc" }),
];

const BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export function cosmeticById(id) {
  return BY_ID.get(id) ?? null;
}

/** What a save says it owns and wears, cut down to what actually exists. */
export function cleanCosmetics(owned, equipped) {
  const cosmetics = Array.from(new Set(Array.isArray(owned) ? owned.filter((id) => BY_ID.has(id)) : []));
  const worn = {};
  for (const { id } of COSMETIC_SLOTS) {
    const wearing = equipped?.[id];
    if (cosmetics.includes(wearing) && BY_ID.get(wearing).slot === id) worn[id] = wearing;
  }
  return { cosmetics, equipped: worn };
}

/** The item worn in a slot, or null. */
export function wornCosmetic(save, slot) {
  return cosmeticById(save.equipped?.[slot]);
}
