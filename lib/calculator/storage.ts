import { currentAccount, syncWorkspace } from "./sync";
import type { SavedState } from "./types";
export const STORAGE_KEY = "calculator.workspace.v1",
  BACKUP_KEY = "calculator.workspace.previous";
export function validateState(v: any): SavedState {
  const str = (x: any, n = 12000) => typeof x === "string" && x.length <= n;
  const settings = (x: any) =>
    x &&
    ["rad", "deg"].includes(x.angle) &&
    ["real", "complex"].includes(x.domain) &&
    Number.isInteger(x.precision) &&
    x.precision >= 5 &&
    x.precision <= 200 &&
    str(x.assumptions, 1000);
  const def = (d: any) =>
    d &&
    str(d.id, 100) &&
    str(d.name, 24) &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(d.name) &&
    str(d.expression) &&
    ["expression", "matrix", "dataset", "function", "object"].includes(
      d.kind,
    ) &&
    (!d.args || str(d.args, 100));
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.notebooks) ||
    !v.notebooks.length ||
    v.notebooks.length > 100 ||
    !settings(v.settings)
  )
    throw Error("Not a supported Calculator backup.");
  const ids = new Set();
  for (const b of v.notebooks) {
    if (
      !b ||
      !str(b.id, 100) ||
      ids.has(b.id) ||
      !str(b.name, 100) ||
      !Array.isArray(b.definitions) ||
      !Array.isArray(b.history) ||
      !Array.isArray(b.graphs) ||
      b.definitions.length > 500 ||
      b.history.length > 10000 ||
      b.graphs.length > 100 ||
      !Number.isInteger(b.revision)
    )
      throw Error("Invalid notebook data.");
    ids.add(b.id);
    if (
      !b.definitions.every(def) ||
      new Set(b.definitions.map((d: any) => d.name)).size !==
        b.definitions.length
    )
      throw Error("Invalid or duplicate definition.");
    for (const h of b.history)
      if (
        !str(h.id, 100) ||
        !str(h.input) ||
        !str(h.operation, 100) ||
        !h.params ||
        !Object.values(h.params).every((x) => str(x)) ||
        !settings(h.settings) ||
        !Array.isArray(h.definitions) ||
        !h.definitions.every(def) ||
        !h.result ||
        ![
          "exact",
          "numeric",
          "unresolved",
          "conditional",
          "divergent",
          "error",
        ].includes(h.result.status) ||
        !str(h.result.text, 100000) ||
        !str(h.result.latex, 50000) ||
        !Array.isArray(h.result.notes) ||
        !h.result.notes.every((x: any) => str(x, 5000))
      )
        throw Error("Invalid history.");
    for (const g of b.graphs)
      if (
        !str(g.id, 100) ||
        !str(g.expression, 4000) ||
        !str(g.second, 4000) ||
        !str(g.min, 100) ||
        !str(g.max, 100) ||
        ![
          "cartesian",
          "implicit",
          "inequality",
          "parametric",
          "polar",
          "surface",
          "field",
          "sequence",
          "data",
        ].includes(g.type) ||
        typeof g.visible !== "boolean" ||
        !/^#[0-9a-f]{6}$/i.test(g.color) ||
        (g.radians !== undefined && typeof g.radians !== "boolean") ||
        (g.type === "data" &&
          (!Array.isArray(g.points) ||
            g.points.length > 20000 ||
            g.points.some(
              (p: any) =>
                !Array.isArray(p) ||
                p.length !== 2 ||
                !p.every(Number.isFinite),
            )))
      )
        throw Error("Invalid graph.");
  }
  if (!ids.has(v.active)) throw Error("Invalid active notebook.");
  return v;
}
export function loadState(): { state: SavedState | null; warning: string } {
  try {
    const raw = localStorage.getItem(accountStorage(STORAGE_KEY));
    if (!raw) return { state: null, warning: "" };
    try {
      return { state: validateState(JSON.parse(raw)), warning: "" };
    } catch {
      try {
        const previous = localStorage.getItem(accountStorage(BACKUP_KEY));
        if (previous)
          return {
            state: validateState(JSON.parse(previous)),
            warning: "Recovered the previous valid save. Export a backup now.",
          };
      } catch {}
      return {
        state: null,
        warning:
          "Saved data could not be read. It is preserved; automatic saving is paused.",
      };
    }
  } catch {
    return {
      state: null,
      warning:
        "Browser storage is unavailable. Export a backup before closing.",
    };
  }
}
export function persist(state: SavedState) {
  const text = JSON.stringify(state),
    old = localStorage.getItem(accountStorage(STORAGE_KEY));
  if (text === old) {
    if (localStorage.getItem(accountStorage("dirty")) === "1")
      syncWorkspace(state);
    return;
  }
  if (old) {
    try {
      validateState(JSON.parse(old));
      localStorage.setItem(accountStorage(BACKUP_KEY), old);
    } catch {}
  }
  localStorage.setItem(accountStorage(STORAGE_KEY), text);
  syncWorkspace(state);
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function accountStorage(key: string) {
  const id = currentAccount();
  if (!id) throw Error("Sign in before opening saved work.");
  return key + ":" + id;
}
