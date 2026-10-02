import {
  beginDraftSession,
  writeDraft,
  preserveDraft,
  readDrafts,
  discardDraft,
  acknowledgeDraft,
} from "./drafts";
import {
  validateState,
  STORAGE_KEY,
  accountStorage,
  loadState,
} from "./storage";
import { uid, type SavedState } from "./types";
type User = { id: string; name: string };
const IDENTITY = "calculator.signed-in-account";
let user: User | null = null,
  revision = 0,
  accountGeneration = 0,
  saving = false,
  pending: SavedState | null = null;
const emit = (message: string) =>
  window.dispatchEvent(new CustomEvent("calculator-sync", { detail: message }));
const revKey = () => accountStorage("revision");
function validUser(value: unknown): value is User {
  const candidate = value as User | null;
  return (
    !!candidate &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.name === "string"
  );
}
function savedRevision() {
  const value = Number(localStorage.getItem(revKey()) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function assignAccount(identity: User) {
  if (user && user.id !== identity.id) {
    accountGeneration++;
    pending = null;
    navigator.serviceWorker?.controller?.postMessage({ type: "SIGN_OUT" });
  }
  user = identity;
}
export async function initializeAccount(): Promise<User> {
  const generation = ++accountGeneration;
  pending = null;
  beginDraftSession();
  const assertCurrent = () => {
    if (generation !== accountGeneration)
      throw Error("Account changed. Reload before opening saved work.");
  };
  const restoreLocal = (identity: User) => {
    assertCurrent();
    assignAccount(identity);
    revision = savedRevision();
    return identity;
  };
  let cached: User | null = null;
  try {
    const value = JSON.parse(localStorage.getItem(IDENTITY) || "null");
    if (validUser(value)) cached = value;
  } catch {}
  if (!navigator.onLine) {
    if (!cached)
      throw Error("Connect and sign in once before using this device offline.");
    return restoreLocal(cached);
  }
  let response: Response;
  try {
    response = await fetch("/api/workspace", { cache: "no-store" });
  } catch (error) {
    if (!cached) throw error;
    return restoreLocal(cached);
  }
  assertCurrent();
  if (!response.ok) {
    if (response.status >= 500 && cached) {
      const unavailable = (await response.json().catch(() => null)) as {
        user?: unknown;
      } | null;
      assertCurrent();
      if (validUser(unavailable?.user) && unavailable.user.id === cached.id) {
        return restoreLocal(unavailable.user);
      }
    }
    if (response.status === 401 || response.status === 403) forgetAccount();
    throw Error(
      response.status === 401
        ? "Sign in to open your workspace."
        : "Cloud saves are temporarily unavailable. Try again; your local work is preserved.",
    );
  }
  const data = (await response.json()) as any;
  assertCurrent();
  if (
    !validUser(data.user) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0
  )
    throw Error(
      "The saved workspace response is invalid. Your local work is preserved.",
    );
  const remote = data.state ? validateState(data.state) : null;
  assignAccount(data.user);
  localStorage.setItem(IDENTITY, JSON.stringify(user));
  revision = data.revision;
  // A legacy local workspace has no authenticated owner. Claim it only explicitly.
  const local = loadState().state;
  const dirty = localStorage.getItem(accountStorage("dirty")) === "1";
  if (remote) {
    let drafts = readDrafts(data.user.id);
    const localText = local ? JSON.stringify(local) : "";
    if (
      local &&
      dirty &&
      !drafts.some((draft) => JSON.stringify(draft.state) === localText)
    ) {
      preserveDraft(data.user.id, savedRevision(), local);
      drafts = readDrafts(data.user.id);
    }
    const merged = { ...remote, notebooks: [...remote.notebooks] };
    const seen = new Set([JSON.stringify(remote)]);
    const incorporated = [];
    for (const draft of drafts) {
      const text = JSON.stringify(draft.state);
      if (seen.has(text)) {
        incorporated.push(draft);
        continue;
      }
      if (merged.notebooks.length + draft.state.notebooks.length > 100)
        continue;
      const suffix = " (offline copy)";
      merged.notebooks.push(
        ...draft.state.notebooks.map((book) => ({
          ...book,
          id: uid(),
          name: book.name.slice(0, 100 - suffix.length) + suffix,
        })),
      );
      seen.add(text);
      incorporated.push(draft);
    }
    validateState(merged);
    localStorage.setItem(accountStorage(STORAGE_KEY), JSON.stringify(merged));
    if (merged.notebooks.length > remote.notebooks.length) {
      writeDraft(data.user.id, revision, merged);
      localStorage.setItem(accountStorage("dirty"), "1");
    } else localStorage.removeItem(accountStorage("dirty"));
    for (const draft of incorporated) discardDraft(draft);
  }
  localStorage.setItem(revKey(), String(revision));
  return user!;
}
export function currentAccount() {
  return user?.id || "";
}
export function forgetAccount() {
  accountGeneration++;
  pending = null;
  user = null;
  localStorage.removeItem(IDENTITY);
  navigator.serviceWorker?.controller?.postMessage({ type: "SIGN_OUT" });
}
export function syncWorkspace(state: SavedState) {
  writeDraft(currentAccount(), revision, state);
  pending = state;
  localStorage.setItem(revKey(), String(revision));
  localStorage.setItem(accountStorage("dirty"), "1");
  void drain();
}
async function drain() {
  if (saving || !pending || !user) return;
  if (!navigator.onLine) {
    emit("Saved offline · sync when connected");
    return;
  }
  saving = true;
  const state = pending;
  const acknowledgedText = JSON.stringify(state);
  const owner = user.id,
    generation = accountGeneration;
  const stillCurrent = () =>
    user?.id === owner && generation === accountGeneration;
  pending = null;
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, revision, account: owner }),
    });
    const data = (await response.json()) as any;
    if (!stillCurrent()) return;
    if (response.status === 409) {
      pending ??= state;
      emit("Newer work exists on another device. Reload to keep both copies.");
      return;
    }
    if (!response.ok) throw Error(data.error || "Cloud save unavailable");
    if (!Number.isSafeInteger(data.revision) || data.revision <= revision)
      throw Error("The cloud save response is invalid");
    revision = data.revision;
    acknowledgeDraft(owner, state, revision);
    const storedText = localStorage.getItem(accountStorage(STORAGE_KEY));
    if (storedText === acknowledgedText) {
      localStorage.setItem(revKey(), String(revision));
      if (!pending) localStorage.removeItem(accountStorage("dirty"));
    } else if (pending && storedText === JSON.stringify(pending)) {
      localStorage.setItem(revKey(), String(revision));
    }
    emit("Saved to your account");
  } catch (error) {
    if (!stillCurrent()) return;
    pending ??= state;
    emit((error as Error).message + " · saved on this device");
    return;
  } finally {
    saving = false;
    if (!stillCurrent() && pending && user) void drain();
  }
  if (pending) void drain();
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void drain());
  window.addEventListener("focus", () => void drain());
}
