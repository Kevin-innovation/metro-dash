import { describe, expect, it } from "vitest";
import {
  HANDLE_MAX,
  HANDLE_MIN,
  REJECT,
  foldHandle,
  handleKey,
  normalizeHandle,
  validateHandle,
} from "../src/nickname.js";

const reasonFor = (raw) => {
  const result = validateHandle(raw);
  return result.ok ? "ok" : result.reason;
};

describe("accepts ordinary names", () => {
  it.each(["카이", "네온러너", "메트로킹", "Runner", "ru77", "달리기왕", "abc123", "가나다라마바사아"])(
    "%s",
    (name) => {
      const result = validateHandle(name);
      expect(result.ok, `${name}: ${result.reason ?? ""}`).toBe(true);
    },
  );
});

describe("length", () => {
  it("rejects empty and whitespace-only", () => {
    expect(reasonFor("")).toBe(REJECT.EMPTY);
    expect(reasonFor("   ")).toBe(REJECT.EMPTY);
    expect(reasonFor(null)).toBe(REJECT.EMPTY);
  });

  it("enforces the bounds", () => {
    expect(reasonFor("가")).toBe(REJECT.SHORT);
    expect(reasonFor("가".repeat(HANDLE_MAX))).toBe("ok");
    expect(reasonFor("가".repeat(HANDLE_MAX + 1))).toBe(REJECT.LONG);
  });

  it("counts Hangul syllables as one character each", () => {
    // Decomposed Hangul must not let a longer name through on a code-unit count.
    const decomposed = "가".repeat(HANDLE_MAX).normalize("NFD");
    expect(reasonFor(decomposed)).toBe("ok");
    expect(HANDLE_MIN).toBeLessThan(HANDLE_MAX);
  });
});

describe("charset", () => {
  it("rejects lone jamo, which is how masked profanity is written", () => {
    expect(reasonFor("ㅅㅂ")).toBe(REJECT.JAMO);
    expect(reasonFor("ㅄ")).toBe(REJECT.JAMO);
    expect(reasonFor("ㅗㅗ")).toBe(REJECT.JAMO);
    expect(reasonFor("ㅋㅋㅋ")).toBe(REJECT.JAMO);
  });

  it("rejects punctuation used to split banned words", () => {
    expect(reasonFor("시-발")).toBe(REJECT.CHARSET);
    expect(reasonFor("시.발")).toBe(REJECT.CHARSET);
    expect(reasonFor("f*ck")).toBe(REJECT.CHARSET);
  });

  it("rejects emoji and symbols", () => {
    expect(reasonFor("러너💀")).toBe(REJECT.CHARSET);
    expect(reasonFor("★관리★")).toBe(REJECT.CHARSET);
  });

  it("strips zero-width characters rather than trusting them", () => {
    // A name padded with zero-width joiners must not slip a banned word past.
    expect(reasonFor("시​발")).toBe(REJECT.PROFANITY);
    expect(reasonFor("관﻿리‍자")).toBe(REJECT.RESERVED);
  });

  it("rejects an all-digit name", () => {
    expect(reasonFor("1234")).toBe(REJECT.NUMERIC);
  });
});

describe("impersonation", () => {
  it.each(["관리자", "운영자", "admin", "ADMIN", "선생님", "메트로대시", "staff"])(
    "rejects %s",
    (name) => expect(reasonFor(name)).toBe(REJECT.RESERVED),
  );

  it("does not reserve ordinary words that merely appear in staff titles", () => {
    // 「메트로」 is the setting, not a claim to be the game; blocking it would
    // reject a large share of the names students would naturally pick.
    for (const name of ["메트로킹", "메트로걸", "관리왕"]) {
      expect(reasonFor(name), name).toBe("ok");
    }
  });

  it("rejects a reserved word with padding around it", () => {
    expect(reasonFor("김관리자")).toBe(REJECT.RESERVED);
    expect(reasonFor("admin7")).toBe(REJECT.RESERVED);
  });
});

describe("profanity", () => {
  it.each(["시발", "씨발이", "존나쎔", "병신아", "개새끼", "fuck", "bitch", "느금마"])(
    "rejects %s",
    (name) => expect(reasonFor(name)).toBe(REJECT.PROFANITY),
  );

  it("sees through digit substitution", () => {
    expect(reasonFor("시1발")).toBe(REJECT.PROFANITY);
    expect(reasonFor("fu0ck")).toBe(REJECT.PROFANITY);
  });

  it("sees through repeated letters", () => {
    expect(reasonFor("ffuuck")).toBe(REJECT.PROFANITY);
    expect(reasonFor("시발발")).toBe(REJECT.PROFANITY);
  });

  it("documents what the list cannot catch", () => {
    // Characters inserted *inside* a word defeat substring matching, and no
    // word list closes that gap — 「씨이발」 passes here. This is why names are
    // reportable and staff can force a rename; the filter is the first line,
    // not the only one.
    expect(reasonFor("씨이발")).toBe("ok");
  });

  it("does not flag ordinary words that merely contain a fragment", () => {
    // Over-blocking is its own failure: a filter students cannot satisfy just
    // pushes them to nonsense names.
    for (const name of ["시원한바람", "발자국", "새싹", "지구인", "미친듯이"]) {
      expect(reasonFor(name), name).toBe("ok");
    }
  });
});

describe("normalizeHandle", () => {
  it("trims and removes inner whitespace", () => {
    expect(normalizeHandle("  카 이  ")).toBe("카이");
  });

  it("is idempotent", () => {
    const once = normalizeHandle(" Run ner ");
    expect(normalizeHandle(once)).toBe(once);
  });

  it("survives non-string input", () => {
    expect(normalizeHandle(undefined)).toBe("");
    expect(normalizeHandle(42)).toBe("42");
  });
});

describe("handleKey", () => {
  it("collapses case so two players cannot share a name", () => {
    expect(handleKey("Runner")).toBe(handleKey("runner"));
    expect(handleKey("RUNNER")).toBe(handleKey("Runner"));
  });

  it("collapses repeated characters", () => {
    expect(handleKey("카이이")).toBe(handleKey("카이"));
  });

  it("keeps genuinely different names apart", () => {
    expect(handleKey("카이")).not.toBe(handleKey("네온"));
  });
});

describe("foldHandle", () => {
  it("exposes the forms matching relies on", () => {
    const folded = foldHandle("A1a");
    expect(folded.base).toBe("a1a");
    expect(folded.deleet).toContain("a");
  });
});
