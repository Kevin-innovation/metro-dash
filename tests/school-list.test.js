import { describe, expect, it } from "vitest";
import { loadSchoolNames } from "../src/school-list.js";

describe("학교 검색 목록", () => {
  it("DIS를 대구 초 · 중 · 고 검색 목록에 모두 넣는다", async () => {
    for (const level of ["초", "중", "고"]) {
      expect(await loadSchoolNames("대구", level)).toContain("=DIS");
    }
  });

  it("다른 지역에는 DIS를 임의로 넣지 않는다", async () => {
    expect(await loadSchoolNames("서울", "초")).not.toContain("=DIS");
  });
});
