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

/**
 * Everyone who is not at a school: teachers, parents, anyone past school age.
 *
 * Modelled as an affiliation like any other so it travels through the same
 * validation, the same one-time choice and the same staff tools — but it is not
 * a school, so `schools:top` leaves it off the school ranking. Without it an
 * adult either has to claim a school they do not attend or stay unaffiliated.
 */
export const GENERAL_LEVEL = "일";
export const GENERAL = { region: "일반", level: GENERAL_LEVEL, name: "일반부", label: "일반부" };

/**
 * Daegu International School is a K–12 affiliation, so it must be findable
 * from every school-level tab. Keep 「국제」 as the stored name for backwards
 * compatibility, while accepting the names people are likely to search for.
 */
const DIS_CANONICAL_NAME = "국제";
const DIS_SEARCH_NAMES = new Set([
  "dis",
  "daeguinternationalschool",
  "대구국제",
  "국제학교",
  "대구국제학교",
  "dis(대구국제학교)",
  "대구국제학교(dis)",
  "daeguinternationalschool(대구국제학교)",
]);

/** The leaderboard label is deliberately just the familiar abbreviation. */
const DIS_SCHOOL_KEY = "대구|DIS";

function isDISSchool(region, level, name) {
  return region === "대구" && ["초", "중", "고"].includes(level) && foldHandle(name).collapsed === DIS_CANONICAL_NAME;
}

function normalizeKnownSchoolName(region, raw) {
  if (region === "대구" && DIS_SEARCH_NAMES.has(foldHandle(raw).base)) {
    return DIS_CANONICAL_NAME;
  }
  return raw;
}

/** @returns {boolean} true for the 일반부 affiliation rather than a real school. */
export function isGeneral(school) {
  return school?.level === GENERAL_LEVEL;
}

/**
 * Long enough for the real ones. Checked against the national list: the longest
 * legitimate name is 「이화여자대학교사범대학부속이화금란」 at seventeen syllables,
 * so anything under that would refuse actual schools.
 */
export const SCHOOL_NAME_MAX = 24;

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
  { pattern: /여자중학교$/, level: "중", keep: "여자", certain: true },
  { pattern: /남자중학교$/, level: "중", keep: "남자", certain: true },
  { pattern: /여자고등학교$/, level: "고", keep: "여자", certain: true },
  { pattern: /남자고등학교$/, level: "고", keep: "남자", certain: true },
  { pattern: /여중$/, level: "중", keep: "여자", certain: true },
  { pattern: /남중$/, level: "중", keep: "남자", certain: true },
  { pattern: /여고$/, level: "고", keep: "여자", certain: true },
  { pattern: /남고$/, level: "고", keep: "남자", certain: true },
  { pattern: /초등학교$/, level: "초", keep: "", certain: true },
  { pattern: /중학교$/, level: "중", keep: "", certain: true },
  { pattern: /고등학교$/, level: "고", keep: "", certain: true },
  { pattern: /초등$/, level: "초", keep: "", certain: true },
  { pattern: /중등$/, level: "중", keep: "", certain: true },
  { pattern: /고등$/, level: "고", keep: "", certain: true },
  // A lone 초/중/고 is usually an abbreviation, but it can also be the last
  // syllable of the name itself — 서초중학교, 서울당중초등학교, 서울서빙고초등학교.
  // So it is stripped only when it agrees with the level already chosen.
  { pattern: /초$/, level: "초", keep: "", certain: false },
  { pattern: /중$/, level: "중", keep: "", certain: false },
  { pattern: /고$/, level: "고", keep: "", certain: false },
];

/**
 * Schools whose official name really does begin with their own region, and
 * which would collide with a different school if that were taken off.
 *
 * There is exactly one nationwide: 인천삼산초등학교 and 삼산초등학교 are two
 * schools, both in 인천. Every other region prefix in the national list is
 * removable without merging two real schools — see `stripRegion`.
 */
const KEEP_REGION_PREFIX = new Set(["인천|초|인천삼산"]);

/**
 * Take the region off the front of a name that already carries it.
 *
 * Most schools outside Seoul are registered with their city in the name —
 * 224 of the 237 primary schools in 대구 are 「대구○○초등학교」. A student writes
 * whichever half they say out loud, so 「범어초」 and 「대구범어초등학교」 arrive as
 * two different names for one school and the ranking splits in two. The region
 * is already known from the menu, so it is dropped from the name and put back
 * by the label, which makes both spellings the same school.
 *
 * The name is only shortened, never lengthened: 「계성초등학교」 in 서울 stays
 * 「계성」 and is shown as 「서울계성초」.
 */
function stripRegion(region, level, name) {
  if (!name.startsWith(region) || name.length === region.length) return name;
  if (KEEP_REGION_PREFIX.has(`${region}|${level}|${name}`)) return name;
  return name.slice(region.length);
}

/**
 * The university whose 부설 school is simply 「사대부」 in each region.
 *
 * Every region has one national university, and its attached school is the one
 * everybody there means by the bare abbreviation — in 대구 that is 경북대, so
 * 경북대학교사범대학부설중학교 is 대구사대부중 to anyone who lives there. Other
 * universities' attached schools keep their name, because 서울 has a dozen of
 * them and dropping the name would make them all the same school.
 */
const REGION_UNIVERSITY = {
  서울: "서울", 부산: "부산", 대구: "경북", 인천: "인천", 광주: "전남",
  대전: "충남", 울산: "울산", 세종: "공주", 경기: "경인", 강원: "강원",
  충북: "충북", 충남: "공주", 전북: "전북", 전남: "순천", 경북: "경북",
  경남: "경상", 제주: "제주",
};

/**
 * Shorten the formal names of attached schools.
 *
 * 「경북대학교사범대학부설」 is seventeen syllables that nobody says out loud and
 * that no leaderboard column can hold. These are the abbreviations people
 * actually use, so the board reads the way the school is spoken about.
 */
function aliasName(region, name) {
  const home = REGION_UNIVERSITY[region];
  if (home && new RegExp(`^${home}대학교사범대학부[설속]`).test(name)) {
    return name.replace(/^[가-힣]+대학교사범대학부[설속]/, "사대부");
  }
  return name
    .replace(/^([가-힣]{2,4})대학교사범대학부[설속]/, "$1대사대부")
    .replace(/^([가-힣]{2,4})교육대학교[가-힣]*부[설속]/, "$1교대부")
    .replace(/^([가-힣]{2,4})대학교교육대학부[설속]/, "$1대교대부");
}

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
    return {
      base: base === suffix.keep ? "" : base,
      impliedLevel: suffix.level,
      certain: suffix.certain,
    };
  }
  return { base: name, impliedLevel: null, certain: false };
}

/** The identifying part of a typed name, with any level suffix removed. */
export function baseName(raw) {
  return splitName(raw).base;
}

/**
 * Work out the name and whether the spelling contradicts the chosen level.
 *
 * 중학교 + 「계성초등학교」 is certainly a mistake and is refused — guessing which
 * half is wrong would file a primary school in the middle-school ranking under
 * a name nobody typed. But 중학교 + 「서초」 is not a mistake at all: 서초중학교 is
 * a real school whose name happens to end in 「초」, so the syllable is left
 * alone and becomes part of the name.
 */
function resolve(name, level) {
  const split = splitName(name);
  // A bare level token is not a name under any reading, so the fallback below
  // must not rescue it into a school called 「고」.
  if (!split.base) return { ...split, mismatch: false };
  if (!split.impliedLevel || split.impliedLevel === level) return { ...split, mismatch: false };
  if (split.certain) return { ...split, mismatch: true };
  return { base: normalizeHandle(name), impliedLevel: null, certain: false, mismatch: false };
}

/**
 * @returns {{ ok: true, school: { region: string, level: string, name: string }, label: string }
 *   | { ok: false, reason: string, message: string }}
 */
export function validateSchool({ region, level, name } = {}) {
  const fail = (reason) => ({ ok: false, reason, message: REJECT_SCHOOL_MESSAGE[reason] });

  // 일반부 carries no region and no name, so it is answered before either is
  // looked at — and answered here rather than at the caller, so every path in
  // and out of the database agrees on what it is.
  if (level === GENERAL_LEVEL) return { ok: true, school: { ...GENERAL }, label: GENERAL.label };

  if (!REGIONS.includes(region)) return fail(REJECT_SCHOOL.REGION);
  if (!LEVELS.some((entry) => entry.code === level)) return fail(REJECT_SCHOOL.LEVEL);

  const split = resolve(normalizeKnownSchoolName(region, name), level);
  if (split.mismatch) return fail(REJECT_SCHOOL.MISMATCH);

  const { base, impliedLevel } = split;
  if (!base) return fail(REJECT_SCHOOL.EMPTY);
  if (!ALLOWED.test(base)) return fail(REJECT_SCHOOL.CHARSET);
  if ([...base].length > SCHOOL_NAME_MAX) return fail(REJECT_SCHOOL.LONG);
  // A school name sits on the leaderboard exactly like a nickname does, so it
  // gets the same word check.
  if (containsProfanity(base)) return fail(REJECT_SCHOOL.PROFANITY);

  // Whether the name is already a complete school name is decided here, while
  // the original spelling is still in hand, and stored with it. It cannot be
  // recovered later: 「용연학교」 is complete but 「서울대학교사범대학부설」 is not,
  // and nothing in the two strings tells them apart.
  const whole = impliedLevel === null && base.includes("학교");
  const name_ = stripRegion(region, level, aliasName(region, base));
  const school = {
    region,
    level,
    name: name_,
    label: schoolDisplayLabel(region, level, name_, composeLabel(region, level, name_, whole)),
  };
  return { ok: true, school, label: school.label };
}

/**
 * What a school is called on the board: 「대구범어초」, 「대구성화여중」.
 *
 * The region leads, because it is the one part every entry has and the part the
 * ranking is read by, and the level is abbreviated the way a school is actually
 * referred to out loud. Written this way the region cannot appear twice, which
 * 「대구 대구동산초등학교」 did as long as the official name was kept whole.
 */
function composeLabel(region, level, name, whole) {
  // A name that already ends in 학교 is complete and takes nothing after it.
  if (whole) return `${region}${name}`;
  // 성화여자 + 중 → 성화여중, not 성화여자중.
  const gender = name.endsWith("여자") ? "여" : name.endsWith("남자") ? "남" : "";
  const stem = gender ? name.slice(0, -2) : name;
  return `${region}${stem}${gender}${level}`;
}

function schoolDisplayLabel(region, level, name, fallback) {
  return isDISSchool(region, level, normalizeKnownSchoolName(region, name)) ? "DIS" : fallback;
}

/**
 * Identity of a school. Takes a school that has already been through
 * `validateSchool`, never raw input. DIS is intentionally one K–12 key rather
 * than one row per selected school level.
 *
 * It deliberately does not strip a suffix again. 「서울당중초등학교」 is a real
 * school whose name is 「서울당중」, and stripping once more would file it as
 * 「서울당」 — colliding with any actual 서울당초등학교 and disagreeing with the
 * name stored beside it.
 */
export function schoolKey({ region, level, name }) {
  const canonicalName = normalizeKnownSchoolName(region, name);
  if (isDISSchool(region, level, canonicalName)) return DIS_SCHOOL_KEY;
  return `${region}|${level}|${foldHandle(canonicalName).collapsed}`;
}

/**
 * What a player sees: 「대구 동중학교」.
 *
 * Reads the label written when the school was validated. The fallback covers
 * rows stored before labels were kept, and simply rebuilds the ordinary form.
 */
export function schoolLabel(school) {
  if (!school) return "";
  const fallback = school.label || composeLabel(school.region, school.level, school.name, false);
  return schoolDisplayLabel(school.region, school.level, school.name, fallback);
}

/**
 * Bring a stored school up to the current rules, for the maintenance pass that
 * rewrites rows written by an older version.
 *
 * The name is not put back through `splitName` — it has already had its suffix
 * taken off once, and a second pass would eat a syllable that is part of the
 * name (「서울당중」 → 「서울당」). Only the region prefix and the label are redone.
 *
 * Whether the name is a complete school name cannot be read off the name alone
 * (「용연학교」 is, 「서울대학교사범대학부설」 is not), so it is recovered from the
 * stored label: a complete name was written with nothing after it. Rows saved
 * before labels were kept fall back to the ending, which is right for every
 * name that is complete because it ends in 학교.
 */
export function canonicalSchool({ region, level, name, label } = {}) {
  if (level === GENERAL_LEVEL) return { ...GENERAL };
  const base = normalizeHandle(normalizeKnownSchoolName(region, name));
  const whole = label
    ? label.replace(/\s+/g, "") === `${region}${base}`
    : base.endsWith("학교");
  // Aliasing is idempotent — 「사대부」 does not match the pattern that produced
  // it — so a row already shortened passes through unchanged.
  const canonical = stripRegion(region, level, aliasName(region, base));
  const fallback = composeLabel(region, level, canonical, whole);
  return { region, level, name: canonical, label: schoolDisplayLabel(region, level, canonical, fallback) };
}

/**
 * Best-effort label while someone is still typing, for the live preview under
 * the form. Never throws and never judges — it just shows what would be stored.
 */
export function previewLabel({ region, level, name }) {
  if (level === GENERAL_LEVEL) return GENERAL.label;
  const { base, impliedLevel } = resolve(normalizeKnownSchoolName(region, name), level);
  if (!region || !level || !base) return "";
  const whole = impliedLevel === null && base.includes("학교");
  const canonical = stripRegion(region, level, aliasName(region, base));
  return schoolDisplayLabel(region, level, canonical, composeLabel(region, level, canonical, whole));
}
