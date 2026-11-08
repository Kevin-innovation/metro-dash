import { CHARACTERS, UPGRADE_COSTS } from "./shop.js";
import { COSMETICS, cosmeticById } from "./cosmetics.js";
import { POWERUPS, POWERUP_IDS, POWERUP_MAX_LEVEL } from "./powerups.js";

/**
 * The class's coins, worked out for the staff economy tab.
 *
 * Purchases are not logged, so spending is read off what each save owns, priced
 * at today's prices. Consumables spent in a run leave nothing behind to read,
 * so whatever the balance cannot account for is filed as 「소모품 · 기타」.
 * Pure, so it can be tested without a server.
 */

const PRICE = new Map(CHARACTERS.filter((c) => c.cost > 0).map((c) => [c.id, c.cost]));

/** Coins sunk into one save's power-up levels. */
export function upgradeSpend(upgrades = {}) {
  let spent = 0;
  for (const id of POWERUP_IDS) {
    const level = Math.min(POWERUP_MAX_LEVEL, Math.max(1, Math.floor(upgrades[id] ?? 1)));
    for (let step = 2; step <= level; step++) spent += UPGRADE_COSTS[step] ?? 0;
  }
  return spent;
}

/** One student's money: where it came from and where it went. */
export function studentEconomy(row) {
  const characters = row.characters.reduce((sum, id) => sum + (PRICE.get(id) ?? 0), 0);
  const upgrades = upgradeSpend(row.upgrades);
  const cosmetics = row.cosmetics.reduce((sum, id) => sum + (cosmeticById(id)?.cost ?? 0), 0);
  const items = characters + upgrades + cosmetics;
  // The server's ledger is the record; the save's own figure stands in on an
  // account that has not synced since the ledger existed. Never less than what
  // the save visibly holds, or spending would come out negative.
  const earned = Math.max(row.ledger ?? row.earned ?? 0, row.coins + items);
  const spent = earned - row.coins;
  const fromRuns = Math.min(row.runCoins ?? 0, earned);
  return {
    ...row,
    earned,
    income: { runs: fromRuns, other: earned - fromRuns },
    spent: { characters, upgrades, cosmetics, other: Math.max(0, spent - items), total: spent },
    itemCount: row.characters.filter((id) => PRICE.has(id)).length + row.cosmetics.length,
  };
}

/** The whole class at once, plus what each item has sold. */
export function classEconomy(rows) {
  const students = rows.map(studentEconomy);
  const sum = (pick) => students.reduce((total, student) => total + pick(student), 0);

  const owners = (list, of) =>
    list
      .map((item) => {
        const count = students.filter((student) => of(student).includes(item.id)).length;
        return { id: item.id, name: item.name, icon: item.icon ?? "", cost: item.cost, count, coins: count * item.cost };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || b.coins - a.coins);

  const upgrades = POWERUP_IDS.map((id) => {
    const levels = students.map((student) => Math.max(1, Math.min(POWERUP_MAX_LEVEL, student.upgrades[id] ?? 1)));
    return {
      id,
      name: POWERUPS[id].name,
      icon: POWERUPS[id].icon,
      average: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1,
      raised: levels.filter((level) => level > 1).length,
      maxed: levels.filter((level) => level >= POWERUP_MAX_LEVEL).length,
    };
  });

  return {
    students,
    totals: {
      students: students.length,
      buyers: students.filter((student) => student.spent.total > 0).length,
      coins: sum((s) => s.coins),
      earned: sum((s) => s.earned),
      spent: sum((s) => s.spent.total),
      income: { runs: sum((s) => s.income.runs), other: sum((s) => s.income.other) },
      spending: {
        characters: sum((s) => s.spent.characters),
        upgrades: sum((s) => s.spent.upgrades),
        cosmetics: sum((s) => s.spent.cosmetics),
        other: sum((s) => s.spent.other),
      },
      hoverboards: sum((s) => s.hoverboards),
      antidotes: sum((s) => s.antidotes),
    },
    owners: {
      characters: owners(
        CHARACTERS.filter((c) => c.cost > 0),
        (s) => s.characters,
      ),
      cosmetics: owners(COSMETICS, (s) => s.cosmetics),
      upgrades,
    },
  };
}
