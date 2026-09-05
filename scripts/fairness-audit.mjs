/**
 * Fairness audit.
 *
 * Every unfair layout so far has been found the same way: someone played, died
 * to something they could not have avoided, and reported it. That finds one
 * case at a time, always after it has already shipped, and only the cases a
 * person happens to hit.
 *
 * This runs the real spawner over a whole run — the same pattern table, the
 * same pacing curve, the same sections and zone biases — and checks every
 * consecutive pair of hazards against what the runner can physically do. It
 * knows how long a jump commits you for, that a slide cannot be renewed until
 * it ends, that landing on a roof is a timed jump rather than any jump, and
 * that a bus coming the other way arrives long before the place it was put.
 *
 * Runs are seeded, so a violation can be reproduced and a fix can be proven.
 *
 *   node scripts/fairness-audit.mjs [runs] [seconds]
 */

import {
  GRAVITY,
  JUMP_V,
  ONCOMING_SPEED,
  SLIDE_TIME,
  SNEAKER_JUMP_MULT,
  START_SPEED,
} from "../src/config.js";
import { oncomingSpeedAt, phaseAt, pressureAt, reactionAt, speedAt } from "../src/pace.js";
import { SLIDE_DEAD_BAND, describeRows, requiredGapSeconds } from "../src/patterns.js";
import { Spawner } from "../src/spawner.js";
import { MAX_TIER } from "../src/tiers.js";
import { RunSchedule } from "../src/schedule.js";

const AIRTIME = (2 * JUMP_V) / -GRAVITY;
const BOOSTED_AIRTIME = (2 * JUMP_V * SNEAKER_JUMP_MULT) / -GRAVITY;

/** Time to notice a hazard and press something. Generous: this is a floor. */
const REACTION = 0.22;

/**
 * The window in which a slide cannot answer a second gate.
 *
 * A slide runs for SLIDE_TIME and cannot be renewed while it is running, so a
 * gate arriving just after the first slide ends leaves no time to start another
 * one. Earlier than that and the first slide is still covering you; later and
 * there is room to react.
 */
// Imported rather than restated: the audit checking a different band from the
// one the spawner enforces is how this stops meaning anything.

const STEP = 1 / 60;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Play one run without a renderer and collect where every hazard ended up.
 *
 * Oncoming vehicles are resolved to where they actually meet the runner, which
 * is far short of where they were placed — that closing distance is the whole
 * reason they are placed so far ahead, and auditing their spawn position would
 * pass layouts the player never survives.
 */
function simulate(seconds, seed) {
  const random = Math.random;
  Math.random = seededRandom(seed);
  try {
    const placements = [];
    let playerZ = 0;
    let time = 0;
    let phaseId = 0;

    const pool = {
      live: [],
      spawn(type, lane, z) {
        const item = { type, lane, z, spawnZ: playerZ, spawnTime: time, oncoming: false };
        placements.push(item);
        return item;
      },
    };
    // A different course per audited run, the way a player now gets one. Seeded
    // from the same number the rest of this run is, so a failure replays.
    const schedule = new RunSchedule(seed);
    const spawner = new Spawner(pool, {
      onOncoming: (item) => {
        item.oncoming = true;
        // What game.js does: base closing speed plus a little more per phase.
        item.closing = oncomingSpeedAt(phaseId);
      },
    });

    spawner.reset(seed);
    spawner.seed(40, 5, 30, { speed: START_SPEED, phaseId: 0, tutorial: true, nextSpawn: 155 });

    while (time < seconds) {
      const speed = speedAt(time);
      phaseId = phaseAt(time).id;
      playerZ += speed * STEP;
      spawner.update(playerZ, {
        speed,
        phaseId,
        reaction: reactionAt(time),
        pressure: pressureAt(time),
        // Swept rather than played out. A real run reaches a tier by scoring,
        // and a simulated runner has no score — so the audit walks the whole
        // ladder across the run instead, which is the only way the layouts
        // gated behind `minTier` are ever checked at all. Without this the
        // hardest patterns in the table would ship having been audited zero
        // times, which is exactly the failure this script exists to prevent.
        tier: Math.min(MAX_TIER, Math.floor((time / seconds) * (MAX_TIER + 1))),
        slideBias: schedule.lookAt(time).slideBias,
        oncomingSpeed: oncomingSpeedAt(phaseId),
        eventPatterns: schedule.eventAt(time)?.event.patterns ?? null,
        tutorial: true,
      });
      time += STEP;
    }

    // Where the runner actually meets each hazard.
    for (const item of placements) {
      if (!item.oncoming) {
        item.metZ = item.z;
        continue;
      }
      const runner = speedAt(item.spawnTime);
      const closing = runner + (item.closing ?? ONCOMING_SPEED);
      const meetIn = Math.max(0, (item.z - item.spawnZ) / closing);
      item.metZ = item.spawnZ + runner * meetIn;
    }

    return placements;
  } finally {
    Math.random = random;
  }
}

/** Seconds into the run at which the runner reaches `z`. */
function makeClock(seconds) {
  const times = [];
  const zs = [];
  let z = 0;
  for (let t = 0; t <= seconds; t += STEP) {
    times.push(t);
    zs.push(z);
    z += speedAt(t) * STEP;
  }
  return (target) => {
    let lo = 0;
    let hi = zs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (zs[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return times[Math.min(lo, times.length - 1)];
  };
}

const ALL_LANES = [-1, 0, 1];
/** A lane change settles in about this long; it can be started in mid-air. */
const LANE_CHANGE = 0.19;

/**
 * Lanes the runner can be in on the far side of a row.
 *
 * A wall leaves all three: it is passed by jumping, sliding or riding it, not
 * by picking a lane, so it puts no constraint on where the runner ends up.
 */
const freeLanes = (row) => (row.isWall ? ALL_LANES : ALL_LANES.filter((lane) => !row.lanes.includes(lane)));

/**
 * Slack before a shortfall is called a fault.
 *
 * The spawner sizes gaps in metres using the speed at the moment it places a
 * pattern, and the runner arrives a couple of seconds later going slightly
 * faster, so a gap set to exactly the requirement measures a hair under it.
 * That is a rounding artefact, not something anyone can feel.
 */
const TOLERANCE = 0.02;

/**
 * How long the runner needs between two hazards, and why.
 *
 * The important case is the cheap one: two rows that are not walls, with a lane
 * free through both, cost nothing at all — the runner picks that lane once and
 * both go by. Charging reaction time for each of them would condemn half the
 * pattern table for a difficulty that does not exist.
 *
 * @returns {{ seconds: number, why: string } | null} null when anything goes
 */
function demand(previous, next) {
  // The rule itself comes from the game — this only explains the answer.
  const seconds = requiredGapSeconds(previous, next);
  if (seconds <= 0) return null;

  const why = !next.isWall
    ? "두 줄을 통과하는 레인이 없음"
    : next.requires === "mount"
      ? previous.requires === "slide"
        ? "슬라이드 뒤 차량 벽(일어서서 타이밍 점프)"
        : "차량 벽(지붕에 착지하는 타이밍 점프)"
      : previous.requires === "jump"
        ? "점프 체공이 끝나야 벽에 답할 수 있음"
        : previous.rideable
          ? "지붕에서 내려와야 함"
          : "벽 반응";
  return { seconds, why };
}

function audit({ runs, seconds }) {
  const clock = makeClock(seconds + 30);
  const found = [];
  let pairs = 0;

  for (let seed = 1; seed <= runs; seed++) {
    const placements = simulate(seconds, seed * 7919);
    const moved = placements.map((item) => ({ ...item, z: item.metZ }));
    const rows = describeRows(moved);
    // Which rows contain something coming the other way, and which were built
    // out of more than one pattern. Both are ways a row appears that no single
    // layout ever declared.
    for (const row of rows) {
      const near = moved.filter((item) => Math.abs(item.z - row.z) <= 6 && item.lane !== undefined);
      row.oncoming = near.some((item) => item.oncoming);
      row.patterns = new Set(near.map((item) => item.spawnTime.toFixed(2))).size;
    }

    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const next = rows[i];
      const at = clock(next.z);
      const speed = speedAt(at);
      const gap = (next.z - previous.z) / speed;
      pairs += 1;

      const need = demand(previous, next);
      if (need && gap < need.seconds - TOLERANCE) {
        found.push({
          seed,
          at,
          gap,
          need: need.seconds,
          why: need.why,
          from: `${previous.requires ?? "회피"}${previous.isWall ? " 벽" : ""}`,
          to: `${next.requires ?? "회피"}${next.isWall ? " 벽" : ""}`,
          tag: `${next.oncoming || previous.oncoming ? "마주오는차량 " : ""}${next.patterns > 1 ? "패턴합성" : "단일패턴"}`,
        });
        continue;
      }

      // A slide cannot be renewed while it is running: a second gate landing
      // just after the first slide ends is unanswerable however far away it is.
      if (previous.requires === "slide" && next.requires === "slide") {
        if (gap > SLIDE_DEAD_BAND[0] + TOLERANCE && gap < SLIDE_DEAD_BAND[1] - TOLERANCE) {
          found.push({
            seed,
            at,
            gap,
            need: SLIDE_DEAD_BAND[1],
            why: `슬라이드 재사용 불가 구간 (${SLIDE_DEAD_BAND[0].toFixed(2)}~${SLIDE_DEAD_BAND[1].toFixed(2)}초)`,
            from: "slide 벽",
            to: "slide 벽",
          });
        }
      }
    }
  }

  return { found, pairs };
}

const runs = Number(process.argv[2] ?? 40);
const seconds = Number(process.argv[3] ?? 420);
const { found, pairs } = audit({ runs, seconds });

console.log(`${runs}판 × ${seconds}초 · 장애물 쌍 ${pairs.toLocaleString()}개 검사`);
console.log(`체공 ${AIRTIME.toFixed(2)}초 (스니커즈 ${BOOSTED_AIRTIME.toFixed(2)}초) · 슬라이드 ${SLIDE_TIME}초 · 반응 ${REACTION}초\n`);

if (!found.length) {
  console.log("피할 수 없는 배치 없음");
  process.exit(0);
}

// Grouped: one line per kind of failure, with the worst example and how often.
const groups = new Map();
for (const hit of found) {
  const key = `${hit.from} → ${hit.to} · ${hit.why} [${hit.tag ?? "-"}]`;
  const entry = groups.get(key) ?? { key, count: 0, worst: hit };
  entry.count += 1;
  if (hit.need - hit.gap > entry.worst.need - entry.worst.gap) entry.worst = hit;
  groups.set(key, entry);
}

console.log(`피할 수 없는 배치 ${found.length}건 (${groups.size}종)\n`);
for (const { key, count, worst } of [...groups.values()].sort((a, b) => b.count - a.count)) {
  console.log(`  ${count}회  ${key}`);
  console.log(
    `        최악: ${worst.at.toFixed(0)}초 지점, 간격 ${worst.gap.toFixed(2)}초 / 필요 ${worst.need.toFixed(2)}초 (seed ${worst.seed})`,
  );
}
process.exit(1);
