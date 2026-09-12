import { describe, expect, it } from "vitest";
import { DEBUTS, DEBUT_LEAD, debutsBetween } from "../src/debuts.js";
import { HAZARD_FROM_SCORE } from "../src/spawner.js";
import { LANES_FROM_SCORE } from "../src/lanes.js";
import { STORM_FROM_SCORE } from "../src/lightning.js";

describe("새로 나오는 것 예고", () => {
  it("점수로 켜지는 세 가지를 전부 예고한다", () => {
    // The list that matters: anything that switches on at a score and is not on
    // here arrives with no notice, and a hazard nobody was told about is
    // indistinguishable from a bug.
    expect(DEBUTS.map((d) => d.at).sort((a, b) => a - b)).toEqual(
      [HAZARD_FROM_SCORE, LANES_FROM_SCORE, STORM_FROM_SCORE].sort((a, b) => a - b),
    );
    for (const debut of DEBUTS) expect(debut.text.length, debut.id).toBeGreaterThan(4);
  });

  it("일이 벌어지기 전에 말한다", () => {
    for (const debut of DEBUTS) {
      const said = debutsBetween(debut.at - DEBUT_LEAD - 1, debut.at - DEBUT_LEAD);
      expect(said.map((d) => d.id), debut.id).toContain(debut.id);
      // 문턱에 도착해서 말하는 건 예고가 아니다.
      expect(debutsBetween(debut.at - 1, debut.at).map((d) => d.id)).not.toContain(debut.id);
    }
  });

  it("점수가 건너뛰어도 놓치지 않는다", () => {
    // The score moves in jumps — a wheel face, a long combo, a line of coins at
    // once — so a check for 「are we at the number」 misses every threshold that
    // was stepped over rather than landed on.
    const all = debutsBetween(0, 10_000_000);
    expect(all.length).toBe(DEBUTS.length);
  });

  it("같은 구간을 두 번 물어도 두 번 말하지 않게 되어 있다", () => {
    // The span is half-open at the bottom, so consecutive steps that share an
    // edge cannot both claim the same announcement.
    const at = DEBUTS[0].at - DEBUT_LEAD;
    const first = debutsBetween(at - 5, at);
    const second = debutsBetween(at, at + 5);
    expect(first.map((d) => d.id)).toContain(DEBUTS[0].id);
    expect(second.map((d) => d.id)).not.toContain(DEBUTS[0].id);
  });

  it("예고가 서로 겹치지 않는다", () => {
    // Two lines at once is one line nobody reads.
    const points = DEBUTS.map((d) => d.at - DEBUT_LEAD).sort((a, b) => a - b);
    for (let i = 1; i < points.length; i++) {
      expect(points[i] - points[i - 1]).toBeGreaterThan(DEBUT_LEAD);
    }
  });

  it("예고는 판 안에서 닿는 곳에 있다", () => {
    // A warning for something the player will never reach is noise.
    for (const debut of DEBUTS) {
      expect(debut.at - DEBUT_LEAD, debut.id).toBeGreaterThan(0);
    }
  });
});
