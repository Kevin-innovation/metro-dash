import { expect, test } from "@playwright/test";
import {
  ADMIN_KEY,
  canRunOnline,
  deleteAccount,
  freshHandle,
  openGame,
  signUp,
} from "./helpers.js";

/**
 * The flows that need a server: signing up, claiming a school, the two
 * leaderboards, reporting a nickname.
 *
 * These create real accounts on the development deployment and remove them
 * afterwards. Skipped when the deployment or the admin key is not configured,
 * so a fresh checkout still runs the rest of the suite.
 */

test.skip(!canRunOnline, "VITE_CONVEX_URL 과 ADMIN_KEY 가 있어야 실행됩니다");

// Serial: each test signs in and out against one shared deployment, and four
// workers doing that at once just make each other slow enough to time out.
test.describe.configure({ mode: "serial" });

test("가입하면 학교 화면이 바로 뜨고, 건너뛸 수 있다", async ({ page }) => {
  const handle = freshHandle("가");
  try {
    await openGame(page);
    await signUp(page, handle);

    // Asked at the moment the account is made, which is the only time everyone
    // reliably sees it — but never forced.
    await expect(page.locator("#school-screen")).toBeVisible();
    await page.click("#btn-school-close");
    await expect(page.locator("#school-screen")).toBeHidden();

    await expect(page.locator("#account-state")).toContainText(handle);
    await expect(page.locator("#btn-school")).toBeVisible();
  } finally {
    await deleteAccount(handle);
  }
});

test("학교를 정하면 표기가 어떻든 같은 이름으로 저장된다", async ({ page }) => {
  const handle = freshHandle("나");
  try {
    await openGame(page);
    await signUp(page, handle);

    await expect(page.locator("#school-screen")).toBeVisible();
    await page.selectOption("#field-region", "대구");
    await page.selectOption("#field-level", "중");
    await page.fill("#field-school", "동중");
    await page.click("#btn-school-submit");
    await page.click("#btn-school-confirm");

    await expect(page.locator("#school-screen")).toBeHidden({ timeout: 20_000 });
    await expect(page.locator("#account-state")).toContainText("대구 동중학교");
    // Never 「동중중학교」, whatever was typed.
    await expect(page.locator("#account-state")).not.toContainText("중중");
    // The offer is withdrawn once taken, because it cannot be taken twice.
    await expect(page.locator("#btn-school")).toBeHidden();
  } finally {
    await deleteAccount(handle);
  }
});

test("학교 이름 자동완성이 그 지역 학교를 제안한다", async ({ page }) => {
  const handle = freshHandle("다");
  try {
    await openGame(page);
    await signUp(page, handle);
    await expect(page.locator("#school-screen")).toBeVisible();

    await page.selectOption("#field-region", "대구");
    await page.selectOption("#field-level", "중");
    await expect
      .poll(async () => page.locator("#school-options option").count(), { timeout: 15_000 })
      .toBeGreaterThan(100);

    const first = await page.locator("#school-options option").first().getAttribute("value");
    expect(first).toContain("중학교");
  } finally {
    await deleteAccount(handle);
  }
});

test("리더보드가 개인과 학교를 함께 보여준다", async ({ page }) => {
  const handle = freshHandle("라");
  try {
    await openGame(page);
    await signUp(page, handle);
    await page.click("#btn-school-close");

    await page.click("#btn-leaderboard");
    await expect(page.locator("#leaderboard-screen")).toBeVisible();
    await expect(page.locator(".board-title").first()).toHaveText("개인");
    await expect(page.locator(".board-title").nth(1)).toHaveText("학교");

    // Both lists resolve to something — rows, or the empty-state line.
    await expect
      .poll(async () => page.locator("#leaderboard-list li").count(), { timeout: 20_000 })
      .toBeGreaterThan(0);
    await expect.poll(async () => page.locator("#school-list li").count()).toBeGreaterThan(0);
  } finally {
    await deleteAccount(handle);
  }
});

test("자기 자신에게는 신고 버튼이 붙지 않는다", async ({ page }) => {
  const handle = freshHandle("마");
  try {
    await openGame(page);
    await signUp(page, handle);
    await page.click("#btn-school-close");
    await page.click("#btn-leaderboard");
    await expect(page.locator("#leaderboard-screen")).toBeVisible();
    await page.waitForTimeout(2500);

    // A report has to be attributable, so the button is a button only on other
    // people's rows; own row gets an inert placeholder that holds the column.
    const own = page.locator(".leaderboard-row.me");
    if (await own.count()) {
      await expect(own.locator("button.report-flag")).toHaveCount(0);
    }
  } finally {
    await deleteAccount(handle);
  }
});

test("비밀번호를 틀리면 남은 횟수를 알려준다", async ({ page }) => {
  const handle = freshHandle("바");
  try {
    await openGame(page);
    await signUp(page, handle);
    await page.click("#btn-school-close");
    await page.click("#btn-account"); // sign out
    await page.waitForTimeout(1200);

    await page.click("#btn-account");
    await page.fill("#field-handle", handle);
    await page.fill("#field-pin", "9999");
    await page.click("#btn-account-submit");

    await expect(page.locator("#account-error")).toContainText("맞지 않아요", { timeout: 20_000 });
    await expect(page.locator("#account-error")).toContainText("더 틀리면");
  } finally {
    await deleteAccount(handle);
  }
});

test("이미 쓰는 닉네임은 가입에서 막힌다", async ({ page }) => {
  const handle = freshHandle("사");
  try {
    await openGame(page);
    await signUp(page, handle);
    await page.click("#btn-school-close");
    await page.click("#btn-account"); // sign out
    await page.waitForTimeout(1200);

    await page.click("#btn-account");
    await page.click("#tab-signup");
    await page.fill("#field-handle", handle);
    await page.fill("#field-pin", "5678");
    await page.click("#btn-account-submit");

    await expect(page.locator("#account-error")).toContainText("이미 쓰고", { timeout: 20_000 });
  } finally {
    await deleteAccount(handle);
  }
});

test("쓸 수 없는 닉네임은 서버가 거절한다", async ({ page }) => {
  await openGame(page);
  await page.click("#btn-account");
  await page.click("#tab-signup");
  await page.fill("#field-handle", "관리자");
  await page.fill("#field-pin", "1234");
  await page.click("#btn-account-submit");

  await expect(page.locator("#account-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#account-screen")).toBeVisible();
});

test.describe("관리자 페이지", () => {
  test("키가 없으면 아무것도 보여주지 않는다", async ({ page }) => {
    await page.goto("/admin.html");
    await expect(page.locator("#admin-gate")).toBeVisible();
    await expect(page.locator("#admin-panel")).toBeHidden();

    await page.fill("#admin-key", "wrong-key");
    await page.click("#admin-form button[type=submit]");
    await expect(page.locator("#admin-error")).toContainText("관리자 키", { timeout: 20_000 });
    await expect(page.locator("#admin-panel")).toBeHidden();
  });

  test("올바른 키로 목록이 열린다", async ({ page }) => {
    await page.goto("/admin.html");
    await page.fill("#admin-key", ADMIN_KEY);
    await page.click("#admin-form button[type=submit]");

    await expect(page.locator("#admin-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#admin-gate")).toBeHidden();
    await expect(page.locator("#admin-players")).not.toBeEmpty();
    await expect(page.locator("#admin-schools")).not.toBeEmpty();
    await expect(page.locator("#admin-signout")).toBeVisible();
  });
});
