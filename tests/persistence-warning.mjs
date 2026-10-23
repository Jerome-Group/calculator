import "./resolve-types.mjs";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  componentHarness,
  notebook,
  workspace,
  settings,
} from "./component-harness.mjs";
const investigations = await import("../lib/calculator/investigations.ts");
const { operations, categories } = await import("../lib/calculator/catalog.ts");

Object.defineProperty(globalThis, "crypto", { value: webcrypto });
globalThis.CustomEvent = class {
  constructor(type, options) {
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window = { addEventListener() {} };
const sync = await import("../lib/calculator/sync.ts");
const storage = await import("../lib/calculator/storage.ts");
const drafts = await import("../lib/calculator/drafts.ts");
const flush = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
function footer(tree) {
  return find(tree, (node) => node.type === "footer").props.children[1].props
    .children;
}
async function fixture(book = notebook("original")) {
  sync.forgetAccount();
  const values = new Map(),
    listeners = new Map(),
    timers = new Map(),
    cloud = { account: "a", state: workspace([book]) };
  let nextTimer = 0,
    now = 0,
    captures = 0;
  const device = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (i) => [...values.keys()][i] ?? null,
    get length() {
      return values.size;
    },
  };
  const exports = [];
  const browser = {
    addEventListener(type, callback) {
      const handlers = listeners.get(type) || new Set();
      handlers.add(callback);
      listeners.set(type, handlers);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners.get(event.type) || []) callback(event);
    },
  };
  globalThis.localStorage = device;
  globalThis.sessionStorage = device;
  globalThis.window = browser;
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, serviceWorker: {} },
    configurable: true,
  });
  globalThis.fetch = async () =>
    Response.json({
      user: { id: cloud.account, name: cloud.account },
      state: cloud.state,
      revision: 1,
    });
  await sync.initializeAccount();
  navigator.onLine = false;
  const h = componentHarness(
    "Calculator",
    ["change", "runInvestigation", "stopCalculation"],
    {
      state: cloud.state,
      status: "Ready",
      syncStatus: "Saved to your account",
    },
    {
      "@/lib/calculator/storage": storage,
      "@/lib/calculator/sync": {
        ...sync,
        captureAccountSession() {
          captures++;
          return sync.captureAccountSession();
        },
      },
      "@/lib/calculator/investigations": investigations,
      "@/lib/calculator/catalog": { operations, categories },
    },
    {
      effects: "all",
      window: browser,
      document: { documentElement: { classList: { toggle() {} } } },
      localStorage: device,
      setTimeout(callback, delay) {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  h.render();
  h.render();
  const gate = componentHarness(
    "CalculatorGate",
    [],
    { ready: true, name: "a" },
    {
      "@/lib/calculator/sync": {
        ...sync,
        initializeAccount: async () => ({ id: "a", name: "a" }),
      },
      "@/lib/calculator/storage": {
        ...storage,
        download: (name, body) => exports.push({ name, body }),
      },
      "@/components/ui/dialog": Object.fromEntries(
        [
          "Dialog",
          "DialogContent",
          "DialogHeader",
          "DialogTitle",
          "DialogDescription",
          "DialogFooter",
        ].map((name) => [name, name]),
      ),
    },
    { effects: "all", window: browser },
  );
  gate.render();
  const tick = (duration) => {
    now += duration;
    for (const [id, timer] of [...timers])
      if (timer.at <= now && timers.delete(id)) timer.callback();
  };
  const edit = (name) => {
    h.render().actions.change((state) => ({
      ...state,
      notebooks: state.notebooks.map((b) => ({ ...b, name })),
    }));
    return h.render();
  };
  return {
    h,
    gate,
    exports,
    cloud,
    values,
    device,
    listeners,
    tick,
    edit,
    captures: () => captures,
    exit: () => browser.dispatchEvent({ type: "pagehide" }),
    acknowledge: () =>
      browser.dispatchEvent(
        new CustomEvent("calculator-sync", { detail: "Saved to your account" }),
      ),
    primary: () =>
      JSON.parse(values.get(storage.accountStorage(storage.STORAGE_KEY))),
  };
}
function click(gate, label, event) {
  const control = find(
    gate.render().tree,
    (node) => node.props?.children === label,
  );
  assert(control, `Missing Gate control ${label}`);
  control.props.onClick(event);
}
function assertDepartureBlocked(f, expectedName) {
  let prevented = false;
  click(f.gate, "Sign out", {
    preventDefault() {
      prevented = true;
    },
  });
  assert(prevented, "Immediate Sign out must guard the latest committed edit");
  assert.equal(
    find(f.gate.render().tree, (node) => node.type === "Dialog").props.open,
    true,
  );
  click(f.gate, "Export backup");
  assert.equal(
    JSON.parse(f.exports.at(-1).body).notebooks[0].name,
    expectedName,
  );
  const event = {
    preventDefault() {
      this.prevented = true;
    },
  };
  for (const listener of f.listeners.get("beforeunload") || []) listener(event);
  assert.equal(event.prevented, true);
  assert.equal(event.returnValue, "");
}
const results = [];
async function check(name, action) {
  try {
    await action();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.stack });
  } finally {
    sync.forgetAccount();
  }
}
await check(
  "actual Gate guards and exports the committed edit before the debounce, then respects explicit sign-out",
  async () => {
    const f = await fixture();
    f.tick(200);
    const durable = [...f.values];
    f.edit("edit before debounce");
    assert.deepEqual([...f.values], durable, "Commit must remain memory-only");
    assertDepartureBlocked(f, "edit before debounce");
    assert.equal(f.primary().notebooks[0].name, "original");
    click(f.gate, "Keep working");
    assert.equal(sync.currentAccount(), "a");
    assert.equal(
      find(f.gate.render().tree, (node) => node.type === "Dialog").props.open,
      false,
    );
    click(f.gate, "Sign out", { preventDefault() {} });
    click(f.gate, "Sign out anyway");
    assert.equal(sync.sessionWorkspace(), null);
    const afterSignout = [...f.values];
    f.h.render();
    f.exit();
    f.tick(200);
    assert.equal(sync.sessionWorkspace(), null);
    assert.deepEqual([...f.values], afterSignout);
  },
);
await check(
  "pending committed edits hide an older account acknowledgement before 200 ms",
  async () => {
    const f = await fixture();
    f.tick(200);
    f.h.render();
    const edited = f.edit("latest committed edit");
    assert.equal(footer(edited.tree), "Saving your latest changes…");
    f.acknowledge();
    assert.equal(footer(f.h.render().tree), "Saving your latest changes…");
    assert.equal(f.primary().notebooks[0].name, "original");
    f.tick(199);
    assert.equal(f.primary().notebooks[0].name, "original");
    f.exit();
    assert.equal(f.primary().notebooks[0].name, "latest committed edit");
    assert.equal(
      drafts.readDrafts("a")[0].state.notebooks[0].name,
      "latest committed edit",
    );
    assert.equal(
      storage.loadState().state.notebooks[0].name,
      "latest committed edit",
    );
    assert.equal(f.captures(), 1, "Mount must capture one account generation");
  },
);
await check(
  "pagehide saves a partial investigation and its latest observation before the timer",
  async () => {
    const book = investigations.createInvestigationNotebook({
      seed: { kind: "lab", labId: "singular-matrix" },
      workspaceSettings: settings,
    });
    const f = await fixture(book);
    f.tick(200);
    const running = f.h
      .render()
      .actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    f.h.requests[0].resolve({
      status: "exact",
      text: "1",
      latex: "1",
      notes: [],
    });
    await flush();
    f.h.render().actions.stopCalculation();
    f.h.requests[1].reject(Error("Stopped"));
    await running;
    const rendered = f.h.render();
    find(
      rendered.tree,
      (node) => typeof node.props?.onObservation === "function",
    ).props.onObservation(
      f.h.state.get("state").notebooks[0].investigation.runs[0].id,
      "A partial run still teaches me something.",
    );
    f.h.render();
    f.exit();
    const saved = storage.loadState().state.notebooks[0];
    assert.equal(saved.history.length, 1);
    assert.equal(
      saved.investigation.runs[0].observation,
      "A partial run still teaches me something.",
    );
    assert.equal(
      drafts.readDrafts("a")[0].state.notebooks[0].history.length,
      1,
    );
  },
);
await check("pagehide only saves a committed workspace snapshot", async () => {
  const f = await fixture();
  f.tick(200);
  f.h.deferWorkspaceUpdates();
  f.h.render().actions.change((state) => ({
    ...state,
    notebooks: state.notebooks.map((b) => ({ ...b, name: "not committed" })),
  }));
  f.exit();
  assert.equal(f.primary().notebooks[0].name, "original");
  assert.equal(sync.sessionWorkspace().notebooks[0].name, "original");
});
await check(
  "an older persistence flush cannot replace the latest committed Gate export",
  async () => {
    const f = await fixture();
    f.tick(200);
    f.edit("older flush");
    const older = f.h.state.get("state");
    f.edit("latest committed");
    const latest = f.h.state.get("state");
    storage.persist(older);
    assert.equal(sync.sessionWorkspace(), latest);
    assert.equal(f.primary().notebooks[0].name, "older flush");
    assertDepartureBlocked(f, "latest committed");
  },
);
await check(
  "committed edits remain guarded and exportable when device reads and writes are denied",
  async () => {
    const f = await fixture();
    let writes = 0;
    f.device.getItem = () => {
      throw Error("Device storage denied");
    };
    f.device.setItem = () => {
      writes++;
      throw Error("Device storage denied");
    };
    f.edit("memory-only edit");
    assert.equal(writes, 0, "Commit must not attempt a device write");
    assert.equal(sync.sessionWorkspace(), f.h.state.get("state"));
    assertDepartureBlocked(f, "memory-only edit");
    assert.equal(sync.currentAccount(), "a");
  },
);
for (const transition of [
  "same account renewal",
  "another account",
  "sign out",
  "unmount",
]) {
  await check(`obsolete mount cannot flush after ${transition}`, async () => {
    const f = await fixture();
    f.tick(200);
    f.edit("must stay private to the old mount");
    const retainedExit = [...(f.listeners.get("pagehide") || [])];
    if (transition === "unmount") f.h.unmount();
    else if (transition === "sign out") sync.forgetAccount();
    else {
      if (transition === "another account") f.cloud.account = "b";
      navigator.onLine = true;
      await sync.initializeAccount();
      navigator.onLine = false;
    }
    const remembered = sync.sessionWorkspace();
    f.h.render();
    assert.equal(sync.sessionWorkspace(), remembered);
    const before = [...f.values];
    f.exit();
    for (const callback of retainedExit) callback();
    f.tick(200);
    assert.deepEqual([...f.values], before);
    assert.equal(f.captures(), 1);
  });
}
await check(
  "paused unreadable bytes survive pagehide and timer cleanup",
  async () => {
    const f = await fixture();
    const key = storage.accountStorage(storage.STORAGE_KEY);
    f.values.set(key, "{broken");
    f.h.state.set("paused", true);
    f.edit("do not overwrite corrupt bytes");
    const before = [...f.values];
    f.exit();
    f.tick(200);
    assert.deepEqual([...f.values], before);
    assertDepartureBlocked(f, "do not overwrite corrupt bytes");
    assert.deepEqual([...f.values], before);
  },
);
await check(
  "quota failure reports device failure, retains exportable state and clears on successful retry",
  async () => {
    const f = await fixture();
    f.tick(200);
    f.edit("still exportable");
    const setItem = f.device.setItem;
    f.device.setItem = () => {
      throw Error("Quota exceeded");
    };
    f.exit();
    assert.equal(
      footer(f.h.render().tree),
      "Device save failed · export a backup",
    );
    assert.match(f.h.state.get("warning"), /latest changes could not be saved/);
    assert.equal(sync.sessionWorkspace().notebooks[0].name, "still exportable");
    assert.equal(f.primary().notebooks[0].name, "original");
    f.device.setItem = setItem;
    f.tick(200);
    f.h.render();
    assert.equal(f.h.state.get("warning"), "");
    assert.equal(f.primary().notebooks[0].name, "still exportable");
  },
);
await check(
  "corrupt-primary failure preserves bytes, draft and recovery warning",
  async () => {
    const f = await fixture();
    f.tick(200);
    f.values.set(storage.accountStorage(storage.STORAGE_KEY), "{broken");
    f.h.state.set(
      "warning",
      "Recovered the previous valid save. Export a backup now.",
    );
    f.edit("current work");
    f.exit();
    assert.equal(
      f.values.get(storage.accountStorage(storage.STORAGE_KEY)),
      "{broken",
    );
    assert.equal(drafts.readDrafts("a").length, 1);
    assert.equal(
      drafts.readDrafts("a")[0].state.notebooks[0].name,
      "current work",
    );
    assert.equal(
      footer(f.h.render().tree),
      "Device save failed · export a backup",
    );
    f.values.set(
      storage.accountStorage(storage.STORAGE_KEY),
      JSON.stringify(f.h.state.get("state")),
    );
    f.h.state.set(
      "warning",
      "Recovered the previous valid save. Export a backup now.",
    );
    f.tick(200);
    assert.equal(
      f.h.state.get("warning"),
      "Recovered the previous valid save. Export a backup now.",
    );
  },
);
await check(
  "identical clean persistence does not leave Saving without a cloud acknowledgement",
  async () => {
    const f = await fixture();
    f.tick(200);
    f.h.render().actions.change((state) => structuredClone(state));
    assert.equal(footer(f.h.render().tree), "Saving your latest changes…");
    f.tick(200);
    assert.equal(footer(f.h.render().tree), "Saved to your account");
  },
);
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
