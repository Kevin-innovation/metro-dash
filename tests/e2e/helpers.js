import { expect } from "@playwright/test";

/**
 * Shared setup for the browser tests.
 *
 * The online tests create real accounts on the development Convex deployment
 * and delete them again through the admin functions, so they need both the
 * deployment URL and the admin key. Without those they skip rather than fail —
 * a checkout with no backend configured should still be able to run the rest.
 */

export const CONVEX_URL = process.env.VITE_CONVEX_URL ?? "";
export const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
export const canRunOnline = Boolean(CONVEX_URL && ADMIN_KEY);

/** A nickname no other run will pick. Eight characters is the limit. */
export function freshHandle(prefix = "테") {
  const n = Math.floor(Math.random() * 8999 + 1000);
  return `${prefix}${n}`;
}

/** Open the game and wait until the title screen has settled. */
export async function openGame(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#title-screen")).toBeVisible();
  await page.waitForTimeout(1200);
  return errors;
}

/** Create an account through the real form and return the nickname used. */
export async function signUp(page, handle = freshHandle()) {
  await page.click("#btn-account");
  await page.click("#tab-signup");
  await page.fill("#field-handle", handle);
  await page.fill("#field-pin", "1234");
  await page.click("#btn-account-submit");
  await expect(page.locator("#account-screen")).toBeHidden({ timeout: 20_000 });
  return handle;
}

/** Remove an account and everything attached to it. */
export async function deleteAccount(handle) {
  if (!canRunOnline) return;
  const { ConvexHttpClient } = await import("convex/browser");
  const client = new ConvexHttpClient(CONVEX_URL);
  await client.mutation("admin:remove", { adminKey: ADMIN_KEY, handle }).catch(() => {});
}

/**
 * Text nodes whose last line box holds a stranded fragment.
 *
 * Korean wraps mid-word unless told otherwise, which strands a syllable on its
 * own line. Nothing in the DOM shows this — only the rendered line boxes do.
 */
export const findOrphanLines = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length < 12) continue;
    if (!node.parentElement?.offsetParent) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    if (rects.length < 2) continue;

    const perLine = Math.max(1, Math.round(text.length / rects.length));
    if (rects[rects.length - 1].width < (rects[0].width / perLine) * 3) {
      out.push(`${text.slice(0, 48)} (${rects.length}줄)`);
    }
  }
  return out;
};

/** Elements whose text is cut off by their own box. */
export const findClippedText = () =>
  [...document.querySelectorAll(".leaderboard-handle, .admin-handle, .shop-name, .mission-text")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.textContent.trim().split("\n")[0]);

/** Anything sticking out past the right edge of the page. */
export const findOverflow = () => {
  const doc = document.documentElement;
  if (doc.scrollWidth <= doc.clientWidth + 1) return [];
  return [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
    .slice(0, 5)
    .map((el) => `${el.tagName.toLowerCase()}.${el.className || "(no class)"}`);
};
