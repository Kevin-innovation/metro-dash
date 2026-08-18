import { BOARD_HINT, BOARD_HINT_LONG } from "./input.js";
import { HANDLE_MAX } from "./nickname.js";
import { missionLabel } from "./missions.js";
import { POWERUP_IDS, powerupDuration } from "./powerups.js";
import { runXp } from "./progression.js";
import { purchase, shopView } from "./shop.js";
import {
  escapeHtml,
  renderHud,
  renderMissions,
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
    const hint = $("touch-hint");
    if (hint) hint.textContent = `스와이프 · 점프 · 슬라이드 · 위로 두 번 = 호버보드`;
    const howto = $("howto-board");
    if (howto) howto.textContent = `${BOARD_HINT} · 호버보드 (충돌 1회 방어)`;
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
    const settingsBtn = $("btn-settings");
    if (settingsBtn) settingsBtn.onclick = () => a.openSettings();
    const settingsClose = $("btn-settings-close");
    if (settingsClose) settingsClose.onclick = () => this.closeSettings();

    const accountBtn = $("btn-account");
    if (accountBtn) accountBtn.onclick = () => a.openAccount();
    const accountClose = $("btn-account-close");
    if (accountClose) accountClose.onclick = () => this.closeAccount();
    const boardBtn2 = $("btn-leaderboard");
    if (boardBtn2) boardBtn2.onclick = () => a.openLeaderboard();
    const boardClose = $("btn-leaderboard-close");
    if (boardClose) boardClose.onclick = () => this.closeLeaderboard();

    for (const [id, mode] of [["tab-signin", "signin"], ["tab-signup", "signup"]]) {
      const tab = $(id);
      if (tab) tab.onclick = () => this.setAccountMode(mode);
    }

    const form = $("account-form");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        a.submitAccount(this.accountMode ?? "signin", $("field-handle").value, $("field-pin").value);
      });
    }
    // The PIN field is digits only, enforced as it is typed so the rule is
    // obvious rather than a rejection after the fact.
    const pin = $("field-pin");
    if (pin) {
      pin.addEventListener("input", () => {
        pin.value = pin.value.replace(/\D/g, "").slice(0, 4);
      });
    }
    const handle = $("field-handle");
    if (handle) {
      handle.addEventListener("input", () => {
        handle.value = handle.value.slice(0, HANDLE_MAX);
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
    if (boardBtn) boardBtn.classList.toggle("hidden", !cloud.enabled || !cloud.signedIn);
    if (!cloud.enabled) return;

    const state = $("account-state");
    const action = $("btn-account");
    if (cloud.signedIn) {
      if (state) state.innerHTML = `<strong>${escapeHtml(cloud.handle)}</strong> 님으로 기록 중`;
      if (action) action.textContent = "로그아웃";
    } else {
      if (state) state.textContent = "게스트로 플레이 중 · 기록은 이 기기에만 남아요";
      if (action) action.textContent = "로그인";
    }
  }

  openAccount(mode = "signin") {
    this.setAccountMode(mode);
    $("field-handle").value = "";
    $("field-pin").value = "";
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

  openLeaderboard() {
    $("leaderboard-screen").classList.remove("hidden");
  }

  closeLeaderboard() {
    const panel = $("leaderboard-screen");
    if (panel) panel.classList.add("hidden");
  }

  renderLeaderboard(rows, standing, myHandle) {
    const list = $("leaderboard-list");
    if (!list) return;

    if (!rows?.length) {
      list.innerHTML = `<li class="leaderboard-empty">아직 기록이 없어요. 첫 번째가 되어 보세요!</li>`;
    } else {
      list.innerHTML = rows
        .map((row) => {
          const me = row.handle === myHandle ? " me" : "";
          return `
            <li class="leaderboard-row${me}">
              <span class="leaderboard-rank">${row.rank}</span>
              <span class="leaderboard-handle">${escapeHtml(row.handle)}</span>
              <span class="leaderboard-score">${row.best.toLocaleString()}</span>
            </li>`;
        })
        .join("");
    }

    const mine = $("my-standing");
    if (mine) {
      const show = standing?.rank != null;
      mine.classList.toggle("hidden", !show);
      if (show) {
        mine.textContent = `내 순위 ${standing.rank}위 · ${standing.best.toLocaleString()}점`;
      }
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
    this.closeLeaderboard();
    $("hud").classList.toggle("hidden", mode !== "hud" && mode !== "dead");
    $("btn-pause").classList.toggle("hidden", mode !== "hud");
    if (mode !== "hud") $("touch-hint").classList.add("hidden");
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
    renderMissions($("mission-list"), save.missions);
    renderRank($("rank-name"), $("rank-fill"), $("rank-xp"), save.xp);
  }

  // --- in-run HUD ----------------------------------------------------------

  resetHud() {
    $("pace-chip").textContent = "START";
    $("speed-toast").classList.add("hidden");
    $("coin-gain").classList.add("hidden");
    $("combo").classList.add("hidden");
    $("touch-hint").classList.remove("hidden");
  }

  hideHint() {
    $("touch-hint").classList.add("hidden");
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
      hoverboards: game.store.data.hoverboards,
      phaseName: game.phaseName(),
      speed: game.speed,
    });
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

  showGameOver(run, save, result) {
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

    const cleared = this.renderMissionResults(result);
    this.setOverlay("dead");
    return cleared;
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
      <p class="mission-cleared-reward">🪙 +${result.reward.coins} · XP +${result.reward.xp}</p>`;
    return true;
  }

}
