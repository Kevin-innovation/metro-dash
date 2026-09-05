import { BOARD_HINT_LONG, BOARD_LIMIT_NOTE } from "./input.js";
import {
  allCleared,
  clearedCount,
  dailyBonus,
  isComplete,
  missionDef,
  missionLabel,
  missionPay,
} from "./missions.js";
import { CROW } from "./crow.js";
import { CHANGELOG } from "./release.js";
import { POWERUPS, POWERUP_IDS, POWERUP_METRIC } from "./powerups.js";
import { rankAt, rankProgress, nextRankAt } from "./progression.js";
import { comboTier } from "./scoring.js";
import { ANTIDOTE_SECONDS } from "./shop.js";
import { DIAMOND_GOAL } from "./slots.js";
import { QUALITY_PROFILES, QUALITY_TIERS } from "./settings.js";

const $ = (id) => document.getElementById(id);

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const money = (n) => Math.floor(n).toLocaleString();

/**
 * @param {number} tier difficulty step the day's set was dealt at, so the bonus
 *   line quotes what will actually be paid rather than the base it scales from.
 */
export function renderMissions(el, missions, tier = 0) {
  const counter = $("mission-count");
  if (counter) {
    const done = clearedCount(missions);
    counter.textContent = missions?.length ? `${done}/${missions.length}` : "";
    // Gold once the set is finished, so the day's job reads as done at a glance.
    counter.classList.toggle("done", allCleared(missions));
  }

  if (!el) return;
  if (!missions.length) {
    el.innerHTML = `<li class="mission empty">미션을 불러오는 중…</li>`;
    return;
  }

  el.innerHTML = missions
    .map((mission) => {
      const def = missionDef(mission.id);
      if (!def) return "";
      // The step is read back from the target the mission was dealt at, so the
      // payout shown is the one this mission will actually pay.
      const pay = missionPay(def, def.targets.indexOf(mission.target));
      const done = isComplete(mission);
      const pct = Math.min(100, (mission.progress / mission.target) * 100);
      return `
        <li class="mission${done ? " done" : ""}">
          <div class="mission-row">
            <span class="mission-label">${escapeHtml(missionLabel(mission))}</span>
            <span class="mission-count">${money(mission.progress)} / ${money(mission.target)}</span>
          </div>
          <div class="mission-track"><div class="mission-fill" style="width:${pct}%"></div></div>
          <div class="mission-reward">🪙 ${money(pay.coins)} · XP ${money(pay.xp)}</div>
        </li>`;
    })
    .join("");

  // Stated where the missions are, so the reason to finish the third one is
  // visible while looking at the third one.
  const bonus = dailyBonus(tier);
  el.insertAdjacentHTML(
    "beforeend",
    `<li class="mission-bonus${allCleared(missions) ? " done" : ""}">
       3개 모두 달성 시 🪙 ${money(bonus.coins)} · XP ${money(bonus.xp)}
     </li>`,
  );
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
/** The bar nodes of the chips currently mounted, so the frame loop never queries. */
let powerupFills = [];

/**
 * @param {{remaining:number, seconds:number}|null} [crow] the debuff, if it is
 *   running. Drawn as a chip in the same row and read the same way — icon plus
 *   a draining bar — because "a timed thing is on you" is one idea and should
 *   have one shape. The colour is what says which kind.
 */
export function renderPowerupHud(el, timers, durations, crow = null, slot = null) {
  if (!el) return;
  const active = Object.keys(POWERUPS).filter((id) => timers[id] > 0);
  // The wheel first: it is the largest number on the screen while it runs, and
  // a ×10 that appears below three power-up chips is a ×10 nobody sees.
  const chips = [...(slot ? [SLOT_CHIP] : []), ...active, ...(crow ? [CROW.id] : [])];
  const signature = chips.join(",");

  if (el.dataset.signature !== signature) {
    el.dataset.signature = signature;
    el.innerHTML = chips
      .map((id) => {
        const spec =
          id === CROW.id
            ? CROW
            : id === SLOT_CHIP
              ? slotChipSpec(slot)
              : POWERUPS[id];
        const bad = id === CROW.id || (id === SLOT_CHIP && slot.multiplier < 1) ? " bad" : "";
        // The name is kept in the DOM but hidden by CSS: the icon is what a
        // player reads mid-run, and four spelled-out names used to cover the
        // track. `title` puts it back on hover for anyone who wants it.
        return `
          <div class="pw-chip${bad}" data-pw="${id}" style="--pw:${spec.colour}"
            title="${escapeHtml(spec.name)}">
            <span class="pw-icon" aria-hidden="true">${spec.icon}</span>
            <span class="pw-name">${escapeHtml(spec.name)}</span>
            <div class="pw-track"><div class="pw-fill"></div></div>
          </div>`;
      })
      .join("");
    // Looked up once per change of the set, rather than three querySelectors
    // every frame for the whole of a magnet.
    powerupFills = chips.map((id) => [id, el.querySelector(`[data-pw="${id}"] .pw-fill`)]);
    el.classList.toggle("hidden", chips.length === 0);
  }

  // The wheel's label carries a number that changes between spins, so unlike
  // every other chip it has to be rewritten even when the set has not changed.
  if (slot && el.dataset.slotLabel !== String(slot.multiplier)) {
    el.dataset.slotLabel = String(slot.multiplier);
    const chip = el.querySelector(`[data-pw="${SLOT_CHIP}"]`);
    const name = chip?.querySelector(".pw-name");
    if (name) name.textContent = slotChipSpec(slot).name;
    // And the tooltip with it. The chip is only rebuilt when the *set* of
    // chips changes, so a second spin at a different multiplier reused the
    // first one's title and hovering it read out the number it used to be.
    if (chip) chip.title = slotChipSpec(slot).name;
  }

  for (const [id, fill] of powerupFills) {
    if (!fill) continue;
    const left =
      id === CROW.id
        ? (crow?.remaining ?? 0) / (crow?.seconds || 1)
        : id === SLOT_CHIP
          ? (slot?.remaining ?? 0) / (slotFullSeconds(slot) || 1)
          : timers[id] / (durations[id] || 1);
    fill.style.transform = `scaleX(${Math.max(0, left)})`;
  }
}

/** The wheel's chip id. Not a power-up id, and deliberately not in POWERUPS. */
const SLOT_CHIP = "slot";

/** What the wheel's chip looks like, given what it is currently paying. */
function slotChipSpec(slot) {
  const down = slot.multiplier < 1;
  return {
    name: `점수 ×${slot.multiplier}`,
    icon: down ? "💧" : "💎",
    colour: down ? "#64748b" : "#7dd3fc",
  };
}

/**
 * The duration the chip's bar is drawn against.
 *
 * Taken from the face the wheel landed on rather than from the timer's own
 * starting value, because Run only keeps what is left. Without it a chip that
 * appeared at 12 seconds and one that appeared at 30 would both start full and
 * drain at visibly different rates for no reason the player could see.
 */
function slotFullSeconds(slot) {
  return slot?.face?.effect?.seconds ?? slot?.remaining ?? 1;
}

/**
 * Per-frame HUD sync. Everything here is cheap string/transform work; anything
 * that rebuilds DOM guards on a change first.
 */
/**
 * Nodes the run touches every frame.
 *
 * Resolved once. getElementById is cheap on its own, but this runs sixty times
 * a second on a phone that is also drawing the world, and none of these ids
 * ever point at a different element.
 */
let hud = null;
function hudNodes() {
  if (hud) return hud;
  const boardWrap = $("board-wrap");
  hud = {
    score: $("score"),
    coins: $("coin-count"),
    combo: $("combo"),
    powerups: $("powerup-stack"),
    boardWrap,
    boardFill: boardWrap?.querySelector(".board-fill") ?? null,
    boardCount: $("board-count"),
    antidote: $("antidote-chip"),
    diamond: $("diamond-chip"),
    diamondCount: $("diamond-count"),
    pace: $("pace-chip"),
    event: $("event-chip"),
    eventName: $("event-name"),
    eventFill: $("event-fill"),
    /** Last value written, so an unchanged string is not written again. */
    last: {
      score: null,
      coins: null,
      combo: null,
      boards: null,
      pace: null,
      event: null,
      antidotes: null,
      diamonds: null,
    },
  };
  return hud;
}

export function renderHud(state) {
  const el = hudNodes();
  const last = el.last;

  const score = Math.floor(state.score).toLocaleString();
  if (score !== last.score) {
    el.score.textContent = score;
    last.score = score;
  }
  if (state.coins !== last.coins) {
    el.coins.textContent = String(state.coins);
    last.coins = state.coins;
  }

  const tier = comboTier(state.combo);
  const combo =
    state.combo >= 2 ? (tier.label ? `${tier.label}  x${tier.multiplier}` : `COMBO x${state.combo}`) : "";
  if (combo !== last.combo) {
    // Shown and hidden by visibility, not display: the line keeps its space
    // either way so nothing below it moves.
    el.combo.classList.toggle("on", Boolean(combo));
    if (combo) el.combo.textContent = combo;
    last.combo = combo;
  }

  renderPowerupHud(el.powerups, state.powerups, state.durations, state.crow, state.slot);

  if (el.boardWrap) {
    el.boardWrap.classList.toggle("riding", state.boarding);
    // Greyed once this run's board has been used, so the button is not offering
    // something it will refuse.
    el.boardWrap.classList.toggle("spent", Boolean(state.boardUsed) && !state.boarding);
    if (el.boardFill) {
      el.boardFill.style.transform = `scaleX(${state.boardT / (state.boardMax || 1)})`;
    }
    if (el.boardCount && state.hoverboards !== last.boards) {
      el.boardCount.textContent = String(state.hoverboards);
      last.boards = state.hoverboards;
    }
  }

  // Shown only while one is held, and animated out on the frame it is spent so
  // the corner it left is what says the antidote did something.
  if (el.antidote && state.antidotes !== last.antidotes) {
    const had = last.antidotes;
    last.antidotes = state.antidotes;
    if (state.antidotes > 0) {
      el.antidote.classList.remove("hidden", "spent");
    } else if (had > 0) {
      el.antidote.classList.add("spent");
      // Removed only once the animation it was given has finished, or the node
      // would be display:none before the first frame of it was drawn.
      setTimeout(() => {
        if (el.antidote.classList.contains("spent")) el.antidote.classList.add("hidden");
      }, 520);
    } else {
      el.antidote.classList.add("hidden");
    }
  }

  // Diamonds are counted rather than gauged: three is a number small enough to
  // read as a number, and 「2/3」 says how many more with no arithmetic. Hidden
  // at zero, because a counter at zero for the first minute of every run is
  // three characters of noise over the track.
  if (el.diamond && state.diamonds !== last.diamonds) {
    last.diamonds = state.diamonds;
    el.diamond.classList.toggle("hidden", !(state.diamonds > 0));
    if (el.diamondCount) el.diamondCount.textContent = `${state.diamonds}/${DIAMOND_GOAL}`;
  }

  // The section banner drains a bar rather than printing a number. A gauge is
  // read at a glance while the track is moving; a digit has to be focused on.
  if (el.event && state.event) {
    const bonus = state.event.multiplier > 1 ? ` ×${state.event.multiplier}` : "";
    const text = `${state.event.name}${bonus}`;
    if (text !== last.event) {
      if (el.eventName) el.eventName.textContent = text;
      last.event = text;
    }
    if (el.eventFill) {
      const left = Math.max(0, Math.min(1, state.event.remaining / (state.event.seconds || 1)));
      el.eventFill.style.transform = `scaleX(${left})`;
    }
  } else {
    last.event = null;
  }

  const pace = `${state.phaseName}  ${Math.round(state.speed)}`;
  if (pace !== last.pace) {
    el.pace.textContent = pace;
    last.pace = pace;
  }
}

/**
 * What the run met, under what it scored.
 *
 * The rows the track decides are always shown, zero included — 「다이아몬드 2 ·
 * 룰렛 0」 is the run telling you it was one stone short, which is a thing worth
 * knowing and is invisible if the line is hidden for being zero.
 *
 * The two consumables are the exception. Those are things you brought with you
 * rather than things the track handed out, and a player who owns neither would
 * be shown two permanent zeros explaining nothing about the run they just had.
 * They appear the moment one is spent.
 */
const TALLY_ROWS = [
  { key: "diamonds", icon: "💎", label: "다이아몬드", always: true },
  { key: "spins", icon: "🎰", label: "룰렛", suffix: "회", always: true },
  // The four by name rather than one 「파워업 14」.
  //
  // Run has counted them separately since the missions needed to single one
  // out, and the total was the only one being shown — which told a player the
  // least interesting fact available. Whether a run was carried by four
  // jetpacks or by fourteen magnets is the shape of the run; the sum of them is
  // not. Read from the power-up table so the card cannot end up calling one of
  // them something the shop does not.
  ...POWERUP_IDS.map((id) => ({
    key: POWERUP_METRIC[id],
    icon: POWERUPS[id].icon,
    label: POWERUPS[id].name,
    always: true,
  })),
  { key: "crows", icon: "🐦‍⬛", label: "까마귀", always: true },
  { key: "gates", icon: "🚧", label: "게이트", always: true },
  { key: "boards", icon: "🛹", label: "호버보드", always: false },
  { key: "antidotes", icon: "💊", label: "해독제", always: false },
];

export function renderRunTally(root, metrics = {}) {
  if (!root) return;
  const rows = TALLY_ROWS.filter((row) => row.always || (metrics[row.key] ?? 0) > 0);
  root.innerHTML = rows
    .map((row) => {
      const value = Math.max(0, Math.floor(metrics[row.key] ?? 0));
      return `
      <div class="tally${value > 0 ? " on" : ""}">
        <span class="tally-icon" aria-hidden="true">${row.icon}</span>
        <span class="tally-label">${escapeHtml(row.label)}</span>
        <strong class="tally-value">${value.toLocaleString()}${row.suffix ?? ""}</strong>
      </div>`;
    })
    .join("");
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
  const antidote = view.antidotes;
  // Both are consumables held one at a time, so they read as one section and
  // the same three lines: what it does, what the limit is, what it costs.
  const boardBlock = `
    <div class="shop-item" style="--accent:#ff3d71">
      <div class="shop-icon">🛹</div>
      <div class="shop-body">
        <div class="shop-title">호버보드 <em>${board.owned}/${board.max}</em></div>
        <div class="shop-blurb">${escapeHtml(BOARD_HINT_LONG)}</div>
        <div class="shop-meta">${escapeHtml(BOARD_LIMIT_NOTE)}</div>
      </div>
      <button type="button" class="shop-buy" data-buy="hoverboard" data-id="hoverboard"
        ${board.affordable ? "" : "disabled"}>${
          board.owned >= board.max ? "보유 중" : `🪙 ${money(board.cost)}`
        }</button>
    </div>
    <div class="shop-item" style="--accent:#14d4b8">
      <div class="shop-icon">💊</div>
      <div class="shop-body">
        <div class="shop-title">까마귀 해독제 <em>${antidote.owned}/${antidote.max}</em></div>
        <div class="shop-blurb">까마귀 알을 먹으면 대신 사라지고, ${ANTIDOTE_SECONDS}초간 까마귀가 붙지 않습니다</div>
        <div class="shop-meta">까마귀는 20만 점부터 나옵니다</div>
      </div>
      <button type="button" class="shop-buy" data-buy="antidote" data-id="antidote"
        ${antidote.affordable ? "" : "disabled"}>${
          antidote.owned >= antidote.max ? "보유 중" : `🪙 ${money(antidote.cost)}`
        }</button>
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

/** Korean date, so「2026-08-29」is not the first thing a student has to parse. */
function noteDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return Number.isFinite(y) ? `${y}년 ${m}월 ${d}일` : iso;
}

const NOTE_KIND = {
  major: "큰 업데이트",
  minor: "업데이트",
  fix: "수정",
};

/**
 * The patch notes.
 *
 * Newest first and open by default at the top, because the reason anyone opens
 * this is the entry they have not read yet. Everything below it is collapsed —
 * the history is worth having and is not worth scrolling past.
 */
export function renderNotes(el, entries = CHANGELOG) {
  if (!el) return;
  el.innerHTML = entries
    .map(
      (entry, i) => `
      <details class="note note-${entry.kind}"${i === 0 ? " open" : ""}>
        <summary class="note-head">
          <span class="note-version">v${escapeHtml(entry.version)}</span>
          <span class="note-title">${escapeHtml(entry.title)}</span>
          <span class="note-meta">
            <span class="note-kind">${escapeHtml(NOTE_KIND[entry.kind] ?? "업데이트")}</span>
            <span class="note-date">${escapeHtml(noteDate(entry.date))}</span>
          </span>
        </summary>
        <ul class="note-body">
          ${entry.notes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
        </ul>
      </details>`,
    )
    .join("");
}
