import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (name) => fs.readFileSync(path.join(root, name), "utf8");
const source = (name) => stripTypeScriptTypes(readSource(name));
const flush = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};
const initial = (name = "initial") => ({
  version: 1,
  active: "b",
  settings: { angle: "rad", domain: "real", precision: 30, assumptions: "" },
  notebooks: [
    { id: "b", name, definitions: [], history: [], graphs: [], revision: 0 },
  ],
});
const largeWorkspace = (name, count = 16) => {
  const state = initial(name);
  state.notebooks[0].history = Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    operation: "evaluate",
    input: "1",
    mode: "text",
    params: {},
    settings: state.settings,
    definitions: [],
    revision: 0,
    time: 1,
    result: { status: "exact", text: "X".repeat(80000), latex: "1", notes: [] },
  }));
  return state;
};
const storage = (values) => ({
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  key: (index) => [...values.keys()][index] ?? null,
  get length() {
    return values.size;
  },
});
async function tab(name, values, server, rewriteStorageWarnings = false) {
  const listeners = {},
    messages = [];
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    Response,
    Request,
    URL,
    AbortController,
    TextEncoder,
    setTimeout: server.clock
      ? server.clock.setTimeout
      : (...args) => {
          const timer = setTimeout(...args);
          timer.unref();
          return timer;
        },
    clearTimeout: server.clock ? server.clock.clearTimeout : clearTimeout,
    queueMicrotask,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    window: {
      dispatchEvent(event) {
        messages.push(event.detail);
      },
      addEventListener(type, callback) {
        listeners[type] = callback;
      },
    },
    navigator: { onLine: true, serviceWorker: {} },
    localStorage: storage(values),
    sessionStorage: storage(new Map()),
    fetch: async (_url, options) => {
      if (!options?.method && server.get) return await server.get(options);
      if (!options?.method)
        return Response.json(
          server.status === 200
            ? {
                user: { id: server.account, name: server.account },
                state: server.state,
                revision: server.revision,
              }
            : {
                error: "Unavailable",
                ...(server.status === 503
                  ? { user: { id: server.account, name: server.account } }
                  : {}),
              },
          { status: server.status },
        );
      return await new Promise((resolve, reject) => {
        const signal = options.signal;
        const aborted = () => {
          const error = Error("The save was aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted && !server.ignoreAbort) {
          aborted();
          return;
        }
        if (!server.ignoreAbort)
          signal?.addEventListener("abort", aborted, { once: true });
        server.calls.push({
          tab: name,
          body: JSON.parse(options.body),
          resolve: (response) => {
            signal?.removeEventListener("abort", aborted);
            resolve(response);
          },
          signal,
        });
      });
    },
  });
  const modules = {};
  for (const file of [
    "sync",
    "storage",
    "types",
    "drafts",
    "result-validation",
    "workspace-request",
  ])
    modules[file] = new vm.SourceTextModule(
      file === "storage" && rewriteStorageWarnings
        ? source(`lib/calculator/${file}.ts`)
            .replace(
              "Browser storage is unavailable. Export a backup before closing.",
              "Device reads failed. Keep this session open.",
            )
            .replace(
              "Saved data could not be read. It is preserved; automatic saving is paused.",
              "",
            )
        : source(`lib/calculator/${file}.ts`),
      { context, identifier: file },
    );
  await modules.sync.link((specifier) => modules[specifier.replace("./", "")]);
  await modules.sync.evaluate();
  return {
    sync: modules.sync.namespace,
    storage: modules.storage.namespace,
    drafts: modules.drafts.namespace,
    trigger: (type) => listeners[type]?.(),
    setOnline: (value) => {
      context.navigator.onLine = value;
    },
    messages,
  };
}
const server = () => ({
  account: "a",
  status: 200,
  state: initial(),
  revision: 1,
  calls: [],
});
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

await check(
  "two-tab acknowledgement preserves the other tab's dirty snapshot and base revision",
  async () => {
    const values = new Map(),
      cloud = server();
    const a = await tab("A", values, cloud),
      b = await tab("B", values, cloud);
    await a.sync.initializeAccount();
    await b.sync.initializeAccount();
    a.storage.persist(initial("Tab A"));
    b.storage.persist(initial("Tab B"));
    assert.equal(cloud.calls.length, 2);
    cloud.state = initial("Tab A");
    cloud.revision = 2;
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    cloud.calls[1].resolve(
      Response.json({ error: "Conflict" }, { status: 409 }),
    );
    await flush();
    assert.equal(
      values.get("dirty:a"),
      "1",
      "Other tab's dirty flag was cleared",
    );
    assert.equal(
      values.get("revision:a"),
      "1",
      "Other tab's base revision was advanced",
    );
    await b.sync.initializeAccount();
    const saved = JSON.parse(values.get("calculator.workspace.v1:a"));
    assert(
      saved.notebooks.some((book) => book.name.includes("Tab B")),
      "Reload discarded Tab B",
    );
  },
);

await check(
  "same-tab queued save uses the acknowledged new revision",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("first"));
    a.storage.persist(initial("second"));
    assert.equal(cloud.calls.length, 1);
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(cloud.calls.length, 2);
    assert.equal(cloud.calls[1].body.revision, 2);
    assert.equal(values.get("dirty:a"), "1");
    cloud.calls[1].resolve(Response.json({ revision: 3 }));
    await flush();
    assert.equal(values.get("dirty:a"), undefined);
  },
);

await check(
  "stale account completion cannot release the new owner's active save",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    cloud.ignoreAbort = true;
    a.storage.persist(initial("account A"));
    a.sync.forgetAccount();
    cloud.account = "b";
    await a.sync.initializeAccount();
    a.storage.persist(initial("account B"));
    assert.equal(cloud.calls.length, 2);
    assert.equal(cloud.calls[0].signal.aborted, true);
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(cloud.calls.length, 2, "New account's save remained stuck");
    assert.equal(cloud.calls[1].body.account, "b");
    assert.equal(
      values.get("revision:a"),
      "1",
      "Stale save modified account A metadata",
    );
    a.storage.persist(initial("account B queued"));
    assert.equal(
      cloud.calls.length,
      2,
      "Stale A completion released B's active request",
    );
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(cloud.calls.length, 3);
    assert.equal(cloud.calls[2].body.revision, 2);
    cloud.calls[2].resolve(Response.json({ revision: 3 }));
    await flush();
  },
);

await check("cached workspace opens during a cloud 503", async () => {
  const values = new Map(),
    cloud = server(),
    a = await tab("A", values, cloud);
  await a.sync.initializeAccount();
  cloud.status = 503;
  assert.equal((await a.sync.initializeAccount()).id, "a");
});
await check("cached identity never bypasses a 401", async () => {
  const values = new Map(),
    cloud = server(),
    a = await tab("A", values, cloud);
  await a.sync.initializeAccount();
  cloud.status = 401;
  await assert.rejects(a.sync.initializeAccount());
});
await check(
  "cloud outage under another account never exposes the cached previous account",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    cloud.account = "b";
    cloud.status = 503;
    try {
      assert.notEqual((await a.sync.initializeAccount()).id, "a");
    } catch (error) {
      if (error?.code === "ERR_ASSERTION") throw error;
    }
  },
);

await check(
  "SIGN_OUT during PREPARE cannot restore the cached shell or ready marker",
  async () => {
    const listeners = {},
      entries = new Map();
    let releaseShell, notifyShell;
    const shellReached = new Promise((resolve) => (notifyShell = resolve)),
      shellRelease = new Promise((resolve) => (releaseShell = resolve));
    const cache = {
      match: async (key) =>
        entries.get(typeof key === "string" ? key : key.url)?.clone(),
      delete: async (key) => entries.delete(key),
      put: async (key, response) => {
        if (key === "/__calculator_shell__") {
          notifyShell();
          await shellRelease;
        }
        entries.set(key, response.clone());
      },
    };
    const context = vm.createContext({
      console,
      Response,
      URL,
      crypto: webcrypto,
      Uint8Array,
      AbortController,
      TextEncoder,
      fetch: async (url) =>
        url === "/offline-manifest.json"
          ? Response.json({
              version: "__BUILD_VERSION__",
              assets: [],
              bytes: 0,
            })
          : new Response("<html>Signed-in app</html>"),
      caches: {
        open: async () => cache,
        keys: async () => ["calculator-core-__BUILD_VERSION__"],
        delete: async () => true,
      },
      self: {
        location: { origin: "https://example.test" },
        clients: { matchAll: async () => [], claim: async () => {} },
        skipWaiting: async () => {},
        addEventListener: (type, fn) => (listeners[type] = fn),
      },
    });
    vm.runInContext(readSource("public/sw.js"), context);
    let preparing, signout;
    listeners.message({
      data: { type: "PREPARE" },
      waitUntil: (promise) => (preparing = promise),
    });
    await shellReached;
    listeners.message({
      data: { type: "SIGN_OUT" },
      waitUntil: (promise) => (signout = promise),
    });
    await signout;
    releaseShell();
    await preparing;
    assert(
      !entries.has("/__calculator_shell__"),
      "Sign-out shell was restored",
    );
    assert(
      !entries.has("/__calculator_offline_ready__"),
      "Sign-out ready marker was restored",
    );
  },
);

await check(
  "account discovered through initialization never submits previous-account pending data",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("A first"));
    a.storage.persist(initial("A queued private draft"));
    cloud.account = "b";
    cloud.state = initial("B workspace");
    await a.sync.initializeAccount();
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(a.sync.currentAccount(), "b");
    assert(
      !cloud.calls.some(
        (call) =>
          call.body.account === "b" &&
          call.body.state.notebooks.some((book) =>
            book.name.includes("A queued"),
          ),
      ),
      "A's private pending data was submitted under B",
    );
  },
);

await check(
  "initialization response after sign-out cannot restore identity",
  async () => {
    const values = new Map(),
      cloud = server();
    let resolveGet;
    cloud.get = () => new Promise((resolve) => (resolveGet = resolve));
    const a = await tab("A", values, cloud),
      initializing = a.sync.initializeAccount();
    a.sync.forgetAccount();
    resolveGet(
      Response.json({
        user: { id: "a", name: "A" },
        state: initial(),
        revision: 1,
      }),
    );
    await assert.rejects(initializing, /Account changed/);
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(values.get("calculator.signed-in-account"), undefined);
  },
);

await check(
  "SIGN_OUT during READY cache write cannot restore readiness",
  async () => {
    const listeners = {},
      entries = new Map(),
      reports = [];
    let releaseReady, notifyReady;
    const readyReached = new Promise((resolve) => (notifyReady = resolve)),
      readyRelease = new Promise((resolve) => (releaseReady = resolve));
    const cache = {
      match: async (key) =>
        entries.get(typeof key === "string" ? key : key.url)?.clone(),
      delete: async (key) => entries.delete(key),
      put: async (key, response) => {
        if (key === "/__calculator_offline_ready__") {
          notifyReady();
          await readyRelease;
        }
        entries.set(key, response.clone());
      },
    };
    const context = vm.createContext({
      console,
      Response,
      URL,
      crypto: webcrypto,
      Uint8Array,
      AbortController,
      TextEncoder,
      fetch: async (url) =>
        url === "/offline-manifest.json"
          ? Response.json({
              version: "__BUILD_VERSION__",
              assets: [],
              bytes: 0,
            })
          : new Response("<html>App</html>"),
      caches: {
        open: async () => cache,
        keys: async () => ["calculator-core-__BUILD_VERSION__"],
        delete: async () => true,
      },
      self: {
        location: { origin: "https://example.test" },
        clients: {
          matchAll: async () => [
            { postMessage: (message) => reports.push(message) },
          ],
          claim: async () => {},
        },
        skipWaiting: async () => {},
        addEventListener: (type, fn) => (listeners[type] = fn),
      },
    });
    vm.runInContext(readSource("public/sw.js"), context);
    let preparing, signout;
    listeners.message({
      data: { type: "PREPARE" },
      waitUntil: (promise) => (preparing = promise),
    });
    await readyReached;
    listeners.message({
      data: { type: "SIGN_OUT" },
      waitUntil: (promise) => (signout = promise),
    });
    await signout;
    releaseReady();
    await preparing;
    assert(!entries.has("/__calculator_shell__"));
    assert(!entries.has("/__calculator_offline_ready__"));
    assert(!reports.some((report) => report.status.state === "Ready"));
  },
);

await check(
  "API outages include verified identity, distinguish bad input, and keep no-store",
  async () => {
    let current = { userId: "a", displayName: "A" };
    const env = {};
    const context = vm.createContext({
      console: { error() {} },
      crypto: webcrypto,
      Response,
      Request,
      TextDecoder,
      TextEncoder,
      Uint8Array,
      URL,
    });
    const modules = {};
    for (const file of [
      "sync",
      "storage",
      "types",
      "drafts",
      "result-validation",
      "workspace-request",
    ])
      modules[file] = new vm.SourceTextModule(
        source(`lib/calculator/${file}.ts`),
        { context, identifier: file },
      );
    modules.env = new vm.SyntheticModule(
      ["env"],
      function () {
        this.setExport("env", env);
      },
      { context },
    );
    modules.auth = new vm.SyntheticModule(
      ["getChatGPTUser"],
      function () {
        this.setExport("getChatGPTUser", async () => current);
      },
      { context },
    );
    modules.route = new vm.SourceTextModule(
      source("app/api/workspace/route.ts"),
      { context, identifier: "route" },
    );
    await modules.route.link((specifier) =>
      specifier === "cloudflare:workers"
        ? modules.env
        : specifier === "@/app/chatgpt-auth"
          ? modules.auth
          : specifier === "@/lib/calculator/storage"
            ? modules.storage
            : modules[
                specifier.replace("@/lib/calculator/", "").replace("./", "")
              ],
    );
    await modules.route.evaluate();
    const api = modules.route.namespace;
    const request = (body) =>
      new Request("https://site.test/api/workspace", {
        method: "PUT",
        headers: {
          Origin: "https://site.test",
          "Content-Type": "application/json",
        },
        body,
      });
    const get = await api.GET();
    assert.equal(get.status, 503);
    assert.equal((await get.json()).user.id, "a");
    assert.equal(get.headers.get("Cache-Control"), "private, no-store");
    const valid = await api.PUT(
      request(JSON.stringify({ account: "a", revision: 0, state: initial() })),
    );
    assert.equal(valid.status, 503);
    assert.equal(valid.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await api.PUT(request("{bad"))).status, 400);
    assert.equal((await api.PUT(request("x".repeat(1_800_001)))).status, 413);
    current = null;
    assert.equal((await api.GET()).status, 401);
    assert.equal(
      (
        await api.PUT(
          request(
            JSON.stringify({ account: "a", revision: 0, state: initial() }),
          ),
        )
      ).status,
      401,
    );
  },
);

await check(
  "reverse two-tab winner preserves a conflicted draft after another edit and reload",
  async () => {
    const values = new Map(),
      cloud = server();
    const a = await tab("A", values, cloud),
      b = await tab("B", values, cloud);
    await a.sync.initializeAccount();
    await b.sync.initializeAccount();
    a.storage.persist(initial("A unsynced draft"));
    b.storage.persist(initial("B workspace"));
    cloud.state = initial("B workspace");
    cloud.revision = 2;
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
    await flush();
    cloud.calls[0].resolve(
      Response.json({ error: "Conflict" }, { status: 409 }),
    );
    await flush();
    b.storage.persist(initial("B next edit"));
    cloud.state = initial("B next edit");
    cloud.revision = 3;
    cloud.calls[2].resolve(Response.json({ revision: 3 }));
    await flush();
    const reopened = await tab("reopened A", values, cloud);
    await reopened.sync.initializeAccount();
    const saved = JSON.parse(values.get("calculator.workspace.v1:a"));
    assert(
      saved.notebooks.some((book) => book.name.includes("A unsynced draft")),
      "Reload discarded the losing tab's draft",
    );
    assert(
      saved.notebooks.some((book) => book.name.includes("B next edit")),
      "Recovery discarded the winning workspace",
    );
  },
);

await check(
  "reload preserves an overwritten tab draft before its network response arrives",
  async () => {
    const values = new Map(),
      cloud = server();
    const a = await tab("A", values, cloud),
      b = await tab("B", values, cloud);
    await a.sync.initializeAccount();
    await b.sync.initializeAccount();
    a.storage.persist(initial("A draft before response"));
    b.storage.persist(initial("B workspace"));
    cloud.state = initial("B workspace");
    cloud.revision = 2;
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
    await flush();
    // A closes here; its unresolved PUT never executes a conflict handler.
    b.storage.persist(initial("B next edit"));
    cloud.state = initial("B next edit");
    cloud.revision = 3;
    cloud.calls[2].resolve(Response.json({ revision: 3 }));
    await flush();
    const reopened = await tab("reopened A", values, cloud);
    await reopened.sync.initializeAccount();
    const saved = JSON.parse(values.get("calculator.workspace.v1:a"));
    assert(
      saved.notebooks.some((book) =>
        book.name.includes("A draft before response"),
      ),
      "Draft depended on the closed tab's response handler",
    );
    assert(
      saved.notebooks.some((book) => book.name.includes("B next edit")),
      "Recovery discarded the winning workspace",
    );
  },
);

await check(
  "capacity recovery opens cloud work and preserves an exportable draft across new edits",
  async () => {
    const many = (name) => {
      const state = initial(name);
      state.notebooks = Array.from({ length: 60 }, (_, i) => ({
        ...state.notebooks[0],
        id: name + i,
        name: name + i,
      }));
      state.active = state.notebooks[0].id;
      return state;
    };
    const values = new Map(),
      cloud = server();
    cloud.state = many("Remote");
    const a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(many("Local"));
    cloud.revision = 2;
    cloud.calls[0].resolve(
      Response.json({ error: "Conflict" }, { status: 409 }),
    );
    await flush();
    const reopened = await tab("reopened", values, cloud);
    await reopened.sync.initializeAccount();
    assert.equal(
      JSON.parse(values.get("calculator.workspace.v1:a")).notebooks.length,
      60,
    );
    assert(
      reopened.drafts
        .readDrafts("a")
        .some((draft) =>
          draft.state.notebooks.some((book) => book.name.startsWith("Local")),
        ),
    );
    reopened.storage.persist(initial("New work"));
    cloud.calls[1].resolve(Response.json({ revision: 3 }));
    await flush();
    assert(
      reopened.drafts
        .readDrafts("a")
        .some((draft) =>
          draft.state.notebooks.some((book) => book.name.startsWith("Local")),
        ),
      "New edit overwrote preserved capacity draft",
    );
  },
);
await check(
  "recovered notebook names remain valid at the 100-character boundary",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("x".repeat(100)));
    cloud.revision = 2;
    cloud.calls[0].resolve(
      Response.json({ error: "Conflict" }, { status: 409 }),
    );
    await flush();
    const reopened = await tab("reopened", values, cloud);
    await reopened.sync.initializeAccount();
    const saved = JSON.parse(values.get("calculator.workspace.v1:a"));
    reopened.storage.validateState(saved);
    assert(
      saved.notebooks.some(
        (book) =>
          book.name.endsWith(" (offline copy)") && book.name.length === 100,
      ),
    );
  },
);

await check(
  "dirty legacy workspace survives reload with the same cloud base revision",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    values.set(
      "calculator.workspace.v1:a",
      JSON.stringify(initial("Legacy unsynced")),
    );
    values.set("dirty:a", "1");
    values.set("revision:a", "1");
    const reopened = await tab("reopened", values, cloud);
    await reopened.sync.initializeAccount();
    assert(
      JSON.parse(values.get("calculator.workspace.v1:a")).notebooks.some(
        (book) => book.name.includes("Legacy unsynced"),
      ),
    );
  },
);
await check("signed-out save never writes an unowned draft", async () => {
  const values = new Map(),
    cloud = server(),
    a = await tab("A", values, cloud);
  assert.throws(() => a.sync.syncWorkspace(initial("Private")), /Sign in/);
  assert.equal(values.size, 0);
});
await check(
  "recovery enumeration remains usable when browser storage reads fail",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    assert.equal(a.drafts.readDrafts("a").length, 0);
    values.set("calculator.pending.v1:a:test", '{"revision":1,"state":null}');
    const original = values.get;
    values.get = () => {
      throw Error("Storage disabled");
    };
    assert.equal(a.drafts.readDrafts("a").length, 0);
    values.get = original;
  },
);

await check(
  "an unsettled old-account save cannot block the current account",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("A pending save"));
    a.sync.forgetAccount();
    cloud.account = "b";
    await a.sync.initializeAccount();
    a.storage.persist(initial("B pending save"));
    await flush();
    assert.equal(
      cloud.calls.length,
      2,
      "Account B was blocked by account A's unsettled fetch",
    );
    assert.equal(cloud.calls[1].body.account, "b");
    assert.equal(
      a.drafts.readDrafts("a").length,
      1,
      "Account A's unsynced draft disappeared",
    );
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(values.get("dirty:b"), undefined);
  },
);
for (const failure of ["reads", "writes"]) {
  await check(
    `server-verified identity opens in memory when storage ${failure} fail`,
    async () => {
      class UnavailableStorage extends Map {
        get(key) {
          if (failure === "reads") throw Error("Browser storage unavailable");
          return super.get(key);
        }
        set(key, value) {
          if (failure === "writes") throw Error("Browser storage unavailable");
          return super.set(key, value);
        }
      }
      const cloud = server(),
        a = await tab(failure, new UnavailableStorage(), cloud);
      const identity = await a.sync.initializeAccount();
      assert.equal(identity.id, "a");
      assert.equal(a.sync.currentAccount(), "a");
      assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "initial");
      assert.equal(cloud.calls.length, 0);
      const loaded = a.storage.loadState();
      if (failure === "reads") {
        assert.equal(loaded.readable, false);
        assert.equal(loaded.state.notebooks[0].name, "initial");
        assert.match(loaded.warning, /storage is unavailable/);
      } else {
        assert.equal(loaded.readable, true);
        assert.equal(loaded.state, null);
        assert.equal(loaded.warning, "");
        assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "initial");
      }
      assert.throws(
        () => a.storage.persist(initial("memory edit")),
        /storage unavailable/,
      );
      assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "memory edit");
      assert.equal(
        cloud.calls.length,
        1,
        "Storage failure should retain authenticated cloud sync",
      );
      cloud.calls[0].resolve(Response.json({ revision: 2 }));
      await flush();
      assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "memory edit");
      a.sync.forgetAccount();
      assert.equal(a.sync.sessionWorkspace(), null);
    },
  );
}

await check(
  "a timed-out save preserves the draft and can retry on focus",
  async () => {
    const callbacks = new Map();
    let nextTimer = 0;
    const cloud = server();
    cloud.clock = {
      setTimeout(callback, delay) {
        assert.equal(delay, 15000);
        callbacks.set(++nextTimer, callback);
        return nextTimer;
      },
      clearTimeout(timer) {
        callbacks.delete(timer);
      },
    };
    const values = new Map(),
      a = await tab("deadline", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("timed out"));
    assert.equal(cloud.calls.length, 1);
    [...callbacks.values()][0]();
    await flush();
    assert.equal(cloud.calls[0].signal.aborted, true);
    assert.equal(a.drafts.readDrafts("a").length, 1);
    assert(a.messages.some((message) => message.includes("timed out")));
    a.trigger("focus");
    assert.equal(cloud.calls.length, 2);
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(a.drafts.readDrafts("a").length, 0);
    assert.equal(callbacks.size, 0);
  },
);
await check(
  "quota failure keeps recovered work in RAM and durable recovery drafts",
  async () => {
    class QuotaStorage extends Map {
      fail = false;
      set(key, value) {
        if (this.fail) throw Error("Quota exceeded");
        return super.set(key, value);
      }
    }
    const values = new QuotaStorage(),
      cloud = server(),
      a = await tab("quota", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("unsynced local"));
    values.fail = true;
    cloud.state = initial("remote workspace");
    await a.sync.initializeAccount();
    assert.equal(a.sync.currentAccount(), "a");
    assert(
      a.sync
        .sessionWorkspace()
        .notebooks.some((book) => book.name.includes("unsynced local")),
    );
    assert.equal(
      a.drafts.readDrafts("a").length,
      1,
      "Durable draft erased when merged cache could not be written",
    );
    a.sync.forgetAccount();
    assert.equal(a.sync.sessionWorkspace(), null);
  },
);
await check(
  "in-memory work never crosses owners and cannot authorize unknown offline identity",
  async () => {
    const cloud = server(),
      values = new Map(),
      a = await tab("owners", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("private A"));
    cloud.account = "b";
    cloud.state = initial("private B");
    await a.sync.initializeAccount();
    assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "private B");
    assert(!JSON.stringify(a.sync.sessionWorkspace()).includes("private A"));
    a.sync.forgetAccount();
    a.setOnline(false);
    await assert.rejects(a.sync.initializeAccount(), /Connect and sign in/);
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(a.sync.sessionWorkspace(), null);
  },
);
await check(
  "storage faults cannot bypass validation of a verified remote workspace",
  async () => {
    class FaultStorage extends Map {
      get() {
        throw Error("storage blocked");
      }
      set() {
        throw Error("storage blocked");
      }
    }
    const cloud = server();
    cloud.state = { version: 1, notebooks: [] };
    const a = await tab("invalid", new FaultStorage(), cloud);
    await assert.rejects(
      a.sync.initializeAccount(),
      /supported Calculator backup/,
    );
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(a.sync.sessionWorkspace(), null);
  },
);

await check(
  "unreadable storage is never overwritten regardless of warning wording",
  async () => {
    class Unreadable extends Map {
      blocked = false;
      get(key) {
        if (this.blocked) throw Error("Reads unavailable");
        return super.get(key);
      }
    }
    const values = new Unreadable(),
      cloud = server(),
      a = await tab("reads preserved", values, cloud, true);
    await a.sync.initializeAccount();
    a.storage.persist(initial("unreadable private work"));
    const text = values.get("calculator.workspace.v1:a"),
      base = values.get("revision:a");
    values.blocked = true;
    const inaccessible = a.storage.loadState();
    assert.equal(inaccessible.readable, false);
    assert.equal(
      inaccessible.state.notebooks[0].name,
      "unreadable private work",
    );
    assert.equal(
      inaccessible.warning,
      "Device reads failed. Keep this session open.",
    );
    cloud.state = initial("verified cloud");
    cloud.revision = 5;
    await a.sync.initializeAccount();
    assert.equal(a.sync.sessionWorkspace().notebooks[0].name, "verified cloud");
    values.blocked = false;
    assert.equal(values.get("calculator.workspace.v1:a"), text);
    assert.equal(values.get("revision:a"), base);
    assert.equal(a.drafts.readDrafts("a").length, 1);
    a.sync.forgetAccount();
  },
);

await check(
  "verified cloud hydration preserves malformed scoped bytes and unscoped legacy data",
  async () => {
    const malformed = '{"schema":1,"notebooks":broken',
      legacy = JSON.stringify(initial("unowned legacy work")),
      values = new Map([
        ["calculator.workspace.v1:a", malformed],
        ["calculator.workspace.v1", legacy],
        ["revision:a", "3"],
        ["dirty:a", "1"],
      ]),
      cloud = server();
    cloud.state = initial("verified remote work");
    cloud.revision = 7;
    const a = await tab("malformed preserved", values, cloud, true);
    await a.sync.initializeAccount();
    assert.equal(
      a.sync.sessionWorkspace().notebooks[0].name,
      "verified remote work",
    );
    const loaded = a.storage.loadState();
    assert.equal(loaded.state, null);
    assert.equal(loaded.warning, "");
    assert.equal(loaded.readable, false);
    assert.equal(values.get("calculator.workspace.v1:a"), malformed);
    assert.equal(values.get("revision:a"), "3");
    assert.equal(values.get("dirty:a"), "1");
    assert.equal(values.get("calculator.workspace.v1"), legacy);
    assert.equal(cloud.calls.length, 0);
    assert.throws(
      () => a.storage.persist(initial("safe current edit")),
      /unreadable device save is preserved/,
    );
    assert.equal(values.get("calculator.workspace.v1:a"), malformed);
    assert.equal(values.get("revision:a"), "3");
    assert.equal(values.get("calculator.workspace.v1"), legacy);
    assert.equal(
      a.sync.sessionWorkspace().notebooks[0].name,
      "safe current edit",
    );
    assert.equal(cloud.calls.length, 1);
    cloud.calls[0].resolve(Response.json({ revision: 8 }));
    await flush();
    assert.equal(values.get("calculator.workspace.v1:a"), malformed);
    assert.equal(values.get("revision:a"), "3");
    a.sync.forgetAccount();
    assert.equal(a.sync.sessionWorkspace(), null);
  },
);

await check(
  "volatile quota work warns until its exact latest state is cloud-acknowledged",
  async () => {
    class Quota extends Map {
      set() {
        throw Error("Quota exceeded");
      }
    }
    const cloud = server(),
      a = await tab("volatile quota", new Quota(), cloud);
    await a.sync.initializeAccount();
    assert.equal(a.sync.hasVolatileWorkspace(), false);
    assert.throws(() => a.storage.persist(initial("volatile42")), /Quota/);
    assert.equal(a.sync.hasVolatileWorkspace(), true);
    assert.throws(() => a.storage.persist(initial("volatile43")), /Quota/);
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(
      a.sync.hasVolatileWorkspace(),
      true,
      "An older acknowledgement cannot protect the latest edit",
    );
    assert.equal(cloud.calls.length, 2);
    assert.equal(a.messages.at(-1), "Saving your latest changes…");
    cloud.calls[1].resolve(Response.json({ revision: 3 }));
    await flush();
    assert.equal(a.sync.hasVolatileWorkspace(), false);
    assert.equal(a.messages.at(-1), "Saved to your account");
    a.sync.forgetAccount();
    assert.equal(a.sync.hasVolatileWorkspace(), false);
  },
);
await check(
  "durable offline workspace or owned draft needs no volatile warning",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("durable offline", values, cloud);
    await a.sync.initializeAccount();
    a.setOnline(false);
    a.storage.persist(initial("durable edit"));
    assert.equal(a.sync.hasVolatileWorkspace(), false);
    values.delete("calculator.workspace.v1:a");
    assert.equal(
      a.sync.hasVolatileWorkspace(),
      false,
      "The valid writer draft protects offline edits",
    );
    for (const key of [...values.keys()])
      if (key.startsWith("calculator.pending.v1:a:")) values.delete(key);
    values.set(
      "calculator.workspace.v1:b",
      JSON.stringify(initial("durable edit")),
    );
    assert.equal(
      a.sync.hasVolatileWorkspace(),
      true,
      "Another owner's copy cannot protect this account",
    );
    a.sync.forgetAccount();
  },
);

await check(
  "successful durable writer save stays safe when reads alone are unavailable",
  async () => {
    class ReadFailure extends Map {
      get() {
        throw Error("Reads unavailable");
      }
    }
    const cloud = server(),
      values = new ReadFailure(),
      a = await tab("durable unreadable", values, cloud);
    await a.sync.initializeAccount();
    assert.throws(
      () => a.storage.persist(initial("durable writer")),
      /Reads unavailable/,
    );
    assert.equal(cloud.calls.length, 1);
    assert.equal(a.sync.hasVolatileWorkspace(), false);
    a.sync.forgetAccount();
  },
);

await check(
  "byte-limited recovery preserves the original draft, usable remote work and later fitting copies",
  async () => {
    const local = largeWorkspace("Local"),
      remote = largeWorkspace("Remote"),
      original = JSON.stringify({ revision: 0, state: local });
    const key = "calculator.pending.v1:a:original";
    const values = new Map([
        ["calculator.workspace.v1:a", JSON.stringify(local)],
        ["dirty:a", "1"],
        [key, original],
      ]),
      cloud = server();
    cloud.state = remote;
    const a = await tab("byte-recovery", values, cloud);
    await a.sync.initializeAccount();
    const recovered = a.sync.sessionWorkspace();
    assert.equal(
      recovered.notebooks.length,
      1,
      "Oversized draft was merged into cloud work",
    );
    assert.equal(recovered.notebooks[0].name, "Remote");
    assert.equal(
      values.get(key),
      original,
      "Original oversized draft bytes changed",
    );
    const edited = JSON.parse(JSON.stringify(recovered));
    edited.notebooks[0].history.push({
      ...edited.notebooks[0].history[0],
      id: "new42",
      result: { status: "exact", text: "42", latex: "42", notes: [] },
    });
    a.storage.persist(edited);
    assert.equal(cloud.calls.length, 1);
    assert(
      new TextEncoder().encode(JSON.stringify(cloud.calls[0].body))
        .byteLength <= 1_800_000,
    );
    cloud.state = cloud.calls[0].body.state;
    cloud.revision = 2;
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert(a.messages.includes("Saved to your account"));
    assert.equal(
      values.get(key),
      original,
      "New remote edit discarded the separate recovery draft",
    );
    values.set(
      "calculator.pending.v1:a:small",
      JSON.stringify({ revision: 2, state: initial("Small later") }),
    );
    await a.sync.initializeAccount();
    const next = a.sync.sessionWorkspace();
    assert.equal(next.notebooks.length, 2);
    assert(next.notebooks.some((book) => book.name.includes("Small later")));
    assert(
      next.notebooks.some((book) =>
        book.history.some((entry) => entry.id === "new42"),
      ),
    );
    assert.equal(values.get(key), original);
    const explicit = largeWorkspace("Large local", 25);
    a.storage.persist(explicit);
    assert.equal(
      cloud.calls.length,
      1,
      "Explicit oversized local workspace reached the API",
    );
    assert(
      a.messages.some((message) =>
        message.includes("Cloud save exceeds 1.8 MB"),
      ),
    );
    assert.equal(
      JSON.parse(values.get("calculator.workspace.v1:a")).notebooks[0].name,
      "Large local",
    );
    assert(
      a.drafts
        .readDrafts("a")
        .some((draft) => draft.state.notebooks[0].name === "Large local"),
    );
    assert.equal(values.get(key), original);
  },
);
await check(
  "unpreserved oversized local work is never overwritten by hydration",
  async () => {
    class NoDraftSpace extends Map {
      set(key, value) {
        if (key.startsWith("calculator.pending.v1:"))
          throw Error("Draft quota exceeded");
        return super.set(key, value);
      }
    }
    const local = largeWorkspace("Only local copy"),
      raw = JSON.stringify(local);
    const values = new NoDraftSpace([
        ["calculator.workspace.v1:a", raw],
        ["dirty:a", "1"],
      ]),
      cloud = server();
    cloud.state = largeWorkspace("Remote");
    const a = await tab("no-draft-space", values, cloud);
    await a.sync.initializeAccount();
    assert.equal(
      values.get("calculator.workspace.v1:a"),
      raw,
      "Only original was overwritten when draft preservation failed",
    );
    assert.equal(
      a.sync.sessionWorkspace().notebooks[0].name,
      "Only local copy",
    );
  },
);
await check(
  "held initialization GET aborts and opens only the cached owner",
  async () => {
    const values = new Map([
      ["calculator.signed-in-account", JSON.stringify({ id: "a", name: "a" })],
      [
        "calculator.workspace.v1:a",
        JSON.stringify(initial("Offline original")),
      ],
    ]);
    const cloud = server(),
      timers = new Map();
    cloud.clock = {
      setTimeout(fn, ms) {
        timers.set(fn, ms);
        return fn;
      },
      clearTimeout(fn) {
        timers.delete(fn);
      },
    };
    let signal;
    cloud.get = (options) => {
      signal = options.signal;
      return new Promise(() => {});
    };
    const a = await tab("held-get", values, cloud);
    const initializing = a.sync.initializeAccount();
    await flush();
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0], 15000);
    [...timers.keys()][0]();
    assert.equal((await initializing).id, "a");
    assert.equal(signal.aborted, true);
    assert.equal(timers.size, 0);
    assert.equal(
      a.sync.sessionWorkspace().notebooks[0].name,
      "Offline original",
    );
    assert.equal(
      cloud.calls.length,
      0,
      "Opening a cached workspace wrote cloud data",
    );
  },
);
await check(
  "held GET cannot create an unknown offline identity or act on late data",
  async () => {
    const values = new Map(),
      cloud = server(),
      timers = new Map();
    cloud.clock = {
      setTimeout(fn) {
        timers.set(fn, true);
        return fn;
      },
      clearTimeout(fn) {
        timers.delete(fn);
      },
    };
    let release;
    cloud.get = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const a = await tab("unknown-held-get", values, cloud);
    const initializing = a.sync.initializeAccount();
    const outcome = initializing.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await flush();
    [...timers.keys()][0]();
    assert.match((await outcome).error.message, /timed out/);
    release(
      Response.json({
        user: { id: "b", name: "b" },
        state: initial("Private B"),
        revision: 1,
      }),
    );
    await flush();
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(a.sync.sessionWorkspace(), null);
    assert.equal(values.size, 0);
    assert.equal(cloud.calls.length, 0);
  },
);
await check(
  "initialization body deadline preserves authentication and stale-owner checks",
  async () => {
    for (const status of [200, 401, 503]) {
      const values = new Map([
        [
          "calculator.signed-in-account",
          JSON.stringify({ id: "a", name: "a" }),
        ],
        ["calculator.workspace.v1:a", JSON.stringify(initial("Private A"))],
      ]);
      const cloud = server(),
        timers = new Map();
      cloud.clock = {
        setTimeout(fn) {
          timers.set(fn, true);
          return fn;
        },
        clearTimeout(fn) {
          timers.delete(fn);
        },
      };
      let signal;
      cloud.get = async (options) => {
        signal = options.signal;
        return {
          status,
          ok: status === 200,
          json: () => new Promise(() => {}),
        };
      };
      const a = await tab("held-body", values, cloud);
      const initializing = a.sync.initializeAccount();
      // Attach before the immediate 401 rejection to avoid an unhandled promise.
      const outcome = initializing.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await flush();
      if (status !== 401) [...timers.keys()][0]();
      const result = await outcome;
      if (status === 200) assert.equal(result.value.id, "a");
      else assert(result.error);
      if (status === 401) {
        assert.equal(a.sync.currentAccount(), "");
        assert.equal(a.sync.sessionWorkspace(), null);
        assert.equal(values.has("calculator.signed-in-account"), false);
      } else assert(signal.aborted);
      assert.equal(timers.size, 0);
      assert.equal(cloud.calls.length, 0);
    }
    const values = new Map([
      ["calculator.signed-in-account", JSON.stringify({ id: "a", name: "a" })],
    ]);
    const cloud = server(),
      timers = new Map();
    cloud.clock = {
      setTimeout(fn) {
        timers.set(fn, true);
        return fn;
      },
      clearTimeout(fn) {
        timers.delete(fn);
      },
    };
    cloud.get = () => new Promise(() => {});
    const a = await tab("stale-held-get", values, cloud);
    const initializing = a.sync.initializeAccount();
    const outcome = initializing.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await flush();
    a.sync.forgetAccount();
    [...timers.keys()][0]();
    assert.match((await outcome).error.message, /Account changed/);
    assert.equal(a.sync.currentAccount(), "");
    assert.equal(a.sync.sessionWorkspace(), null);
  },
);
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
