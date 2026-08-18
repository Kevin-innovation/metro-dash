/**
 * Build the bundled school list from NEIS open data.
 *
 * Run by hand, not by the build: the output is committed, so the game never
 * calls this API at runtime and nothing in the deployed app needs a key. Re-run
 * it when schools open or close, which is roughly once a year.
 *
 *   NEIS_KEY=... node scripts/fetch-schools.mjs
 *
 * The key is free and issued immediately at https://open.neis.go.kr (회원가입 →
 * 인증키 신청). It is required: without one the endpoint ignores `pIndex` and
 * returns the same first five rows for every page, so the list cannot be walked.
 *
 * The list is optional to the game. Without src/data/schools.json the school
 * form simply has no autocomplete and students type the name themselves, which
 * src/school.js normalises either way.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { LEVELS, REGIONS, baseName, levelLabel, validateSchool } from "../src/school.js";

const ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const PAGE_SIZE = 1000;
const DELAY_MS = 120;

const KEY = process.env.NEIS_KEY;
if (!KEY) {
  console.error("NEIS_KEY 가 필요합니다. https://open.neis.go.kr 에서 무료로 발급받으세요.");
  console.error("  NEIS_KEY=... node scripts/fetch-schools.mjs");
  process.exit(1);
}

/**
 * NEIS spells regions out in full; the game uses the short forms.
 *
 * 광주 and 전남 are not 「광주광역시」/「전라남도」 in this dataset — their offices
 * merged into 전남광주통합특별시 and the rows are tagged with the combined name.
 * Querying the old names returns INFO-200, which reads exactly like a region
 * with no schools, so both quietly went missing from an earlier run.
 */
const NEIS_REGION = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "전남광주통합특별시(광주)", 대전: "대전광역시", 울산: "울산광역시",
  세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도",
  충남: "충청남도", 전북: "전북특별자치도", 전남: "전남광주통합특별시(전남)",
  경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(region, level, page) {
  const params = new URLSearchParams({
    KEY,
    Type: "json",
    pIndex: String(page),
    pSize: String(PAGE_SIZE),
    LCTN_SC_NM: NEIS_REGION[region],
    SCHUL_KND_SC_NM: levelLabel(level),
  });

  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const response = await fetch(`${ENDPOINT}?${params}`);
      const body = await response.json();

      // "No rows" is a real answer; anything else that is not a result set is
      // a failure and must not be mistaken for an empty region. Reading an
      // auth error as "this region has no schools" is exactly how 광주 and
      // 전남 silently vanished from an earlier run.
      const code = body.RESULT?.CODE ?? body.schoolInfo?.[0]?.head?.[1]?.RESULT?.CODE;
      if (code === "INFO-200") return { rows: [], total: 0 };

      const head = body.schoolInfo?.[0]?.head;
      if (!head) throw new Error(`${code ?? "unknown"}: ${body.RESULT?.MESSAGE ?? ""}`);

      return { rows: body.schoolInfo?.[1]?.row ?? [], total: head[0].list_total_count ?? 0 };
    } catch (error) {
      lastError = error;
      // The rate limit clears on its own, so back off generously rather than
      // giving up and writing a file with a hole in it.
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`${region} ${levelLabel(level)} p${page}: ${lastError?.message ?? "실패"}`);
}

async function collect(region, level) {
  const first = await fetchPage(region, level, 1);
  const total = first.total;
  if (!total) return [];

  // Keyed by the school's own code so the overlap between pages collapses.
  const seen = new Map();
  const take = (rows) => rows.forEach((row) => seen.set(row.SD_SCHUL_CODE, row.SCHUL_NM));
  take(first.rows);

  const pages = Math.ceil(total / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    take((await fetchPage(region, level, page)).rows);
    await sleep(DELAY_MS);
  }

  process.stdout.write(`  ${region} ${levelLabel(level)}: ${seen.size}/${total}\n`);
  return [...seen.values()];
}

/**
 * Reduce a full school name to what the game stores.
 *
 * A name that does not rebuild exactly is kept whole — 「한국조리과학고등학교」
 * shortens fine, but the handful of schools whose names do not follow the
 * pattern must not be renamed by this script.
 */
function compact(fullName, level) {
  const base = baseName(fullName);
  return base && `${base}${levelLabel(level)}` === fullName ? base : `=${fullName}`;
}

const path = new URL("../src/data/schools.json", import.meta.url);

/** Keep whatever a previous run managed, so a rate limit costs one region. */
let out = {};
try {
  out = JSON.parse(await readFile(path, "utf8"));
} catch {
  out = {};
}

// Only the levels that are actually missing, so a re-run after a rate limit is
// short. Delete the file to force a full refresh.
const todo = [];
for (const region of REGIONS) {
  for (const level of LEVELS) {
    if (!out[region]?.[level.code]?.length) todo.push([region, level.code]);
  }
}

if (!todo.length) {
  console.log("이미 모두 채워져 있습니다. 새로 받으려면 src/data/schools.json 을 지우세요.");
} else {
  console.log(`받을 항목: ${todo.length}개\n`);
  for (const [region, level] of todo) {
    const names = await collect(region, level);
    out[region] ??= {};
    out[region][level] = names.map((name) => compact(name, level)).sort();
    // Written after each region so an interruption never loses what was got.
    await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
    await writeFile(path, JSON.stringify(out));
  }
}

// Drop anything the rules will not accept, so the autocomplete never offers a
// school that cannot be chosen. In practice this is 「(가칭)」, 「(개교예정)」 and
// 「(폐교)」 entries — places nobody actually attends.
let count = 0;
let literal = 0;
let dropped = 0;
const holes = [];
for (const region of REGIONS) {
  for (const level of LEVELS) {
    const names = out[region]?.[level.code] ?? [];
    const usable = names.filter((entry) => {
      const name = entry.startsWith("=") ? entry.slice(1) : `${entry}${level.label}`;
      if (validateSchool({ region, level: level.code, name }).ok) return true;
      dropped += 1;
      return false;
    });
    if (out[region]) out[region][level.code] = usable;
    if (!usable.length) holes.push(`${region} ${level.label}`);
    count += usable.length;
    literal += usable.filter((name) => name.startsWith("=")).length;
  }
}
await writeFile(path, JSON.stringify(out));
if (dropped) console.log(`선택 불가로 제외: ${dropped}개`);

console.log(`\n${count} schools, ${literal} kept verbatim`);
if (holes.length) console.log(`빠진 항목 (다시 실행하세요): ${holes.join(", ")}`);
else console.log("전 지역 · 전 학교급 채워졌습니다.");
console.log("written to src/data/schools.json");
