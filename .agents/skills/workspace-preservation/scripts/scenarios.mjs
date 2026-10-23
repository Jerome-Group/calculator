import { pathToFileURL } from "node:url";
import path from "node:path";
import { webcrypto } from "node:crypto";

const root = process.env.WORKSPACE_SOURCE_ROOT || process.cwd();
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
await load("tests/resolve-types.mjs");
const { componentHarness, notebook, workspace } = await load(
  "tests/component-harness.mjs",
);
Object.defineProperty(globalThis, "crypto", { value: webcrypto });
globalThis.CustomEvent = class {
  constructor(type, options) {
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window = { addEventListener() {} };
const sync = await load("lib/calculator/sync.ts");
const storage = await load("lib/calculator/storage.ts");
const drafts = await load("lib/calculator/drafts.ts");
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
async function fixture() {
  sync.forgetAccount();
  const values = new Map(),
    listeners = new Map(),
    timers = new Map(),
    requests = [],
    messages = [],
    exports = [];
  const cloud = { account: "a", state: workspace([notebook("original")]) };
  let clock = 0,
    nextTimer = 0;
  const device = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (i) => [...values.keys()][i] ?? null,
    get length() {
      return values.size;
    },
  };
  const browser = {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    dispatchEvent(event) {
      messages.push({ type: event.type, detail: event.detail });
      for (const cb of listeners.get(event.type) || []) cb(event);
    },
  };
  globalThis.localStorage = device;
  globalThis.sessionStorage = device;
  globalThis.window = browser;
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true, serviceWorker: {} },
    configurable: true,
  });
  globalThis.fetch = async (_url, options) => {
    if (!options?.method)
      return Response.json({
        user: { id: cloud.account, name: cloud.account },
        state: cloud.state,
        revision: 1,
      });
    return new Promise((resolve) =>
      requests.push({ body: JSON.parse(options.body), resolve }),
    );
  };
  await sync.initializeAccount();
  navigator.onLine = false;
  const environment = {
    effects: "all",
    window: browser,
    document: { documentElement: { classList: { toggle() {} } } },
    localStorage: device,
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: clock + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const modules = {
    "@/lib/calculator/storage": storage,
    "@/lib/calculator/sync": sync,
  };
  const h = componentHarness(
    "Calculator",
    ["change"],
    { state: cloud.state, status: "Ready" },
    modules,
    environment,
  );
  h.render();
  h.render();
  const gate = componentHarness(
    "CalculatorGate",
    [],
    {},
    {
      ...modules,
      "@/lib/calculator/storage": {
        ...storage,
        download: (name, body) => exports.push({ name, body }),
      },
      "@/lib/calculator/sync": {
        ...sync,
        initializeAccount: async () => ({ id: "a", name: "a" }),
      },
    },
    environment,
  );
  gate.render();
  await flush();
  gate.render();
  const tick = () => {
    clock += 200;
    for (const [id, timer] of [...timers])
      if (timer.at <= clock && timers.delete(id)) timer.callback();
  };
  tick();
  h.render();
  const edit = (name = "committed-1") => {
    h.render().actions.change((state) => ({
      ...state,
      notebooks: state.notebooks.map((b) => ({ ...b, name })),
    }));
    h.render();
  };
  return {
    h,
    gate,
    values,
    listeners,
    cloud,
    requests,
    messages,
    exports,
    edit,
    tick,
    exit: () => browser.dispatchEvent({ type: "pagehide" }),
    primary: (owner = "a") =>
      JSON.parse(values.get(storage.STORAGE_KEY + ":" + owner) || "null"),
  };
}
function permutations(events) {
  if (!events.length) return [[]];
  return events.flatMap((event, i) =>
    permutations(events.filter((_, j) => j !== i)).map((tail) => [
      event,
      ...tail,
    ]),
  );
}
const results = [];
async function check(property, schedule, action) {
  try {
    results.push({ property, schedule, ...(await action()) });
  } catch (error) {
    results.push({ property, schedule, passed: false, error: error.stack });
  } finally {
    sync.forgetAccount();
  }
}
const group = process.argv[2] || "all";
if (["all", "stage"].includes(group))
  await check(
    "latest-committed-guard-and-export",
    ["commit 1", "commit 2", "signout before timer", "export backup"],
    async () => {
      const f = await fixture();
      f.edit("committed-1");
      f.edit("committed-2");
      let blocked = false;
      find(
        f.gate.render().tree,
        (node) => node.props?.children === "Sign out",
      ).props.onClick({
        preventDefault() {
          blocked = true;
        },
      });
      find(
        f.gate.render().tree,
        (node) => node.props?.children === "Export backup",
      ).props.onClick();
      const exported = f.exports.at(-1);
      const name = exported
        ? JSON.parse(exported.body).notebooks[0].name
        : null;
      return {
        passed:
          blocked && sync.currentAccount() === "a" && name === "committed-2",
        blocked,
        account: sync.currentAccount(),
        exported: name,
        session: sync.sessionWorkspace()?.notebooks[0].name || null,
        primary: f.primary()?.notebooks[0].name,
      };
    },
  );
if (["all", "committed"].includes(group)) {
  for (const extra of [[], ["timer"], ["pagehide"], ["timer", "pagehide"]]) {
    for (const schedule of permutations(["signout", ...extra])) {
      await check(
        "committed-preserved",
        ["edit+React commit", ...schedule],
        async () => {
          const f = await fixture();
          f.edit();
          let blocked = false;
          for (const event of schedule) {
            if (event === "timer") f.tick();
            else if (event === "pagehide") f.exit();
            else
              find(
                f.gate.render().tree,
                (node) => node.props?.children === "Sign out",
              ).props.onClick({
                preventDefault() {
                  blocked = true;
                },
              });
          }
          const primary = f.primary()?.notebooks[0].name;
          const retained = drafts
            .readDrafts("a")
            .some((d) => d.state.notebooks[0].name === "committed-1");
          const session = sync.sessionWorkspace()?.notebooks[0].name;
          return {
            passed:
              primary === "committed-1" ||
              retained ||
              (blocked && session === "committed-1"),
            blocked,
            primary,
            retained,
            session: session || null,
            account: sync.currentAccount(),
          };
        },
      );
    }
  }
}
if (["all", "pagehide"].includes(group))
  await check(
    "committed-preserved",
    ["edit+React commit", "pagehide"],
    async () => {
      const f = await fixture();
      f.edit();
      f.exit();
      return {
        passed: f.primary()?.notebooks[0].name === "committed-1",
        primary: f.primary()?.notebooks[0].name,
      };
    },
  );
if (["all", "epoch"].includes(group)) {
  for (const transition of ["renew a", "open b", "forget"])
    await check(
      "stale-mount-inert",
      ["edit+React commit", transition, "retained pagehide", "timer"],
      async () => {
        const f = await fixture();
        f.edit();
        const retained = [...f.listeners.get("pagehide")];
        if (transition === "forget") sync.forgetAccount();
        else {
          if (transition === "open b") {
            f.cloud.account = "b";
            f.cloud.state = workspace([notebook("remote-b")]);
          }
          navigator.onLine = true;
          await sync.initializeAccount();
          navigator.onLine = false;
        }
        const before = JSON.stringify([...f.values]);
        for (const callback of retained) callback();
        f.tick();
        return {
          passed: JSON.stringify([...f.values]) === before,
          account: sync.currentAccount(),
          primary: f.primary(sync.currentAccount() || "a")?.notebooks[0].name,
        };
      },
    );
}
if (["all", "ack"].includes(group))
  await check(
    "acknowledgement-matches",
    ["persist 1", "persist 2", "resolve PUT 1"],
    async () => {
      const f = await fixture();
      navigator.onLine = true;
      f.edit("committed-1");
      f.exit();
      f.edit("committed-2");
      f.exit();
      f.requests[0].resolve(Response.json({ revision: 2 }));
      await flush();
      const names = drafts
        .readDrafts("a")
        .map((d) => d.state.notebooks[0].name);
      return {
        passed: names.includes("committed-2"),
        draftNames: names,
        firstRequest: f.requests[0].body.state.notebooks[0].name,
      };
    },
  );
if (["all", "response"].includes(group))
  await check(
    "stale-response-inert",
    ["persist 1", "open b", "resolve old PUT 1"],
    async () => {
      const f = await fixture();
      navigator.onLine = true;
      f.edit();
      f.exit();
      f.cloud.account = "b";
      f.cloud.state = workspace([notebook("remote-b")]);
      await sync.initializeAccount();
      const before = JSON.stringify([...f.values]);
      const messagesBefore = f.messages.length;
      f.requests[0].resolve(Response.json({ revision: 2 }));
      await flush();
      return {
        passed:
          JSON.stringify([...f.values]) === before &&
          f.messages.length === messagesBefore,
        emittedMessages: f.messages.slice(messagesBefore),
        account: sync.currentAccount(),
        session: sync.sessionWorkspace()?.notebooks[0].name,
      };
    },
  );
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
