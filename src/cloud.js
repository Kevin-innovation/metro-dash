/**
 * Online mode.
 *
 * Everything here is optional. With no VITE_CONVEX_URL configured — or with the
 * backend unreachable — `enabled` stays false and the game runs exactly as it
 * did before, entirely on local storage. Guest play must never depend on a
 * server being up.
 */

const SESSION_KEY = "metro-dash-session";
const DEVICE_KEY = "metro-dash-device";

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode — the session simply does not persist */
  }
}

/**
 * Stable per-browser id, used only to cap how many accounts one device can
 * create. Not a fingerprint: it is a random value this browser generated about
 * itself, and clearing site data resets it.
 */
export function deviceId() {
  let id = readLocal(DEVICE_KEY);
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    writeLocal(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Convex reports application errors in `error.data`; `error.message` carries a
 * stack trace and a server file path that no player should ever be shown.
 */
export function cloudMessage(error) {
  const data = error?.data;
  if (typeof data === "string" && data) return data;
  return "잠시 후 다시 시도해 주세요";
}

export class Cloud {
  constructor(url = import.meta.env?.VITE_CONVEX_URL) {
    this.url = url || null;
    this.client = null;
    this.session = null;
    this.ready = false;
    this.listeners = new Set();
  }

  get enabled() {
    return Boolean(this.url);
  }

  get signedIn() {
    return Boolean(this.session?.token);
  }

  get handle() {
    return this.session?.handle ?? null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  /**
   * Load the Convex client lazily, so a guest never pays for code they do not
   * use and a missing backend cannot break start-up.
   */
  async connect() {
    if (!this.enabled || this.client) return this.client;
    try {
      const { ConvexClient } = await import("convex/browser");
      this.client = new ConvexClient(this.url);
      this.ready = true;
      const saved = readLocal(SESSION_KEY);
      if (saved) {
        this.session = JSON.parse(saved);
        // Confirm the token is still good before trusting it.
        await this.refresh().catch(() => this.clearSession());
      }
    } catch {
      this.client = null;
      this.ready = false;
    }
    this.emit();
    return this.client;
  }

  clearSession() {
    this.session = null;
    writeLocal(SESSION_KEY, null);
    this.emit();
  }

  keepSession(result) {
    this.session = { token: result.token, handle: result.handle };
    writeLocal(SESSION_KEY, JSON.stringify(this.session));
    this.emit();
    return result;
  }

  async mutation(name, args) {
    await this.connect();
    if (!this.client) throw new Error("서버에 연결할 수 없어요");
    return await this.client.mutation(name, args);
  }

  async query(name, args) {
    await this.connect();
    if (!this.client) throw new Error("서버에 연결할 수 없어요");
    return await this.client.query(name, args);
  }

  // --- account ------------------------------------------------------------

  async checkHandle(handle) {
    return await this.query("players:available", { handle });
  }

  async register(handle, pin, profile) {
    const result = await this.mutation("players:register", {
      handle,
      pin,
      deviceId: deviceId(),
      profile,
    });
    return this.keepSession(result);
  }

  async signIn(handle, pin) {
    // The server reports a bad PIN as a value rather than an error, so its
    // attempt counter survives; turn it back into an error for the caller.
    const result = await this.mutation("players:signIn", { handle, pin });
    if (!result?.ok) {
      const error = new Error(result?.message ?? "로그인하지 못했어요");
      error.data = result?.message ?? "로그인하지 못했어요";
      throw error;
    }
    return this.keepSession(result);
  }

  async signOut() {
    if (this.signedIn) {
      await this.mutation("players:signOut", { token: this.session.token }).catch(() => {});
    }
    this.clearSession();
  }

  async refresh() {
    if (!this.signedIn) return null;
    const result = await this.query("players:load", { token: this.session.token });
    this.session = { ...this.session, handle: result.handle };
    return result;
  }

  // --- sync ---------------------------------------------------------------

  /**
   * Push the save up. Failures are swallowed on purpose: a run that finished
   * offline still counts locally, and the next sync carries it.
   */
  async save(profile, best) {
    if (!this.signedIn) return false;
    try {
      await this.mutation("players:save", { token: this.session.token, profile, best });
      return true;
    } catch {
      return false;
    }
  }

  async submitRun(run) {
    if (!this.signedIn) return null;
    try {
      return await this.mutation("scores:submit", { token: this.session.token, ...run });
    } catch {
      return null;
    }
  }

  async leaderboard(limit = 20) {
    return await this.query("scores:top", { limit });
  }

  async standing() {
    if (!this.signedIn) return null;
    try {
      return await this.query("scores:standing", { token: this.session.token });
    } catch {
      return null;
    }
  }
}
