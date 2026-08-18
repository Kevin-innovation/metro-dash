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

import { writeFile, mkdir } from "node:fs/promises";
import { LEVELS, REGIONS, baseName, levelLabel } from "../src/school.js";

const ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const PAGE_SIZE = 1000;
const DELAY_MS = 120;

const KEY = process.env.NEIS_KEY;
if (!KEY) {
  console.error("NEIS_KEY 가 필요합니다. https://open.neis.go.kr 에서 무료로 발급받으세요.");
  console.error("  NEIS_KEY=... node scripts/fetch-schools.mjs");
  process.exit(1);
}

/** NEIS spells regions out in full; the game uses the short forms. */
const NEIS_REGION = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
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

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${ENDPOINT}?${params}`);
      const body = await response.json();
      if (body.RESULT?.CODE === "INFO-200") return { rows: [], total: 0 }; // no data
      const head = body.schoolInfo?.[0]?.head;
      return {
        rows: body.schoolInfo?.[1]?.row ?? [],
        total: head?.[0]?.list_total_count ?? 0,
      };
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(400 * attempt);
    }
  }
  return { rows: [], total: 0 };
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

const out = {};
let count = 0;
let literal = 0;

for (const region of REGIONS) {
  out[region] = {};
  for (const level of LEVELS) {
    const names = await collect(region, level.code);
    const compacted = names.map((name) => compact(name, level.code)).sort();
    literal += compacted.filter((name) => name.startsWith("=")).length;
    count += compacted.length;
    out[region][level.code] = compacted;
  }
}

await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
const path = new URL("../src/data/schools.json", import.meta.url);
await writeFile(path, JSON.stringify(out));

console.log(`\n${count} schools, ${literal} kept verbatim`);
console.log(`written to src/data/schools.json`);
