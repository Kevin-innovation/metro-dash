import { describe, expect, it } from "vitest";
import {
  LEVELS,
  REGIONS,
  REJECT_SCHOOL,
  SCHOOL_NAME_MAX,
  baseName,
  previewLabel,
  schoolKey,
  schoolLabel,
  splitName,
  validateSchool,
} from "../src/school.js";

const ok = (region, level, name) => {
  const result = validateSchool({ region, level, name });
  expect(result.ok, `expected ${region}/${level}/${name} to pass: ${result.message}`).toBe(true);
  return result;
};

describe("한 학교가 한 줄로 모이는지", () => {
  // The whole point of the module: however a student writes it, the same
  // school has to end up on the same row of the ranking.
  it("동 · 동중 · 동중학교 를 모두 같은 학교로 본다", () => {
    const forms = ["동", "동중", "동중학교", "동 중학교", " 동중학교 "];
    const keys = new Set(forms.map((name) => schoolKey({ region: "대구", level: "중", name })));
    expect(keys.size).toBe(1);

    for (const name of forms) {
      expect(ok("대구", "중", name).label).toBe("대구 동중학교");
    }
  });

  it("이름에 학교급을 적어도 '동중중학교'가 되지 않는다", () => {
    for (const name of ["동", "동중", "동중학교"]) {
      const label = ok("대구", "중", name).label;
      expect(label).toBe("대구 동중학교");
      expect(label).not.toContain("중중");
    }
  });

  it("초등학교와 고등학교도 마찬가지다", () => {
    expect(ok("대구", "초", "계성").label).toBe("대구 계성초등학교");
    expect(ok("대구", "초", "계성초").label).toBe("대구 계성초등학교");
    expect(ok("대구", "초", "계성초등학교").label).toBe("대구 계성초등학교");

    expect(ok("서울", "고", "경신").label).toBe("서울 경신고등학교");
    expect(ok("서울", "고", "경신고").label).toBe("서울 경신고등학교");
    expect(ok("서울", "고", "경신고등학교").label).toBe("서울 경신고등학교");
  });

  it("여중 · 여자중학교 를 한 학교로 합친다", () => {
    const a = schoolKey({ region: "대구", level: "중", name: "성화여중" });
    const b = schoolKey({ region: "대구", level: "중", name: "성화여자중학교" });
    expect(a).toBe(b);
    expect(ok("대구", "중", "성화여중").label).toBe("대구 성화여자중학교");
  });

  it("남고도 같은 방식으로 합친다", () => {
    expect(schoolKey({ region: "부산", level: "고", name: "대동남고" })).toBe(
      schoolKey({ region: "부산", level: "고", name: "대동남자고등학교" }),
    );
    expect(ok("부산", "고", "대동남고").label).toBe("부산 대동남자고등학교");
  });

  it("대소문자와 공백으로는 학교가 갈라지지 않는다", () => {
    expect(schoolKey({ region: "경기", level: "중", name: "ABC중" })).toBe(
      schoolKey({ region: "경기", level: "중", name: " abc 중학교 " }),
    );
  });

  it("지역이나 학교급이 다르면 다른 학교다", () => {
    const seoul = schoolKey({ region: "서울", level: "중", name: "동" });
    const daegu = schoolKey({ region: "대구", level: "중", name: "동" });
    const daeguHigh = schoolKey({ region: "대구", level: "고", name: "동" });
    expect(new Set([seoul, daegu, daeguHigh]).size).toBe(3);
  });
});

describe("어떻게 써도 접미사가 겹치지 않는다", () => {
  // A sweep rather than a handful of examples, because 「동중중학교」 is the one
  // outcome that must never appear no matter how a student writes the name.
  const NAMES = ["동", "계성", "한빛", "대구", "성화여자", "대동남자", "ABC", "새들", "중앙", "고운"];

  it("모든 이름 × 모든 표기 × 모든 학교급에서 라벨이 하나로 모인다", () => {
    let checked = 0;
    for (const name of NAMES) {
      for (const level of LEVELS) {
        // Every way the same school could be typed in.
        const written = [name, `${name}${level.code}`, `${name}${level.label}`];
        const results = written.map((form) => validateSchool({ region: "대구", level: level.code, name: form }));

        for (const [i, result] of results.entries()) {
          expect(result.ok, `${written[i]} (${level.label})`).toBe(true);
          // No doubled level token, ever.
          expect(result.label).not.toMatch(/초초|중중|고고|학교학교/);
          // And the label is what a person would write by hand.
          expect(result.label).toBe(`대구 ${name}${level.label}`);
          checked += 1;
        }

        const keys = new Set(results.map((r) => schoolKey(r.school)));
        expect(keys.size, `${name} (${level.label}) 표기가 갈라졌다`).toBe(1);
      }
    }
    expect(checked).toBe(NAMES.length * LEVELS.length * 3);
  });

  it("저장된 라벨을 다시 입력해도 같은 학교다", () => {
    // Someone re-typing what they see on the board must land where they are.
    for (const name of NAMES) {
      for (const level of LEVELS) {
        const first = ok("대구", level.code, name);
        const again = ok("대구", level.code, `${first.school.name}${level.label}`);
        expect(schoolKey(again.school)).toBe(schoolKey(first.school));
        expect(again.label).toBe(first.label);
      }
    }
  });
});

describe("이름 자체가 학교급으로 끝나는 학교", () => {
  // 「대구중학교」 is a real school whose name is 「대구」. Stripping the suffix is
  // exactly right here, and the region repeating in the label is correct.
  it("대구중학교 는 이름이 '대구'다", () => {
    expect(ok("대구", "중", "대구중학교").label).toBe("대구 대구중학교");
    expect(ok("대구", "중", "대구중").label).toBe("대구 대구중학교");
  });

  it("접미사만 남는 입력은 이름으로 치지 않는다", () => {
    for (const name of ["중", "고", "초", "중학교", "여중", "남고"]) {
      const result = validateSchool({ region: "대구", level: "중", name });
      expect(result.ok, `'${name}' 는 통과하면 안 된다`).toBe(false);
    }
  });
});

describe("고른 학교급과 이름이 어긋날 때", () => {
  it("중학교를 고르고 초등학교 이름을 쓰면 거절한다", () => {
    const result = validateSchool({ region: "대구", level: "중", name: "계성초등학교" });
    expect(result).toMatchObject({ ok: false, reason: REJECT_SCHOOL.MISMATCH });
  });

  it("초등학교를 고르고 '동중'을 쓰면 거절한다", () => {
    // Silently stripping here would file a middle school under 「대구 동초등학교」,
    // a school that does not exist and that nobody typed.
    expect(validateSchool({ region: "대구", level: "초", name: "동중" })).toMatchObject({
      ok: false,
      reason: REJECT_SCHOOL.MISMATCH,
    });
  });

  it("고등학교를 고르고 여중 이름을 쓰면 거절한다", () => {
    expect(validateSchool({ region: "대구", level: "고", name: "성화여중" })).toMatchObject({
      ok: false,
      reason: REJECT_SCHOOL.MISMATCH,
    });
  });

  it("접미사가 없는 이름은 어느 학교급에도 붙는다", () => {
    for (const level of LEVELS) {
      expect(validateSchool({ region: "대구", level: level.code, name: "동" }).ok).toBe(true);
    }
  });
});

describe("입력 검증", () => {
  it("목록에 없는 지역과 학교급을 거절한다", () => {
    expect(validateSchool({ region: "대구시", level: "중", name: "동" })).toMatchObject({
      reason: REJECT_SCHOOL.REGION,
    });
    expect(validateSchool({ region: "대구", level: "대", name: "동" })).toMatchObject({
      reason: REJECT_SCHOOL.LEVEL,
    });
    expect(validateSchool({})).toMatchObject({ reason: REJECT_SCHOOL.REGION });
  });

  it("빈 이름과 너무 긴 이름을 거절한다", () => {
    expect(validateSchool({ region: "대구", level: "중", name: "   " })).toMatchObject({
      reason: REJECT_SCHOOL.EMPTY,
    });
    const long = "가".repeat(SCHOOL_NAME_MAX + 1);
    expect(validateSchool({ region: "대구", level: "중", name: long })).toMatchObject({
      reason: REJECT_SCHOOL.LONG,
    });
    expect(validateSchool({ region: "대구", level: "중", name: "가".repeat(SCHOOL_NAME_MAX) }).ok).toBe(
      true,
    );
  });

  it("한글 · 영문 · 숫자 밖의 글자를 거절한다", () => {
    for (const name of ["동★", "동!", "ㄷ", "동<b>"]) {
      expect(validateSchool({ region: "대구", level: "중", name }).ok, name).toBe(false);
    }
  });

  it("닉네임과 같은 금칙어 검사를 학교 이름에도 건다", () => {
    // A school name is displayed on the board, so it is one more place to try
    // writing something. It goes through the same list.
    expect(validateSchool({ region: "대구", level: "중", name: "시발" })).toMatchObject({
      reason: REJECT_SCHOOL.PROFANITY,
    });
  });

  it("모든 지역과 학교급 조합이 실제로 통과한다", () => {
    for (const region of REGIONS) {
      for (const level of LEVELS) {
        expect(validateSchool({ region, level: level.code, name: "한빛" }).ok).toBe(true);
      }
    }
  });
});

describe("미리보기", () => {
  it("입력하는 동안 저장될 이름을 그대로 보여준다", () => {
    expect(previewLabel({ region: "대구", level: "중", name: "동중" })).toBe("대구 동중학교");
    expect(previewLabel({ region: "대구", level: "중", name: "동" })).toBe("대구 동중학교");
  });

  it("아직 덜 골랐으면 아무것도 보여주지 않는다", () => {
    expect(previewLabel({ region: "", level: "중", name: "동" })).toBe("");
    expect(previewLabel({ region: "대구", level: "", name: "동" })).toBe("");
    expect(previewLabel({ region: "대구", level: "중", name: "" })).toBe("");
  });
});

describe("보조 함수", () => {
  it("splitName 이 이름과 유추된 학교급을 함께 준다", () => {
    expect(splitName("동중")).toEqual({ base: "동", impliedLevel: "중" });
    expect(splitName("동")).toEqual({ base: "동", impliedLevel: null });
    expect(baseName("계성초등학교")).toBe("계성");
  });

  it("schoolLabel 은 값이 없으면 빈 문자열이다", () => {
    expect(schoolLabel(null)).toBe("");
    expect(schoolLabel(undefined)).toBe("");
  });
});
