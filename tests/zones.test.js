import { describe, expect, it } from "vitest";
import { PHASES } from "../src/pace.js";
import { ZONES, ZONE_FADE, lookAt, mixColor, nextZone, zoneAt, zoneBlend } from "../src/zones.js";

describe("구간 전환", () => {
  it("시작은 지상이다", () => {
    expect(zoneAt(0).id).toBe("surface");
    expect(zoneAt(-5).id).toBe("surface");
  });

  it("시간이 지나면 순서대로 넘어간다", () => {
    expect(ZONES.map((zone) => zoneAt(zone.from).id)).toEqual(ZONES.map((zone) => zone.id));
  });

  it("마지막 구간 뒤로는 넘어가지 않는다", () => {
    const last = ZONES[ZONES.length - 1];
    expect(zoneAt(10_000).id).toBe(last.id);
    expect(nextZone(last)).toBe(last);
  });

  it("구간 경계가 페이즈 경계와 맞는다", () => {
    // The picture changing on a different beat from the speed would read as two
    // unrelated things happening near each other.
    const phaseTimes = new Set(PHASES.map((phase) => phase.t));
    for (const zone of ZONES) {
      expect(phaseTimes.has(zone.from), `${zone.name} (${zone.from}s)`).toBe(true);
    }
  });

  it("경계 전에 미리 섞이기 시작한다", () => {
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    // Already changing as the tunnel mouth comes into view, not at the line.
    expect(zoneBlend(tunnel.from - ZONE_FADE - 1).k).toBe(0);
    expect(zoneBlend(tunnel.from - ZONE_FADE / 2).k).toBeCloseTo(0.5, 5);
    expect(zoneBlend(tunnel.from - 0.001).k).toBeCloseTo(1, 3);

    // At the line the pair flips to tunnel→station and k restarts, so the
    // reading to check is the look itself: it must arrive exactly on the
    // tunnel's own numbers and not jump.
    const arrived = lookAt(tunnel.from);
    expect(arrived.sun).toBeCloseTo(tunnel.sun, 6);
    expect(arrived.ceiling).toBe(tunnel.ceiling);
    expect(lookAt(tunnel.from - 0.001).sun).toBeCloseTo(tunnel.sun, 2);
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
    let previous = lookAt(0);
    for (let t = 0.25; t <= 260; t += 0.25) {
      const now = lookAt(t);
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
    for (let t = 0; t <= 260; t += 0.1) {
      const look = lookAt(t);
      if (look.wall > 0.02) {
        expect(look.ceiling, `t=${t.toFixed(1)} 벽=${look.wall.toFixed(2)}`).not.toBeNull();
      }
    }
  });

  it("천장이 열린 하늘에서 내려와 자리를 잡는다", () => {
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    const early = lookAt(tunnel.from - ZONE_FADE * 0.75).ceiling;
    const mid = lookAt(tunnel.from - ZONE_FADE * 0.4).ceiling;

    // Descending, not appearing.
    expect(early).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(tunnel.ceiling);
    expect(lookAt(tunnel.from).ceiling).toBeCloseTo(tunnel.ceiling, 5);
  });

  it("트인 구간에서는 천장이 없다", () => {
    for (const zone of ZONES) {
      if (zone.ceiling !== null) continue;
      // Well clear of the fades on either side.
      expect(lookAt(zone.from + ZONE_FADE).ceiling).toBeNull();
    }
  });

  it("실내에서 실내로 갈 때는 천장 높이만 바뀐다", () => {
    const tunnel = ZONES.find((zone) => zone.id === "tunnel");
    const station = ZONES.find((zone) => zone.id === "station");
    const mid = lookAt(station.from - ZONE_FADE / 2).ceiling;
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
    const { CEILING_CLEARANCE } = await import("../src/player.js");
    const { SIGN_BOARD_TOP } = await import("../src/config.js");

    // A jetpack clamped by the roof must still be over everything lethal, or
    // a power-up turns into a death sentence the moment a tunnel starts.
    for (const zone of ZONES) {
      if (zone.ceiling === null) continue;
      const flying = zone.ceiling - CEILING_CLEARANCE;
      expect(flying, `${zone.name}`).toBeGreaterThan(SIGN_BOARD_TOP + 0.5);
    }
  });

  it("일반 점프와 스니커즈 점프는 천장에 막히지 않는다", async () => {
    const { CEILING_CLEARANCE } = await import("../src/player.js");
    const { GRAVITY, JUMP_V, SNEAKER_JUMP_MULT } = await import("../src/config.js");
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
    const { CEILING_CLEARANCE } = await import("../src/player.js");
    const { PLAYER_HEIGHT } = await import("../src/config.js");

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
