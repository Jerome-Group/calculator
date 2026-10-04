import { validateState } from "./storage";
import { uid, type SavedState } from "./types";

export type Draft = {
  key: string;
  serialized: string;
  state: SavedState;
  revision: number;
};
function prefix(account: string) {
  if (!account) throw Error("Sign in before saving a draft.");
  return `calculator.pending.v1:${encodeURIComponent(account)}:`;
}
let writer = "";
export function beginDraftSession() {
  writer = uid();
}
function writerKey(account: string) {
  if (!writer) beginDraftSession();
  return prefix(account) + writer;
}
export function writeDraft(
  account: string,
  revision: number,
  state: SavedState,
) {
  localStorage.setItem(writerKey(account), JSON.stringify({ revision, state }));
}
export function preserveDraft(
  account: string,
  revision: number,
  state: SavedState,
) {
  localStorage.setItem(
    prefix(account) + uid(),
    JSON.stringify({ revision, state }),
  );
}
export function readDrafts(account: string): Draft[] {
  const drafts: Draft[] = [];
  if (!account) return drafts;
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix(account))) continue;
      const serialized = localStorage.getItem(key);
      if (!serialized) continue;
      try {
        const value = JSON.parse(serialized);
        if (!Number.isSafeInteger(value.revision) || value.revision < 0)
          continue;
        drafts.push({
          key,
          serialized,
          revision: value.revision,
          state: validateState(value.state),
        });
      } catch {
        // Leave malformed recovery data untouched for manual export.
      }
    }
  } catch {
    // Storage can become unavailable while the in-memory workspace is still usable.
  }
  return drafts;
}
export function discardDraft(draft: Draft) {
  if (localStorage.getItem(draft.key) === draft.serialized)
    localStorage.removeItem(draft.key);
}
export function acknowledgeDraft(
  account: string,
  state: SavedState,
  revision: number,
) {
  const key = writerKey(account),
    saved = localStorage.getItem(key);
  if (!saved) return;
  const draft = JSON.parse(saved);
  if (JSON.stringify(draft.state) === JSON.stringify(state))
    localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify({ ...draft, revision }));
}

export async function recoveryNotebooks(
  account: string,
  state: SavedState,
  existing: SavedState["notebooks"],
): Promise<SavedState["notebooks"]> {
  const copies: SavedState["notebooks"] = [];
  for (const notebook of state.notebooks) {
    const unchanged = existing.find(
      (book) =>
        book.id === notebook.id &&
        JSON.stringify(book) === JSON.stringify(notebook),
    );
    if (unchanged) {
      copies.push(unchanged);
      continue;
    }
    const snapshot = JSON.stringify({
      account,
      settings: state.settings,
      notebook,
    });
    let conflict = "";
    for (;;) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(snapshot + conflict),
      );
      const id =
        "recovered-" +
        Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      const suffix = " (offline copy)";
      const copy = {
        ...notebook,
        id,
        name: notebook.name.slice(0, 100 - suffix.length) + suffix,
      };
      const occupied = [...existing, ...copies].find((book) => book.id === id);
      if (!occupied || JSON.stringify(occupied) === JSON.stringify(copy)) {
        copies.push(copy);
        break;
      }
      conflict += JSON.stringify(occupied);
    }
  }
  return copies;
}
