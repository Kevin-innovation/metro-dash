import { expect, test } from "@playwright/test";
import { findClippedText, findOrphanLines, findOverflow, openGame } from "./helpers.js";

/**
 * Every screen, rendered, checked for the three faults that only show up in a
 * layout: a Korean word broken across lines, text clipped by its own box, and
 * anything pushed past the right edge.
 *
 * No backend needed — the screens are opened directly and filled with sample
 * rows, so this runs anywhere.
 */

/** Put plausible content into the lists that are empty without a server. */
const SEED = () => {
  // Name on top, affiliation under it — including the longest school name in
  // the country, which is where the two-line row would break if anywhere.
  const people = [
    ["번개", "대구범어초"],
    ["하늘달리기", "서울대학교사범대학부설초"],
    ["질주왕", "일반부"],
    ["코인수집가", ""],
    ["동중에이스", "대구동중"],
  ];
  document.getElementById("leaderboard-list").innerHTML = people
    .map(
      ([h, school], i) => `<li class="leaderboard-row"><span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-handle">${h}${school ? `<em class="row-school">${school}</em>` : ""}</span>
        <span class="leaderboard-score">${(14200 - i * 1130).toLocaleString()}</span>
        <button type="button" class="report-flag">🚩</button></li>`,
    )
    .join("");

  // The longest real school name in the country, so the column is tested at its
  // worst rather than at a convenient average.
  const schools = [
    ["서울대학교사범대학부설초", 41200, 24],
    ["부산대동남고", 38900, 6],
    ["대구성화여중", 22400, 11],
  ];
  document.getElementById("school-list").innerHTML = schools
    .map(
      ([label, total, members], i) => `<li class="leaderboard-row">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-handle">${label}<em class="school-members">${members}명</em></span>
        <span class="leaderboard-score">${total.toLocaleString()}</span></li>`,
    )
    .join("");

  for (const [id, text] of [
    ["my-standing", "내 순위 5위 · 9,680점"],
    ["my-school-standing", "서울대학교사범대학부설초 · 1위 · 41,200점"],
    ["report-note", "신고했어요. 선생님이 확인합니다"],
  ]) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.classList.remove("hidden");
  }

  document.getElementById("school-confirm-label").textContent = "대구동중";
};

const SCREENS = [
  "title-screen",
  "shop-screen",
  "settings-screen",
  "account-screen",
  "school-screen",
  "leaderboard-screen",
  "gameover-screen",
  "pause-screen",
];

test.describe("모든 화면 레이아웃", () => {
  for (const screen of SCREENS) {
    test(`${screen} 이 깨지지 않는다`, async ({ page }) => {
      const errors = await openGame(page);
      await page.evaluate(SEED);

      await page.evaluate((id) => {
        for (const el of document.querySelectorAll(".overlay")) el.classList.add("hidden");
        const target = document.getElementById(id);
        if (target) target.classList.remove("hidden");
        // Sub-panels that are hidden until a step is reached.
        for (const inner of ["school-confirm"]) {
          if (id === "school-screen") document.getElementById(inner)?.classList.remove("hidden");
        }
      }, screen);
      await page.waitForTimeout(350);

      expect(await page.evaluate(findOrphanLines), "고아 줄바꿈").toEqual([]);
      expect(await page.evaluate(findClippedText), "잘린 글자").toEqual([]);
      expect(await page.evaluate(findOverflow), "가로 넘침").toEqual([]);
      expect(errors, "JS 오류").toEqual([]);
    });
  }
});

test("주요 동작 버튼이 브라우저 기본 스타일로 새지 않는다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".overlay")) el.classList.remove("hidden");
  });

  // A button left unstyled renders flat grey and reads as less important than
  // the ghost button beside it, which is how the school form shipped once.
  const flat = await page.evaluate(() =>
    ["btn-play", "btn-account-submit", "btn-school-submit", "btn-school-confirm", "btn-retry"]
      .map((id) => [id, document.getElementById(id)])
      .filter(([, el]) => el && getComputedStyle(el).backgroundImage === "none")
      .map(([id]) => id),
  );
  expect(flat).toEqual([]);
});

test("학교 폼의 지역과 학교급이 채워진다", async ({ page }) => {
  await openGame(page);
  // Populated when the dialog opens, so the menus prove the form was built.
  await page.evaluate(() => document.getElementById("btn-school").classList.remove("hidden"));
  await page.click("#btn-school");

  await expect(page.locator("#field-region option")).toHaveCount(18); // 17 regions + 선택
  await expect(page.locator("#field-level option")).toHaveCount(4);
  await expect(page.locator("#school-preview")).toContainText("지역과 학교급");
});

test("학교 이름 미리보기가 저장될 이름을 그대로 보여준다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-school").classList.remove("hidden"));
  await page.click("#btn-school");

  await page.selectOption("#field-region", "대구");
  await page.selectOption("#field-level", "중");
  await page.fill("#field-school", "동중");
  // The whole point: 「동중」 must not read as 「동중중학교」.
  await expect(page.locator("#school-preview")).toHaveText("이렇게 저장돼요 → 대구동중");

  await page.fill("#field-school", "동");
  await expect(page.locator("#school-preview")).toHaveText("이렇게 저장돼요 → 대구동중");
});

test("확정 단계가 수정 불가를 알리고 되돌릴 수 있다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-school").classList.remove("hidden"));
  await page.click("#btn-school");
  await page.selectOption("#field-region", "대구");
  await page.selectOption("#field-level", "중");
  await page.fill("#field-school", "동중");
  await page.click("#btn-school-submit");

  await expect(page.locator("#school-confirm")).toBeVisible();
  await expect(page.locator("#school-confirm-label")).toHaveText("대구동중");
  await expect(page.locator(".school-confirm-warn")).toContainText("수정이 불가능합니다");
  // The fields are frozen so the name being confirmed cannot change underneath.
  await expect(page.locator("#field-school")).toBeDisabled();

  await page.click("#btn-school-cancel");
  await expect(page.locator("#school-confirm")).toBeHidden();
  await expect(page.locator("#field-school")).toBeEnabled();
});

test("학교급이 어긋나면 확정 단계로 넘어가지 않는다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-school").classList.remove("hidden"));
  await page.click("#btn-school");
  await page.selectOption("#field-region", "대구");
  await page.selectOption("#field-level", "중");
  await page.fill("#field-school", "계성초등학교");
  await page.click("#btn-school-submit");

  await expect(page.locator("#school-confirm")).toBeHidden();
  await expect(page.locator("#school-error")).toContainText("학교급");
});

test("일반부를 고르면 학교 칸이 비활성화되고 일반부로 저장된다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-school").classList.remove("hidden"));
  await page.click("#btn-school");

  await page.selectOption("#field-region", "대구");
  await page.selectOption("#field-level", "중");
  await page.fill("#field-school", "동중");
  await expect(page.locator("#school-preview")).toHaveText("이렇게 저장돼요 → 대구동중");

  await page.check("#field-general");
  // Whatever was typed stops counting the moment 일반부 is ticked.
  await expect(page.locator("#school-preview")).toHaveText("이렇게 저장돼요 → 일반부");
  await expect(page.locator("#field-school")).toBeDisabled();
  await expect(page.locator("#field-region")).toBeDisabled();

  await page.click("#btn-school-submit");
  await expect(page.locator("#school-confirm-label")).toHaveText("일반부");

  // Backing out returns the form to the state it was in, not to a blank one.
  await page.click("#btn-school-cancel");
  await expect(page.locator("#field-school")).toBeDisabled();
  await page.uncheck("#field-general");
  await expect(page.locator("#field-school")).toBeEnabled();
  await expect(page.locator("#school-preview")).toHaveText("이렇게 저장돼요 → 대구동중");
});

test("자동 로그인 체크박스가 기본으로 켜져 있다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-account").classList.remove("hidden"));
  await page.click("#btn-account");
  // On by default: staying signed in is what almost everyone wants, and the box
  // is there for the one who does not.
  await expect(page.locator("#field-remember")).toBeChecked();
});
