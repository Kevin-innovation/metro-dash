import { expect, test } from "@playwright/test";
import { openGame } from "./helpers.js";

/**
 * Typing into the account form.
 *
 * The game listens for keys on the window and calls preventDefault on the ones
 * it uses, which is every arrow key plus W, A, S, D, P, Space, Enter and Escape.
 * That handler cannot tell a control from a character, so with the nickname box
 * focused those letters were never inserted, the caret could not be moved, and
 * Enter did not submit — the field looked like it was dropping keys at random.
 *
 * page.fill() sets the value directly and never fires a key event, so the whole
 * fault was invisible to the rest of the suite. These tests type.
 *
 * No backend needed: the form is opened and typed into, not submitted.
 */

const handle = (page) => page.locator("#field-handle");

test.describe("계정 폼 입력", () => {
  test.beforeEach(async ({ page }) => {
    await openGame(page);
    // The account row is hidden when no backend is configured; the form itself is
    // the same either way, and typing into it is what is under test.
    await page.evaluate(() => document.getElementById("btn-account").classList.remove("hidden"));
    await page.click("#btn-account");
    await expect(page.locator("#account-screen")).toBeVisible();
    await handle(page).click();
  });

  test("letters the game binds to controls still reach the nickname field", async ({ page }) => {
    await handle(page).pressSequentially("wasdp", { delay: 20 });
    await expect(handle(page)).toHaveValue("wasdp");
    // A control key that landed in a text field would also have driven the game.
    await expect(page.locator("#account-screen")).toBeVisible();
  });

  test("arrow keys move the caret instead of the player", async ({ page }) => {
    await handle(page).pressSequentially("abcd", { delay: 20 });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("X");
    await expect(handle(page)).toHaveValue("abXcd");
  });

  test("the field stops at eight characters", async ({ page }) => {
    await handle(page).pressSequentially("abcdefghij", { delay: 20 });
    await expect(handle(page)).toHaveValue("abcdefgh");
  });

  test("the PIN keeps only digits", async ({ page }) => {
    await page.locator("#field-pin").click();
    await page.locator("#field-pin").pressSequentially("12ab34", { delay: 20 });
    await expect(page.locator("#field-pin")).toHaveValue("1234");
  });

  test("Enter submits the form", async ({ page }) => {
    // Whether the sign-in itself succeeds needs a backend; that Enter reaches the
    // form does not. A preventDefault on the keydown stops the submit ever firing.
    await page.evaluate(() => {
      window.__submits = 0;
      document.getElementById("account-form").addEventListener("submit", () => {
        window.__submits += 1;
      });
    });

    await handle(page).pressSequentially("테스트", { delay: 20 });
    await page.locator("#field-pin").click();
    await page.locator("#field-pin").pressSequentially("1234", { delay: 20 });
    await page.locator("#field-pin").press("Enter");

    await expect.poll(() => page.evaluate(() => window.__submits)).toBe(1);
  });

  test("a Hangul syllable survives being composed", async ({ page, browserName }) => {
    // Composition can only be driven through CDP, which is Chromium only.
    test.skip(browserName !== "chromium", "needs CDP to simulate an IME");

    const cdp = await page.context().newCDPSession(page);
    // What a Korean IME sends for 카나: each syllable is rebuilt in place as its
    // jamo arrive, then committed. Rewriting .value between those steps is what
    // used to throw the half-formed syllable away.
    for (const text of ["ㅋ", "카", "칸"]) {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: 0, selectionEnd: 1 });
    }
    await cdp.send("Input.insertText", { text: "카" });
    for (const text of ["ㄴ", "나"]) {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: 0, selectionEnd: 1 });
    }
    await cdp.send("Input.insertText", { text: "나" });

    await expect(handle(page)).toHaveValue("카나");
  });
});

test("게임 조작키는 그대로 동작한다", async ({ page }) => {
  // The guard must only cover text fields: with nothing focused, the same keys
  // still have to drive the game.
  await openGame(page);
  await page.keyboard.press("Enter");
  await expect(page.locator("#title-screen")).toBeHidden();
});
