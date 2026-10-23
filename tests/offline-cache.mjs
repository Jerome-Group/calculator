import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const origin = "https://calculator.test";
const prefix = "calculator-core-",
  shell = "/__calculator_shell__",
  ready = "/__calculator_offline_ready__";
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const keyOf = (value) => {
  const u = new URL(typeof value === "string" ? value : value.url, origin);
  return u.pathname + u.search;
};
function runtime({
  version,
  id,
  store = new Map(),
  legacy = false,
  clock = 1,
}) {
  const listeners = {},
    reports = [],
    requests = [];
  const root = legacy ? "/engine/" : `/engine-build/${id}/`;
  const body = "verified dependency " + id;
  const asset = {
    url: root + "calculator.py",
    sha256: sha256(body),
    bytes: Buffer.byteLength(body),
  };
  const shellReached = Promise.withResolvers(),
    shellReleased = Promise.withResolvers(),
    publicationReached = Promise.withResolvers(),
    publicationReleased = Promise.withResolvers();
  const config = {
    holdShell: false,
    holdPublication: false,
    accountDeleteFailure: false,
    revocationFailure: false,
    online: true,
    failAsset: false,
    failShell: false,
    shellId: id,
    deleteFailure: false,
  };
  const manifest = {
    version,
    engine: { id, protocol: 1 },
    bytes: asset.bytes,
    assets: [asset],
  };
  const cacheApi = (entries) => ({
    match: async (key) => entries.get(keyOf(key))?.clone(),
    put: async (key, response) => {
      if (
        keyOf(key) === ready &&
        config.revocationFailure &&
        (await response.clone().json()).state === "Not prepared"
      )
        throw Error("Fixture revocation write failed");
      if (keyOf(key) === shell && config.holdPublication) {
        publicationReached.resolve();
        await publicationReleased.promise;
      }
      entries.set(keyOf(key), response.clone());
    },
    delete: async (key) => {
      if (config.accountDeleteFailure && [shell, ready].includes(keyOf(key)))
        throw Error("Fixture cache deletion failed");
      return entries.delete(keyOf(key));
    },
  });
  const caches = {
    keys: async () => [...store.keys()],
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      return cacheApi(store.get(name));
    },
    delete: async (name) => (config.deleteFailure ? false : store.delete(name)),
  };
  const fetch = async (request, options) => {
    const key = keyOf(request);
    requests.push(key);
    if (
      !config.online ||
      (key === asset.url && config.failAsset) ||
      (key === "/" && config.failShell)
    )
      throw Error("Fixture disconnected");
    if (key === "/offline-manifest.json") return Response.json(manifest);
    if (key === "/" && config.holdShell) {
      shellReached.resolve();
      await Promise.race([
        shellReleased.promise,
        new Promise((_, reject) =>
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          ),
        ),
      ]);
    }
    let response;
    if (key === "/")
      response = new Response(
        `<html data-calculator-engine="${config.shellId}">${version} shell</html>`,
      );
    else if (key === asset.url) response = new Response(body);
    else if (key === "/compute-worker.js")
      response = new Response("legacy worker " + version);
    else response = new Response("missing", { status: 404 });
    Object.defineProperty(response, "url", { value: origin + key });
    return response;
  };
  const context = vm.createContext({
    Response,
    URL,
    crypto: webcrypto,
    Uint8Array,
    AbortController,
    AbortSignal,
    Date: { now: () => clock },
    fetch,
    caches,
    self: {
      location: { origin },
      clients: {
        matchAll: async () => [
          { postMessage: (message) => reports.push(message) },
        ],
        claim: async () => {},
      },
      skipWaiting: async () => {},
      addEventListener: (name, fn) => (listeners[name] = fn),
    },
  });
  vm.runInContext(
    source.replace("__BUILD_VERSION__", version).replace("__ENGINE_ID__", id),
    context,
  );
  return {
    store,
    config,
    manifest,
    asset,
    reports,
    requests,
    publicationReached: publicationReached.promise,
    releasePublication: () => publicationReleased.resolve(),
    shellReached: shellReached.promise,
    releaseShell: () => shellReleased.resolve(),
    cache: (name = prefix + version) => store.get(name),
    message: (type, overrides = {}) => {
      let completion;
      listeners.message({
        data: { type, protocol: 1, engineId: id, ...overrides },
        waitUntil: (promise) => (completion = promise),
      });
      return completion;
    },
    fetch: (pathname, mode = "cors") => {
      let response;
      listeners.fetch({
        request: { url: origin + pathname, method: "GET", mode },
        respondWith: (promise) => (response = promise),
      });
      return response;
    },
  };
}
async function prepareLegacy(store = new Map(), version = "legacy-a") {
  const a = runtime({ version, id: "a".repeat(64), store, legacy: true });
  const cache = new Map([
    [shell, new Response(`<html>${version} shell</html>`)],
    [ready, Response.json({ state: "Ready", version, done: 2, total: 2 })],
    [a.asset.url, new Response("verified dependency " + "a".repeat(64))],
    ["/compute-worker.js", new Response("legacy worker " + version)],
  ]);
  store.set(prefix + version, cache);
  return a;
}
async function assertLegacyFallback(runtime, version = "legacy-a") {
  runtime.config.online = false;
  assert.match(
    await (await runtime.fetch("/", "navigate")).text(),
    new RegExp(version + " shell"),
  );
  assert.equal(
    await (await runtime.fetch("/compute-worker.js")).text(),
    "legacy worker " + version,
  );
  assert.equal(
    await (await runtime.fetch("/engine/calculator.py")).text(),
    "verified dependency " + "a".repeat(64),
  );
  runtime.config.online = true;
}

await test("legacy complete preparation survives takeover, failed new preparation and worker restart", async () => {
  const a = await prepareLegacy();
  const b = runtime({
    version: "build-b",
    id: "b".repeat(64),
    store: a.store,
    clock: 2,
  });
  await assertLegacyFallback(b);
  b.config.failAsset = true;
  await b.message("PREPARE");
  assert.match(b.reports.at(-1).status.state, /^Interrupted:/);
  assert(!b.cache().has(ready));
  assert(a.cache().has(ready));
  await b.message("STATUS");
  assert.equal(b.reports.at(-1).status.state, "Not prepared");
  await assertLegacyFallback(b);
  const restarted = runtime({
    version: "build-b",
    id: "b".repeat(64),
    store: a.store,
    clock: 2,
  });
  await assertLegacyFallback(restarted);
  await restarted.message("PREPARE");
  assert.equal(restarted.reports.at(-1).status.state, "Ready");
  assert.equal(restarted.store.size, 2);
  restarted.config.online = false;
  assert.match(
    await (await restarted.fetch("/", "navigate")).text(),
    /build-b shell/,
  );
  assert.equal(
    await (await restarted.fetch(restarted.asset.url)).text(),
    "verified dependency " + "b".repeat(64),
  );
  await assert.rejects(
    restarted.fetch("/engine-build/" + "f".repeat(64) + "/calculator.py"),
    /disconnected/,
  );
});

await test("failed targets stay bounded and only successful Ready retires older complete generations", async () => {
  const a = await prepareLegacy();
  const b = runtime({
    version: "build-b",
    id: "b".repeat(64),
    store: a.store,
    clock: 2,
  });
  await b.message("PREPARE");
  const c = runtime({
    version: "build-c",
    id: "c".repeat(64),
    store: a.store,
    clock: 3,
  });
  c.config.failShell = true;
  await c.message("PREPARE");
  assert.equal(a.store.size, 3);
  assert(a.cache().has(ready));
  assert(b.cache().has(ready));
  assert(!c.cache().has(ready));
  c.config.online = false;
  assert.match(await (await c.fetch("/", "navigate")).text(), /build-b shell/);
  await assert.rejects(
    c.fetch(c.asset.url),
    /disconnected/,
    "Partial assets must not be offline fallbacks",
  );
  const d = runtime({
    version: "build-d",
    id: "d".repeat(64),
    store: a.store,
    clock: 4,
  });
  d.config.failAsset = true;
  await d.message("PREPARE");
  assert.equal(a.store.size, 3);
  assert(!a.store.has(prefix + "build-c"));
  assert(a.cache().has(ready));
  d.config.failAsset = false;
  await d.message("PREPARE");
  assert.equal(a.store.size, 2);
  assert(!a.store.has(prefix + "legacy-a"));
  assert(b.cache().has(ready));
  assert(d.cache().has(ready));
  d.config.online = false;
  await assert.rejects(d.fetch("/compute-worker.js"), /disconnected/);
});

await test("legacy selection remains one deterministic shell and canonical-cache pair after restart", async () => {
  const a = await prepareLegacy(new Map(), "legacy-z");
  const second = new Map(
    [...a.cache()].map(([key, value]) => [key, value.clone()]),
  );
  second.set(shell, new Response("legacy-a shell"));
  second.set("/compute-worker.js", new Response("legacy worker legacy-a"));
  a.store.set(prefix + "legacy-a", second);
  for (let i = 0; i < 2; i++) {
    const b = runtime({
      version: "build-b",
      id: "b".repeat(64),
      store: a.store,
    });
    await assertLegacyFallback(b, "legacy-a");
  }
});

await test("same-version failed repair preserves its committed shell and mismatched shell never commits Ready", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  await b.message("PREPARE");
  const original = await b.cache().get(shell).clone().text();
  b.config.failShell = true;
  await b.message("PREPARE");
  assert.equal(await b.cache().get(shell).clone().text(), original);
  assert.equal((await b.cache().get(ready).clone().json()).state, "Ready");
  const c = runtime({ version: "build-c", id: "c".repeat(64), store: b.store });
  c.config.shellId = "a".repeat(64);
  await c.message("PREPARE");
  assert.match(c.reports.at(-1).status.state, /app changed during preparation/);
  assert(!c.cache().has(ready));
  assert(!c.cache().has(shell));
  assert(b.cache().has(ready));
});

await test("failed incomplete cleanup stops before creating a fourth cache", async () => {
  const a = await prepareLegacy();
  const b = runtime({ version: "build-b", id: "b".repeat(64), store: a.store });
  b.config.failAsset = true;
  await b.message("PREPARE");
  const c = runtime({ version: "build-c", id: "c".repeat(64), store: a.store });
  c.config.deleteFailure = true;
  await c.message("PREPARE");
  assert.match(c.reports.at(-1).status.state, /Could not remove interrupted/);
  assert(!a.store.has(prefix + "build-c"));
  assert(a.cache().has(ready));
});

await test("sign-out clears shells and Ready from every retained cache and publishes Not prepared", async () => {
  const a = await prepareLegacy();
  const b = runtime({ version: "build-b", id: "b".repeat(64), store: a.store });
  await b.message("PREPARE");
  await b.message("SIGN_OUT");
  await b.message("STATUS");
  assert.equal(b.reports.at(-1).status.state, "Not prepared");
  for (const entries of a.store.values()) {
    assert(!entries.has(ready));
    assert(!entries.has(shell));
    assert(entries.size > 0);
  }
});

await test("sign-out retires an obsolete preparation so a new owner's request can finish", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  b.config.holdShell = true;
  const oldPreparation = b.message("PREPARE");
  await b.shellReached;
  await b.message("SIGN_OUT");
  b.config.holdShell = false;
  const newPreparation = b.message("PREPARE");
  b.releaseShell();
  await oldPreparation;
  assert(newPreparation, "New owner preparation was silently ignored");
  await newPreparation;
  assert.equal(b.reports.at(-1).status.state, "Ready");
  assert(b.cache().has(ready));
});

await test("old held shell publication drains before reset and the new owner's Ready commit", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  b.config.holdPublication = true;
  const oldPreparation = b.message("PREPARE");
  await b.publicationReached;
  const clearing = b.message("SIGN_OUT");
  b.config.holdPublication = false;
  const newPreparation = b.message("PREPARE");
  await new Promise(setImmediate);
  assert(!b.reports.some((message) => message.status.state === "Ready"));
  b.releasePublication();
  await Promise.all([oldPreparation, clearing, newPreparation]);
  assert.equal(b.reports.at(-1).status.state, "Ready");
  assert(b.reports.some((message) => message.status.state === "Not prepared"));
  assert(b.cache().has(shell));
  assert(b.cache().has(ready));
});

await test("durable revocation survives failed private deletion and a service-worker restart", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  await b.message("PREPARE");
  b.config.accountDeleteFailure = true;
  await b.message("SIGN_OUT").catch(() => {});
  const restarted = runtime({
    version: "build-b",
    id: "b".repeat(64),
    store: b.store,
  });
  await restarted.message("STATUS");
  assert.equal(restarted.reports.at(-1).status.state, "Not prepared");
  restarted.config.online = false;
  await assert.rejects(restarted.fetch("/", "navigate"), /disconnected/);
  assert(b.cache().has(b.asset.url), "Public verified assets remain intact");
});

await test("revocation write failure still attempts private deletion", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  await b.message("PREPARE");
  b.config.revocationFailure = true;
  await b.message("SIGN_OUT");
  assert(!b.cache().has(shell));
  assert(!b.cache().has(ready));
  assert.equal(b.reports.at(-1).status.state, "Not prepared");
});

await test("failure of every persistent revocation method reports its limit and keeps fallback blocked", async () => {
  const b = runtime({ version: "build-b", id: "b".repeat(64) });
  await b.message("PREPARE");
  b.config.revocationFailure = true;
  b.config.accountDeleteFailure = true;
  await assert.rejects(b.message("SIGN_OUT"), /could not revoke/);
  assert.match(
    b.reports.at(-1).status.state,
    /Browser storage could not revoke/,
  );
  b.config.online = false;
  await assert.rejects(b.fetch("/", "navigate"), /disconnected/);
});

await test("failed complete pruning cannot create another target until its deferred cleanup succeeds", async () => {
  const a = await prepareLegacy();
  const b = runtime({
    version: "build-b",
    id: "b".repeat(64),
    store: a.store,
    clock: 2,
  });
  await b.message("PREPARE");
  const c = runtime({
    version: "build-c",
    id: "c".repeat(64),
    store: a.store,
    clock: 3,
  });
  c.config.deleteFailure = true;
  await c.message("PREPARE");
  assert(
    c.cache().has(ready),
    "The new completion committed before cleanup failed",
  );
  assert.equal(a.store.size, 3);
  const d = runtime({
    version: "build-d",
    id: "d".repeat(64),
    store: a.store,
    clock: 4,
  });
  d.config.deleteFailure = true;
  await d.message("PREPARE");
  assert(
    !a.store.has(prefix + "build-d"),
    "Failed complete cleanup must stop before creating another target",
  );
  assert.equal(a.store.size, 3);
  d.config.deleteFailure = false;
  await d.message("PREPARE");
  assert.equal(a.store.size, 2);
  assert(c.cache().has(ready));
  assert(d.cache().has(ready));
});
