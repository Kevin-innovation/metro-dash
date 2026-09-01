/**
 * The optional autocomplete list.
 *
 * `data/schools.json` is produced by `scripts/fetch-schools.mjs` from NEIS open
 * data and committed. It ships as its own chunk, loaded the first time someone
 * opens the school form, so a player who never touches that form never
 * downloads it.
 *
 * Everything here is a convenience. The file starts out empty and the game is
 * fully usable that way — the names students type are normalised by school.js
 * either way, and the server never trusts this list.
 */

let loading = null;

async function loadTable() {
  if (!loading) {
    loading = import("./data/schools.json")
      .then((module) => module.default ?? module)
      .catch(() => ({}));
  }
  return await loading;
}

/**
 * School names in a region, ready to be shown as suggestions.
 *
 * Entries are stored as the bare name, so the level suffix is added back for
 * display. A handful whose names do not follow the pattern are stored whole,
 * marked with a leading "=".
 *
 * @returns {Promise<string[]>} bare names; the caller appends the suffix
 */
export async function loadSchoolNames(region, level) {
  const table = await loadTable();
  const names = table?.[region]?.[level];
  const result = Array.isArray(names) ? [...names] : [];

  // DIS is a K–12 school and is not consistently present in the NEIS list.
  // Keep it available in all three menus as a search suggestion; school.js
  // still validates and canonicalises the submitted value on the server.
  if (region === "대구" && ["초", "중", "고"].includes(level) && !result.includes("=DIS")) {
    result.unshift("=DIS");
  }
  return result;
}

/** Whether a usable list was bundled at all. */
export async function hasSchoolList() {
  const table = await loadTable();
  return Object.keys(table ?? {}).length > 0;
}
