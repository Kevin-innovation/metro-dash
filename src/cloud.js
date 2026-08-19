/**
 * Online mode.
 *
 * Everything here is optional. With no VITE_CONVEX_URL configured — or with the
 * backend unreachable — `enabled` stays false and the game runs exactly as it
 * did before, entirely on local storage. Guest play must never depend on a
 * server being up.
 */

const SESSION_KEY = "metro-dash-session";
/** Remembers the state of the 자동 로그인 box, not the session itself. */
const REMEMBER_KEY = "metro-dash-remember";
/** Must match the key src/admin.js reads. */
const ADMIN_KEY_STORE = "metro-dash-admin-key";
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
 * Where a session is kept.
 *
 * With 자동 로그인 on it goes to localStorage and survives closing the browser.
 * With it off it goes to sessionStorage instead, which lasts as long as the tab
 * — a reload does not sign you out, but a shared computer does not stay signed
 * in after the tab is closed. It is written to exactly one of the two, so the
 * choice cannot be undone by a copy left behind in the other.
 */
function writeSession(session) {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const keep = session.remember !== false;
    (keep ? sessionStorage : localStorage).removeItem(SESSION_KEY);
    (keep ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode — the session simply does not persist */
  }
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Whether 자동 로그인 was ticked last time, so the box opens the way it was left. */
export function readRemember() {
  return readLocal(REMEMBER_KEY) !== "0";
}

/**
 * Did the server reject this token, or did the call simply not get through?
 *
 * Convex reports an application error as a string in `error.data`; a dropped
 * connection, a deploy in progress or a browser opened offline arrive without
 * one. The difference decides whether the saved session is thrown away, and
 * getting it wrong is what signed people out for good after one bad moment.
 */
function sessionRejected(error) {
  return typeof error?.data === "string" && error.data.length > 0;
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
    // Read here rather than in connect(), which cannot run until the Convex
    // client has been fetched and parsed. Waiting for that meant the title
    // screen painted 「로그인」 first and swapped to the signed-in row a moment
    // later — a flash on every reload for someone who never signed out.
    this.session = readSession();
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

  /** The school this account belongs to, or "" while none has been chosen. */
  get schoolLabel() {
    return this.session?.schoolLabel ?? "";
  }

  /** True for the staff account, which manages rather than plays. */
  get staff() {
    return Boolean(this.session?.staff);
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
      const saved = this.session ?? readSession();
      if (saved) {
        this.session = saved;
        // Confirm the token is still good before trusting it — but only throw it
        // away if the server actually says so. A failed call on a train tunnel
        // used to end the session permanently.
        await this.refresh().catch((error) => {
          if (sessionRejected(error)) this.clearSession();
        });
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
    writeSession(null);
    this.emit();
  }

  keepSession(result, remember = true) {
    // Stored with the session, so every later write goes back to the same place
    // without having to ask the form again.
    writeLocal(REMEMBER_KEY, remember ? "1" : "0");
    this.session = {
      token: result.token,
      handle: result.handle,
      schoolLabel: result.schoolLabel ?? "",
      staff: Boolean(result.staff),
      remember,
    };
    // Handed over to the tools page through sessionStorage, which is per-tab
    // and cleared when the tab closes — the key is never written to disk.
    if (result.adminKey) {
      try {
        sessionStorage.setItem(ADMIN_KEY_STORE, result.adminKey);
      } catch {
        /* private mode — the tools page will ask for the key itself */
      }
    }
    writeSession(this.session);
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

  async register(handle, pin, profile, remember = true) {
    const result = await this.mutation("players:register", {
      handle,
      pin,
      deviceId: deviceId(),
      profile,
    });
    return this.keepSession(result, remember);
  }

  async signIn(handle, pin, remember = true) {
    // The server reports a bad PIN as a value rather than an error, so its
    // attempt counter survives; turn it back into an error for the caller.
    // The device id goes with it: the token comes back scoped to this browser,
    // so signing in here does not sign the same account out anywhere else.
    const result = await this.mutation("players:signIn", { handle, pin, deviceId: deviceId() });
    if (!result?.ok) {
      const error = new Error(result?.message ?? "로그인하지 못했어요");
      error.data = result?.message ?? "로그인하지 못했어요";
      throw error;
    }
    return this.keepSession(result, remember);
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
    this.session = {
      ...this.session,
      handle: result.handle,
      schoolLabel: result.schoolLabel ?? "",
      staff: Boolean(result.staff),
    };
    writeSession(this.session);
    this.emit();
    return result;
  }

  // --- sync ---------------------------------------------------------------

  /**
   * Push the save up. Failures are swallowed on purpose: a run that finished
   * offline still counts locally, and the next sync carries it.
   */
  async save(profile) {
    if (!this.signedIn) return false;
    try {
      // No score here on purpose: the server owns `best`, and it only moves
      // when a submitted run passes validation.
      await this.mutation("players:save", { token: this.session.token, profile });
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

  /**
   * Claim a school. The server allows this exactly once per account, so the
   * label it returns is final until staff change it.
   */
  async setSchool(region, level, name) {
    if (!this.signedIn) throw new Error("로그인해야 학교를 정할 수 있어요");
    const result = await this.mutation("players:setSchool", {
      token: this.session.token,
      region,
      level,
      name,
    });
    this.session = { ...this.session, schoolLabel: result.schoolLabel };
    writeSession(this.session);
    this.emit();
    return result;
  }

  async report(handle) {
    if (!this.signedIn) throw new Error("로그인해야 신고할 수 있어요");
    return await this.mutation("reports:report", { token: this.session.token, handle });
  }

  /** @param {"week"|"all"} range which board to read. */
  async leaderboard(limit = 20, range = "week") {
    return await this.query("scores:top", { limit, range });
  }

  async standing(range = "week") {
    if (!this.signedIn) return null;
    try {
      return await this.query("scores:standing", { token: this.session.token, range });
    } catch {
      return null;
    }
  }

  async schoolLeaderboard(limit = 10) {
    return await this.query("schools:top", { limit });
  }

  async schoolStanding() {
    if (!this.signedIn) return null;
    try {
      return await this.query("schools:standing", { token: this.session.token });
    } catch {
      return null;
    }
  }
}
