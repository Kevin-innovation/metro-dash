/**
 * Noticing that the page is out of date.
 *
 * A browser that already has the game open keeps running the copy it loaded.
 * That is how the web works, and normally it does not matter — but this gets
 * patched while people are playing it, and a tab opened before a fix is a tab
 * that still has the bug. Nobody thinks to reload, because nothing tells them
 * to. From the inside it looks like the fix did not work.
 *
 * The build gives every deploy a new hashed entry script, so the check is just:
 * does the server's index.html still point at the file this page is running?
 * No extra endpoint, no version number to remember to bump, and nothing that
 * can drift from what was actually deployed.
 *
 * Only ever *offers* a reload. Reloading somebody mid-run to fix a HUD colour
 * would be a worse bug than the one being fixed.
 */

/** The module script this page actually loaded. */
function currentEntry() {
  const tag = document.querySelector('script[type="module"][src]');
  return tag?.getAttribute("src") ?? null;
}

/** What the server is serving right now. */
async function servedEntry() {
  // no-store rather than a cache-buster query: a query string would make every
  // check a cache miss at the CDN, and this runs whenever a tab is refocused.
  const response = await fetch("/", { cache: "no-store" });
  if (!response.ok) return null;
  const html = await response.text();
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;
}

/**
 * Watch for a newer deploy and call `onStale` once when one appears.
 *
 * Checked when the tab is refocused and when `poke()` is called, rather than on
 * a timer — the two moments a player is between things anyway.
 *
 * @param {() => void} onStale
 * @returns {{ poke: () => void }}
 */
export function watchForUpdate(onStale) {
  const entry = currentEntry();
  // In dev the entry is /src/main.js and never changes, so there is nothing
  // here to detect and no reason to spend the request.
  if (!entry || !import.meta.env?.PROD) return { poke: () => {} };

  let told = false;
  let checking = false;

  const check = async () => {
    if (told || checking || document.hidden) return;
    checking = true;
    try {
      const served = await servedEntry();
      if (served && served !== entry) {
        told = true;
        onStale();
      }
    } catch {
      // Offline, or the deploy is mid-flight. Nothing to say; try again later.
    } finally {
      checking = false;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  return { poke: check };
}
