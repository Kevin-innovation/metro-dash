import { ConvexClient } from "convex/browser";
// The stylesheet is pulled in per entry point. Without this line the admin page
// ships with no CSS at all — including `.hidden`, so the key form and the panel
// it guards are both on screen at once.
import "./style.css";
import { escapeHtml } from "./ui.js";
import { LEVELS, REGIONS, previewLabel, validateSchool } from "./school.js";

/**
 * Teacher tools, as a page rather than a set of CLI commands.
 *
 * Reachable only by knowing the admin key, which is held in sessionStorage for
 * the life of the tab and never written to disk. Every call carries the key and
 * is checked server-side — this page grants nothing on its own.
 */

const $ = (id) => document.getElementById(id);
const KEY_STORE = "metro-dash-admin-key";

const client = new ConvexClient(import.meta.env.VITE_CONVEX_URL);
let adminKey = null;

const message = (error) =>
  typeof error?.data === "string" ? error.data : "요청을 처리하지 못했습니다";

function toast(text, tone = "ok") {
  const el = $("admin-toast");
  el.textContent = text;
  el.className = `admin-toast ${tone}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function when(ms) {
  const date = new Date(ms);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

async function call(kind, name, args = {}) {
  return await client[kind](name, { adminKey, ...args });
}

// --- rendering --------------------------------------------------------------

let players = [];
let schools = [];

function renderReports(rows) {
  const root = $("admin-reports");
  if (!rows.length) {
    root.innerHTML = `<p class="admin-empty">신고된 닉네임이 없습니다.</p>`;
    return;
  }
  root.innerHTML = rows
    .map(
      (row) => `
      <div class="admin-row flagged">
        <div class="admin-row-main">
          <span class="admin-handle">${escapeHtml(row.handle)}</span>
          <span class="admin-meta">신고 ${row.count}건 · ${when(row.latest)}</span>
          <span class="admin-meta">신고자: ${row.reporters.map(escapeHtml).join(", ")}</span>
        </div>
        <div class="admin-actions">
          <button data-act="rename" data-handle="${escapeHtml(row.handle)}">개명</button>
          <button data-act="remove" data-handle="${escapeHtml(row.handle)}" class="danger">삭제</button>
          <button data-act="resolve" data-handle="${escapeHtml(row.handle)}">문제없음</button>
        </div>
      </div>`,
    )
    .join("");
}

function renderSchools() {
  const root = $("admin-schools");
  if (!schools.length) {
    root.innerHTML = `<p class="admin-empty">등록된 학교가 없습니다.</p>`;
    return;
  }
  root.innerHTML = schools
    .map(
      (row) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <span class="admin-handle">${escapeHtml(row.label)}</span>
          <span class="admin-meta">${row.members}명 · ${row.total.toLocaleString()}점</span>
        </div>
        <div class="admin-actions">
          <button data-act="merge" data-key="${escapeHtml(row.key)}">합치기</button>
        </div>
      </div>`,
    )
    .join("");
}

function renderPlayers() {
  const filter = $("admin-search").value.trim().toLowerCase();
  const rows = filter
    ? players.filter((p) => p.handle.toLowerCase().includes(filter))
    : players;

  const root = $("admin-players");
  if (!rows.length) {
    root.innerHTML = `<p class="admin-empty">플레이어가 없습니다.</p>`;
    return;
  }

  const now = Date.now();
  root.innerHTML = rows
    .map((row) => {
      const locked = row.lockedUntil > now;
      return `
      <div class="admin-row">
        <div class="admin-row-main">
          <span class="admin-handle">${escapeHtml(row.handle)}${
            locked ? ' <em class="locked">잠김</em>' : ""
          }</span>
          <span class="admin-meta">최고 ${row.best.toLocaleString()}점 · 코인 ${(row.coins ?? 0).toLocaleString()} · ${
            row.school ? escapeHtml(row.school) : "학교 없음"
          } · 가입 ${when(row.createdAt)}${
            row.failedAttempts ? ` · 실패 ${row.failedAttempts}회` : ""
          }${row.flagged ? ' · <em class="locked">저장 거절됨</em>' : ""}</span>
        </div>
        <div class="admin-actions">
          <button data-act="school" data-handle="${escapeHtml(row.handle)}">학교 ${
            row.school ? "변경" : "지정"
          }</button>
          ${
            row.school
              ? `<button data-act="unschool" data-handle="${escapeHtml(row.handle)}">학교 지우기</button>`
              : ""
          }
          <button data-act="coins" data-handle="${escapeHtml(row.handle)}">코인</button>
          <button data-act="score" data-handle="${escapeHtml(row.handle)}">점수 기록</button>
          <button data-act="pin" data-handle="${escapeHtml(row.handle)}">비번 초기화</button>
          ${locked ? `<button data-act="unlock" data-handle="${escapeHtml(row.handle)}">잠금 해제</button>` : ""}
          <button data-act="rename" data-handle="${escapeHtml(row.handle)}">개명</button>
          <button data-act="remove" data-handle="${escapeHtml(row.handle)}" class="danger">삭제</button>
        </div>
      </div>`;
    })
    .join("");
}

async function refresh() {
  const [reports, list, schoolRows] = await Promise.all([
    call("query", "admin:reports"),
    call("query", "admin:list", { limit: 200 }),
    call("query", "admin:schools"),
  ]);
  renderReports(reports);
  schools = schoolRows;
  renderSchools();
  players = list;
  renderPlayers();
}

/**
 * Ask for a school the same way the game does — pick a region and a level, type
 * the name — and show what will actually be stored before committing, so staff
 * see 「대구 동중학교」 rather than guessing at what 「동중」 becomes.
 */
function askSchool(handle) {
  const region = prompt(`${handle} 님의 지역\n(${[...REGIONS, "일반"].join(" · ")})`, "");
  if (!region) return null;
  const level = prompt(
    `학교급\n${LEVELS.map((l) => `${l.code} = ${l.label}`).join(" · ")} · 일 = 선생님`,
    "",
  );
  if (!level) return null;
  const name = prompt("학교 이름 (접미사는 붙여도 됩니다)", "");
  if (!name) return null;

  const check = validateSchool({ region, level, name });
  if (!check.ok) {
    toast(check.message, "bad");
    return null;
  }
  if (!confirm(`이렇게 저장됩니다:\n\n${previewLabel({ region, level, name })}\n\n계속할까요?`)) {
    return null;
  }
  return { region, level, name };
}

// --- actions ----------------------------------------------------------------

async function act(kind, handle) {
  try {
    if (kind === "pin") {
      const newPin = prompt(`${handle} 님의 새 비밀번호 (숫자 4자리)`, "");
      if (!newPin) return;
      await call("mutation", "admin:resetPin", { handle, newPin });
      toast(`${handle} 비밀번호를 ${newPin} 로 바꿨습니다`);
    } else if (kind === "coins") {
      // A delta rather than a total: 「+500」 and 「-200」 are what a teacher
      // actually wants to say, and an absolute number would need them to know
      // what the student is holding right now.
      const typed = prompt(`${handle} 님에게 줄 코인 (회수하려면 음수, 예: -200)`, "500");
      if (!typed) return;
      const coins = Number(typed);
      if (!Number.isFinite(coins) || coins === 0) return toast("숫자를 입력하세요", "bad");
      const result = await call("mutation", "admin:grantCoins", { handle, coins });
      toast(`${handle} 코인 → ${result.coins.toLocaleString()}`);
    } else if (kind === "score") {
      // A run rather than a number: the weekly board, the school totals and the
      // hall of fame all descend from the runs table, and a score typed
      // straight into the player row reaches none of them.
      const typed = prompt(`${handle} 님의 기록으로 남길 점수`, "");
      if (!typed) return;
      const score = Math.floor(Number(typed));
      if (!Number.isFinite(score) || score <= 0) return toast("1 이상의 숫자를 입력하세요", "bad");
      const result = await call("mutation", "admin:recordRun", { handle, score });
      toast(
        `${handle} 기록 ${score.toLocaleString()}점 · 최고 ${result.best.toLocaleString()}점`,
      );
    } else if (kind === "unlock") {
      await call("mutation", "admin:unlock", { handle });
      toast(`${handle} 잠금을 풀었습니다`);
    } else if (kind === "rename") {
      const newHandle = prompt(`${handle} 님의 새 닉네임 (8글자까지)`, "");
      if (!newHandle) return;
      const result = await call("mutation", "admin:rename", { handle, newHandle });
      toast(`${result.from} → ${result.to} 로 바꿨습니다`);
    } else if (kind === "remove") {
      // Irreversible and it takes their scores with it, so make them type it.
      const typed = prompt(`정말 삭제하려면 닉네임을 그대로 입력하세요: ${handle}`, "");
      if (typed !== handle) return;
      await call("mutation", "admin:remove", { handle });
      toast(`${handle} 계정을 삭제했습니다`);
    } else if (kind === "school") {
      const school = askSchool(handle);
      if (!school) return;
      const result = await call("mutation", "admin:setSchool", { handle, ...school });
      toast(`${handle} → ${result.schoolLabel}`);
    } else if (kind === "unschool") {
      await call("mutation", "admin:clearSchool", { handle });
      toast(`${handle} 의 학교를 지웠습니다. 본인이 다시 정할 수 있습니다`);
    } else if (kind === "resolve") {
      await call("mutation", "admin:resolveReports", { handle });
      toast(`${handle} 신고를 처리 완료로 표시했습니다`);
    }
    await refresh();
  } catch (error) {
    toast(message(error), "bad");
  }
}

// --- gate -------------------------------------------------------------------

async function unlock(key) {
  adminKey = key;
  // The key is only proven by a call the server accepts.
  await call("query", "admin:list", { limit: 1 });
  sessionStorage.setItem(KEY_STORE, key);
  $("admin-gate").classList.add("hidden");
  $("admin-panel").classList.remove("hidden");
  $("admin-signout").classList.remove("hidden");
  await refresh();
}

$("admin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("admin-error");
  error.classList.add("hidden");
  try {
    await unlock($("admin-key").value.trim());
  } catch (err) {
    adminKey = null;
    error.textContent = message(err);
    error.classList.remove("hidden");
  }
});

$("admin-signout").addEventListener("click", () => {
  sessionStorage.removeItem(KEY_STORE);
  location.reload();
});

$("admin-search").addEventListener("input", renderPlayers);

async function mergeSchool(fromKey) {
  const from = schools.find((row) => row.key === fromKey);
  const others = schools.filter((row) => row.key !== fromKey);
  if (!others.length) return toast("합칠 상대가 없습니다", "bad");

  const menu = others.map((row, i) => `${i + 1}. ${row.label} (${row.members}명)`).join("\n");
  const pick = prompt(`「${from.label}」 을(를) 어느 학교로 합칠까요?\n\n${menu}`, "");
  const target = others[Number(pick) - 1];
  if (!target) return;
  if (!confirm(`${from.label} (${from.members}명) 을 ${target.label} 로 합칩니다. 되돌릴 수 없습니다.`)) {
    return;
  }

  try {
    const result = await call("mutation", "admin:mergeSchools", { fromKey, toKey: target.key });
    toast(`${result.from} → ${result.to} · ${result.moved}명 이동`);
    await refresh();
  } catch (error) {
    toast(message(error), "bad");
  }
}

$("admin-recompute").addEventListener("click", async () => {
  try {
    const result = await call("mutation", "admin:recomputeSchools");
    toast(`학교 ${result.schools}곳 재계산 · ${result.removed}곳 정리`);
    await refresh();
  } catch (error) {
    toast(message(error), "bad");
  }
});

$("admin-schools").addEventListener("click", (event) => {
  const button = event.target.closest("[data-act='merge']");
  if (button) mergeSchool(button.dataset.key);
});

for (const id of ["admin-reports", "admin-players"]) {
  $(id).addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (button) act(button.dataset.act, button.dataset.handle);
  });
}

const saved = sessionStorage.getItem(KEY_STORE);
if (saved) unlock(saved).catch(() => sessionStorage.removeItem(KEY_STORE));
