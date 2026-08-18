import { HOVERBOARD_TIME } from "./config.js";
import { BOARD_HINT_LONG } from "./input.js";
import { isComplete, missionDef, missionLabel } from "./missions.js";
import { POWERUPS } from "./powerups.js";
import { rankAt, rankProgress, nextRankAt } from "./progression.js";
import { comboTier } from "./scoring.js";
import { QUALITY_PROFILES, QUALITY_TIERS } from "./settings.js";

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const money = (n) => Math.floor(n).toLocaleString();

export function renderMissions(el, missions) {
  if (!el) return;
  if (!missions.length) {
    el.innerHTML = `<li class="mission empty">미션을 불러오는 중…</li>`;
    return;
  }

  el.innerHTML = missions
    .map((mission) => {
      const def = missionDef(mission.id);
      if (!def) return "";
      const done = isComplete(mission);
      const pct = Math.min(100, (mission.progress / mission.target) * 100);
      return `
        <li class="mission${done ? " done" : ""}">
          <div class="mission-row">
            <span class="mission-label">${escapeHtml(missionLabel(mission))}</span>
            <span class="mission-count">${money(mission.progress)} / ${money(mission.target)}</span>
          </div>
          <div class="mission-track"><div class="mission-fill" style="width:${pct}%"></div></div>
          <div class="mission-reward">🪙 ${money(def.coins)} · XP ${money(def.xp)}</div>
        </li>`;
    })
    .join("");
}

export function renderRank(nameEl, barEl, xpEl, xp) {
  const rank = rankAt(xp);
  const next = nextRankAt(xp);
  if (nameEl) nameEl.textContent = `Lv.${rank.level} ${rank.name}`;
  if (barEl) barEl.style.transform = `scaleX(${rankProgress(xp)})`;
  if (xpEl) {
    xpEl.textContent = next ? `${money(xp)} / ${money(next.xp)} XP` : `${money(xp)} XP · MAX`;
  }
}

/**
 * Power-up chips with their remaining-time bars. Rebuilt only when the set of
 * active power-ups changes; the bars themselves are scaled every frame.
 */
export function renderPowerupHud(el, timers, durations) {
  if (!el) return;
  const active = Object.keys(POWERUPS).filter((id) => timers[id] > 0);
  const signature = active.join(",");

  if (el.dataset.signature !== signature) {
    el.dataset.signature = signature;
    el.innerHTML = active
      .map((id) => {
        const spec = POWERUPS[id];
        return `
          <div class="pw-chip" data-pw="${id}" style="--pw:${spec.colour}">
            <span class="pw-icon">${spec.icon}</span>
            <span class="pw-name">${escapeHtml(spec.name)}</span>
            <div class="pw-track"><div class="pw-fill"></div></div>
          </div>`;
      })
      .join("");
  }

  el.classList.toggle("hidden", active.length === 0);
  for (const id of active) {
    const chip = el.querySelector(`[data-pw="${id}"] .pw-fill`);
    if (chip) chip.style.transform = `scaleX(${Math.max(0, timers[id] / (durations[id] || 1))})`;
  }
}

/**
 * Per-frame HUD sync. Everything here is cheap string/transform work; anything
 * that rebuilds DOM guards on a change first.
 */
export function renderHud(state) {
  $("score").textContent = Math.floor(state.score).toLocaleString();
  $("coin-count").textContent = String(state.coins);

  const comboEl = $("combo");
  const tier = comboTier(state.combo);
  if (state.combo >= 2) {
    comboEl.classList.remove("hidden");
    comboEl.textContent = tier.label
      ? `${tier.label}  x${tier.multiplier}`
      : `COMBO x${state.combo}`;
  } else {
    comboEl.classList.add("hidden");
  }

  renderPowerupHud($("powerup-stack"), state.powerups, state.durations);

  const boardWrap = $("board-wrap");
  if (boardWrap) {
    boardWrap.classList.toggle("riding", state.boarding);
    const fill = boardWrap.querySelector(".board-fill");
    if (fill) fill.style.transform = `scaleX(${state.boardT / HOVERBOARD_TIME})`;
    const count = $("board-count");
    if (count) count.textContent = String(state.hoverboards);
  }

  $("pace-chip").textContent = `${state.phaseName}  ${Math.round(state.speed)}`;
}

export function renderSettings(root, settings, activeTier) {
  if (!root) return;
  const toggle = (key, label, hint) => `
    <button type="button" class="setting-row" data-setting="${key}" role="switch"
      aria-checked="${settings[key]}">
      <span class="setting-text">
        <span class="setting-label">${escapeHtml(label)}</span>
        <span class="setting-hint">${escapeHtml(hint)}</span>
      </span>
      <span class="switch${settings[key] ? " on" : ""}"><i></i></span>
    </button>`;

  const qualityOptions = ["auto", ...QUALITY_TIERS]
    .map((tier) => {
      const label = tier === "auto" ? "자동" : QUALITY_PROFILES[tier].label;
      const selected = settings.quality === tier;
      return `<button type="button" class="quality-pill${selected ? " on" : ""}"
        data-quality="${tier}">${escapeHtml(label)}</button>`;
    })
    .join("");

  root.innerHTML = `
    ${toggle("sfx", "효과음", "코인 · 점프 · 충돌 사운드")}
    ${toggle("music", "배경음악", "달릴수록 레이어가 쌓입니다")}
    ${toggle("haptics", "진동", "모바일에서만 동작합니다")}
    <div class="setting-row static">
      <span class="setting-text">
        <span class="setting-label">화질</span>
        <span class="setting-hint">자동은 프레임에 맞춰 조절합니다 · 현재 ${escapeHtml(
          QUALITY_PROFILES[activeTier]?.label ?? "-",
        )}</span>
      </span>
    </div>
    <div class="quality-row">${qualityOptions}</div>`;
}

export function renderShop(root, view) {
  if (!root) return;

  const upgrades = view.upgrades
    .map(
      (item) => `
      <div class="shop-item" style="--accent:${item.colour}">
        <div class="shop-icon">${item.icon}</div>
        <div class="shop-body">
          <div class="shop-title">${escapeHtml(item.name)} <em>Lv.${item.level}</em></div>
          <div class="shop-blurb">${escapeHtml(item.blurb)}</div>
          <div class="shop-meta">
            지속 ${item.duration.toFixed(1)}초${
              item.nextDuration ? ` → <strong>${item.nextDuration.toFixed(1)}초</strong>` : ""
            }
          </div>
          <div class="shop-pips">${Array.from(
            { length: item.maxLevel },
            (_, i) => `<i class="${i < item.level ? "on" : ""}"></i>`,
          ).join("")}</div>
        </div>
        <button type="button" class="shop-buy" data-buy="upgrade" data-id="${item.id}"
          ${item.maxed || !item.affordable ? "disabled" : ""}>
          ${item.maxed ? "MAX" : `🪙 ${money(item.cost)}`}
        </button>
      </div>`,
    )
    .join("");

  const board = view.hoverboards;
  const boardBlock = `
    <div class="shop-item" style="--accent:#ff3d71">
      <div class="shop-icon">🛹</div>
      <div class="shop-body">
        <div class="shop-title">호버보드 <em>${board.owned}/${board.max}</em></div>
        <div class="shop-blurb">${escapeHtml(BOARD_HINT_LONG)}</div>
        <div class="shop-meta">보유한 만큼 계속 쓸 수 있습니다</div>
      </div>
      <button type="button" class="shop-buy" data-buy="hoverboard" data-id="hoverboard"
        ${board.affordable ? "" : "disabled"}>🪙 ${money(board.cost)}</button>
    </div>`;

  const characters = view.characters
    .map((character) => {
      const label = character.equipped
        ? "착용 중"
        : character.owned
          ? "착용하기"
          : `🪙 ${money(character.cost)}`;
      return `
      <div class="shop-item character${character.equipped ? " equipped" : ""}">
        <div class="shop-swatch" style="--a:#${character.palette.shirt
          .toString(16)
          .padStart(6, "0")};--b:#${character.palette.pack.toString(16).padStart(6, "0")}"></div>
        <div class="shop-body">
          <div class="shop-title">${escapeHtml(character.name)}</div>
          <div class="shop-blurb">${escapeHtml(character.blurb)}</div>
        </div>
        <button type="button" class="shop-buy" data-buy="character" data-id="${character.id}"
          ${character.equipped || !character.affordable ? "disabled" : ""}>${label}</button>
      </div>`;
    })
    .join("");

  root.innerHTML = `
    <section class="shop-section">
      <h3>파워업 강화</h3>
      ${upgrades}
    </section>
    <section class="shop-section">
      <h3>아이템</h3>
      ${boardBlock}
    </section>
    <section class="shop-section">
      <h3>캐릭터</h3>
      ${characters}
    </section>`;
}
