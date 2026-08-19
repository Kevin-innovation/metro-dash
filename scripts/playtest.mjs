/**
 * Play the game.
 *
 * Everything else that checks this project checks a model of it: the unit tests
 * check the rules, the fairness audit checks the spawner without a renderer,
 * the boot check loads the page and looks for exceptions. None of them ever
 * dodges anything. A layout can be provably clearable and still kill you,
 * because clearing it means the collision test, the player physics, the camera
 * and the input path all agreeing at sixty frames a second — and those are
 * exactly the parts a model leaves out.
 *
 * So this drives the real build in a real browser with real key events, reads
 * what is coming out of the live entity pool, and plays. It reports how far it
 * got, what killed it, and anything the console said on the way.
 *
 * The bot is deliberately ordinary: it reads one row ahead and answers it the
 * way the rules say it should be answered. It is not meant to be good — it is
 * meant to be a fair test of whether the game can be played at all.
 *
 *   node scripts/playtest.mjs [runs] [seconds] [url]
 */

import { chromium } from "playwright";

const RUNS = Number(process.argv[2] ?? 3);
const SECONDS = Number(process.argv[3] ?? 150);
const URL = process.argv[4] ?? "http://localhost:5173/";

/**
 * The bot, as source, injected into the page.
 *
 * Runs off the game's own animation frames rather than from the test process:
 * a decision made a hundred milliseconds late is a decision made after the
 * obstacle has already arrived.
 */
const BOT = () => {
  const game = window.__metroDash;
  if (!game) return "게임 핸들 없음";

  const CLEAR = { barrier: "jump", crate: "jump", sign: "slide" };
  const LANES = [-1, 0, 1];
  const log = [];
  window.__bot = { log, deaths: [], frames: 0, alive: true, seen: { sections: {}, powerups: 0, levelUps: 0, best: 0, hudPeek: null } };

  // What the run actually showed, rather than what the code says it would.
  const watch = () => {
    const bot = window.__bot;
    bot.seen.best = Math.max(bot.seen.best, Math.round(game.run.score));
    const section = game.section?.event?.name;
    if (section) bot.seen.sections[section] = (bot.seen.sections[section] ?? 0) + 1;
    const live = Object.values(game.run.powerups ?? {}).filter((t) => t > 0).length;
    if (live > (bot.seen.livePowerups ?? 0)) bot.seen.powerups += 1;
    bot.seen.livePowerups = live;
    // One look at the HUD while a section is on, for the overlap check.
    if (section && !bot.seen.hudPeek) {
      const box = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.bottom)];
      };
      bot.seen.hudPeek = {
        section,
        score: box("score"),
        combo: box("combo"),
        event: box("event-chip"),
        powerups: box("powerup-stack"),
        toast: box("speed-toast"),
      };
    }
  };

  const key = (code) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
  };

  /** Hazards grouped into rows, nearest first. */
  const rowsAhead = () => {
    const p = game.player;
    const rows = [];
    for (const item of game.pool.live) {
      if (!item.lethal || item.taken) continue;
      // A train is twelve metres long: its centre can be behind the runner
      // while its body is still alongside. Dropping it there is how a bot
      // swerves into the side of something it has half passed.
      const tail = item.z + item.length / 2;
      if (tail < p.z - 0.5 || item.z - p.z > 90) continue;
      const distance = item.z - p.z;
      let row = rows.find((r) => Math.abs(r.z - item.z) <= 4.2);
      if (!row) {
        row = { z: item.z, items: [], lanes: new Set() };
        rows.push(row);
      }
      row.items.push(item);
      row.lanes.add(item.lane);
      row.z = Math.min(row.z, item.z);
    }
    return rows.sort((a, b) => a.z - b.z);
  };

  const decide = () => {
    const p = game.player;
    if (!p.alive) return;
    const rows = rowsAhead();
    if (!rows.length) return;

    const row = rows[0];
    const speed = Math.max(1, game.speed);
    const eta = (row.z - p.z) / speed;
    const mine = row.items.filter((item) => item.lane === p.lane);
    const free = LANES.filter((lane) => !row.lanes.has(lane));

    // Where to stand: a lane that is clear through this row and, where there is
    // a choice, through the one after it too. Decided early — a lane change
    // takes about two tenths of a second to settle, and a swerve begun later
    // than that arrives at the obstacle still halfway between lanes.
    // A wall still leaves a choice of lane: some of them may hold something
    // that cannot be jumped, slid under or ridden, and standing there is fatal
    // however well the wall itself is answered.
    const deadly = new Set(
      row.items.filter((item) => !CLEAR[item.type] && !item.rideable).map((item) => item.lane),
    );
    const standable = LANES.filter((lane) => !deadly.has(lane));
    if (!free.length && deadly.size && standable.length && eta < 1.4 && eta > 0.26) {
      if (!standable.includes(p.lane)) {
        const step = standable.sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane))[0];
        return key(step > p.lane ? "ArrowLeft" : "ArrowRight");
      }
    }

    const next = rows[1];
    if (free.length && eta < 1.4) {
      // Chosen once per row and held. Recomputing every frame let the choice
      // flip between two equally good lanes as the row behind it came into
      // range, and each flip costs two tenths of a second of sideways travel —
      // enough to be halfway between lanes when the row arrives.
      const commit = window.__bot.commit;
      let wanted;
      if (commit && Math.abs(commit.rowZ - row.z) < 3) {
        wanted = commit.lane;
      } else {
        wanted = free
          .slice()
          .sort((a, b) => {
            const clearA = next && next.lanes.has(a) ? 1 : 0;
            const clearB = next && next.lanes.has(b) ? 1 : 0;
            if (clearA !== clearB) return clearA - clearB;
            return Math.abs(a - p.lane) - Math.abs(b - p.lane);
          })[0];
        window.__bot.commit = { rowZ: row.z, lane: wanted };
      }
      if (wanted !== p.lane && eta > 0.26) {
        return key(wanted > p.lane ? "ArrowLeft" : "ArrowRight");
      }
    }

    if (!mine.length) return;

    // The move the row demands, not the one the nearest object suggests: a gate
    // wall with a train in it is still a gate wall.
    const answer =
      mine.map((item) => CLEAR[item.type]).find(Boolean) ??
      row.items.map((item) => CLEAR[item.type]).find(Boolean) ??
      null;
    const blocking = mine[0];

    if (answer === "jump" && eta < 0.32 && !p.jumping) return key("ArrowUp");
    if (answer === "slide" && eta < 0.45 && !p.sliding) return key("ArrowDown");
    // A wall of vehicles: land on the roof.
    if (!answer && blocking.rideable && eta < 0.38 && !p.jumping && !p.mounted) {
      return key("ArrowUp");
    }
  };

  const tick = () => {
    const bot = window.__bot;
    bot.frames += 1;
    if (game.state === "playing") {
      bot.alive = true;
      try {
        decide();
        watch();
      } catch (error) {
        log.push(`판단 실패: ${error.message}`);
      }
    } else if (game.state === "dead" && bot.alive) {
      bot.alive = false;
      const p = game.player;
      const near = game.pool.live
        .filter((item) => item.lethal && Math.abs(item.z - p.z) < 8)
        .map((item) => `${item.type}(lane ${item.lane})`);
      bot.deaths.push({
        at: Math.round(game.runTime),
        score: Math.round(game.run.score),
        lane: p.lane,
        y: Number(p.y.toFixed(2)),
        near: near.join(", ") || "주변에 아무것도 없음",
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return "봇 시작";
};

const browser = await chromium.launch();
const results = [];

for (let run = 1; run <= RUNS; run++) {
  const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(URL);
  await page.waitForSelector("#title-screen", { state: "visible", timeout: 20000 });
  await page.waitForTimeout(1200);
  console.log(await page.evaluate(BOT));

  await page.click("#btn-play");

  const deadline = Date.now() + SECONDS * 1000;
  let best = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const game = window.__metroDash;
      return {
        state: game.state,
        time: Math.round(game.runTime),
        score: Math.round(game.run.score),
        deaths: window.__bot.deaths.length,
        frames: window.__bot.frames,
      };
    });
    best = Math.max(best, state.time);
    if (state.state === "dead") {
      // Straight back in, the way a player would.
      await page.waitForTimeout(900);
      await page.evaluate(() => window.__metroDash.startRun());
    }
  }

  const summary = await page.evaluate(() => ({
    deaths: window.__bot.deaths,
    log: window.__bot.log.slice(0, 5),
    frames: window.__bot.frames,
    seen: window.__bot.seen,
    profile: {
      coins: window.__metroDash.store.data.coins,
      xp: window.__metroDash.store.data.xp,
      streak: window.__metroDash.store.data.streak,
      best: window.__metroDash.store.data.best,
    },
  }));
  await page.screenshot({ path: `/tmp/playtest-${run}.png` });
  results.push({ run, best, errors, ...summary });
  await page.close();
}

await browser.close();

for (const result of results) {
  console.log(`\n[${result.run}판] 최장 생존 ${result.best}초 · 프레임 ${result.frames} · 죽음 ${result.deaths.length}회`);
  for (const death of result.deaths.slice(0, 8)) {
    console.log(`   ${String(death.at).padStart(3)}초  ${String(death.score).padStart(6)}점  lane ${death.lane} y ${death.y}  주변: ${death.near}`);
  }
  const seen = result.seen ?? {};
  const sections = Object.keys(seen.sections ?? {});
  console.log(`   최고 점수 ${seen.best?.toLocaleString() ?? 0} · 구간 ${sections.length ? sections.join(", ") : "못 봄"} · 파워업 ${seen.powerups ?? 0}회`);
  console.log(`   저장된 프로필: 코인 ${result.profile.coins} · XP ${result.profile.xp} · 연속 ${result.profile.streak}일 · 최고 ${result.profile.best}`);
  if (seen.hudPeek) {
    const peek = seen.hudPeek;
    const rows = ["score", "combo", "event", "powerups", "toast"]
      .map((k) => (peek[k] ? `${k} ${peek[k][0]}~${peek[k][1]}` : null))
      .filter(Boolean);
    let overlap = "겹침 없음";
    const boxes = ["score", "combo", "event", "powerups", "toast"].map((k) => peek[k]).filter(Boolean);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (boxes[i][1] > boxes[j][0] && boxes[j][1] > boxes[i][0]) overlap = "겹침 있음!";
    console.log(`   구간 중 HUD (${peek.section}): ${rows.join(" | ")} → ${overlap}`);
  }
  if (result.log.length) console.log("   봇 로그:", result.log.join(" | "));
  console.log("   콘솔 오류:", result.errors.length ? result.errors.slice(0, 3).join(" | ") : "없음");
}
