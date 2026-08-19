import { describe, expect, it } from "vitest";
import {
  GENERAL,
  GENERAL_LEVEL,
  LEVELS,
  REGIONS,
  REJECT_SCHOOL,
  SCHOOL_NAME_MAX,
  baseName,
  canonicalSchool,
  isGeneral,
  previewLabel,
  schoolKey,
  schoolLabel,
  splitName,
  validateSchool,
} from "../src/school.js";

/** The key a raw input ends up under, via the same path the app takes. */
const keyOf = (region, level, name) => {
  const result = validateSchool({ region, level, name });
  expect(result.ok, `${name}: ${result.message}`).toBe(true);
  return schoolKey(result.school);
};

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
    const keys = new Set(forms.map((name) => keyOf("대구", "중", name)));
    expect(keys.size).toBe(1);

    for (const name of forms) {
      expect(ok("대구", "중", name).label).toBe("대구동중");
    }
  });

  it("이름에 학교급을 적어도 '동중중학교'가 되지 않는다", () => {
    for (const name of ["동", "동중", "동중학교"]) {
      const label = ok("대구", "중", name).label;
      expect(label).toBe("대구동중");
      expect(label).not.toContain("중중");
    }
  });

  it("초등학교와 고등학교도 마찬가지다", () => {
    expect(ok("대구", "초", "계성").label).toBe("대구계성초");
    expect(ok("대구", "초", "계성초").label).toBe("대구계성초");
    expect(ok("대구", "초", "계성초등학교").label).toBe("대구계성초");

    expect(ok("서울", "고", "경신").label).toBe("서울경신고");
    expect(ok("서울", "고", "경신고").label).toBe("서울경신고");
    expect(ok("서울", "고", "경신고등학교").label).toBe("서울경신고");
  });

  it("여중 · 여자중학교 를 한 학교로 합친다", () => {
    const a = keyOf("대구", "중", "성화여중");
    const b = keyOf("대구", "중", "성화여자중학교");
    expect(a).toBe(b);
    expect(ok("대구", "중", "성화여중").label).toBe("대구성화여중");
  });

  it("남고도 같은 방식으로 합친다", () => {
    expect(keyOf("부산", "고", "대동남고")).toBe(keyOf("부산", "고", "대동남자고등학교"));
    expect(ok("부산", "고", "대동남고").label).toBe("부산대동남고");
  });

  it("대소문자와 공백으로는 학교가 갈라지지 않는다", () => {
    expect(keyOf("경기", "중", "ABC중")).toBe(keyOf("경기", "중", " abc 중학교 "));
  });

  it("지역이나 학교급이 다르면 다른 학교다", () => {
    const seoul = keyOf("서울", "중", "동");
    const daegu = keyOf("대구", "중", "동");
    const daeguHigh = keyOf("대구", "고", "동");
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
          // And the label is what a person would write by hand: 대구성화여중,
          // not 대구성화여자중.
          const gender = name.endsWith("여자") ? "여" : name.endsWith("남자") ? "남" : "";
          const stem = gender ? name.slice(0, -2) : name;
          expect(result.label).toBe(`대구${stem}${gender}${level.code}`);
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
    expect(ok("대구", "중", "대구중학교").label).toBe("대구대구중");
    expect(ok("대구", "중", "대구중").label).toBe("대구대구중");
  });

  it("접미사만 남는 입력은 이름으로 치지 않는다", () => {
    for (const name of ["중", "고", "초", "중학교", "여중", "남고"]) {
      const result = validateSchool({ region: "대구", level: "중", name });
      expect(result.ok, `'${name}' 는 통과하면 안 된다`).toBe(false);
    }
  });
});

describe("실제 학교 목록에서 나온 까다로운 이름들", () => {
  // Every case here is a real school that broke an earlier version of these
  // rules when the national list was checked against them.
  it("서울당중초등학교 의 이름은 '서울당중' 이고 한 번만 깎인다", () => {
    // The region is taken off the front (서울당중 → 당중, put back by the label),
    // but the 「중」 that belongs to the name is not.
    const school = ok("서울", "초", "서울당중초등학교");
    expect(school.school.name).toBe("당중");
    expect(school.label).toBe("서울당중초");

    // Stripping the suffix again would file it as 「당」 and collide with a
    // different school, so the key has to keep the whole name.
    expect(schoolKey(school.school)).toContain("당중");
    const other = ok("서울", "초", "서울당초등학교");
    expect(schoolKey(school.school)).not.toBe(schoolKey(other.school));
  });

  it("이름에 이미 '학교'가 든 학교는 접미사를 붙이지 않는다", () => {
    expect(ok("광주", "중", "용연학교").label).toBe("광주용연학교");
    expect(ok("대구", "중", "군위중학교우보캠퍼스").label).toBe("대구군위중학교우보캠퍼스");
    for (const name of ["용연학교", "군위중학교우보캠퍼스"]) {
      expect(ok("대구", "중", name).label).not.toMatch(/학교중학교$/);
    }
  });

  it("긴 정식 명칭도 받는다", () => {
    expect(ok("서울", "초", "서울대학교사범대학부설초등학교").label).toBe("서울대학교사범대학부설초");
    expect(ok("서울", "초", "상명대학교사범대학부속초등학교").school.name).toBe(
      "상명대학교사범대학부속",
    );
  });

  it("이름이 학교급 글자로 끝나는 학교들이 모두 통과한다", () => {
    // 서울면중·서울송중·서울신중·서울영중 are primary schools whose names end in
    // 「중」; 서울서빙고 ends in 「고」.
    for (const name of ["서울면중", "서울송중", "서울신중", "서울영중", "서울서빙고"]) {
      const result = ok("서울", "초", `${name}초등학교`);
      // 서울 comes off the front, the last syllable does not.
      expect(result.school.name).toBe(name.slice(2));
      expect(result.label).toBe(`서울${name.slice(2)}초`);
    }
  });
});

describe("고른 학교급과 이름이 어긋날 때", () => {
  it("중학교를 고르고 초등학교 이름을 쓰면 거절한다", () => {
    const result = validateSchool({ region: "대구", level: "중", name: "계성초등학교" });
    expect(result).toMatchObject({ ok: false, reason: REJECT_SCHOOL.MISMATCH });
  });

  it("한 글자 접미사가 어긋나면 이름의 일부로 본다", () => {
    // 초등학교 + 「동중」 could be a middle-school name typed under the wrong
    // level, but it is indistinguishable from 서울당중초등학교 — a real primary
    // school whose name ends in 「중」. Refusing it would refuse that school too,
    // so the syllable stays in the name and the preview shows the result.
    expect(ok("대구", "초", "동중").label).toBe("대구동중초");
    expect(ok("서울", "중", "서초").label).toBe("서울서초중");
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

describe("정식 명칭에 지역이 들어간 학교", () => {
  // The split that reached the live board: 대구범어초등학교 is the official name,
  // 「범어초」 is what a student writes, and the two sat on the ranking as two
  // schools with one member each.
  it("범어초 와 대구범어초등학교 는 같은 학교다", () => {
    const keys = new Set(
      ["범어", "범어초", "범어초등학교", "대구범어", "대구범어초", "대구범어초등학교"].map((name) =>
        keyOf("대구", "초", name),
      ),
    );
    expect(keys.size).toBe(1);
    expect(ok("대구", "초", "대구범어초등학교").label).toBe("대구범어초");
    expect(ok("대구", "초", "범어초").label).toBe("대구범어초");
  });

  it("지역이 두 번 나오지 않는다", () => {
    for (const name of ["대구동산초등학교", "동산초", "동산"]) {
      expect(ok("대구", "초", name).label).toBe("대구동산초");
    }
  });

  it("이름이 지역과 똑같으면 그대로 둔다", () => {
    // 대구초등학교 in 대구: taking 「대구」 off would leave nothing.
    expect(ok("대구", "초", "대구초등학교").label).toBe("대구대구초");
  });

  it("보드에 적힌 이름을 그대로 입력해도 같은 학교다", () => {
    for (const [region, level, typed] of [
      ["대구", "초", "대구범어초"],
      ["대구", "중", "대구동중"],
      ["서울", "고", "서울경신고"],
    ]) {
      const first = ok(region, level, typed);
      const again = ok(region, level, first.label);
      expect(schoolKey(again.school), typed).toBe(schoolKey(first.school));
    }
  });

  it("인천삼산초 와 삼산초 는 서로 다른 학교로 남는다", () => {
    // The one pair in the national list where the region prefix is part of what
    // tells two schools apart.
    expect(keyOf("인천", "초", "인천삼산초등학교")).not.toBe(keyOf("인천", "초", "삼산초등학교"));
    expect(ok("인천", "초", "인천삼산초등학교").label).toBe("인천인천삼산초");
    expect(ok("인천", "초", "삼산초등학교").label).toBe("인천삼산초");
  });
});

describe("일반부", () => {
  it("지역도 이름도 없이 통과한다", () => {
    const result = validateSchool({ region: "", level: GENERAL_LEVEL, name: "" });
    expect(result.ok).toBe(true);
    expect(result.label).toBe("일반부");
    expect(isGeneral(result.school)).toBe(true);
  });

  it("적어 넣은 학교는 무시된다", () => {
    // The form disables those fields, but a stale value must not follow anyone
    // into 일반부 either.
    const result = validateSchool({ region: "대구", level: GENERAL_LEVEL, name: "범어초" });
    expect(result.school).toMatchObject({ name: "일반부", label: "일반부" });
  });

  it("학교와 섞이지 않는 자기만의 키를 쓴다", () => {
    const general = schoolKey(validateSchool({ level: GENERAL_LEVEL }).school);
    expect(general).not.toBe(keyOf("대구", "초", "범어"));
    expect(isGeneral({ level: "초" })).toBe(false);
    expect(isGeneral(null)).toBe(false);
  });

  it("미리보기도 일반부라고 말한다", () => {
    expect(previewLabel({ region: "", level: GENERAL_LEVEL, name: "" })).toBe("일반부");
  });
});

describe("예전 규칙으로 저장된 학교 되돌리기", () => {
  // What the maintenance pass runs on every stored school.
  it("갈라져 있던 두 줄이 같은 키로 모인다", () => {
    const split = canonicalSchool({ region: "대구", level: "초", name: "대구범어", label: "대구 대구범어초등학교" });
    const other = canonicalSchool({ region: "대구", level: "초", name: "범어", label: "대구 범어초등학교" });
    expect(split).toEqual({ region: "대구", level: "초", name: "범어", label: "대구범어초" });
    expect(schoolKey(split)).toBe(schoolKey(other));
  });

  it("이름이 곧 학교 이름인 줄에는 학교급을 붙이지 않는다", () => {
    expect(canonicalSchool({ region: "광주", level: "중", name: "용연학교", label: "광주 용연학교" })).toEqual({
      region: "광주",
      level: "중",
      name: "용연학교",
      label: "광주용연학교",
    });
  });

  it("이름 안에 '학교'가 들어 있을 뿐인 줄은 학교급을 붙인다", () => {
    // 서울대학교사범대학부설초등학교 — the name contains 학교 but is not one.
    expect(
      canonicalSchool({
        region: "서울",
        level: "초",
        name: "서울대학교사범대학부설",
        label: "서울 서울대학교사범대학부설초등학교",
      }).label,
    ).toBe("서울대학교사범대학부설초");
  });

  it("한 번 더 돌려도 그대로다", () => {
    for (const school of [
      { region: "대구", level: "초", name: "대구범어", label: "대구 대구범어초등학교" },
      { region: "광주", level: "중", name: "용연학교", label: "광주 용연학교" },
      { region: "대구", level: "중", name: "성화여자", label: "대구 성화여자중학교" },
      { ...GENERAL },
    ]) {
      const once = canonicalSchool(school);
      expect(canonicalSchool(once), once.label).toEqual(once);
    }
  });

  it("일반부는 손대지 않는다", () => {
    expect(canonicalSchool({ ...GENERAL })).toEqual(GENERAL);
  });

  it("라벨이 없던 옛 줄도 되살린다", () => {
    expect(canonicalSchool({ region: "대구", level: "초", name: "대구범어" }).label).toBe("대구범어초");
    expect(canonicalSchool({ region: "광주", level: "중", name: "용연학교" }).label).toBe("광주용연학교");
  });
});

describe("미리보기", () => {
  it("입력하는 동안 저장될 이름을 그대로 보여준다", () => {
    expect(previewLabel({ region: "대구", level: "중", name: "동중" })).toBe("대구동중");
    expect(previewLabel({ region: "대구", level: "중", name: "동" })).toBe("대구동중");
  });

  it("아직 덜 골랐으면 아무것도 보여주지 않는다", () => {
    expect(previewLabel({ region: "", level: "중", name: "동" })).toBe("");
    expect(previewLabel({ region: "대구", level: "", name: "동" })).toBe("");
    expect(previewLabel({ region: "대구", level: "중", name: "" })).toBe("");
  });
});

describe("보조 함수", () => {
  it("splitName 이 이름과 유추된 학교급을 함께 준다", () => {
    expect(splitName("동중")).toMatchObject({ base: "동", impliedLevel: "중" });
    expect(splitName("동")).toMatchObject({ base: "동", impliedLevel: null });
    expect(baseName("계성초등학교")).toBe("계성");
  });

  it("schoolLabel 은 값이 없으면 빈 문자열이다", () => {
    expect(schoolLabel(null)).toBe("");
    expect(schoolLabel(undefined)).toBe("");
  });
});
