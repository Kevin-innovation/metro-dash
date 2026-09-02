import { describe, expect, it } from "vitest";
import { EVENTS } from "../src/events.js";
import { RunSchedule } from "../src/schedule.js";
import { ZONES, ZONE_FADE, mixColor } from "../src/zones.js";

/** A run's layout, pinned to a seed so a failure can be reproduced. */
const run = (seed = 7) => new RunSchedule(seed);

/** The first stretch of `id` in a run, as `{ zone, from, to }`. */
function firstSpan(schedule, id, until = 900) {
  schedule.extendZones(until);
  return schedule.zones.find((span) => span.zone.id === id) ?? null;
}

/** The span before it, so a boundary can be approached from the right side. */
function spanBefore(schedule, span) {
  return schedule.zones[schedule.zones.indexOf(span) - 1] ?? null;
}

describe("구간 전환", () => {
  it("어느 판이든 지상에서 시작한다", () => {
    // The opening is the tutorial patterns and a player's first look at the
    // game; it is the one stretch that is not shuffled.
    for (let seed = 0; seed < 40; seed++) {
      expect(run(seed).zoneAt(0).id, `seed ${seed}`).toBe("surface");
      expect(run(seed).zoneAt(-5).id, `seed ${seed}`).toBe("surface");
    }
  });

  it("끝나지 않고 계속 이어진다", () => {
    // The last zone used to run forever, so a long run was night for minutes.
    const schedule = run();
    expect(schedule.zoneAt(10_000)).toBeTruthy();
    schedule.extendZones(10_000);
    expect(schedule.zones.length).toBeGreaterThan(50);
  });

  it("같은 구간이 연달아 오지 않는다", () => {
    // Two adjacent stretches of the same zone read as the boundary having
    // failed rather than as a choice.
    for (let seed = 0; seed < 60; seed++) {
      const schedule = run(seed);
      schedule.extendZones(900);
      for (let i = 1; i < schedule.zones.length; i++) {
        expect(schedule.zones[i].zone, `seed ${seed} @${i}`).not.toBe(schedule.zones[i - 1].zone);
      }
    }
  });

  it("경계 전에 미리 섞이기 시작한다", () => {
    const schedule = run();
    const tunnel = firstSpan(schedule, "tunnel");
    const before = spanBefore(schedule, tunnel);
    expect(before).toBeTruthy();

    // Already changing as the tunnel mouth comes into view, not at the line.
    expect(schedule.zoneBlend(tunnel.from - ZONE_FADE - 1).k).toBe(0);
    expect(schedule.zoneBlend(tunnel.from - ZONE_FADE / 2).k).toBeCloseTo(0.5, 5);
    expect(schedule.zoneBlend(tunnel.from - 0.001).k).toBeCloseTo(1, 3);

    // At the line the pair flips to the one after and k restarts, so the
    // reading to check is the look itself: it must arrive on the tunnel's own
    // numbers and not jump.
    const arrived = schedule.lookAt(tunnel.from);
    expect(arrived.sun).toBeCloseTo(tunnel.zone.sun, 6);
    expect(arrived.ceiling).toBe(tunnel.zone.ceiling);
    expect(schedule.lookAt(tunnel.from - 0.001).sun).toBeCloseTo(tunnel.zone.sun, 2);
  });
});

describe("판마다 다른 코스", () => {
  const layout = (seed) => {
    const schedule = run(seed);
    schedule.extendZones(600);
    schedule.extendSections(600);
    return {
      zones: schedule.zones.map((z) => `${z.zone.id}@${Math.round(z.from)}`).join(" "),
      sections: schedule.sections.map((x) => `${x.event.id}@${Math.round(x.from)}`).join(" "),
    };
  };

  it("두 판의 구간 순서가 같지 않다", () => {
    // The whole point: the tunnel used to arrive at 34 seconds of every run
    // ever played, so the course could be learned and then recited.
    const seen = new Set();
    for (let seed = 0; seed < 50; seed++) seen.add(layout(seed).zones);
    expect(seen.size).toBeGreaterThan(45);
  });

  it("두 판의 섹션 순서와 시각이 같지 않다", () => {
    const seen = new Set();
    for (let seed = 0; seed < 50; seed++) seen.add(layout(seed).sections);
    expect(seen.size).toBeGreaterThan(45);
  });

  it("같은 시드는 같은 판이다", () => {
    // A run has to be replayable: the fairness audit sweeps seeds, and a bug
    // report is one number.
    expect(layout(1234)).toEqual(layout(1234));
  });

  it("섹션 배분은 모두에게 같다", () => {
    // Shuffling rather than sampling is what keeps this fair. A leaderboard
    // where one player got three coin rushes and another got none would not be
    // measuring the same thing twice.
    const counts = {};
    for (let seed = 0; seed < 400; seed++) {
      const schedule = run(seed);
      schedule.extendSections(900);
      for (const s of schedule.sections) counts[s.event.id] = (counts[s.event.id] ?? 0) + 1;
    }
    const seen = EVENTS.map((e) => counts[e.id] ?? 0);
    const spread = (Math.max(...seen) - Math.min(...seen)) / Math.max(...seen);
    expect(spread).toBeLessThan(0.1);
  });

  it("같은 섹션이 연달아 오지 않는다", () => {
    for (let seed = 0; seed < 60; seed++) {
      const schedule = run(seed);
      schedule.extendSections(900);
      for (let i = 1; i < schedule.sections.length; i++) {
        expect(schedule.sections[i].event, `seed ${seed}`).not.toBe(
          schedule.sections[i - 1].event,
        );
      }
    }
  });

  it("섹션이 서로 겹치지 않는다", () => {
    for (let seed = 0; seed < 60; seed++) {
      const schedule = run(seed);
      schedule.extendSections(900);
      for (let i = 1; i < schedule.sections.length; i++) {
        expect(schedule.sections[i].from, `seed ${seed}`).toBeGreaterThan(
          schedule.sections[i - 1].to,
        );
      }
    }
  });
});

describe("보간", () => {
  it("색을 채널별로 섞는다", () => {
    // Blending the packed integer would bleed blue into green.
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(mixColor(0x123456, 0xabcdef, 0)).toBe(0x123456);
    expect(mixColor(0x123456, 0xabcdef, 1)).toBe(0xabcdef);
  });

  it("어느 시점에서도 값이 튀지 않는다", () => {
    const schedule = run();
    let previous = schedule.lookAt(0);
    for (let t = 0.25; t <= 600; t += 0.25) {
      const now = schedule.lookAt(t);
      // A quarter second must never move the light more than a hair, or the
      // transition reads as a flicker rather than a change of place.
      expect(Math.abs(now.sun - previous.sun), `t=${t}`).toBeLessThan(0.12);
      expect(Math.abs(now.hemi - previous.hemi), `t=${t}`).toBeLessThan(0.12);
      expect(Math.abs(now.fog[0] - previous.fog[0]), `t=${t}`).toBeLessThan(0.06);
      previous = now;
    }
  });

  it("벽이 서 있는 동안에는 반드시 천장이 있다", () => {
    // The bug this replaces: for the four seconds of a surface→tunnel fade the
    // walls rose with no roof above them, so a jump went up past the wall tops
    // into open sky — and with no ceiling there was nothing to stop it either.
    const schedule = run();
    for (let t = 0; t <= 600; t += 0.1) {
      const look = schedule.lookAt(t);
      if (look.wall > 0.02) {
        expect(look.ceiling, `t=${t.toFixed(1)} 벽=${look.wall.toFixed(2)}`).not.toBeNull();
      }
    }
  });

  it("천장이 열린 하늘에서 내려와 자리를 잡는다", () => {
    // A seed whose first tunnel is entered from open sky, which is the case
    // the descending roof exists for.
    for (let seed = 0; seed < 60; seed++) {
      const schedule = run(seed);
      const tunnel = firstSpan(schedule, "tunnel");
      const before = spanBefore(schedule, tunnel);
      if (!before || before.zone.ceiling !== null) continue;

      const early = schedule.lookAt(tunnel.from - ZONE_FADE * 0.75).ceiling;
      const mid = schedule.lookAt(tunnel.from - ZONE_FADE * 0.4).ceiling;
      // Descending, not appearing.
      expect(early).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(tunnel.zone.ceiling);
      expect(schedule.lookAt(tunnel.from).ceiling).toBeCloseTo(tunnel.zone.ceiling, 5);
      return;
    }
    throw new Error("no seed entered a tunnel from open sky");
  });

  it("트인 구간에서는 천장이 없다", () => {
    const schedule = run();
    schedule.extendZones(900);
    for (const span of schedule.zones) {
      if (span.zone.ceiling !== null) continue;
      // Well clear of the fades on either side.
      const mid = (span.from + span.to) / 2;
      expect(schedule.lookAt(mid).ceiling, `${span.zone.name} @${mid.toFixed(0)}`).toBeNull();
    }
  });

  it("실내에서 실내로 갈 때는 천장 높이만 바뀐다", async () => {
    const { blendLook } = await import("../src/zones.js");
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    const station = ZONES.find((zone) => zone.id === "station");
    const mid = blendLook(tunnel, station, 0.5).ceiling;
    expect(mid).toBeGreaterThan(tunnel.ceiling);
    expect(mid).toBeLessThan(station.ceiling);
  });
});

describe("구간이 실제로 달라 보이는가", () => {
  it("모든 구간의 하늘과 지면이 서로 다르다", () => {
    // The whole point is that the run stops looking like one long corridor.
    const skies = new Set(ZONES.map((zone) => zone.sky.join()));
    const grounds = new Set(ZONES.map((zone) => zone.ground));
    expect(skies.size).toBe(ZONES.length);
    expect(grounds.size).toBe(ZONES.length);
  });

  it("터널이 가장 어둡고 시야가 가장 좁다", () => {
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    for (const zone of ZONES) {
      if (zone === tunnel) continue;
      expect(tunnel.sun).toBeLessThanOrEqual(zone.sun);
      expect(tunnel.fog[1]).toBeLessThanOrEqual(zone.fog[1]);
    }
  });

  it("터널만 슬라이드를 크게 요구한다", () => {
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    const others = ZONES.filter((zone) => zone !== tunnel);
    expect(tunnel.slideBias).toBeGreaterThan(0.3);
    for (const zone of others) expect(zone.slideBias).toBeLessThan(tunnel.slideBias);
  });

  it("천장이 있는 구간은 러너보다 확실히 높다", () => {
    // Slide gates are what enforce the ceiling; the roof itself must never be
    // the thing that touches the player.
    for (const zone of ZONES) {
      if (zone.ceiling !== null) expect(zone.ceiling).toBeGreaterThan(4);
    }
  });

  it("한 판 안에서 실내와 실외를 모두 지난다", () => {
    const indoor = ZONES.some((zone) => zone.ceiling !== null);
    const outdoor = ZONES.some((zone) => zone.ceiling === null);
    expect(indoor && outdoor).toBe(true);
  });
});

describe("터널이 실제로 슬라이드를 요구하는가", () => {
  it("슬라이드 패턴 비중이 눈에 띄게 오른다", async () => {
    const { candidatesFor } = await import("../src/patterns.js");
    const share = (bias) => {
      const pool = candidatesFor(9, bias);
      return pool.filter((p) => p.slide).length / pool.length;
    };
    const plain = share(0);
    const tunnel = share(0.5);

    // Not a token nudge — the section has to feel like a low roof.
    expect(tunnel).toBeGreaterThan(plain * 1.8);
    // But it must not become the only thing in the tunnel.
    expect(tunnel).toBeLessThan(0.55);
  });

  it("비중을 벗어난 값을 넣어도 안전하다", async () => {
    const { candidatesFor } = await import("../src/patterns.js");
    for (const bias of [-1, 0, 1, 4, NaN]) {
      const pool = candidatesFor(9, bias);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.every((p) => p && typeof p.build === "function")).toBe(true);
    }
  });
});

describe("천장이 게임을 막지 않는가", () => {
  it("천장 아래 여유 높이가 모든 장애물 위에 있다", async () => {
    const { CEILING_CLEARANCE, JETPACK_ALTITUDE, SIGN_BAND_TOP } = await import("../src/config.js");

    // A jetpack clamped by the roof must still be over everything lethal, or
    // a power-up turns into a death sentence the moment a tunnel starts.
    //
    // Measured against SIGN_BAND_TOP, which is where the gate actually stops
    // being passable. This used to compare against SIGN_BOARD_TOP — the top of
    // the yellow warning board, 2.3m lower — so a tunnel roof that pressed the
    // jetpack 0.2m *into* the band passed this test for months.
    for (const zone of ZONES) {
      if (zone.ceiling === null) continue;
      const flying = zone.ceiling - CEILING_CLEARANCE;
      expect(flying, `${zone.name} 게이트 위`).toBeGreaterThan(SIGN_BAND_TOP);
      // And it keeps the altitude it flies at everywhere else, so a tunnel does
      // not quietly turn the power-up into something weaker.
      expect(flying, `${zone.name} 순항 고도`).toBeGreaterThanOrEqual(JETPACK_ALTITUDE);
    }
  });

  it("일반 점프와 스니커즈 점프는 천장에 막히지 않는다", async () => {
    const { CEILING_CLEARANCE, GRAVITY, JUMP_V, SNEAKER_JUMP_MULT } = await import(
      "../src/config.js"
    );
    const apex = (v) => (v * v) / (2 * -GRAVITY);

    // Ordinary movement has to feel the same everywhere. Only the jetpack,
    // which flies well above the whole obstacle band, is meant to be capped.
    for (const zone of ZONES) {
      if (zone.ceiling === null) continue;
      const limit = zone.ceiling - CEILING_CLEARANCE;
      expect(apex(JUMP_V), `${zone.name} 일반 점프`).toBeLessThan(limit);
      expect(apex(JUMP_V * SNEAKER_JUMP_MULT), `${zone.name} 스니커즈`).toBeLessThanOrEqual(limit);
    }
  });

  it("어떤 높이에서도 러너의 머리가 천장을 뚫지 않는다", async () => {
    const { CEILING_CLEARANCE, PLAYER_HEIGHT } = await import("../src/config.js");

    // `p.y` is the feet. Clamping those alone left the head a metre inside the
    // roof, which on screen looked like the runner being swallowed by it —
    // the bug this whole set of numbers exists to prevent.
    expect(CEILING_CLEARANCE).toBeGreaterThan(PLAYER_HEIGHT);
    for (const zone of ZONES) {
      if (zone.ceiling === null) continue;
      const head = zone.ceiling - CEILING_CLEARANCE + PLAYER_HEIGHT;
      expect(head, `${zone.name} 머리끝`).toBeLessThan(zone.ceiling);
    }
  });
});
