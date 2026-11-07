import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHRISTMAS_EVENT_FROM,
  CHRISTMAS_EVENT_TO,
  CHRISTMAS_SLOT_FACES,
  GIFT_FIRST_MAX,
  christmasTickets,
  GIFT_FIRST_MIN,
  GIFT_GAP_MAX,
  GIFT_GAP_MIN,
  christmasAt,
  firstGiftAt,
  nextGiftGap,
  setChristmasPreview,
  spinChristmas,
} from "../src/christmas.js";
import { MAX_CHARACTER_SCORE_BONUS, characterById, wearableCharacter } from "../src/characters.js";
import { applyCrowGloom } from "../src/crow.js";
import { EntityPool, makeOncoming } from "../src/entities.js";
import { Game } from "../src/game.js";
import { Interactions } from "../src/interactions.js";
import { MAX_EVENT_MULTIPLIER } from "../src/events.js";
import { MAX_WHEEL_MULTIPLIER, maxDistanceIn, validateRun } from "../src/leaderboard-rules.js";
import { JUMP_BONUS, MAX_COMBO_MULTIPLIER, MOUNT_BONUS, SLIDE_BONUS } from "../src/scoring.js";
import { applyAction, createPlayer, resetPlayer, updatePlayer } from "../src/player.js";
import { makeRng } from "../src/rng.js";
import { Run } from "../src/run.js";
import { setCostume } from "../src/costumes.js";
import { SaveStore, hasProgress, normalizeSave } from "../src/save.js";
import { purchase, shopView, unseenNewCharacters } from "../src/shop.js";
import { SPEC } from "../src/specs.js";
import { HAZARD_FROM_SCORE, Spawner } from "../src/spawner.js";
import { renderRunTally, renderShop } from "../src/ui.js";

const store = () => new SaveStore({ getItem: () => null, setItem: () => {} });

function fakePool() {
  return {
    live: [],
    spawn(type, lane, z, y = 0.55) {
      const spec = SPEC[type];
      const item = {
        type, lane, z, prevZ: z, y,
        token: spec.token ?? null, powerup: spec.powerup ?? null, hazard: spec.hazard ?? null,
        lethal: spec.lethal, minY: spec.minY, maxY: spec.maxY, depth: spec.depth, length: spec.length,
        taken: false, scored: false,
        mesh: { position: { x: lane * 2.2, y, z }, visible: true },
      };
      this.live.push(item);
      return item;
    },
    prune() {},
    clear() { this.live = []; },
  };
}

describe("이벤트 기간", () => {
  afterEach(() => setChristmasPreview(false));

  it("한국 시간 11월 7일 0시에 시작해 12월 31일 끝까지 켜져 있다", () => {
    expect(new Date(CHRISTMAS_EVENT_FROM).toISOString()).toBe("2026-11-06T15:00:00.000Z");
    expect(new Date(CHRISTMAS_EVENT_TO).toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(christmasAt(CHRISTMAS_EVENT_FROM - 1)).toBe(false);
    expect(christmasAt(CHRISTMAS_EVENT_FROM)).toBe(true);
    expect(christmasAt(CHRISTMAS_EVENT_TO - 1)).toBe(true);
    expect(christmasAt(CHRISTMAS_EVENT_TO)).toBe(false);
  });

  it("개발 미리보기는 명시적으로 켰을 때만 켜진다", () => {
    expect(christmasAt(0)).toBe(false);
    setChristmasPreview(true);
    expect(christmasAt(0)).toBe(true);
  });
});

describe("선물 룰렛 확률표", () => {
  it("합계 100에 지정한 확률을 쓰고, 당첨은 모두 8초다", () => {
    const table = Object.fromEntries(
      CHRISTMAS_SLOT_FACES.map((face) => [face.effect.value ?? 0, [face.weight, face.effect.seconds ?? 0]]),
    );
    expect(table).toEqual({
      0: [10, 0],
      2: [30, 8],
      3: [22, 8],
      5: [15, 8],
      10: [10, 8],
      12: [5, 8],
      15: [4, 8],
      20: [3, 8],
      99: [1, 8],
    });
    expect(CHRISTMAS_SLOT_FACES.reduce((sum, face) => sum + face.weight, 0)).toBe(100);
  });

  it("모든 칸에 실제 확률대로 멈추고, 돌려준 칸과 번호가 일치한다", () => {
    const counts = new Map();
    const draws = 10000;
    for (let i = 0; i < draws; i++) {
      const { face, index } = spinChristmas(() => (i + 0.5) / draws);
      expect(CHRISTMAS_SLOT_FACES[index]).toBe(face);
      counts.set(face.id, (counts.get(face.id) ?? 0) + 1);
    }
    for (const face of CHRISTMAS_SLOT_FACES) {
      expect(counts.get(face.id) / draws, face.id).toBeCloseTo(face.weight / 100, 3);
    }
  });

  it("×99가 나와도 서버가 정상 기록을 거절하지 않고, 상한은 늘어나지 않는다", () => {
    expect(MAX_WHEEL_MULTIPLIER).toBe(30);
    // The ceilings allow ×30 for the whole run. Each face has to fit in what that
    // allows by the end of its own window, at the earliest it can possibly start.
    for (const face of CHRISTMAS_SLOT_FACES) {
      const window = face.effect.seconds ?? 0;
      const worth = (face.effect.value ?? 0) * window;
      expect(worth, face.id).toBeLessThanOrEqual(MAX_WHEEL_MULTIPLIER * (GIFT_FIRST_MIN + window));
    }

    // A ×99 on every gift, every multiplier at its top, a clear on every quarter
    // second of it: nothing can be luckier, and it still has to be accepted. The
    // run ends right after the second window, where the most has been paid for
    // the least time.
    // Timed for 엘프, who sees gifts soonest.
    const multiplier = MAX_COMBO_MULTIPLIER * MAX_EVENT_MULTIPLIER * 99 * MAX_CHARACTER_SCORE_BONUS;
    const perWindow = 4 * 8 * Math.max(SLIDE_BONUS, JUMP_BONUS, MOUNT_BONUS) * multiplier;
    const soonest = characterById("elf").perk.giftGap;
    for (const [windows, seconds] of [
      [1, GIFT_FIRST_MIN * soonest + 8],
      [2, (GIFT_FIRST_MIN + GIFT_GAP_MIN) * soonest + 8],
    ]) {
      expect(
        validateRun({ score: windows * perWindow, distance: maxDistanceIn(seconds), coins: 0, seconds }),
      ).toEqual({ ok: true });
    }
  });

  it("×99는 흔한 칸 사이에 있어 절반 넘게 포인터 옆에서 멈춘다", () => {
    const at = CHRISTMAS_SLOT_FACES.findIndex((face) => face.jackpot);
    expect(CHRISTMAS_SLOT_FACES[at].effect.value).toBe(99);
    const beside = [CHRISTMAS_SLOT_FACES[at - 1], CHRISTMAS_SLOT_FACES[at + 1]];
    expect(beside.reduce((sum, face) => sum + face.weight, 0)).toBeGreaterThan(50);
  });
});

describe("선물 출현", () => {
  const deal = (christmas, layouts = 900) => {
    const pool = fakePool();
    const spawner = new Spawner(pool);
    spawner.reset(29);
    const giftTimes = [];
    for (let i = 0; i < layouts; i++) {
      const runTime = i * 1.5;
      const before = pool.live.length;
      spawner.place(100 + i * 100, { speed: 40, phaseId: 4, runTime, christmas });
      if (pool.live.slice(before).some((item) => item.type === "gift")) giftTimes.push(runTime);
    }
    return { pool, giftTimes };
  };

  it("범위 양 끝까지 정확히 뽑는다", () => {
    expect(firstGiftAt(() => 0)).toBe(GIFT_FIRST_MIN);
    expect(firstGiftAt(() => 0.999999)).toBe(GIFT_FIRST_MAX);
    expect(nextGiftGap(() => 0)).toBe(GIFT_GAP_MIN);
    expect(nextGiftGap(() => 0.999999)).toBe(GIFT_GAP_MAX);
  });

  it("다이아몬드 없이 플레이 시간 간격대로 나오고, 일반 모드에는 선물이 없다", () => {
    const { pool, giftTimes } = deal(true);
    expect(pool.live.some((item) => item.type === "diamond")).toBe(false);
    expect(giftTimes[0]).toBeGreaterThanOrEqual(GIFT_FIRST_MIN);
    // A due gift may wait one layout for a power-up, so the bound has a step.
    expect(giftTimes[0]).toBeLessThanOrEqual(GIFT_FIRST_MAX + 3);
    giftTimes.slice(1).forEach((time, i) => {
      const gap = time - giftTimes[i];
      expect(gap).toBeGreaterThanOrEqual(GIFT_GAP_MIN);
      expect(gap).toBeLessThanOrEqual(GIFT_GAP_MAX + 3);
    });

    const normal = deal(false).pool;
    expect(normal.live.some((item) => item.type === "gift")).toBe(false);
    expect(normal.live.some((item) => item.type === "diamond")).toBe(true);
  });

  it("파워업과 장애물 배치를 굶기지 않는다", () => {
    const kinds = (pool) => ({
      powerups: pool.live.filter((item) => item.powerup).length,
      lethal: pool.live.filter((item) => item.lethal).length,
    });
    const event = kinds(deal(true).pool);
    const normal = kinds(deal(false).pool);
    expect(event.powerups).toBe(normal.powerups);
    expect(event.lethal).toBeGreaterThanOrEqual(normal.lethal * 0.95);
  });

  it("제트팩 중에는 쓰지 않고 미룬다", () => {
    const pool = fakePool();
    const spawner = new Spawner(pool);
    spawner.reset(13);
    const at = { speed: 40, phaseId: 4, runTime: 40, christmas: true };
    for (let i = 0; i < 20; i++) spawner.place(100 + i * 100, { ...at, flying: true });
    expect(pool.live.some((item) => item.type === "gift")).toBe(false);
    for (let i = 0; i < 2; i++) spawner.place(3000 + i * 100, at);
    expect(pool.live.filter((item) => item.type === "gift")).toHaveLength(1);
  });

  it("일반 판의 추첨 순서를 밀지 않는다", () => {
    const spawner = new Spawner(fakePool());
    spawner.reset(29);
    expect(spawner.rng()).toBe(makeRng(29)());
  });
});

describe("선물 하나에 룰렛 한 번", () => {
  const runner = () => ({ x: 0, prevX: 0, y: 0, prevY: 0, z: 0.4, prevZ: -0.4, height: 1.55, prevHeight: 1.55 });

  beforeEach(() => vi.stubGlobal("document", { hidden: false }));
  afterEach(() => vi.unstubAllGlobals());

  /** The real wheel methods, on a Game with only the parts they touch. */
  function wheelGame(run = new Run(store())) {
    return {
      run,
      state: "playing",
      wheelQueue: [],
      hitstop: 0,
      fovPunch: 0,
      accumulator: 0,
      audio: { powerup() {}, resume() {}, purchase() {}, denied() {} },
      store: store(),
      screens: {
        spun: [],
        showSlots(faces, index, face, onDone, options) {
          this.spun.push({ faces, index, face, onDone, options });
        },
        refreshProfile() {},
        syncHud() {},
      },
      onGift: Game.prototype.onGift,
      spinWheel: Game.prototype.spinWheel,
      settleWheel: Game.prototype.settleWheel,
      pause() {},
    };
  }

  it("겹친 충돌에도 획득 이벤트는 한 번이고, 다이아 3개 조건 없이 큐에 한 번 들어간다", () => {
    const pool = fakePool();
    pool.spawn("gift", 0, 0, 0.95);
    const run = new Run(store());
    const interactions = new Interactions(pool, run, { burst() {} });

    const first = interactions.collectPickups(runner(), { upgradeLevel: () => 1 });
    const second = interactions.collectPickups(runner(), { upgradeLevel: () => 1 });
    expect(first).toEqual([{ type: "token", id: "gift" }]);
    expect(second).toEqual([]);
    expect(run.metrics.gifts).toBe(1);
    expect(run.diamonds).toBe(0);

    const game = wheelGame(run);
    for (const event of first) if (event.id === "gift") game.onGift();
    expect(game.wheelQueue).toEqual([{ kind: "gift" }]);

    game.spinWheel();
    expect(game.state).toBe("slots");
    expect(game.screens.spun).toHaveLength(1);
    expect(run.metrics.spins).toBe(1);

    game.state = "playing";
    game.spinWheel();
    expect(game.screens.spun).toHaveLength(1);
  });

  it("표시되는 칸과 지급되는 결과가 같고, 끝나면 달리기가 재개된다", () => {
    const game = wheelGame();
    game.wheelQueue.push({ kind: "gift" });
    game.spinWheel();
    const { faces, index, face, onDone } = game.screens.spun[0];
    expect(faces[index]).toBe(face);
    onDone();
    expect(game.state).toBe("playing");
    expect(game.run.slotFace).toBe(face.effect.type === "multiplier" ? face : null);
  });

  it("죽은 뒤에는 대기 중이던 룰렛이 돌지 않는다", () => {
    const game = wheelGame();
    game.wheelQueue.push({ kind: "gift" });
    game.state = "dead";
    game.spinWheel();
    expect(game.screens.spun).toHaveLength(0);
    expect(game.run.metrics.spins).toBe(0);
  });

  it("꽝은 점수와 진행 중인 배율을 건드리지 않는다", () => {
    const game = wheelGame();
    const running = CHRISTMAS_SLOT_FACES.find((face) => face.effect.value === 5);
    game.run.setSlotMultiplier(5, 3, running);
    game.run.scoreBonus = 1234;
    const before = [game.run.score, game.run.slotMultiplier, game.run.slotT, game.run.slotFace];

    game.settleWheel(CHRISTMAS_SLOT_FACES.find((face) => face.effect.type === "none"));
    expect([game.run.score, game.run.slotMultiplier, game.run.slotT, game.run.slotFace]).toEqual(before);
    expect(game.state).toBe("playing");
  });

  it("당첨은 기존 배율에 곱하지 않고 배율과 시간을 교체한다", () => {
    const game = wheelGame();
    game.run.setSlotMultiplier(10, 4, null);
    const x3 = CHRISTMAS_SLOT_FACES.find((face) => face.effect.value === 3);
    game.settleWheel(x3);
    expect(game.run.slotMultiplier).toBe(3);
    expect(game.run.slotT).toBe(8);
  });
});

describe("산타와 루돌프", () => {
  const santaPlayer = () => {
    const p = createPlayer(characterById("santa").palette);
    setCostume(p, "santa");
    return p;
  };
  const step = (p, ctx = {}, seconds = 0.2) => {
    for (let t = 0; t < seconds; t += 1 / 120) updatePlayer(p, 1 / 120, 20, ctx);
  };

  it("스니커즈 중에만 루돌프가 나타나고, 끝나면 고삐까지 사라진다", () => {
    const p = santaPlayer();
    step(p);
    expect(p.costume.sled.visible).toBe(true);
    expect(p.costume.reindeer.visible).toBe(false);

    step(p, { reindeer: true });
    expect(p.costume.reindeer.visible).toBe(true);
    expect(p.costume.reins.every((rein) => rein.mesh.visible)).toBe(true);

    step(p, { reindeer: false });
    expect(p.costume.reindeer.visible).toBe(false);
    expect(p.costume.reins.some((rein) => rein.mesh.visible)).toBe(false);
    expect(p.costume.sled.visible).toBe(true);
  });

  it("죽거나 재시작하면 변신이 풀리고, 스킨을 바꾸면 모델이 모두 사라진다", () => {
    const p = santaPlayer();
    step(p, { reindeer: true });
    p.alive = false;
    updatePlayer(p, 1 / 120, 0, { reindeer: true });
    expect(p.costume.reindeer.visible).toBe(false);

    p.alive = true;
    step(p, { reindeer: true });
    resetPlayer(p, 0);
    expect(p.costume.reindeer.visible).toBe(false);
    expect(p.costume.pulling).toBe(false);

    step(p, { reindeer: true });
    setCostume(p, "runner");
    expect(p.costume.outfit.visible).toBe(false);
    expect(p.costume.sled.visible).toBe(false);
    expect(p.costume.reindeer.visible).toBe(false);
    expect(p.parts.pack[0].visible).toBe(true);
    expect(p.board.scale.x).toBe(1);
    expect(p.jets.position.z).toBe(0);
  });

  it("다른 스킨은 산타 모델을 만들지 않는다", () => {
    const p = createPlayer();
    setCostume(p, "runner");
    step(p, { reindeer: true });
    expect(p.costume).toBe(null);
  });

  it("점프 궤적·슬라이드·이동이 일반 스킨과 프레임 단위로 같다", () => {
    const plain = createPlayer();
    const santa = santaPlayer();
    const actions = { 12: "jump", 150: "slide", 260: "left", 400: "jump" };
    for (let frame = 0; frame < 520; frame++) {
      for (const p of [plain, santa]) {
        if (actions[frame]) applyAction(p, actions[frame], null, { jumpMultiplier: 1.4 });
        updatePlayer(p, 1 / 120, 30, { reindeer: p === santa });
      }
      expect([santa.x, santa.y, santa.z, santa.height]).toEqual([plain.x, plain.y, plain.z, plain.height]);
    }
  });

  it("호버보드와 제트팩이 겹쳐도 썰매와 표시가 충돌하지 않게 옮긴다", () => {
    const p = santaPlayer();
    p.boarding = true;
    step(p);
    expect(p.costume.sled.position.y).toBeGreaterThan(0);
    expect(p.board.scale.x).toBeGreaterThan(1);
    expect(p.jets.position.z).toBeLessThan(0);
  });
});

describe("크리스마스 캐릭터 5종", () => {
  const IDS = ["elf", "snowman", "rudolph", "blacksanta", "supersanta"];
  const COSTS = [60000, 90000, 120000, 180000, 300000];

  it("가격순으로 있고, 점수 보너스는 서버 상한을 올리지 않는다", () => {
    expect(IDS.map((id) => characterById(id).cost)).toEqual(COSTS);
    expect(MAX_CHARACTER_SCORE_BONUS).toBe(characterById("principal").perk.scoreBonus);
    expect(characterById("supersanta").perk.scoreBonus).toBe(MAX_CHARACTER_SCORE_BONUS);
  });

  it("이벤트에만 팔고, 산 캐릭터는 이벤트가 끝나도 입을 수 있다", () => {
    const s = store();
    s.data.coins = 100000;
    expect(purchase(s, "character", "elf").ok).toBe(false);
    expect(shopView(s.data).characters.some((c) => c.id === "elf")).toBe(false);

    expect(purchase(s, "character", "elf", { christmas: true }).ok).toBe(true);
    expect(s.data.coins).toBe(40000);
    expect(purchase(s, "character", "snowman", { christmas: true }).ok).toBe(false);

    // Over: still on sale to nobody, still the owner's.
    expect(wearableCharacter("elf", false)).toBe("elf");
    expect(shopView(s.data).characters.find((c) => c.id === "elf").equipped).toBe(true);
    expect(shopView(s.data).characters.some((c) => c.id === "rudolph")).toBe(false);
    expect(purchase(s, "character", "runner").ok).toBe(true);
    expect(purchase(s, "character", "elf").ok).toBe(true);
    expect(s.data.character).toBe("elf");
    expect(hasProgress(s.data)).toBe(true);
  });

  it("어떤 코스튬도 판정과 물리를 바꾸지 않고, 벗으면 흔적이 남지 않는다", () => {
    for (const id of ["santa", ...IDS]) {
      const plain = createPlayer();
      const worn = createPlayer(characterById(id).palette);
      setCostume(worn, id);
      const actions = { 12: "jump", 150: "slide", 260: "left", 400: "jump" };
      for (let frame = 0; frame < 520; frame++) {
        for (const p of [plain, worn]) {
          if (actions[frame]) applyAction(p, actions[frame], null, { jumpMultiplier: 1.4 });
          updatePlayer(p, 1 / 120, 30, { reindeer: p === worn });
        }
        expect([worn.x, worn.y, worn.z, worn.height], id).toEqual([plain.x, plain.y, plain.z, plain.height]);
      }
      resetPlayer(worn, 0);

      setCostume(worn, "runner");
      expect(worn.costume.on, id).toBe(false);
      expect(worn.costume.parts.some((part) => part.visible), id).toBe(false);
      expect(worn.head.visible, id).toBe(true);
      expect(worn.parts.pack[0].visible, id).toBe(true);
      expect(worn.board.scale.x, id).toBe(1);
      expect(worn.jets.position.z, id).toBe(0);
    }
  });

  it("마스코트는 러너를 가리고, 스킨을 바꿔 입어도 이전 모델이 남지 않는다", () => {
    const p = createPlayer();
    setCostume(p, "snowman");
    expect(p.head.visible).toBe(false);
    expect(p.jets.visible).toBe(false);
    const snowman = p.costume;
    updatePlayer(p, 1 / 120, 30, {});

    setCostume(p, "supersanta");
    expect(snowman.model.visible).toBe(false);
    expect(p.head.visible).toBe(true);
    expect(p.costume.herd).toHaveLength(3);
    for (let i = 0; i < 40; i++) updatePlayer(p, 1 / 120, 30, { reindeer: true });
    expect(p.costume.reins.filter((rein) => rein.mesh.visible)).toHaveLength(6);

    setCostume(p, "elf");
    expect(p.costumes.supersanta.reindeer.visible).toBe(false);
    expect(p.costumes.supersanta.sled.visible).toBe(false);
    expect(p.costume.reindeer).toBe(undefined);
    updatePlayer(p, 1 / 120, 30, { reindeer: true });
  });

  it("블랙 산타는 꽝과 ×99가 정확히 2배이고 합은 그대로 100이다", () => {
    const risk = characterById("blacksanta").perk.wheelRisk;
    const tickets = (face) => christmasTickets(face, risk);
    const sum = CHRISTMAS_SLOT_FACES.reduce((total, face) => total + tickets(face), 0);
    expect(sum).toBeCloseTo(100, 8);
    expect(tickets(CHRISTMAS_SLOT_FACES.find((face) => face.jackpot))).toBe(2);
    expect(tickets(CHRISTMAS_SLOT_FACES.find((face) => face.effect.type === "none"))).toBe(20);

    const draws = 10000;
    let jackpots = 0;
    for (let i = 0; i < draws; i++) {
      if (spinChristmas(() => (i + 0.5) / draws, risk).face.jackpot) jackpots += 1;
    }
    expect(jackpots / draws).toBeCloseTo(0.02, 3);
    expect(christmasTickets(CHRISTMAS_SLOT_FACES[1])).toBe(CHRISTMAS_SLOT_FACES[1].weight);
  });

  it("엘프는 선물이 20% 빨리 온다", () => {
    const first = (giftGap) => {
      const spawner = new Spawner(fakePool());
      spawner.reset(29);
      spawner.place(100, { speed: 40, phaseId: 4, runTime: 1, christmas: true, giftGap });
      return spawner.giftAt;
    };
    expect(first(0.8)).toBeCloseTo(first(1) * 0.8, 8);
  });

  it("루돌프는 슈퍼 스니커즈가 50% 길다", () => {
    const plain = new Run(store());
    const rudolph = new Run(store());
    rudolph.sneakerScale = characterById("rudolph").perk.sneakerTime;
    plain.addPowerup("sneakers", 1);
    rudolph.addPowerup("sneakers", 1);
    expect(rudolph.powerups.sneakers).toBeCloseTo(plain.powerups.sneakers * 1.5, 8);
  });

  it("슈퍼 산타는 꽝에 판마다 한 번만 재도전하고, 룰렛 횟수는 늘지 않는다", () => {
    vi.stubGlobal("document", { hidden: false });
    const run = new Run(store());
    const shown = [];
    const game = {
      run,
      state: "playing",
      wheelQueue: [{ kind: "gift" }],
      wheelRetries: 1,
      audio: { powerup() {}, resume() {}, purchase() {} },
      store: store(),
      screens: {
        showSlots: (faces, index, face, onDone, options) => shown.push(options.title),
        refreshProfile() {},
        syncHud() {},
      },
      pause() {},
    };
    const miss = CHRISTMAS_SLOT_FACES.find((face) => face.effect.type === "none");

    Game.prototype.spinWheel.call(game);
    Game.prototype.settleWheel.call(game, miss);
    expect(game.wheelQueue).toEqual([{ kind: "gift", retry: true }]);
    expect(game.wheelRetries).toBe(0);

    Game.prototype.spinWheel.call(game);
    expect(shown[1]).toContain("재도전");
    expect(run.metrics.spins).toBe(1);

    Game.prototype.settleWheel.call(game, miss);
    expect(game.wheelQueue).toEqual([]);
    expect(game.state).toBe("playing");
    vi.unstubAllGlobals();
  });
});

describe("크리스마스 장애물", () => {
  const sizeOf = (object) => {
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  };
  const fakeScene = () => ({ add() {}, remove() {} });

  it("모습만 바뀌고 판정 값과 크기는 그대로라 눈에 보이는 것이 판정과 어긋나지 않는다", () => {
    const pool = new EntityPool(fakeScene());
    for (const type of ["train", "bus", "barrier", "sign", "crate"]) {
      // The container's skin is a canvas, so its size is written down instead.
      const before =
        type === "crate" ? new THREE.Vector3(1.45, 1.2, 1.35) : sizeOf(pool.spawn(type, 0, 10).mesh);
      const plain = { ...SPEC[type] };
      pool.setChristmas(true);
      for (let i = 0; i < 12; i++) {
        const festive = pool.spawn(type, 0, 10);
        for (const key of ["length", "depth", "minY", "maxY", "lethal"]) {
          expect(festive[key], `${type} ${key}`).toBe(plain[key]);
        }
        expect(festive.rideable, type).toBe(Boolean(plain.rideable));
        expect(festive.roofY, type).toBe(plain.roofY ?? 0);
        const after = sizeOf(festive.mesh);
        // Trim may stand a little proud of the body, and no more than that.
        expect(Math.abs(after.x - before.x), `${type} width`).toBeLessThan(0.4);
        expect(Math.abs(after.y - before.y), `${type} height`).toBeLessThan(0.4);
        expect(Math.abs(after.z - before.z), `${type} length`).toBeLessThan(0.4);
      }
      pool.clear();
      pool.setChristmas(false);
    }
  });

  it("지붕의 눈이 탑승 높이를 넘지 않아 발이 파묻히지 않는다", () => {
    const pool = new EntityPool(fakeScene());
    pool.setChristmas(true);
    for (const type of ["train", "bus"]) {
      const vehicle = pool.spawn(type, 0, 10);
      const trim = vehicle.mesh.children.at(-1);
      trim.geometry.computeBoundingBox();
      expect(trim.geometry.boundingBox.max.y, type).toBeLessThanOrEqual(SPEC[type].roofY + 0.2);
    }
  });

  it("마주 오는 버스의 전조등 표시도 그대로 동작한다", () => {
    const pool = new EntityPool(fakeScene());
    pool.setChristmas(true);
    const bus = pool.spawn("bus", 0, 10);
    makeOncoming(bus, 30);
    expect(bus.mesh.rotation.y).toBe(Math.PI);
    let lights = 0;
    bus.mesh.traverse((child) => {
      if (child.userData?.headlight) lights += 1;
    });
    expect(lights).toBe(2);
  });
});

describe("상점의 크리스마스 탭과 NEW", () => {
  const render = (save, opts, tab) => {
    const root = { innerHTML: "" };
    renderShop(root, shopView(save, opts), tab);
    return root.innerHTML;
  };

  it("이벤트 탭에 캐릭터와 효과가, 일반 탭에 나머지가 나온다", () => {
    const s = store();
    const event = render(s.data, { christmas: true }, "christmas");
    for (const name of ["산타", "엘프", "슈퍼 산타", "눈덩이와 눈보라", "진저브레드"]) expect(event).toContain(name);
    // The odds stay off this screen.
    expect(event).not.toContain("선물 룰렛");
    expect(event).toContain("12월 31일");
    expect(event).toContain('class="fx-chip event"');
    expect(event).not.toContain("파워업 강화");

    const general = render(s.data, { christmas: true }, "general");
    expect(general).toContain("파워업 강화");
    expect(general).toContain("네온");
    expect(general).not.toContain("슈퍼 산타");

    const off = render(s.data);
    expect(off).not.toContain("shop-tab");
    expect(off).not.toContain("슈퍼 산타");
    expect(off).toContain("네온");
  });

  it("NEW는 안 산 새 캐릭터에만, 상점 버튼은 안 본 것이 있을 때만 붙는다", () => {
    const s = store();
    s.data.coins = 100000;
    expect(render(s.data, { christmas: true }, "christmas").match(/new-tag/g)).toHaveLength(6);
    expect(render(s.data, { christmas: true }, "general")).not.toContain("new-tag");

    const fresh = unseenNewCharacters(s.data, [], { christmas: true });
    expect(fresh).toContain("supersanta");
    expect(unseenNewCharacters(s.data, fresh, { christmas: true })).toEqual([]);
    // Nothing to nudge about when none of it is for sale.
    expect(unseenNewCharacters(s.data, [])).toEqual([]);

    purchase(s, "character", "elf", { christmas: true });
    expect(shopView(s.data, { christmas: true }).characters.find((c) => c.id === "elf").isNew).toBe(false);
    expect(unseenNewCharacters(s.data, [], { christmas: true })).not.toContain("elf");
  });
});

describe("상점과 저장", () => {
  it("이벤트 중에는 무료로 선택되고, 끝나면 숨겨지되 저장은 깨지지 않는다", () => {
    const s = store();
    expect(shopView(s.data).characters.some((c) => c.id === "santa")).toBe(false);
    expect(purchase(s, "character", "santa").ok).toBe(false);

    const coins = s.data.coins;
    expect(purchase(s, "character", "santa", { christmas: true }).ok).toBe(true);
    expect(s.data.character).toBe("santa");
    expect(s.data.coins).toBe(coins);
    expect(shopView(s.data, { christmas: true }).characters.find((c) => c.id === "santa").equipped).toBe(true);

    // Over: the save keeps it, the game wears the default, the shop agrees.
    expect(wearableCharacter(s.data.character, false)).toBe("runner");
    expect(shopView(s.data).characters.find((c) => c.id === "runner").equipped).toBe(true);
    const again = normalizeSave(JSON.parse(JSON.stringify(s.data)));
    expect(again.character).toBe("santa");
    expect(again.characters).toContain("santa");
  });

  it("무료 스킨만 고른 게스트는 진행 기록이 있는 것으로 치지 않는다", () => {
    const s = store();
    purchase(s, "character", "santa", { christmas: true });
    expect(hasProgress(s.data)).toBe(false);
    s.data.characters.push("neon");
    expect(hasProgress(s.data)).toBe(true);
  });
});

describe("눈보라와 루돌프 코", () => {
  const fakeScene = () => ({ meshes: new Set(), add(m) { this.meshes.add(m); }, remove(m) { this.meshes.delete(m); } });

  it("모습만 바뀌고, 이전 모습의 메시는 풀에서 다시 나오지 않는다", () => {
    const scene = fakeScene();
    const pool = new EntityPool(scene);
    const plain = pool.spawn("coin", 0, 10);
    expect(plain.mesh.geometry.type).toBe("CylinderGeometry");
    pool.setChristmas(true);
    expect(pool.live).toHaveLength(0);
    expect(scene.meshes.has(plain.mesh)).toBe(false);

    const nose = pool.spawn("coin", 0, 10);
    expect(nose.mesh).not.toBe(plain.mesh);
    expect(nose.mesh.geometry.attributes.color).toBeTruthy();
    expect(nose.type).toBe("coin");

    const cloud = pool.spawn("crowEgg", 0, 20, 0.75);
    expect(cloud.hazard).toBe("crow");
    expect(cloud.mesh.isGroup).toBe(true);

    pool.setChristmas(false);
    expect(pool.spawn("coin", 0, 10).mesh.geometry.type).toBe("CylinderGeometry");
  });

  it("같은 시야를 하얗게 흐리고, 조명은 까마귀보다 덜 어둡게 한다", () => {
    const world = () => ({
      scene: { fog: { near: 100, far: 300, color: new THREE.Color(0x8fc6e6) }, background: new THREE.Color(0x8fc6e6) },
      hemi: { intensity: 1 },
      sun: { intensity: 1 },
      ambient: { intensity: 1 },
    });
    const dusk = world();
    const white = world();
    applyCrowGloom(dusk, 1);
    applyCrowGloom(white, 1, true);
    expect(white.scene.fog.near).toBe(dusk.scene.fog.near);
    expect(white.scene.fog.far).toBe(dusk.scene.fog.far);
    expect(white.scene.fog.color.getHSL({}).l).toBeGreaterThan(dusk.scene.fog.color.getHSL({}).l);
    expect(white.sun.intensity).toBeGreaterThan(dusk.sun.intensity);
  });

  it("이벤트 판에서도 같은 점수부터 같은 함정이 나오고, 문구는 눈보라다", () => {
    const pool = fakePool();
    const spawner = new Spawner(pool);
    spawner.reset(5);
    for (let i = 0; i < 80; i++) {
      spawner.place(100 + i * 100, { speed: 40, phaseId: 4, runTime: 1, christmas: true, score: HAZARD_FROM_SCORE });
    }
    expect(pool.live.some((item) => item.type === "crowEgg")).toBe(true);

    const s = store();
    const view = shopView(s.data, { christmas: true });
    const scarecrow = view.characters.find((c) => c.id === "scarecrow");
    expect(scarecrow.blurb).toContain("눈보라 -30%");
    expect(scarecrow.perk.crowTime).toBe(0.7);
    expect(shopView(s.data).characters.find((c) => c.id === "scarecrow").blurb).toContain("까마귀 -30%");

    const root = { innerHTML: "" };
    renderRunTally(root, { crows: 2 }, true);
    expect(root.innerHTML).toContain("눈보라");
    expect(root.innerHTML).not.toContain("까마귀");
  });
});

describe("결과 화면", () => {
  it("이벤트 판에는 다이아몬드 대신 선물 줄이 나온다", () => {
    const root = { innerHTML: "" };
    renderRunTally(root, { gifts: 2, spins: 2 }, true);
    expect(root.innerHTML).toContain("선물");
    expect(root.innerHTML).not.toContain("다이아몬드");
    renderRunTally(root, { diamonds: 2 });
    expect(root.innerHTML).toContain("다이아몬드");
    expect(root.innerHTML).not.toContain("선물");
  });
});
