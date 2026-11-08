import { ConvexClient } from "convex/browser";
// The stylesheet is pulled in per entry point. Without this line the admin page
// ships with no CSS at all — including `.hidden`, so the key form and the panel
// it guards are both on screen at once.
import "./style.css";
import { escapeHtml } from "./ui.js";
import { GENERAL_LEVEL, LEVELS, REGIONS, TEACHER, validateSchool, TEACHER_DISPLAY } from "./school.js";
import { classEconomy } from "./economy.js";
import { characterById } from "./characters.js";
import { cosmeticById } from "./cosmetics.js";
import { POWERUPS, POWERUP_IDS, POWERUP_MAX_LEVEL } from "./powerups.js";

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

/** 「3분 전」, falling back to the date once it is more than a day old. */
function ago(ms) {
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return when(ms);
}

async function call(kind, name, args = {}) {
  return await client[kind](name, { adminKey, ...args });
}

// --- rendering --------------------------------------------------------------

let players = [];
let schools = [];
/** The school picked to be folded into another, while staff choose the target. */
let merging = null;

/** One line per player, newest first; tapping it opens that player's recent runs. */
function renderRuns(rows) {
  const byPlayer = new Map();
  for (const row of rows) {
    if (!byPlayer.has(row.handle)) byPlayer.set(row.handle, []);
    byPlayer.get(row.handle).push(row);
  }
  const line = (run) =>
    `${ago(run.createdAt)} · ${Math.floor(run.distance).toLocaleString()}m · ${Math.floor(run.seconds)}초`;

  // Headed by the best of the player's recent runs rather than the latest: the
  // latest is as often as not a two-second stumble, and that is not who they are.
  $("admin-runs").innerHTML = byPlayer.size
    ? [...byPlayer.values()]
        .map((runs) => {
          const [latest] = runs;
          const best = runs.reduce((top, run) => (run.score > top.score ? run : top));
          const head = `
          <span class="admin-handle">${escapeHtml(latest.handle)} <b class="admin-score">최고 ${best.score.toLocaleString()}점</b> <em class="admin-count">${runs.length}판</em></span>
          <span class="admin-meta">마지막 판 ${ago(latest.createdAt)}${latest.school ? ` · ${escapeHtml(latest.school)}` : ""}</span>`;
          return `
      <details class="admin-row admin-player">
        <summary class="admin-row-main">${head}</summary>
        <ul class="admin-runs">
          ${runs
            .map(
              (run) =>
                `<li><b class="admin-score">${run === best ? "★ " : ""}${run.score.toLocaleString()}점</b> <span class="admin-meta">${line(run)}</span></li>`,
            )
            .join("")}
        </ul>
      </details>`;
        })
        .join("")
    : `<p class="admin-empty">아직 기록된 판이 없습니다.</p>`;
}

// --- economy ----------------------------------------------------------------

let economy = null;
let economySort = "coins";

const n = (value) => Math.round(value).toLocaleString();
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");

/** A 100% bar in up to four parts, each named and numbered beside it, never by colour alone. */
function stack(parts) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const segments = parts
    .filter((part) => part.value > 0)
    .map(
      (part) =>
        `<span class="econ-seg" style="flex:${part.value};background:var(--econ-${part.slot})" title="${escapeHtml(
          part.label,
        )} ${n(part.value)} (${pct(part.value, total)})"></span>`,
    )
    .join("");
  const legend = parts
    .map(
      (part) => `
      <li><i style="background:var(--econ-${part.slot})"></i>${escapeHtml(part.label)}
        <b>${n(part.value)}</b><span>${pct(part.value, total)}</span></li>`,
    )
    .join("");
  return `<div class="econ-stack">${segments || `<span class="econ-seg empty"></span>`}</div><ul class="econ-legend">${legend}</ul>`;
}

/** One measure per row, longest first, the number written beside the bar. */
function bars(rows, format = n, scale = 0) {
  const top = Math.max(1, scale, ...rows.map((row) => row.value));
  return `<ul class="econ-bars">${rows
    .map(
      (row) => `
      <li title="${escapeHtml(row.label)} · ${format(row.value)}${row.note ? ` · ${escapeHtml(row.note)}` : ""}">
        <span class="econ-bar-label">${escapeHtml(row.label)}</span>
        <span class="econ-bar-track"><span class="econ-bar" style="width:${((row.value / top) * 100).toFixed(1)}%"></span></span>
        <span class="econ-bar-value">${format(row.value)}${row.note ? `<em>${escapeHtml(row.note)}</em>` : ""}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

const tile = (label, value, note = "") =>
  `<div class="econ-tile"><span>${label}</span><b>${value}</b>${note ? `<em>${note}</em>` : ""}</div>`;

/** What one student owns, by name, for their expanded row. */
function holdings(student) {
  const chips = (list) => (list.length ? list.map((text) => `<span class="econ-chip">${text}</span>`).join("") : `<span class="econ-none">없음</span>`);
  const characters = student.characters
    .map((id) => characterById(id))
    .filter((c) => c && c.cost > 0)
    .map((c) => `${escapeHtml(c.name)} <small>${n(c.cost)}</small>`);
  const cosmetics = student.cosmetics
    .map((id) => cosmeticById(id))
    .filter(Boolean)
    .map((c) => `${c.icon ?? ""} ${escapeHtml(c.name)} <small>${n(c.cost)}</small>`);
  const upgrades = POWERUP_IDS.filter((id) => (student.upgrades[id] ?? 1) > 1).map(
    (id) => `${POWERUPS[id].icon} ${escapeHtml(POWERUPS[id].name)} Lv.${student.upgrades[id]}`,
  );
  const consumables = [
    student.hoverboards ? `🛹 호버보드 ${student.hoverboards}` : "",
    student.antidotes ? `💊 해독제 ${student.antidotes}` : "",
  ].filter(Boolean);
  return `
    ${stack([
      { label: "캐릭터", value: student.spent.characters, slot: 1 },
      { label: "강화", value: student.spent.upgrades, slot: 2 },
      { label: "꾸미기", value: student.spent.cosmetics, slot: 3 },
      { label: "소모품 · 기타", value: student.spent.other, slot: 4 },
    ])}
    <p class="econ-sub">캐릭터</p><div class="econ-chips">${chips(characters)}</div>
    <p class="econ-sub">강화</p><div class="econ-chips">${chips(upgrades)}</div>
    <p class="econ-sub">꾸미기</p><div class="econ-chips">${chips(cosmetics)}</div>
    <p class="econ-sub">지금 가진 소모품</p><div class="econ-chips">${chips(consumables)}</div>`;
}

const SORTS = {
  coins: ["보유 코인", (s) => s.coins],
  earned: ["번 코인", (s) => s.earned],
  spent: ["쓴 코인", (s) => s.spent.total],
  items: ["아이템 수", (s) => s.itemCount],
};

function renderStudents() {
  const root = $("econ-students");
  if (!root || !economy) return;
  const key = SORTS[economySort][1];
  root.innerHTML = [...economy.students]
    .sort((a, b) => key(b) - key(a))
    .map(
      (student) => `
      <details class="admin-row admin-player">
        <summary class="admin-row-main">
          <span class="admin-handle">${escapeHtml(student.handle)} <b class="admin-score">보유 ${n(student.coins)}</b>${
            student.flagged ? ' <em class="locked">저장 거절됨</em>' : ""
          }</span>
          <span class="admin-meta">번 ${n(student.earned)} · 쓴 ${n(student.spent.total)} · 아이템 ${student.itemCount}개 · ${student.runs}판${
            student.school ? ` · ${escapeHtml(student.school)}` : ""
          }</span>
        </summary>
        ${holdings(student)}
      </details>`,
    )
    .join("");
}

function renderEconomy(rows) {
  const root = $("admin-economy");
  if (!rows.length) {
    root.innerHTML = `<p class="admin-empty">아직 학생이 없습니다.</p>`;
    return;
  }
  economy = classEconomy(rows);
  const { totals, owners } = economy;
  const richest = [...economy.students].sort((a, b) => b.coins - a.coins);

  root.innerHTML = `
    <div class="econ-tiles">
      ${tile("지금 남은 코인", n(totals.coins), `1인 평균 ${n(totals.coins / totals.students)}`)}
      ${tile("지금까지 번 코인", n(totals.earned))}
      ${tile("지금까지 쓴 코인", n(totals.spent), `번 코인의 ${pct(totals.spent, totals.earned)}`)}
      ${tile("한 번이라도 산 학생", `${totals.buyers} / ${totals.students}명`)}
    </div>

    <h3 class="econ-title">코인은 어디서 들어왔나</h3>
    ${stack([
      { label: "판에서 주운 코인", value: totals.income.runs, slot: 1 },
      { label: "미션 · 출석 · 레벨업 · 이벤트 · 관리자 지급", value: totals.income.other, slot: 2 },
    ])}

    <h3 class="econ-title">코인은 어디에 썼나</h3>
    ${stack([
      { label: "캐릭터", value: totals.spending.characters, slot: 1 },
      { label: "강화", value: totals.spending.upgrades, slot: 2 },
      { label: "꾸미기", value: totals.spending.cosmetics, slot: 3 },
      { label: "소모품 · 기타", value: totals.spending.other, slot: 4 },
    ])}
    <p class="admin-note small">소모품 · 기타는 쓴 코인 중 지금 가진 물건으로 설명되지 않는 부분입니다. 판에서 써 버린 호버보드 · 해독제, 가격이 바뀐 물건 등이 여기 들어갑니다.</p>

    <h3 class="econ-title">보유 코인 순위</h3>
    ${bars(richest.slice(0, 15).map((s) => ({ label: s.handle, value: s.coins })))}

    <h3 class="econ-title">많이 팔린 캐릭터</h3>
    ${owners.characters.length ? bars(owners.characters.map((c) => ({ label: c.name, value: c.count, note: `${n(c.coins)}코인` })), (v) => `${v}명`) : `<p class="admin-empty">아직 산 캐릭터가 없습니다.</p>`}

    <h3 class="econ-title">많이 팔린 꾸미기</h3>
    ${owners.cosmetics.length ? bars(owners.cosmetics.slice(0, 15).map((c) => ({ label: `${c.icon} ${c.name}`, value: c.count, note: `${n(c.coins)}코인` })), (v) => `${v}명`) : `<p class="admin-empty">아직 산 꾸미기가 없습니다.</p>`}

    <h3 class="econ-title">강화 평균 레벨</h3>
    ${bars(owners.upgrades.map((u) => ({ label: `${u.icon} ${u.name}`, value: u.average, note: `강화한 학생 ${u.raised}명 · 최대 ${u.maxed}명` })), (v) => `Lv.${v.toFixed(1)}`, POWERUP_MAX_LEVEL)}

    <h3 class="econ-title">지금 가진 소모품</h3>
    <div class="econ-tiles">
      ${tile("🛹 호버보드", `${n(totals.hoverboards)}개`)}
      ${tile("💊 해독제", `${n(totals.antidotes)}개`)}
    </div>

    <div class="admin-head-row econ-students-head">
      <h3 class="econ-title">학생별</h3>
      <select id="econ-sort" aria-label="정렬">
        ${Object.entries(SORTS)
          .map(([id, [label]]) => `<option value="${id}"${id === economySort ? " selected" : ""}>${label} 순</option>`)
          .join("")}
      </select>
    </div>
    <div id="econ-students" class="admin-list"></div>`;
  renderStudents();
}

function renderSeen(rows) {
  $("admin-seen").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <div class="admin-row">
        <div class="admin-row-main">
          <span class="admin-handle">${escapeHtml(row.handle)} <b class="admin-when">${ago(row.updatedAt)}</b></span>
          <span class="admin-meta">이번 시즌 최고 ${row.best.toLocaleString()}점${
            row.school ? ` · ${escapeHtml(row.school)}` : ""
          }</span>
        </div>
      </div>`,
        )
        .join("")
    : `<p class="admin-empty">아직 접속 기록이 없습니다.</p>`;
}

function renderSchools() {
  const root = $("admin-schools");
  if (!schools.length) {
    root.innerHTML = `<p class="admin-empty">등록된 학교가 없습니다.</p>`;
    return;
  }
  root.innerHTML = schools
    .map((row) => {
      const picked = merging === row.key;
      const action = !merging
        ? `<button data-act="merge" data-key="${escapeHtml(row.key)}">합치기</button>`
        : picked
          ? `<button data-act="cancel">취소</button>`
          : `<button data-act="into" data-key="${escapeHtml(row.key)}" class="go">여기로</button>`;
      return `
      <div class="admin-row${picked ? " picked" : ""}">
        <div class="admin-row-main">
          <span class="admin-handle">${escapeHtml(row.label)}</span>
          <span class="admin-meta">${row.members}명 · ${row.total.toLocaleString()}점</span>
        </div>
        <div class="admin-actions">${action}</div>
      </div>`;
    })
    .join("");
}

function renderPlayers() {
  const filter = $("admin-search").value.trim().toLowerCase();
  // In the order of the board players open first: this week, then the season.
  const rows = [
    ...(filter ? players.filter((p) => `${p.handle} ${p.school}`.toLowerCase().includes(filter)) : players),
  ].sort((a, b) => b.weekBest - a.weekBest || b.best - a.best);

  const root = $("admin-players");
  if (!rows.length) {
    root.innerHTML = `<p class="admin-empty">플레이어가 없습니다.</p>`;
    return;
  }

  const now = Date.now();
  root.innerHTML = rows
    .map((row) => {
      const locked = row.lockedUntil > now;
      const handle = escapeHtml(row.handle);
      return `
      <details class="admin-row admin-player">
        <summary class="admin-row-main">
          <span class="admin-handle">${handle}${locked ? ' <em class="locked">잠김</em>' : ""}${
            row.flagged ? ' <em class="locked">저장 거절됨</em>' : ""
          } <b class="admin-score">이번 주 ${row.weekBest.toLocaleString()}점</b></span>
          <span class="admin-meta">이번 시즌 최고 ${row.best.toLocaleString()}점 · ${
            row.school ? escapeHtml(row.school) : "학교 없음"
          } · 코인 ${(
            row.coins ?? 0
          ).toLocaleString()}</span>
          <span class="admin-meta">최근 ${row.updatedAt ? ago(row.updatedAt) : "—"} · 가입 ${when(row.createdAt)}${
            row.failedAttempts ? ` · 비번 실패 ${row.failedAttempts}회` : ""
          }</span>
        </summary>
        <div class="admin-actions">
          <button data-act="school" data-handle="${handle}">학교 ${row.school ? "변경" : "지정"}</button>
          ${row.school ? `<button data-act="unschool" data-handle="${handle}">학교 지우기</button>` : ""}
          <button data-act="coins" data-handle="${handle}">코인</button>
          <button data-act="score" data-handle="${handle}">점수 기록</button>
          <button data-act="pin" data-handle="${handle}">비번 초기화</button>
          ${locked ? `<button data-act="unlock" data-handle="${handle}">잠금 해제</button>` : ""}
          <button data-act="rename" data-handle="${handle}">개명</button>
          <button data-act="remove" data-handle="${handle}" class="danger">삭제</button>
        </div>
      </details>`;
    })
    .join("");
}

async function refresh() {
  const [recent, list, schoolRows, money] = await Promise.all([
    call("query", "admin:recent"),
    call("query", "admin:list", { limit: 200 }),
    call("query", "admin:schools"),
    call("query", "admin:economy"),
  ]);
  renderEconomy(money);
  renderRuns(recent.runs);
  renderSeen(recent.players);
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
  const name = prompt(
    level === GENERAL_LEVEL ? "소속 이름 (선생님)" : "학교 이름 (접미사는 붙여도 됩니다)",
    level === GENERAL_LEVEL ? TEACHER.name : "",
  );
  if (!name) return null;

  const check =
    level === GENERAL_LEVEL && name === TEACHER.name
      ? { ok: true, school: { ...TEACHER }, label: TEACHER_DISPLAY }
      : validateSchool({ region, level, name });
  if (!check.ok) {
    toast(check.message, "bad");
    return null;
  }
  if (!confirm(`이렇게 저장됩니다:\n\n${check.label}\n\n계속할까요?`)) {
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

async function mergeSchool(fromKey, toKey) {
  const from = schools.find((row) => row.key === fromKey);
  const target = schools.find((row) => row.key === toKey);
  merging = null;
  renderSchools();
  if (!from || !target) return;
  if (!confirm(`${from.label} (${from.members}명) 을 ${target.label} 로 합칩니다. 되돌릴 수 없습니다.`)) {
    return;
  }

  try {
    const result = await call("mutation", "admin:mergeSchools", { fromKey, toKey });
    toast(`${result.from} → ${result.to} · ${result.moved}명 이동`);
    await refresh();
  } catch (error) {
    toast(message(error), "bad");
  }
}

$("admin-recompute").addEventListener("click", async () => {
  try {
    const result = await call("mutation", "admin:recomputeSchools");
    // The rebuild deletes rows it folded together, and their weekly figures with
    // them, so this week's totals are rebuilt from this week's runs straight after.
    await call("mutation", "admin:backfillWeek");
    toast(`학교 ${result.schools}곳 재계산 · ${result.removed}곳 정리`);
    await refresh();
  } catch (error) {
    toast(message(error), "bad");
  }
});

$("admin-schools").addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  if (button.dataset.act === "merge") {
    merging = button.dataset.key;
    renderSchools();
    toast("남길 학교의 「여기로」를 누르세요");
  } else if (button.dataset.act === "cancel") {
    merging = null;
    renderSchools();
  } else if (button.dataset.act === "into") {
    mergeSchool(merging, button.dataset.key);
  }
});

$("admin-economy").addEventListener("change", (event) => {
  if (event.target.id !== "econ-sort") return;
  economySort = event.target.value;
  renderStudents();
});

$("admin-players").addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (button) act(button.dataset.act, button.dataset.handle);
});

for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-tab]")) other.classList.toggle("on", other === tab);
    for (const pane of document.querySelectorAll("[data-pane]")) {
      pane.classList.toggle("hidden", pane.dataset.pane !== tab.dataset.tab);
    }
  });
}

const saved = sessionStorage.getItem(KEY_STORE);
if (saved) unlock(saved).catch(() => sessionStorage.removeItem(KEY_STORE));
