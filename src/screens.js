import { readRemember } from "./cloud.js";
import { HOVERBOARD_TIME } from "./config.js";
import { BOARD_HINT } from "./input.js";
import { HANDLE_MAX } from "./nickname.js";
import { GENERAL_LEVEL, LEVELS, REGIONS, levelLabel, previewLabel, validateSchool } from "./school.js";
import { loadSchoolNames } from "./school-list.js";
import { MISSION_TIERS, missionLabel } from "./missions.js";
import { POWERUP_IDS, powerupDuration } from "./powerups.js";
import { missionTier, runXp } from "./progression.js";
import { weekRemainingLabel } from "./week.js";
import { purchase, shopView } from "./shop.js";
import { VERSION } from "./release.js";
import {
  escapeHtml,
  renderHud,
  renderMissions,
  renderNotes,
  renderRank,
  renderSettings,
  renderShop,
} from "./ui.js";

const $ = (id) => document.getElementById(id);

/**
 * Every piece of DOM the game touches.
 *
 * Keeping all of it behind one object means the Game only ever deals in game
 * state, and nothing in the simulation needs to know an element id.
 */
export class Screens {
  /**
   * @param {object} actions callbacks the buttons fire
   */
  constructor(actions) {
    this.actions = actions;
    // Written from the constant rather than typed into the markup, so the
    // badge and the newest patch note can never claim different versions.
    const badge = $("version-badge");
    if (badge) badge.textContent = `ver ${VERSION}`;
    /** Text for the two standing lines, kept together so they move together. */
    this.standings = { mine: "", school: "", schoolNote: "" };
    this.toastTimer = 0;
    this.gainTimer = 0;
    this.nearMissTimer = 0;
    this.shopNoteTimer = 0;
    this.bind();
    this.writeControlHints();
  }

  /**
   * Fill the copy that describes a control from the module that implements it,
   * so changing the gesture cannot leave stale instructions behind.
   */
  writeControlHints() {
    // Short enough to hold one line on a 320px phone. The full control list
    // lives on the title screen; this is only the reminder during a run.
    const hint = $("touch-hint");
    if (hint) hint.textContent = `스와이프로 피하기 · 위로 두 번은 호버보드`;
    const howto = $("howto-board");
    if (howto) howto.textContent = `${BOARD_HINT} — 충돌을 한 번 막아 줍니다`;
  }

  /**
   * Whether the control list starts open.
   *
   * A phone gets a disclosure, because vertical space is the scarce thing
   * there. A wide screen gets it open: the column beside the buttons had room
   * going spare — the whole bottom-right corner of the card was empty — and
   * opening it used to grow the card and shift everything that was already on
   * screen. Something that only ever moves the layout on a click is better off
   * not being a click.
   */
  openHowto(wide) {
    const el = $("howto-wrap");
    if (el) el.open = wide;
  }

  bind() {
    const a = this.actions;
    $("btn-play").onclick = () => a.startRun();
    $("btn-retry").onclick = () => a.startRun();
    $("btn-home").onclick = () => a.toTitle();
    $("btn-quit").onclick = () => a.toTitle();
    $("btn-resume").onclick = () => a.resume();
    $("btn-pause").onclick = () => a.pause();

    const shopBtn = $("btn-shop");
    if (shopBtn) shopBtn.onclick = () => a.openShop();
    const shopClose = $("btn-shop-close");
    if (shopClose) shopClose.onclick = () => this.closeShop();

    const shopList = $("shop-list");
    if (shopList) {
      shopList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-buy]");
        if (button && !button.disabled) a.buy(button.dataset.buy, button.dataset.id);
      });
    }

    const boardBtn = $("btn-board");
    if (boardBtn) boardBtn.onclick = () => a.deployBoard();
    const notesBtn = $("btn-notes");
    if (notesBtn) notesBtn.onclick = () => this.openNotes();
    $("btn-notes-close")?.addEventListener("click", () => this.closeNotes());
    $("btn-notes-x")?.addEventListener("click", () => this.closeNotes());

    const settingsBtn = $("btn-settings");
    if (settingsBtn) settingsBtn.onclick = () => a.openSettings();
    const settingsClose = $("btn-settings-close");
    if (settingsClose) settingsClose.onclick = () => this.closeSettings();

    const accountBtn = $("btn-account");
    if (accountBtn) accountBtn.onclick = () => a.openAccount();
    const accountClose = $("btn-account-close");
    if (accountClose) accountClose.onclick = () => this.closeAccount();
    for (const id of ["btn-leaderboard", "btn-over-board"]) {
      const button = $(id);
      if (button) button.onclick = () => a.openLeaderboard();
    }
    $("btn-board-x")?.addEventListener("click", () => a.closeLeaderboard());
    $("btn-shop-x")?.addEventListener("click", () => this.closeShop());
    $("btn-settings-x")?.addEventListener("click", () => this.closeSettings());

    const boardClose = $("btn-leaderboard-close");
    // Routed through the Game rather than closed directly: it owns the live
    // subscriptions behind the panel and has to be told to drop them.
    if (boardClose) boardClose.onclick = () => a.closeLeaderboard();

    for (const column of ["players", "schools"]) {
      $(`btn-more-${column}`)?.addEventListener("click", () => a.turnBoardPage(column, 1));
      $(`btn-prev-${column}`)?.addEventListener("click", () => a.turnBoardPage(column, -1));
    }

    for (const [id, range] of [
      ["tab-board-week", "week"],
      ["tab-board-all", "all"],
      ["tab-board-level", "level"],
      ["tab-board-hall", "hall"],
    ]) {
      const tab = $(id);
      if (tab) tab.onclick = () => a.setBoardRange(range);
    }

    const boardList = $("leaderboard-list");
    if (boardList) {
      boardList.addEventListener("click", (event) => {
        const flag = event.target.closest("[data-report]");
        if (flag && !flag.disabled) a.reportHandle(flag.dataset.report, flag);
      });
    }

    const schoolBtn = $("btn-school");
    if (schoolBtn) schoolBtn.onclick = () => this.openSchool();
    const schoolClose = $("btn-school-close");
    if (schoolClose) schoolClose.onclick = () => this.closeSchool();
    const schoolForm = $("school-form");
    if (schoolForm) {
      // Submitting the form does not commit — it asks. The choice cannot be
      // undone by the player afterwards, so it gets its own confirmation with
      // the resolved school name spelled out.
      schoolForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.askSchoolConfirm();
      });
    }
    const schoolCancel = $("btn-school-cancel");
    if (schoolCancel) schoolCancel.onclick = () => this.showSchoolConfirm(false);
    const schoolConfirm = $("btn-school-confirm");
    if (schoolConfirm) schoolConfirm.onclick = () => a.submitSchool(this.schoolInput());


    for (const [id, mode] of [["tab-signin", "signin"], ["tab-signup", "signup"]]) {
      const tab = $(id);
      if (tab) tab.onclick = () => this.setAccountMode(mode);
    }

    const form = $("account-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        a.submitAccount(
          this.accountMode ?? "signin",
          $("field-handle").value,
          $("field-pin").value,
          $("field-remember")?.checked ?? true,
        );
      });
    }
    // The PIN field is digits only, enforced as it is typed so the rule is
    // obvious rather than a rejection after the fact.
    //
    // Both fields only ever write back a value that actually differs, and never
    // while a syllable is still being composed: assigning .value mid-composition
    // throws away the Hangul in progress and moves the caret to the end, which
    // is what made typing a nickname feel like the keyboard was skipping.
    const pin = $("field-pin");
    if (pin) {
      pin.addEventListener("input", (event) => {
        if (event.isComposing) return;
        const digits = pin.value.replace(/\D/g, "").slice(0, 4);
        if (digits !== pin.value) pin.value = digits;
      });
    }
    const handle = $("field-handle");
    if (handle) {
      handle.addEventListener("input", (event) => {
        if (event.isComposing) return;
        // Counted in code points, matching the length the validator applies.
        const capped = [...handle.value].slice(0, HANDLE_MAX).join("");
        if (capped !== handle.value) handle.value = capped;
      });
    }

    const settingsList = $("settings-list");
    if (settingsList) {
      settingsList.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-setting]");
        if (toggle) return a.toggleSetting(toggle.dataset.setting);
        const quality = event.target.closest("[data-quality]");
        if (quality) a.setQuality(quality.dataset.quality);
      });
    }
  }

  // --- account ------------------------------------------------------------

  /** Show the account row only when there is a backend to talk to. */
  showAccountBar(cloud) {
    const bar = $("account-bar");
    const boardBtn = $("btn-leaderboard");
    if (bar) bar.classList.toggle("hidden", !cloud.enabled);
    const overBoard = $("btn-over-board");
    const canSee = cloud.enabled && cloud.signedIn;
    if (boardBtn) boardBtn.classList.toggle("hidden", !canSee);
    if (overBoard) overBoard.classList.toggle("hidden", !canSee);
    if (!cloud.enabled) return;

    const state = $("account-state");
    const action = $("btn-account");
    const school = $("btn-school");
    if (cloud.signedIn) {
      const where = cloud.schoolLabel ? ` · ${escapeHtml(cloud.schoolLabel)}` : "";
      if (state) state.innerHTML = `<strong>${escapeHtml(cloud.handle)}</strong> 님으로 기록 중${where}`;
      if (action) action.textContent = "로그아웃";
    } else {
      if (state) state.textContent = "게스트로 플레이 중 · 기록은 이 기기에만 남아요";
      if (action) action.textContent = "로그인";
    }
    // Offered only while there is still a choice to make: once a school is set
    // the button would lead to a form that can only refuse.
    if (school) school.classList.toggle("hidden", !cloud.signedIn || Boolean(cloud.schoolLabel));
  }

  /**
   * The two rank cells on the title screen.
   *
   * Both need a server, so with none configured they are hidden outright rather
   * than left showing a dash — the coin cell widens into the space, and a
   * browser playing offline is not asked a question it cannot answer. Signed
   * out they stay and say so, because that is a state a player can act on.
   *
   * @param {{ me?: object|null, school?: object|null, schoolNote?: string,
   *   guest?: boolean, pending?: boolean }|null} ranks null when there is no
   *   backend at all
   */
  showTitleRanks(ranks) {
    const cells = [$("cell-rank"), $("cell-school")];
    for (const cell of cells) cell?.classList.toggle("hidden", !ranks);
    if (!ranks) return;

    const write = (id, text, quiet) => {
      const el = $(id);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("quiet", Boolean(quiet));
    };

    if (ranks.guest || ranks.pending) {
      const text = ranks.guest ? "로그인" : "…";
      write("stat-rank", text, true);
      write("stat-school", text, true);
      return;
    }

    write(
      "stat-rank",
      ranks.me?.rank != null ? `${ranks.me.rank}위` : "기록 없음",
      ranks.me?.rank == null,
    );
    write(
      "stat-school",
      ranks.school?.rank != null ? `${ranks.school.rank}위` : ranks.schoolNote || "—",
      ranks.school?.rank == null,
    );
  }

  openAccount(mode = "signin") {
    this.setAccountMode(mode);
    $("field-handle").value = "";
    $("field-pin").value = "";
    // Opens the way it was left, so someone on a shared computer does not have
    // to remember to untick it every single time.
    const remember = $("field-remember");
    if (remember) remember.checked = readRemember();
    this.showAccountError(null);
    $("account-screen").classList.remove("hidden");
    $("field-handle").focus();
  }

  closeAccount() {
    const panel = $("account-screen");
    if (panel) panel.classList.add("hidden");
  }

  setAccountMode(mode) {
    this.accountMode = mode;
    const signup = mode === "signup";
    $("tab-signin")?.classList.toggle("on", !signup);
    $("tab-signup")?.classList.toggle("on", signup);
    const title = $("account-title");
    if (title) title.textContent = signup ? "회원가입" : "로그인";
    const submit = $("btn-account-submit");
    if (submit) submit.textContent = signup ? "가입하고 시작" : "로그인";
    this.showAccountError(null);
  }

  showAccountError(message) {
    const el = $("account-error");
    if (!el) return;
    el.textContent = message ?? "";
    el.classList.toggle("hidden", !message);
  }

  setAccountBusy(busy) {
    const submit = $("btn-account-submit");
    if (submit) submit.disabled = busy;
  }

  // --- leaderboard ---------------------------------------------------------

  openLeaderboard(range = "week") {
    this.setBoardTab(range);
    $("leaderboard-screen").classList.remove("hidden");
  }

  /**
   * Paging controls under a column.
   *
   * The buttons say which places they lead to rather than 「다음」: a board is
   * read by rank, so 「11–20위」 answers the question 「내 순위 근처가 어디냐」
   * before it is pressed.
   *
   * @param {"players"|"schools"} column
   * @param {{ page: number, size: number, hasMore: boolean }} state
   */
  setBoardPager(column, state) {
    const nav = $(`nav-${column}`);
    const next = $(`btn-more-${column}`);
    const prev = $(`btn-prev-${column}`);
    if (!nav) return;

    const back = state.page > 0;
    nav.classList.toggle("hidden", !state.hasMore && !back);
    if (prev) {
      prev.classList.toggle("hidden", !back);
      const from = (state.page - 1) * state.size + 1;
      prev.textContent = `${from}–${from + state.size - 1}위`;
    }
    if (next) {
      next.classList.toggle("hidden", !state.hasMore);
      const from = (state.page + 1) * state.size + 1;
      next.textContent = `${from}–${from + state.size - 1}위`;
    }
  }

  /**
   * Which stretch of time the individual column is counting.
   *
   * The weekly board is the default because it is the one a player can still
   * do something about: an all-time list in a school fills up with whoever
   * started first, and everyone who joins in March reads it as a closed door.
   */
  setBoardTab(range) {
    for (const [id, value] of [
      ["tab-board-week", "week"],
      ["tab-board-all", "all"],
      ["tab-board-level", "level"],
      ["tab-board-hall", "hall"],
    ]) {
      $(id)?.classList.toggle("on", range === value);
    }

    // The ladder is about one person's whole history, so it has no school half
    // to show and takes the width instead of leaving it blank.
    const solo = range === "level";
    $("leaderboard-screen")?.classList.toggle("solo", solo);
    const schoolCol = $("school-list")?.closest(".board-col");
    if (schoolCol) schoolCol.classList.toggle("hidden", solo);
    const heading = $("player-title");
    if (heading) heading.textContent = solo ? "레벨" : "개인";

    // Both columns follow the tabs now, so both captions are written here.
    const school = $("school-note");
    if (school) {
      school.textContent =
        range === "hall"
          ? "주간 1~3위"
          : range === "week"
            ? `월요일 0시 초기화 · ${weekRemainingLabel(Date.now())}`
            : "전체 기간 누적";
    }

    const note = $("board-reset");
    if (note) {
      note.textContent =
        range === "hall"
          ? "지난 주의 기록"
          : range === "level"
            ? "누적 경험치 순위 · 미션과 점수로 오릅니다"
            : range === "week"
              ? `월요일 0시 초기화 · ${weekRemainingLabel(Date.now())}`
              : "전체 기간 최고 기록";
    }
  }

  closeLeaderboard() {
    const panel = $("leaderboard-screen");
    if (panel) panel.classList.add("hidden");
  }

  // --- school --------------------------------------------------------------

  /**
   * Fill the region and level menus from the shared rules module, so the only
   * regions offered are the ones the server will accept.
   */
  buildSchoolForm() {
    const region = $("field-region");
    const level = $("field-level");
    if (!region || !level || region.options.length) return;

    region.innerHTML =
      `<option value="">선택</option>` +
      REGIONS.map((name) => `<option value="${name}">${name}</option>`).join("");
    level.innerHTML =
      `<option value="">선택</option>` +
      LEVELS.map((entry) => `<option value="${entry.code}">${entry.label}</option>`).join("");

    const onInput = () => this.updateSchoolPreview();
    region.onchange = onInput;
    level.onchange = onInput;
    $("field-school").oninput = onInput;
    const general = $("field-general");
    if (general) general.onchange = onInput;
  }

  /** True while 일반부 is ticked, which makes the school fields irrelevant. */
  isGeneralPicked() {
    return Boolean($("field-general")?.checked);
  }

  schoolInput() {
    // 일반부 carries no region and no name, so none is sent: the rules answer on
    // the level alone, and a half-filled form left behind cannot leak into it.
    if (this.isGeneralPicked()) return { region: "", level: GENERAL_LEVEL, name: "" };
    return {
      region: $("field-region")?.value ?? "",
      level: $("field-level")?.value ?? "",
      name: $("field-school")?.value ?? "",
    };
  }

  /**
   * Show the name that would actually be stored, live.
   *
   * This is what stops 「동중」 from being submitted in the belief that it will
   * read 「동중중학교」 — the answer is on screen before anyone presses the button.
   */
  updateSchoolPreview() {
    const preview = $("school-preview");
    if (!preview) return;
    const general = this.isGeneralPicked();
    // The school fields are left visible but inert under 일반부, so what was
    // typed is still there if the box is unticked again.
    for (const id of ["field-region", "field-level", "field-school"]) {
      const field = $(id);
      if (field) field.disabled = general;
    }

    const submit = $("btn-school-submit");
    if (submit) submit.textContent = general ? "일반부로 참여하기" : "이 학교로 정하기";

    const input = this.schoolInput();
    const label = previewLabel(input);
    preview.textContent = label
      ? `이렇게 저장돼요 → ${label}`
      : "지역과 학교급을 고르고 이름을 입력해 주세요";
    preview.classList.toggle("on", Boolean(label));
    this.suggestSchools(input);
  }

  /**
   * Offer the real schools in that region, when the bundled list is present.
   * Without it the field is simply a plain text box — the rules do not change.
   */
  async suggestSchools({ region, level }) {
    const list = $("school-options");
    if (!list) return;
    if (!region || !level) {
      list.innerHTML = "";
      return;
    }

    const names = await loadSchoolNames(region, level);
    const suffix = levelLabel(level);
    list.innerHTML = names
      .map((name) => {
        // A leading "=" marks a name that does not follow the usual pattern and
        // is therefore stored whole.
        const full = name.startsWith("=") ? name.slice(1) : `${name}${suffix}`;
        const label = full === "DIS" ? "DIS (대구국제학교)" : "";
        return `<option value="${escapeHtml(full)}"${label ? ` label="${escapeHtml(label)}"` : ""}></option>`;
      })
      .join("");
  }

  openSchool() {
    this.buildSchoolForm();
    $("field-school").value = "";
    const general = $("field-general");
    if (general) general.checked = false;
    this.showSchoolError(null);
    this.showSchoolConfirm(false);
    this.updateSchoolPreview();
    $("school-screen").classList.remove("hidden");
    $("field-region").focus();
  }

  /**
   * Check the input here first, so the confirmation only ever appears for a
   * school that will actually be accepted — being asked "are you sure?" and
   * then told the input was wrong is the worst of both.
   */
  askSchoolConfirm() {
    const check = validateSchool(this.schoolInput());
    if (!check.ok) {
      this.showSchoolError(check.message);
      return;
    }
    this.showSchoolError(null);
    $("school-confirm-label").textContent = check.label;
    this.showSchoolConfirm(true);
  }

  showSchoolConfirm(on) {
    $("school-confirm")?.classList.toggle("hidden", !on);
    // The form stays visible but inert, so the choice being confirmed is still
    // on screen above the warning.
    $("btn-school-submit")?.classList.toggle("hidden", on);
    for (const id of ["field-region", "field-level", "field-school"]) {
      const field = $(id);
      // Back out of the confirmation and 일반부 decides again which of these are
      // usable, rather than the confirmation handing them all back.
      if (field) field.disabled = on || this.isGeneralPicked();
    }
    const general = $("field-general");
    if (general) general.disabled = on;
  }

  closeSchool() {
    const panel = $("school-screen");
    if (panel) panel.classList.add("hidden");
  }

  showSchoolError(message) {
    const el = $("school-error");
    if (!el) return;
    el.textContent = message ?? "";
    el.classList.toggle("hidden", !message);
    // A server refusal lands here; drop back to the form so it can be fixed.
    if (message) this.showSchoolConfirm(false);
  }

  setSchoolBusy(busy) {
    const confirm = $("btn-school-confirm");
    if (confirm) confirm.disabled = busy;
  }

  showReportNote(message) {
    const note = $("report-note");
    if (!note) return;
    note.textContent = message ?? "";
    note.classList.toggle("hidden", !message);
    clearTimeout(this.reportNoteTimer);
    if (message) this.reportNoteTimer = setTimeout(() => note.classList.add("hidden"), 3000);
  }

  renderLeaderboard(rows, standing, myHandle) {
    const list = $("leaderboard-list");
    if (!list) return;

    if (!rows?.length) {
      list.innerHTML = `<li class="leaderboard-empty">아직 기록이 없어요. 첫 번째가 되어 보세요!</li>`;
    } else {
      list.innerHTML = rows
        .map((row) => {
          const mine = row.handle === myHandle;
          // No flag on your own row, and none at all for a signed-out viewer:
          // a report has to be attributable to be worth acting on.
          const flag =
            myHandle && !mine
              ? `<button type="button" class="report-flag" data-report="${escapeHtml(
                  row.handle,
                )}" title="닉네임 신고" aria-label="${escapeHtml(row.handle)} 신고">🚩</button>`
              : `<span class="report-flag" aria-hidden="true"></span>`;
          // The school under the name, where there is one. A player who has not
          // picked yet simply has a one-line row.
          const where = row.school
            ? `<em class="row-school">${escapeHtml(row.school)}</em>`
            : "";
          // What the name has earned over everything, beside what it did once.
          const level = row.level ? ` <em class="row-level">Lv.${row.level}</em>` : "";
          return `
            <li class="leaderboard-row${mine ? " me" : ""}">
              <span class="leaderboard-rank">${row.rank}</span>
              <span class="leaderboard-handle">${escapeHtml(row.handle)}${level}${where}</span>
              <span class="leaderboard-score">${row.best.toLocaleString()}</span>
              ${flag}
            </li>`;
        })
        .join("");

      // Outside the top ten, the list is a list of other people. Pinned at the
      // bottom so the player can see where they sit relative to it, which is
      // the question they opened the board to answer.
      if (standing?.rank != null && !rows.some((row) => row.handle === myHandle)) {
        list.insertAdjacentHTML(
          "beforeend",
          `<li class="leaderboard-row me pinned">
             <span class="leaderboard-rank">${standing.rank}</span>
             <span class="leaderboard-handle">${escapeHtml(standing.handle ?? myHandle ?? "")}${
               standing.level ? ` <em class="row-level">Lv.${standing.level}</em>` : ""
             }</span>
             <span class="leaderboard-score">${standing.best.toLocaleString()}</span>
             <span class="report-flag" aria-hidden="true"></span>
           </li>`,
        );
      }
    }

    this.standings.mine =
      standing?.rank != null
        ? `내 순위 ${standing.rank}위 · ${standing.best.toLocaleString()}점`
        : "";
    this.applyStandings();
  }

  /**
   * The school column.
   *
   * A school's figure is the sum of its members' best scores, so the member
   * count is shown alongside it — without that, a big school's lead looks like
   * skill rather than headcount.
   */
  renderSchoolBoard(rows, standing, note = "") {
    const list = $("school-list");
    if (!list) return;

    if (!rows?.length) {
      list.innerHTML = `<li class="leaderboard-empty">아직 학교 기록이 없어요.</li>`;
    } else {
      const mineKey = standing?.rank != null ? rows.find((row) => row.label === standing.label)?.key : null;
      list.innerHTML = rows
        .map(
          (row) => `
            <li class="leaderboard-row${row.key === mineKey ? " me" : ""}">
              <span class="leaderboard-rank">${row.rank}</span>
              <span class="leaderboard-handle">
                ${escapeHtml(row.label)}
                <em class="school-members">${row.members}명</em>
              </span>
              <span class="leaderboard-score">${row.total.toLocaleString()}</span>
            </li>`,
        )
        .join("");

      // Same for the school column: a school outside the top ten is still the
      // player's school, and its place is the point.
      if (standing?.rank != null && !rows.some((row) => row.label === standing.label)) {
        list.insertAdjacentHTML(
          "beforeend",
          `<li class="leaderboard-row me pinned">
             <span class="leaderboard-rank">${standing.rank}</span>
             <span class="leaderboard-handle">
               ${escapeHtml(standing.label)}
               <em class="school-members">${standing.members ?? 0}명</em>
             </span>
             <span class="leaderboard-score">${standing.total.toLocaleString()}</span>
           </li>`,
        );
      }
    }

    this.standings.school =
      standing?.rank != null
        ? `${standing.label} · ${standing.rank}위 · ${standing.total.toLocaleString()}점`
        : "";
    this.standings.schoolNote = note;
    this.applyStandings();
  }

  /**
   * The two 「내 순위」 lines, shown and hidden as a pair.
   *
   * Each sits above its own column, so one appearing alone pushes that list
   * down and the two boards stop lining up — which is all a reader sees. The
   * side with nothing to report keeps its slot and says why instead, which is
   * more use than a blank strip anyway: 일반부 players kept looking for a school
   * rank that is never going to be there.
   */
  applyStandings() {
    const { mine, school, schoolNote } = this.standings;
    const solo = $("leaderboard-screen")?.classList.contains("solo");
    const any = Boolean(mine || (!solo && school));
    const slots = [
      ["my-standing", mine, "아직 내 기록이 없어요"],
      ["my-school-standing", school, schoolNote || "학교를 정하면 순위가 나와요"],
    ];
    for (const [id, text, fallback] of slots) {
      const el = $(id);
      if (!el) continue;
      el.classList.toggle("hidden", !any);
      // Muted, so an explanation never reads as a placing.
      el.classList.toggle("quiet", any && !text);
      if (any) el.textContent = text || fallback;
    }
  }

  // --- overlays -----------------------------------------------------------

  setOverlay(mode) {
    $("title-screen").classList.toggle("hidden", mode !== "title");
    $("gameover-screen").classList.toggle("hidden", mode !== "dead");
    $("pause-screen").classList.add("hidden");
    this.closeShop();
    this.closeSettings();
    this.closeAccount();
    this.actions.closeLeaderboard?.();
    this.closeSchool();
    $("hud").classList.toggle("hidden", mode !== "hud" && mode !== "dead");
    $("btn-pause").classList.toggle("hidden", mode !== "hud");
    if (mode !== "hud") $("touch-hint").classList.add("hidden");
    // A pointer sitting in the middle of the track reads as something in the
    // game. It comes back the moment there is a button to press.
    document.body.classList.toggle("running", mode === "hud");
  }

  showPause(visible) {
    $("pause-screen").classList.toggle("hidden", !visible);
  }

  gameOverVisible() {
    return !$("gameover-screen").classList.contains("hidden");
  }

  openShop(save) {
    renderShop($("shop-list"), shopView(save));
    $("shop-screen").classList.remove("hidden");
  }

  closeShop() {
    const shop = $("shop-screen");
    if (shop) shop.classList.add("hidden");
  }

  /**
   * The patch notes.
   *
   * Rendered on open rather than at boot: the list is static, but it is also
   * the one screen most players will never open, and building it costs nothing
   * if nobody asks.
   */
  openNotes() {
    renderNotes($("notes-list"));
    $("notes-screen")?.classList.remove("hidden");
  }

  closeNotes() {
    $("notes-screen")?.classList.add("hidden");
  }

  openSettings(settings, tier) {
    renderSettings($("settings-list"), settings, tier);
    $("settings-screen").classList.remove("hidden");
  }

  closeSettings() {
    const panel = $("settings-screen");
    if (panel) panel.classList.add("hidden");
  }

  refreshSettings(settings, tier) {
    renderSettings($("settings-list"), settings, tier);
  }

  refreshShop(save) {
    renderShop($("shop-list"), shopView(save));
  }

  /** @returns {{ ok: boolean, reason?: string }} */
  buy(store, kind, id) {
    const result = purchase(store, kind, id);
    if (!result.ok) {
      this.flashShopNote(result.reason === "poor" ? "코인이 부족합니다" : "이미 최대입니다");
    }
    return result;
  }

  flashShopNote(text) {
    const note = $("shop-note");
    if (!note) return;
    note.textContent = text;
    note.classList.remove("hidden", "pop");
    void note.offsetWidth;
    note.classList.add("pop");
    clearTimeout(this.shopNoteTimer);
    this.shopNoteTimer = setTimeout(() => note.classList.add("hidden"), 1400);
  }

  // --- persistent profile --------------------------------------------------

  refreshProfile(save) {
    // Days in a row, where the player sees it before deciding to play rather
    // than after. A streak nobody can see is not a streak.
    const streakEl = $("streak-chip");
    if (streakEl) {
      const days = Math.max(0, Math.floor(save.streak ?? 0));
      streakEl.classList.toggle("hidden", days < 1);
      streakEl.textContent = `🔥 ${days}일 연속`;
    }

    const best = save.best.toLocaleString();
    for (const id of ["best-score", "hud-best", "over-best"]) {
      const el = $(id);
      if (el) el.textContent = best;
    }
    // The game-over card shows the bank too, so a run's earnings can be read
    // against what they add up to.
    for (const id of ["coin-bank", "shop-coins", "over-bank"]) {
      const el = $(id);
      if (el) el.textContent = save.coins.toLocaleString();
    }
    const boardCount = $("board-count");
    if (boardCount) boardCount.textContent = String(save.hoverboards);
    renderMissions($("mission-list"), save.missions, missionTier(save.xp, MISSION_TIERS));
    renderRank($("rank-name"), $("rank-fill"), $("rank-xp"), save.xp);
  }

  // --- in-run HUD ----------------------------------------------------------

  resetHud() {
    $("pace-chip").textContent = "START";
    $("speed-toast").classList.add("hidden");
    $("coin-gain").classList.add("hidden");
    this.setCrowVeil(0);
    $("combo").classList.remove("on");
    // Nothing to say to a keyboard: the hint describes swipes.
    const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const hint = $("touch-hint");
    hint.classList.toggle("hidden", !touch);
    hint.classList.remove("fading");
  }

  hideHint() {
    // Faded rather than cut, so it reads as finishing instead of glitching.
    const hint = $("touch-hint");
    if (hint.classList.contains("hidden") || hint.classList.contains("fading")) return;
    hint.classList.add("fading");
    setTimeout(() => hint.classList.add("hidden"), 400);
  }

  setPhaseLabel(text) {
    $("pace-chip").textContent = text;
  }

  syncHud(game) {
    const durations = {};
    for (const id of POWERUP_IDS) durations[id] = powerupDuration(id, game.store.upgradeLevel(id));

    renderHud({
      score: game.run.score,
      coins: game.run.coins,
      combo: game.run.combo,
      powerups: game.run.powerups,
      durations,
      boarding: game.player.boarding,
      boardT: game.boardT,
      // The full duration this run's board actually got, so a character that
      // extends it drains a full bar rather than one that starts over 100%.
      boardMax: HOVERBOARD_TIME * (game.boardScale ?? 1),
      boardUsed: game.boardUsed,
      hoverboards: game.store.data.hoverboards,
      antidotes: game.store.data.antidotes ?? 0,
      phaseName: game.phaseName(),
      speed: game.speed,
      crow: game.run.crowT > 0 ? { remaining: game.run.crowT, seconds: game.run.crowSeconds } : null,
      event: game.section
        ? {
            name: game.section.event.name,
            multiplier: game.section.event.scoreMultiplier,
            remaining: game.section.remaining,
            seconds: game.section.seconds,
          }
        : null,
    });
  }

  /** The banner that says what this stretch of track is for. */
  /**
   * Drive the crow's overlay.
   *
   * Written straight to the style every frame from the curve in crow.js rather
   * than handed to a CSS transition, so the sheet, the fog and the lights are
   * always at the same point of the same ramp.
   *
   * @param {number} veil 0-1
   * @param {boolean} blur whether this quality tier can afford a backdrop blur
   */
  setCrowVeil(veil, blur = false) {
    const el = $("crow-veil");
    if (!el) return;
    if (veil <= 0) {
      if (this.crowVeilOn) {
        el.style.opacity = "0";
        el.classList.remove("blurred");
        this.crowVeilOn = false;
      }
      return;
    }
    this.crowVeilOn = true;
    el.style.opacity = String(veil);
    el.classList.toggle("blurred", blur);
    if (blur) el.style.setProperty("--crow-blur", `${(veil * 3.4).toFixed(2)}px`);
  }

  showEvent(event) {
    const el = $("event-chip");
    if (!el) return;
    el.style.setProperty("--event", event.colour ?? "var(--gold)");
    // The label is written by the HUD sync, which also drains the bar.
    el.classList.remove("hidden");
  }

  hideEvent() {
    $("event-chip")?.classList.add("hidden");
  }

  showToast(text) {
    const el = $("speed-toast");
    el.textContent = text;
    el.classList.remove("hidden", "pop");
    void el.offsetWidth;
    el.classList.add("pop");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("pop");
    }, 1200);
  }

  flashCoinGain(gain) {
    const gainEl = $("coin-gain");
    gainEl.textContent = `+${gain}`;
    gainEl.classList.remove("hidden", "pop");
    void gainEl.offsetWidth;
    gainEl.classList.add("pop");
    clearTimeout(this.gainTimer);
    this.gainTimer = setTimeout(() => gainEl.classList.add("hidden"), 520);

    const scoreEl = $("score");
    scoreEl.classList.remove("score-punch");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-punch");

    const chip = $("coin-count").parentElement;
    chip.classList.remove("coin-punch");
    void chip.offsetWidth;
    chip.classList.add("coin-punch");
  }

  flashNearMiss() {
    const el = $("near-miss");
    if (!el) return;
    el.classList.remove("hidden", "pop");
    void el.offsetWidth;
    el.classList.add("pop");
    clearTimeout(this.nearMissTimer);
    this.nearMissTimer = setTimeout(() => el.classList.add("hidden"), 520);
  }

  // --- game over -----------------------------------------------------------

  showGameOver(run, save, result, promotion = null) {
    const rounded = Math.floor(run.score);

    $("final-score").textContent = rounded.toLocaleString();
    $("break-dist").textContent = Math.floor(run.scoreDist).toLocaleString();
    $("break-coins").textContent = Math.floor(run.scoreCoins).toLocaleString();
    $("break-bonus").textContent = Math.floor(run.scoreBonus).toLocaleString();
    $("final-coins").textContent = String(run.coins);
    $("final-dist").textContent = `${Math.floor(run.distance)}m`;
    $("final-combo").textContent = String(run.comboMax);
    $("over-best").textContent = save.best.toLocaleString();
    $("new-best").classList.toggle("hidden", rounded < save.best || rounded === 0);

    const nearEl = $("final-nearmiss");
    if (nearEl) nearEl.textContent = String(run.metrics.nearMisses);
    const mountEl = $("final-mounts");
    if (mountEl) mountEl.textContent = String(run.metrics.mounts);
    const xpEl = $("final-xp");
    if (xpEl) xpEl.textContent = `+${runXp(rounded).toLocaleString()}`;

    this.renderPromotion(promotion);
    const cleared = this.renderMissionResults(result);
    this.setOverlay("dead");
    return cleared;
  }

  /**
   * The two standings on the game-over card.
   *
   * Called twice per run: once as the card opens, to show that a rank is on its
   * way, and again when the server answers. A card that simply never mentioned
   * the leaderboard left the run feeling like it happened in private.
   *
   * @param {{ pending?: boolean, me?: object|null, school?: object|null }|null} ranks
   */
  showRanks(ranks) {
    const box = $("over-ranks");
    if (!box) return;
    if (!ranks) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");

    const write = (id, text, muted) => {
      const el = $(id);
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("quiet", Boolean(muted));
    };

    if (ranks.pending) {
      write("over-rank-me", "…", true);
      write("over-rank-school", "…", true);
      return;
    }
    write(
      "over-rank-me",
      ranks.me?.rank != null ? `${ranks.me.rank}위` : "기록 없음",
      ranks.me?.rank == null,
    );
    write(
      "over-rank-school",
      ranks.school?.rank != null ? `${ranks.school.rank}위` : ranks.schoolNote || "—",
      ranks.school?.rank == null,
    );
  }

  /**
   * The experience ladder.
   *
   * Its own renderer rather than the score board's, because the number that
   * matters is different: a rank and the experience behind it, not a run.
   *
   * @param {Array} rows
   * @param {object|null} standing where the viewer sits, when off the page
   */
  renderLevelBoard(rows, standing, myHandle) {
    const list = $("leaderboard-list");
    if (!list) return;

    const line = (row, mine) => `
      <li class="leaderboard-row${mine ? " me" : ""}">
        <span class="leaderboard-rank">${row.rank}</span>
        <span class="leaderboard-handle">
          ${escapeHtml(row.handle)}
          <em class="row-school">Lv.${row.level}${row.school ? ` · ${escapeHtml(row.school)}` : ""}</em>
        </span>
        <span class="leaderboard-score">${row.xp.toLocaleString()}<em class="score-unit">XP</em></span>
        <span class="report-flag" aria-hidden="true"></span>
      </li>`;

    if (!rows?.length) {
      list.innerHTML = `<li class="leaderboard-empty">아직 기록이 없어요.</li>`;
    } else {
      list.innerHTML = rows.map((row) => line(row, row.handle === myHandle)).join("");
      if (standing?.rank != null && !rows.some((row) => row.handle === myHandle)) {
        list.insertAdjacentHTML(
          "beforeend",
          `<li class="leaderboard-row me pinned">
             <span class="leaderboard-rank">${standing.rank}</span>
             <span class="leaderboard-handle">
               ${escapeHtml(standing.handle ?? myHandle ?? "")}
               <em class="row-school">Lv.${standing.level}</em>
             </span>
             <span class="leaderboard-score">${standing.xp.toLocaleString()}<em class="score-unit">XP</em></span>
             <span class="report-flag" aria-hidden="true"></span>
           </li>`,
        );
      }
    }

    this.standings.mine =
      standing?.rank != null
        ? `내 레벨 ${standing.rank}위 · Lv.${standing.level} · ${standing.xp.toLocaleString()} XP`
        : "";
    this.standings.school = "";
    this.standings.schoolNote = "";
    this.applyStandings();
  }

  /**
   * The hall of fame, in the two columns the board already has.
   *
   * A week per block, its podium inside. Laid out down the same two columns as
   * the live board so the eye does not have to relearn the screen: whatever is
   * on the left is about people, whatever is on the right is about schools.
   *
   * @param {Array} weeks newest first
   */
  renderHall(weeks) {
    const medal = ["🥇", "🥈", "🥉"];
    const block = (label, rows, render) => `
      <li class="hall-week">
        <p class="hall-label">${escapeHtml(label)}</p>
        ${
          rows.length
            ? rows.map((row, i) => `<p class="hall-row">${medal[i] ?? ""} ${render(row)}</p>`).join("")
            : `<p class="hall-row empty">기록 없음</p>`
        }
      </li>`;

    const fill = (id, pick, render) => {
      const list = $(id);
      if (!list) return;
      list.innerHTML = weeks?.length
        ? weeks.map((week) => block(week.label, pick(week) ?? [], render)).join("")
        : `<li class="leaderboard-empty">아직 끝난 주가 없어요. 이번 주가 첫 번째입니다!</li>`;
    };

    fill(
      "leaderboard-list",
      (week) => week.players,
      (row) =>
        `<strong>${escapeHtml(row.handle)}</strong> ${row.score.toLocaleString()}` +
        (row.school ? ` <em>${escapeHtml(row.school)}</em>` : ""),
    );
    fill(
      "school-list",
      (week) => week.schools,
      (row) =>
        `<strong>${escapeHtml(row.label)}</strong> ${row.total.toLocaleString()}` +
        ` <em>${row.members}명</em>`,
    );

    // Nothing to page through and no standing to state: a closed week is whole.
    for (const column of ["players", "schools"]) {
      this.setBoardPager(column, { page: 0, size: 10, hasMore: false });
    }
    this.standings = { mine: "", school: "", schoolNote: "" };
    this.applyStandings();
  }

  /** The rank climbed by this run, when there was one. */
  renderPromotion(promotion) {
    const box = $("rank-up");
    if (!box) return;
    if (!promotion?.ranks?.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    const top = promotion.ranks[promotion.ranks.length - 1];
    box.classList.remove("hidden");
    box.innerHTML = `
      <p class="rank-up-title">LEVEL UP</p>
      <p class="rank-up-name">Lv.${top.level} ${escapeHtml(top.name)}</p>
      <p class="rank-up-reward">🪙 +${promotion.coins.toLocaleString()}</p>`;
  }

  /** @returns {boolean} whether any mission was cleared, so the caller can cue audio */
  renderMissionResults(result) {
    const box = $("mission-cleared");
    if (!box) return false;
    if (!result?.completed.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return false;
    }
    box.classList.remove("hidden");
    box.innerHTML = `
      <p class="mission-cleared-title">미션 달성 ×${result.completed.length}</p>
      ${result.completed
        .map((entry) => `<p class="mission-cleared-row">✓ ${missionLabel(entry)}</p>`)
        .join("")}
      ${result.reward.dailyBonus ? `<p class="mission-cleared-row daily">★ 오늘의 미션 3개 모두 달성!</p>` : ""}
      <p class="mission-cleared-reward">🪙 +${result.reward.coins} · XP +${result.reward.xp}</p>`;
    return true;
  }

}
