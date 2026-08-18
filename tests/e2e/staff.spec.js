import { expect, test } from "@playwright/test";
import { canRunOnline, openGame } from "./helpers.js";

/**
 * The staff account.
 *
 * Signing in as it should land on the tools page with the key already in hand,
 * and nowhere near the game. Everything else about it — that the key is only
 * handed over on a correct PIN, that ordinary accounts never get one — is
 * covered in the backend suite; what is checked here is the browser half.
 */

test.skip(!canRunOnline, "VITE_CONVEX_URL 과 ADMIN_KEY 가 있어야 실행됩니다");

const STAFF = { handle: "admin", pin: "4490" };

test("관리자 계정으로 로그인하면 관리 페이지로 넘어간다", async ({ page }) => {
  await openGame(page);
  await page.click("#btn-account");
  await page.fill("#field-handle", STAFF.handle);
  await page.fill("#field-pin", STAFF.pin);
  await page.click("#btn-account-submit");

  await page.waitForURL(/\/admin\.html/, { timeout: 25_000 });
  // Straight into the panel: the key came back with the sign-in, so the gate
  // has nothing left to ask.
  await expect(page.locator("#admin-panel")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#admin-gate")).toBeHidden();
  await expect(page.locator("#admin-players")).not.toBeEmpty();
});

test("잠그기를 누르면 키가 사라진다", async ({ page }) => {
  await openGame(page);
  await page.click("#btn-account");
  await page.fill("#field-handle", STAFF.handle);
  await page.fill("#field-pin", STAFF.pin);
  await page.click("#btn-account-submit");
  await page.waitForURL(/\/admin\.html/, { timeout: 25_000 });
  await expect(page.locator("#admin-panel")).toBeVisible({ timeout: 20_000 });

  await page.click("#admin-signout");
  await expect(page.locator("#admin-gate")).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => sessionStorage.getItem("metro-dash-admin-key"))).toBeNull();
});

test("관리자 계정은 리더보드에 없다", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => document.getElementById("btn-leaderboard").classList.remove("hidden"));
  await page.click("#btn-leaderboard");
  await page.waitForTimeout(3000);

  const handles = await page.locator(".leaderboard-handle").allInnerTexts();
  expect(handles.some((h) => h.trim() === "admin")).toBe(false);
});
