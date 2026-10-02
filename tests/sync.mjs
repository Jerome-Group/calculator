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
const storage = (values) => ({
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  key: (index) => [...values.keys()][index] ?? null,
  get length() {
    return values.size;
  },
});
async function tab(name, values, server) {
  const context = vm.createContext({
    console,
    crypto: webcrypto,
    Response,
    Request,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    window: { dispatchEvent() {}, addEventListener() {} },
    navigator: { onLine: true, serviceWorker: {} },
    localStorage: storage(values),
    sessionStorage: storage(new Map()),
    fetch: async (_url, options) => {
      if (!options?.method && server.get) return await server.get();
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
      return await new Promise((resolve) =>
        server.calls.push({
          tab: name,
          body: JSON.parse(options.body),
          resolve,
        }),
      );
    },
  });
  const modules = {};
  for (const file of ["sync", "storage", "types"])
    modules[file] = new vm.SourceTextModule(
      source(`lib/calculator/${file}.ts`),
      { context, identifier: file },
    );
  await modules.sync.link((specifier) => modules[specifier.replace("./", "")]);
  await modules.sync.evaluate();
  return { sync: modules.sync.namespace, storage: modules.storage.namespace };
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
  "stale account response drains the new account's pending save",
  async () => {
    const values = new Map(),
      cloud = server(),
      a = await tab("A", values, cloud);
    await a.sync.initializeAccount();
    a.storage.persist(initial("account A"));
    a.sync.forgetAccount();
    cloud.account = "b";
    await a.sync.initializeAccount();
    a.storage.persist(initial("account B"));
    assert.equal(cloud.calls.length, 1);
    cloud.calls[0].resolve(Response.json({ revision: 2 }));
    await flush();
    assert.equal(cloud.calls.length, 2, "New account's save remained stuck");
    assert.equal(cloud.calls[1].body.account, "b");
    assert.equal(
      values.get("revision:a"),
      "1",
      "Stale save modified account A metadata",
    );
    cloud.calls[1].resolve(Response.json({ revision: 2 }));
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
      Uint8Array,
      URL,
    });
    const modules = {};
    for (const file of ["sync", "storage", "types"])
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
            : modules[specifier.replace("./", "")],
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

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
