const VERSION = "__BUILD_VERSION__",
  ENGINE_ID = "__ENGINE_ID__",
  PROTOCOL = 1,
  PREFIX = "calculator-core-",
  CACHE = PREFIX + VERSION,
  READY = "/__calculator_offline_ready__",
  SHELL = "/__calculator_shell__";
let preparation = null,
  accountPublication = Promise.resolve(),
  accountGeneration = 0,
  clearingAccount = Promise.resolve();
const notPrepared = { state: "Not prepared", done: 0, total: 0 };
const report = async (status, generation = accountGeneration) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  if (generation !== accountGeneration) return;
  for (const c of clients)
    c.postMessage({
      type: "OFFLINE_STATUS",
      protocol: PROTOCOL,
      engineId: ENGINE_ID,
      status,
    });
};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

async function completePreparations() {
  const complete = [];
  for (const key of await caches.keys()) {
    if (!key.startsWith(PREFIX)) continue;
    const cache = await caches.open(key);
    const response = await cache.match(READY);
    if (!response) continue;
    let marker;
    try {
      marker = await response.json();
    } catch {
      continue;
    }
    if (marker?.state !== "Ready" || !(await cache.match(SHELL))) continue;
    const legacy =
      marker.engineId === undefined && marker.protocol === undefined;
    if (
      !legacy &&
      (marker.protocol !== PROTOCOL ||
        !/^[a-f0-9]{64}$/.test(marker.engineId) ||
        marker.version !== key.slice(PREFIX.length) ||
        !Number.isFinite(marker.completedAt) ||
        marker.completedAt <= 0 ||
        !Number.isSafeInteger(marker.done) ||
        marker.done <= 0 ||
        marker.done !== marker.total)
    )
      continue;
    complete.push({
      key,
      cache,
      marker,
      legacy,
      completedAt: legacy ? 0 : marker.completedAt,
    });
  }
  return complete.sort(
    (a, b) => b.completedAt - a.completedAt || a.key.localeCompare(b.key),
  );
}
const currentFirst = (complete) => [
  ...complete.filter((entry) => entry.key === CACHE),
  ...complete.filter((entry) => entry.key !== CACHE),
];
async function removeIncompleteTargets(complete) {
  const committed = new Set(complete.map((entry) => entry.key));
  for (const key of await caches.keys())
    if (key.startsWith(PREFIX) && key !== CACHE && !committed.has(key))
      if (!(await caches.delete(key)))
        throw Error("Could not remove interrupted offline files.");
}
async function pruneCompletePreparations() {
  const complete = currentFirst(await completePreparations());
  for (const entry of complete.slice(2))
    if (!(await caches.delete(entry.key)))
      throw Error("Could not retire older offline files.");
}
const clearAccount = async (generation) => {
  let failed = false;
  for (const key of await caches.keys())
    if (key.startsWith(PREFIX)) {
      const cache = await caches.open(key);
      let revoked = false;
      try {
        await cache.put(READY, new Response(JSON.stringify(notPrepared)));
        revoked = true;
      } catch {}
      for (const entry of [SHELL, READY]) {
        try {
          await cache.delete(entry);
          revoked = true;
        } catch {}
      }
      if (!revoked) failed = true;
    }
  if (failed) {
    await report(
      {
        ...notPrepared,
        state:
          "Not prepared: Browser storage could not revoke offline reopening. Retry sign-out when storage is available.",
      },
      generation,
    );
    throw Error("Browser storage could not revoke offline reopening.");
  }
  await report(notPrepared, generation);
};
const matchesBuild = (message) =>
  message?.protocol === PROTOCOL && message.engineId === ENGINE_ID;
self.addEventListener("message", (event) => {
  if (event.data?.type === "SIGN_OUT") {
    const generation = ++accountGeneration;
    preparation?.controller.abort();
    preparation = null;
    const publication = accountPublication;
    clearingAccount = clearingAccount
      .catch(() => {})
      .then(() => publication.catch(() => {}))
      .then(() => clearAccount(generation));
    event.waitUntil(clearingAccount);
    return;
  }
  if (event.data?.type === "STATUS") {
    const generation = accountGeneration;
    event.waitUntil(
      (async () => {
        try {
          await clearingAccount;
          if (generation !== accountGeneration) return;
          const complete = await completePreparations();
          const current = complete.find(
            (entry) =>
              entry.key === CACHE &&
              !entry.legacy &&
              entry.marker.engineId === ENGINE_ID,
          );
          await report(
            matchesBuild(event.data) && current ? current.marker : notPrepared,
            generation,
          );
        } catch {
          await report(notPrepared, generation);
        }
      })(),
    );
    return;
  }
  if (event.data?.type !== "PREPARE" || preparation) return;
  if (!matchesBuild(event.data)) {
    event.waitUntil(
      report({
        ...notPrepared,
        state:
          "Interrupted: A new version is available. Reload online and prepare again.",
      }),
    );
    return;
  }
  const generation = accountGeneration;
  const attempt = { generation, controller: new AbortController() };
  preparation = attempt;
  const fetchPrepared = (url, options) =>
    fetch(url, {
      ...options,
      signal: AbortSignal.any([
        attempt.controller.signal,
        AbortSignal.timeout(30000),
      ]),
    });
  event.waitUntil(
    (async () => {
      let done = 0,
        total = 0,
        bytes = 0;
      try {
        clearingAccount = clearingAccount.catch(() => clearAccount(generation));
        await clearingAccount;
        if (generation !== accountGeneration) return;
        const response = await fetchPrepared("/offline-manifest.json", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok)
          throw Error(
            "Offline manifest unavailable. Build the app before preparing offline.",
          );
        const manifest = await response.json();
        if (
          manifest.version !== VERSION ||
          manifest.engine?.protocol !== PROTOCOL ||
          manifest.engine.id !== ENGINE_ID
        )
          throw Error(
            "A new version is available. Reload online and prepare again.",
          );
        let complete = await completePreparations();
        if (complete.length > 2) {
          await pruneCompletePreparations();
          complete = await completePreparations();
        }
        await removeIncompleteTargets(complete);
        if (generation !== accountGeneration) return;
        const cache = await caches.open(CACHE);
        total = manifest.assets.length + 1;
        const current = () =>
          generation === accountGeneration && preparation === attempt;
        const clearShell = async () => {
          await cache.delete(SHELL);
          await cache.delete(READY);
        };
        const valid = async (response, asset) => {
          const data = await response.clone().arrayBuffer();
          return (
            data.byteLength === asset.bytes &&
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
              (x) => x.toString(16).padStart(2, "0"),
            ).join("") === asset.sha256
          );
        };
        for (let i = 0; i < manifest.assets.length; i += 3) {
          const batch = await Promise.allSettled(
            manifest.assets.slice(i, i + 3).map(async (asset) => {
              if (
                !/^\/(?!\/)/.test(asset.url) ||
                !/^[a-f0-9]{64}$/.test(asset.sha256) ||
                !Number.isSafeInteger(asset.bytes) ||
                asset.bytes < 0 ||
                asset.bytes >= 25 * 1024 * 1024
              )
                throw Error("Invalid offline asset.");
              let r = await cache.match(asset.url);
              if (!r || !r.ok || !(await valid(r, asset))) {
                r = undefined;
                for (const entry of complete) {
                  const candidate = await entry.cache.match(asset.url);
                  if (candidate && (await valid(candidate, asset))) {
                    r = candidate;
                    break;
                  }
                }
                r ??= await fetchPrepared(asset.url, {
                  cache: "reload",
                  credentials: "same-origin",
                  headers: { "X-Requested-With": "XMLHttpRequest" },
                });
                if (
                  !r.ok ||
                  new URL(r.url || asset.url, self.location.origin).origin !==
                    self.location.origin ||
                  !(await valid(r, asset))
                )
                  throw Error("Could not verify " + asset.url);
                await cache.put(asset.url, r);
              }
              done++;
              bytes += asset.bytes;
              await report(
                {
                  state: "Preparing",
                  done,
                  total,
                  bytes,
                  totalBytes: manifest.bytes,
                },
                generation,
              );
            }),
          );
          const failed = batch.find((r) => r.status === "rejected");
          if (failed) throw failed.reason;
          if (!current()) return;
        }
        if (!current()) return;
        const page = await fetchPrepared("/", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!page.ok || page.redirected)
          throw Error("Sign in before preparing offline reopening.");
        const html = await page.clone().text();
        if (!html.includes('data-calculator-engine="' + ENGINE_ID + '"'))
          throw Error(
            "The app changed during preparation. Reload online and prepare again.",
          );
        if (!current()) return;
        accountPublication = (async () => {
          await cache.put(SHELL, page);
          if (!current()) {
            await clearShell();
            return;
          }
          done++;
          const status = {
            state: "Ready",
            done,
            total,
            bytes,
            totalBytes: manifest.bytes,
            version: VERSION,
            protocol: PROTOCOL,
            engineId: ENGINE_ID,
            completedAt: Date.now(),
          };
          await cache.put(READY, new Response(JSON.stringify(status)));
          if (!current()) {
            await clearShell();
            return;
          }
          await report(status, generation);
        })();
        await accountPublication;
        if (current()) await pruneCompletePreparations();
      } catch (error) {
        await report(
          {
            state:
              "Interrupted: " +
              error.message +
              " Retry resumes verified files.",
            done,
            total,
            bytes,
          },
          generation,
        );
      } finally {
        if (preparation === attempt) preparation = null;
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (
    u.origin !== self.location.origin ||
    event.request.method !== "GET" ||
    u.pathname.startsWith("/api/") ||
    [
      "/sw.js",
      "/offline-manifest.json",
      "/signin-with-chatgpt",
      "/signout-with-chatgpt",
      "/callback",
    ].includes(u.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const generation = accountGeneration;
      try {
        await clearingAccount;
      } catch {
        return fetch(event.request);
      }
      if (generation !== accountGeneration) return fetch(event.request);
      const complete = await completePreparations();
      if (generation !== accountGeneration) return fetch(event.request);
      if (event.request.mode === "navigate") {
        try {
          return await fetch(event.request);
        } catch (error) {
          const selected = currentFirst(complete)[0];
          if (selected && generation === accountGeneration) {
            const page = await selected.cache.match(
              u.pathname === "/" ? SHELL : event.request,
            );
            if (page && generation === accountGeneration)
              return new Response(page.body, {
                status: page.status,
                statusText: page.statusText,
                headers: page.headers,
              });
          }
          throw error;
        }
      }
      const canonical =
        u.pathname === "/compute-worker.js" ||
        u.pathname.startsWith("/engine/");
      const eligible = canonical
        ? complete.filter((entry) => entry.legacy).slice(0, 1)
        : currentFirst(complete);
      for (const entry of eligible) {
        const response = await entry.cache.match(event.request);
        if (response) return response;
      }
      return fetch(event.request);
    })(),
  );
});
