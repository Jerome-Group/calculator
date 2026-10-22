import { validateState } from "./storage";
import { uid, type SavedState } from "./types";
import { MAX_WORKSPACE_REQUEST_BYTES } from "./workspace-request";

type SourceSnapshot = { revision: number; state: SavedState };
type ReplaySource = SourceSnapshot & {
  projections: SavedState["notebooks"][];
};
export type RecoverySource = SourceSnapshot & { notebookIds: string[] };
type RecoveryLineage = {
  owner: string;
  base: SavedState;
  sources: RecoverySource[];
};
export type Draft = SourceSnapshot & {
  key: string;
  serialized: string;
} & ({ kind: "source" } | { kind: "recovery"; recovery: RecoveryLineage });
function prefix(account: string) {
  if (!account) throw Error("Sign in before saving a draft.");
  return `calculator.pending.v1:${encodeURIComponent(account)}:`;
}
let writer = "";
let recovery: RecoveryLineage | null = null;
const OFFLINE_SUFFIX = " (offline copy)";
const MAX_RECOVERY_SOURCES = 100;
const MAX_RECOVERY_BYTES = MAX_WORKSPACE_REQUEST_BYTES * 2;
function checkRecoveryBounds(value: unknown, sources: unknown[]) {
  if (
    !sources.length ||
    sources.length > MAX_RECOVERY_SOURCES ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_RECOVERY_BYTES
  )
    throw Error("Recovery lineage exceeds the device save limit.");
}
export function beginDraftSession() {
  writer = uid();
  recovery = null;
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
  if (recovery) checkRecoveryBounds(recovery, recovery.sources);
  localStorage.setItem(
    writerKey(account),
    JSON.stringify({ revision, state, ...(recovery ? { recovery } : {}) }),
  );
}
export function writeRecoveryDraft(
  account: string,
  revision: number,
  state: SavedState,
  sources: RecoverySource[],
) {
  recovery = { owner: account, base: state, sources };
  writeDraft(account, revision, state);
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
function parseRecovery(value: unknown, account: string): RecoveryLineage {
  if (
    !value ||
    typeof value !== "object" ||
    !("owner" in value) ||
    value.owner !== account ||
    !("base" in value) ||
    !("sources" in value) ||
    !Array.isArray(value.sources)
  )
    throw Error("Invalid recovery lineage.");
  checkRecoveryBounds(value, value.sources);
  const base = validateState(value.base);
  const sources = value.sources.map((source: unknown): RecoverySource => {
    if (
      !source ||
      typeof source !== "object" ||
      !("revision" in source) ||
      typeof source.revision !== "number" ||
      !Number.isSafeInteger(source.revision) ||
      source.revision < 0 ||
      !("state" in source) ||
      !("notebookIds" in source) ||
      !Array.isArray(source.notebookIds) ||
      "recovery" in source
    )
      throw Error("Invalid recovery source.");
    const state = validateState(source.state);
    if (
      source.notebookIds.length !== state.notebooks.length ||
      new Set(source.notebookIds).size !== source.notebookIds.length
    )
      throw Error("Invalid recovery notebook correspondence.");
    const notebookIds = source.notebookIds.map((id: unknown, index: number) => {
      if (typeof id !== "string" || id.length > 100)
        throw Error("Invalid recovery notebook identity.");
      const notebook = state.notebooks[index];
      const generated = base.notebooks.find((book) => book.id === id);
      const original = { ...notebook, id };
      const copy = {
        ...original,
        name:
          notebook.name.slice(0, 100 - OFFLINE_SUFFIX.length) + OFFLINE_SUFFIX,
      };
      if (
        JSON.stringify(generated) !== JSON.stringify(original) &&
        JSON.stringify(generated) !== JSON.stringify(copy)
      )
        throw Error("Invalid recovery notebook correspondence.");
      return id;
    });
    return { revision: source.revision, state, notebookIds };
  });
  return { owner: account, base, sources };
}
export function draftSources(draft: Draft): ReplaySource[] {
  if (draft.kind === "source") return [{ ...draft, projections: [] }];
  const { base, sources } = draft.recovery;
  const changed = draft.state.notebooks.filter(
    (book) =>
      !base.notebooks.some(
        (original) => JSON.stringify(original) === JSON.stringify(book),
      ),
  );
  if (
    !changed.length &&
    JSON.stringify(base.settings) !== JSON.stringify(draft.state.settings)
  )
    changed.push(
      ...draft.state.notebooks.filter((book) => book.id === draft.state.active),
    );
  const edits = changed.map((book): ReplaySource => {
    const source = sources.find((input) => input.notebookIds.includes(book.id));
    const original =
      source?.state.notebooks[source.notebookIds.indexOf(book.id)];
    const generated = base.notebooks.find((input) => input.id === book.id);
    const notebook = original
      ? {
          ...book,
          id: original.id,
          name: book.name === generated?.name ? original.name : book.name,
        }
      : book;
    return {
      revision: draft.revision,
      state: { ...draft.state, active: notebook.id, notebooks: [notebook] },
      projections: [[book]],
    };
  });
  return [
    ...sources.map((source) => ({
      ...source,
      projections: [
        source.notebookIds.flatMap((id) =>
          base.notebooks.filter((book) => book.id === id),
        ),
      ],
    })),
    ...edits,
  ];
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
        const snapshot = {
          key,
          serialized,
          revision: value.revision,
          state: validateState(value.state),
        };
        try {
          if (value.recovery !== undefined) {
            drafts.push({
              ...snapshot,
              kind: "recovery",
              recovery: parseRecovery(value.recovery, account),
            });
            continue;
          }
        } catch {}
        drafts.push({ ...snapshot, kind: "source" });
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
  const lineage =
    draft.recovery === undefined
      ? null
      : parseRecovery(draft.recovery, account);
  const covered =
    !lineage ||
    lineage.sources.every(
      (source) =>
        JSON.stringify(source.state.settings) ===
          JSON.stringify(state.settings) &&
        source.notebookIds.every((id) => {
          const generated = lineage.base.notebooks.find(
            (book) => book.id === id,
          );
          return state.notebooks.some(
            (book) => JSON.stringify(book) === JSON.stringify(generated),
          );
        }),
    );
  if (covered && JSON.stringify(draft.state) === JSON.stringify(state)) {
    localStorage.removeItem(key);
    if (JSON.stringify(recovery) === JSON.stringify(lineage)) recovery = null;
  } else localStorage.setItem(key, JSON.stringify({ ...draft, revision }));
}

export async function recoveryNotebooks(
  account: string,
  state: SavedState,
  existing: SavedState["notebooks"],
  projections: SavedState["notebooks"][] = [],
): Promise<SavedState["notebooks"]> {
  const copies: SavedState["notebooks"] = [];
  for (const [index, notebook] of state.notebooks.entries()) {
    const unchanged = existing.find(
      (book) =>
        (book.id === notebook.id &&
          JSON.stringify(book) === JSON.stringify(notebook)) ||
        projections.some(
          (projection) =>
            JSON.stringify(book) === JSON.stringify(projection[index]),
        ),
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
      const copy = {
        ...notebook,
        id,
        name:
          notebook.name.slice(0, 100 - OFFLINE_SUFFIX.length) + OFFLINE_SUFFIX,
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
