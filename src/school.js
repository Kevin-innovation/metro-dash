import { REJECT, REJECT_MESSAGE, containsProfanity, foldHandle, normalizeHandle } from "./nickname.js";

/**
 * School affiliation.
 *
 * Pure, like nickname.js, so the browser and the Convex backend run the exact
 * same rules — the browser copy is for feedback, the server's is the one that
 * decides.
 *
 * The hard part is not validation but *agreement*: five students from one
 * school typing the name freely produce 「대구 동중」, 「동중」 and 「동중학교」, and
 * the ranking splits three ways. So the region and the level are picked from
 * fixed lists and only the bare name is typed — and whatever school suffix the
 * name was written with is taken off before it becomes a key. 「동」, 「동중」 and
 * 「동중학교」 all land on 「대구 동중학교」, never on 「동중중학교」.
 *
 * A suffix that disagrees with the chosen level is not silently stripped: 중학교
 * plus 「계성초등학교」 is a mistake, not a spelling, and it is refused.
 */

/** Short forms, because 「대구 동중학교」 reads better on a board than the legal name. */
export const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

export const LEVELS = [
  { code: "초", label: "초등학교" },
  { code: "중", label: "중학교" },
  { code: "고", label: "고등학교" },
];

export const SCHOOL_NAME_MAX = 10;

export const REJECT_SCHOOL = {
  REGION: "region",
  LEVEL: "level",
  EMPTY: "school-empty",
  LONG: "school-long",
  MISMATCH: "school-mismatch",
  CHARSET: REJECT.CHARSET,
  PROFANITY: REJECT.PROFANITY,
};

export const REJECT_SCHOOL_MESSAGE = {
  [REJECT_SCHOOL.REGION]: "지역을 골라 주세요",
  [REJECT_SCHOOL.LEVEL]: "초 · 중 · 고를 골라 주세요",
  [REJECT_SCHOOL.EMPTY]: "학교 이름을 입력해 주세요",
  [REJECT_SCHOOL.LONG]: `학교 이름은 ${SCHOOL_NAME_MAX}글자까지 쓸 수 있어요`,
  [REJECT_SCHOOL.MISMATCH]: "고른 학교급과 입력한 이름이 서로 달라요",
  [REJECT_SCHOOL.CHARSET]: REJECT_MESSAGE[REJECT.CHARSET],
  [REJECT_SCHOOL.PROFANITY]: REJECT_MESSAGE[REJECT.PROFANITY],
};

const ALLOWED = /^[가-힣a-zA-Z0-9]+$/;

/**
 * Every way a level is written at the end of a school name, longest first so
 * 「중학교」 is matched before the 「중」 inside it.
 *
 * 「여중」 and 「남고」 are a gendered prefix fused with the level, so they expand
 * back to 「여자」/「남자」 rather than vanishing — otherwise 「성화여중」 would
 * reduce to 「성화여」 and never meet 「성화여자중학교」.
 */
const SUFFIXES = [
  { pattern: /여자중학교$/, level: "중", keep: "여자" },
  { pattern: /남자중학교$/, level: "중", keep: "남자" },
  { pattern: /여자고등학교$/, level: "고", keep: "여자" },
  { pattern: /남자고등학교$/, level: "고", keep: "남자" },
  { pattern: /여중$/, level: "중", keep: "여자" },
  { pattern: /남중$/, level: "중", keep: "남자" },
  { pattern: /여고$/, level: "고", keep: "여자" },
  { pattern: /남고$/, level: "고", keep: "남자" },
  { pattern: /초등학교$/, level: "초", keep: "" },
  { pattern: /중학교$/, level: "중", keep: "" },
  { pattern: /고등학교$/, level: "고", keep: "" },
  { pattern: /초등$/, level: "초", keep: "" },
  { pattern: /중등$/, level: "중", keep: "" },
  { pattern: /고등$/, level: "고", keep: "" },
  { pattern: /초$/, level: "초", keep: "" },
  { pattern: /중$/, level: "중", keep: "" },
  { pattern: /고$/, level: "고", keep: "" },
];

export function levelLabel(code) {
  return LEVELS.find((level) => level.code === code)?.label ?? "";
}

/**
 * Split a typed name into the part that identifies the school and the level its
 * spelling implies, if any.
 *
 * @returns {{ base: string, impliedLevel: string | null }}
 */
export function splitName(raw) {
  const name = normalizeHandle(raw);
  for (const suffix of SUFFIXES) {
    if (!suffix.pattern.test(name)) continue;
    const base = name.replace(suffix.pattern, suffix.keep);
    // The first suffix that matches is the answer, even when nothing is left in
    // front of it: 「중」 and 「여중」 are a level with no school name, and letting
    // them fall through would store a school actually called 「중」 — which is
    // how you end up with 「대구 중중학교」 on the board.
    return { base: base === suffix.keep ? "" : base, impliedLevel: suffix.level };
  }
  return { base: name, impliedLevel: null };
}

/** The identifying part of a typed name, with any level suffix removed. */
export function baseName(raw) {
  return splitName(raw).base;
}

/**
 * @returns {{ ok: true, school: { region: string, level: string, name: string }, label: string }
 *   | { ok: false, reason: string, message: string }}
 */
export function validateSchool({ region, level, name } = {}) {
  const fail = (reason) => ({ ok: false, reason, message: REJECT_SCHOOL_MESSAGE[reason] });

  if (!REGIONS.includes(region)) return fail(REJECT_SCHOOL.REGION);
  if (!LEVELS.some((entry) => entry.code === level)) return fail(REJECT_SCHOOL.LEVEL);

  const { base, impliedLevel } = splitName(name);
  if (!base) return fail(REJECT_SCHOOL.EMPTY);
  if (!ALLOWED.test(base)) return fail(REJECT_SCHOOL.CHARSET);
  if ([...base].length > SCHOOL_NAME_MAX) return fail(REJECT_SCHOOL.LONG);
  // 중학교 + 「계성초등학교」 means one of the two is wrong. Guessing which would
  // put a primary school into the middle-school ranking under a name nobody
  // typed, so it is refused instead.
  if (impliedLevel && impliedLevel !== level) return fail(REJECT_SCHOOL.MISMATCH);
  // A school name sits on the leaderboard exactly like a nickname does, so it
  // gets the same word check.
  if (containsProfanity(base)) return fail(REJECT_SCHOOL.PROFANITY);

  const school = { region, level, name: base };
  return { ok: true, school, label: schoolLabel(school) };
}

/** Identity of a school. Folded, so case and spacing cannot split one in two. */
export function schoolKey({ region, level, name }) {
  return `${region}|${level}|${foldHandle(baseName(name)).collapsed}`;
}

/** What a player sees: 「대구 동중학교」. */
export function schoolLabel(school) {
  if (!school) return "";
  return `${school.region} ${school.name}${levelLabel(school.level)}`;
}

/**
 * Best-effort label while someone is still typing, for the live preview under
 * the form. Never throws and never judges — it just shows what would be stored.
 */
export function previewLabel({ region, level, name }) {
  const base = baseName(name);
  if (!region || !level || !base) return "";
  return schoolLabel({ region, level, name: base });
}
