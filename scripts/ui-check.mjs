/**
 * Layout checks a unit test cannot see.
 *
 *   npm run build && npm run preview &
 *   npm run check:ui
 *
 * Two things are measured, both of which have already shipped as real bugs:
 * a Korean line broken mid-word (「... 점수가 모 / 두 더해져요」), and a name clipped
 * to an ellipsis because its column collapsed. Neither shows up in the DOM, in
 * a snapshot, or in a build — only in the rendered box.
 */

import { chromium } from "playwright";

const SITE = process.env.UI_CHECK_URL ?? "http://localhost:4173";
const WIDTHS = [320, 360, 380, 430, 768, 1280];

/** Fill the board with plausible rows; the live one may be empty. */
const SAMPLE = () => {
  document.querySelectorAll(".overlay").forEach((el) => el.classList.remove("hidden"));
  document.querySelectorAll("#school-confirm, .report-note").forEach((el) =>
    el.classList.remove("hidden"),
  );

  const people = ["번개", "하늘달리기", "질주왕", "코인수집가", "동중에이스"];
  document.getElementById("leaderboard-list").innerHTML = people
    .map(
      (h, i) => `<li class="leaderboard-row"><span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-handle">${h}</span>
        <span class="leaderboard-score">${(14200 - i * 1130).toLocaleString()}</span>
        <button type="button" class="report-flag">🚩</button></li>`,
    )
    .join("");

  const schools = [
    ["부산 대동남자고등학교", 41200, 24],
    ["서울 서울대학교사범대학부설초등학교", 38900, 6],
    ["대구 성화여자중학교", 22400, 11],
  ];
  document.getElementById("school-list").innerHTML = schools
    .map(
      ([label, total, members], i) => `<li class="leaderboard-row">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-handle">${label}<em class="school-members">${members}명</em></span>
        <span class="leaderboard-score">${total.toLocaleString()}</span></li>`,
    )
    .join("");
};

/**
 * A text node whose final line box is much shorter than the others has been
 * left with a stranded fragment.
 */
const ORPHANS = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length < 12) continue;
    if (!node.parentElement?.offsetParent) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (rects.length < 2) continue;

    const perLine = Math.max(1, Math.round(text.length / rects.length));
    if (rects[rects.length - 1].width < (rects[0].width / perLine) * 3) {
      out.push(`${text.slice(0, 48)} (${rects.length}줄)`);
    }
  }
  return out;
};

const CLIPPED = () =>
  [...document.querySelectorAll(".leaderboard-handle, .admin-handle")]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.textContent.trim().split("\n")[0]);

const browser = await chromium.launch();
let failures = 0;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.evaluate(SAMPLE);
  await page.waitForTimeout(300);

  const orphans = await page.evaluate(ORPHANS);
  const clipped = await page.evaluate(CLIPPED);
  failures += orphans.length + clipped.length;

  const status = orphans.length || clipped.length ? "✗" : "✓";
  console.log(`${status} ${width}px`);
  orphans.forEach((t) => console.log(`    고아 줄바꿈: ${t}`));
  clipped.forEach((t) => console.log(`    잘린 이름: ${t}`));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures}건` : "\n문제 없음");
process.exit(failures ? 1 : 0);
