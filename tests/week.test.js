import { describe, expect, it } from "vitest";
import { KST_OFFSET_MS, weekEnd, weekKey, weekLabel, weekStart } from "../src/week.js";
import { seasonAt } from "../src/release.js";

/** The KST weekday of an epoch moment. 0 is Sunday, 6 is Saturday. */
const kstDay = (ms) => new Date(ms + KST_OFFSET_MS).getUTCDay();
/** KST wall-clock, for asserting a boundary lands on midnight. */
const kstClock = (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16);

describe("주는 토요일에 넘어간다", () => {
  it("어느 순간을 넣어도 시작과 끝이 토요일 0시다", () => {
    // 학교의 한 주는 금요일에 끝난다. 월요일 아침에 초기화하는 보드는 주말을
    // 버리는 것이다 — 실제로 게임할 시간이 있는 이틀을.
    for (let i = 0; i < 400; i++) {
      const ms = Date.UTC(2026, 0, 1) + i * 13 * 60 * 60 * 1000;
      expect(kstDay(weekStart(ms)), String(i)).toBe(6);
      expect(kstClock(weekStart(ms)), String(i)).toBe("00:00");
      expect(kstDay(weekEnd(ms)), String(i)).toBe(6);
    }
  });

  it("한 주는 정확히 7일이고 빈틈도 겹침도 없다", () => {
    const ms = Date.UTC(2026, 8, 9);
    expect(weekEnd(ms) - weekStart(ms)).toBe(7 * 24 * 60 * 60 * 1000);
    // 한 주의 끝은 다음 주의 시작과 같은 순간이다.
    expect(weekStart(weekEnd(ms))).toBe(weekEnd(ms));
    // 그리고 그 순간부터 키가 바뀐다.
    expect(weekKey(weekEnd(ms) - 1)).not.toBe(weekKey(weekEnd(ms)));
  });

  it("금요일 23:59 와 토요일 00:00 은 다른 주다", () => {
    // 이번 판의 경계. 2026-09-12 00:00 KST = 2026-09-11 15:00 UTC.
    const turn = Date.UTC(2026, 8, 11, 15, 0, 0);
    expect(weekKey(turn - 60_000)).not.toBe(weekKey(turn));
    expect(weekStart(turn)).toBe(turn);
  });

  it("라벨은 그 주 토요일이 속한 달을 따른다", () => {
    expect(weekLabel(Date.UTC(2026, 8, 11, 15, 0, 0))).toBe("9월 2주차");
  });
});

describe("시즌", () => {
  it("점수 규칙이 바뀌는 그 주부터 시즌 4다", () => {
    // 시즌은 달력이 아니라 규칙 묶음이다. 시즌 4는 「1분 20만 · 3분이 끝」으로
    // 치러지는 첫 주고, 그 앞은 이제 존재하지 않는 단위로 매겨진 점수들이다.
    const turn = Date.UTC(2026, 8, 11, 15, 0, 0);
    expect(seasonAt(turn - 1)).toBe(3);
    expect(seasonAt(turn)).toBe(4);
    expect(seasonAt(turn + 90 * 24 * 60 * 60 * 1000)).toBe(4);
  });

  it("시즌이 바뀌는 순간은 주가 바뀌는 순간이다", () => {
    // 둘이 어긋나면 한 주가 두 시즌에 걸친다.
    const turn = Date.UTC(2026, 8, 11, 15, 0, 0);
    expect(weekStart(turn)).toBe(turn);
  });
});
