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
import {
  serializeWorkspaceRequest,
  workspaceRequestFits,
  WORKSPACE_SIZE_ERROR,
} from "./workspace-request";
type User = { id: string; name: string };
const IDENTITY = "calculator.signed-in-account";
let user: User | null = null,
  revision = 0,
  accountGeneration = 0,
  pending: SavedState | null = null;
const REQUEST_TIMEOUT = 15000;
type SaveRequest = {
  owner: string;
  generation: number;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
};
let activeSave: SaveRequest | null = null;
let sessionOwner = "",
  sessionState: SavedState | null = null;
let cloudAcknowledgedText = "",
  durableDraftText = "";
let storageUnavailable = false,
  storageReadable = true;
function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageUnavailable = true;
    storageReadable = false;
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageUnavailable = true;
    return false;
  }
}
function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    storageUnavailable = true;
  }
}
function stopSave() {
  const request = activeSave;
  activeSave = null;
  if (!request) return;
  clearTimeout(request.timer);
  request.controller.abort();
}
function rememberWorkspace(owner: string, state: SavedState) {
  sessionState = validateState(JSON.parse(JSON.stringify(state)));
  sessionOwner = owner;
}
export function sessionWorkspace(): SavedState | null {
  return user?.id === sessionOwner ? sessionState : null;
}
export function hasVolatileWorkspace(): boolean {
  const state = sessionWorkspace();
  if (!state || !user) return false;
  const text = JSON.stringify(state);
  if (text === cloudAcknowledgedText) return false;
  try {
    const stored = localStorage.getItem(accountStorage(STORAGE_KEY));
    if (stored && JSON.stringify(validateState(JSON.parse(stored))) === text)
      return false;
  } catch {
    if (text === durableDraftText) return false;
  }
  return !readDrafts(user.id).some(
    (draft) => JSON.stringify(draft.state) === text,
  );
}
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
  const value = Number(readLocal(revKey()) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function assignAccount(identity: User) {
  if (user && user.id !== identity.id) {
    accountGeneration++;
    stopSave();
    pending = null;
    sessionOwner = "";
    sessionState = null;
    cloudAcknowledgedText = "";
    durableDraftText = "";
    navigator.serviceWorker?.controller?.postMessage({ type: "SIGN_OUT" });
  }
  user = identity;
}
export async function initializeAccount(): Promise<User> {
  const generation = ++accountGeneration;
  stopSave();
  pending = null;
  storageUnavailable = false;
  storageReadable = true;
  beginDraftSession();
  const assertCurrent = () => {
    if (generation !== accountGeneration)
      throw Error("Account changed. Reload before opening saved work.");
  };
  const restoreLocal = (identity: User) => {
    assertCurrent();
    assignAccount(identity);
    revision = savedRevision();
    const local = loadState().state;
    if (local) rememberWorkspace(identity.id, local);
    return identity;
  };
  let cached: User | null = null;
  try {
    const value = JSON.parse(readLocal(IDENTITY) || "null");
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
  if (!writeLocal(IDENTITY, JSON.stringify(user))) removeLocal(IDENTITY);
  revision = data.revision;
  cloudAcknowledgedText = remote ? JSON.stringify(remote) : "";
  // A legacy local workspace has no authenticated owner. Claim it only explicitly.
  const loaded = loadState(),
    local = loaded.state;
  if (
    loaded.warning.includes("storage is unavailable") ||
    (loaded.warning && !local)
  ) {
    storageReadable = false;
    storageUnavailable = true;
  }
  const dirty = readLocal(accountStorage("dirty")) === "1";
  if (remote) {
    let drafts = readDrafts(data.user.id);
    const localText = local ? JSON.stringify(local) : "";
    if (
      local &&
      dirty &&
      !drafts.some((draft) => JSON.stringify(draft.state) === localText)
    ) {
      try {
        preserveDraft(data.user.id, savedRevision(), local);
      } catch {
        storageUnavailable = true;
      }
      drafts = readDrafts(data.user.id);
      if (!drafts.some((draft) => JSON.stringify(draft.state) === localText))
        drafts.push({
          key: "",
          serialized: "",
          state: local,
          revision: savedRevision(),
        });
    }
    const merged = { ...remote, notebooks: [...remote.notebooks] };
    const seen = new Set([JSON.stringify(remote)]);
    const incorporated = [];
    let keepOnlyLocalCopy = false;
    for (const draft of drafts) {
      const text = JSON.stringify(draft.state);
      if (seen.has(text)) {
        incorporated.push(draft);
        continue;
      }
      if (merged.notebooks.length + draft.state.notebooks.length > 100) {
        if (!draft.key) keepOnlyLocalCopy = true;
        continue;
      }
      const suffix = " (offline copy)";
      const candidate = {
        ...merged,
        notebooks: [
          ...merged.notebooks,
          ...draft.state.notebooks.map((book) => ({
            ...book,
            id: uid(),
            name: book.name.slice(0, 100 - suffix.length) + suffix,
          })),
        ],
      };
      if (
        !workspaceRequestFits(
          serializeWorkspaceRequest(candidate, revision, data.user.id),
        )
      ) {
        if (!draft.key) keepOnlyLocalCopy = true;
        continue;
      }
      merged.notebooks = candidate.notebooks;
      seen.add(text);
      incorporated.push(draft);
    }
    if (keepOnlyLocalCopy && local) {
      rememberWorkspace(data.user.id, local);
      emit(
        "The original local copy could not be preserved separately. Export a backup before recovering cloud work.",
      );
      return user!;
    }
    validateState(merged);
    rememberWorkspace(data.user.id, merged);
    const cachedWorkspace =
      storageReadable &&
      writeLocal(accountStorage(STORAGE_KEY), JSON.stringify(merged));
    let cachedDraft = true;
    if (merged.notebooks.length > remote.notebooks.length) {
      try {
        if (!storageReadable)
          throw Error("Browser storage reads are unavailable");
        writeDraft(data.user.id, revision, merged);
      } catch {
        storageUnavailable = true;
        cachedDraft = false;
      }
      if (storageReadable) writeLocal(accountStorage("dirty"), "1");
    } else if (storageReadable) removeLocal(accountStorage("dirty"));
    for (const draft of incorporated) {
      if (!draft.key || !cachedWorkspace || !cachedDraft) continue;
      try {
        discardDraft(draft);
      } catch {
        storageUnavailable = true;
      }
    }
  } else if (local) rememberWorkspace(data.user.id, local);
  if (storageReadable) writeLocal(revKey(), String(revision));
  return user!;
}
export function currentAccount() {
  return user?.id || "";
}
export function forgetAccount() {
  accountGeneration++;
  stopSave();
  pending = null;
  user = null;
  sessionOwner = "";
  sessionState = null;
  cloudAcknowledgedText = "";
  durableDraftText = "";
  removeLocal(IDENTITY);
  navigator.serviceWorker?.controller?.postMessage({ type: "SIGN_OUT" });
}
export function syncWorkspace(state: SavedState) {
  const owner = currentAccount();
  if (!owner) throw Error("Sign in before saving a draft.");
  rememberWorkspace(owner, state);
  try {
    writeDraft(owner, revision, state);
    durableDraftText = JSON.stringify(state);
  } catch {
    storageUnavailable = true;
  }
  pending = state;
  if (storageReadable) {
    writeLocal(revKey(), String(revision));
    writeLocal(accountStorage("dirty"), "1");
  }
  void drain();
}
async function drain() {
  if (activeSave || !pending || !user) return;
  if (!navigator.onLine) {
    emit(
      storageUnavailable
        ? "Kept in this tab · export a backup before closing"
        : "Saved offline · sync when connected",
    );
    return;
  }
  const state = pending;
  const acknowledgedText = JSON.stringify(state);
  const owner = user.id,
    generation = accountGeneration;
  const stillCurrent = () =>
    user?.id === owner && generation === accountGeneration;
  const body = serializeWorkspaceRequest(state, revision, owner);
  if (!workspaceRequestFits(body)) {
    emit(
      WORKSPACE_SIZE_ERROR +
        (storageUnavailable
          ? " · kept in this tab; export a backup"
          : " · saved on this device"),
    );
    return;
  }
  pending = null;
  const controller = new AbortController();
  const request: SaveRequest = {
    owner,
    generation,
    controller,
    timer: setTimeout(() => controller.abort(), REQUEST_TIMEOUT),
  };
  activeSave = request;
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body,
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
    cloudAcknowledgedText = acknowledgedText;
    try {
      acknowledgeDraft(owner, state, revision);
    } catch {
      storageUnavailable = true;
    }
    const storedText = readLocal(accountStorage(STORAGE_KEY));
    if (storedText === acknowledgedText) {
      writeLocal(revKey(), String(revision));
      if (!pending) removeLocal(accountStorage("dirty"));
    } else if (pending && storedText === JSON.stringify(pending)) {
      writeLocal(revKey(), String(revision));
    }
    emit(pending ? "Saving your latest changes…" : "Saved to your account");
  } catch (error) {
    if (!stillCurrent()) return;
    pending ??= state;
    emit(
      (controller.signal.aborted
        ? "Cloud save timed out"
        : (error as Error).message) +
        (storageUnavailable
          ? " · kept in this tab; export a backup"
          : " · saved on this device"),
    );
    return;
  } finally {
    clearTimeout(request.timer);
    if (activeSave === request) activeSave = null;
  }
  if (pending) void drain();
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void drain());
  window.addEventListener("focus", () => void drain());
}
