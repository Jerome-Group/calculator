const VERSION = "__BUILD_VERSION__",
  CACHE = "calculator-core-" + VERSION,
  READY = "/__calculator_offline_ready__",
  SHELL = "/__calculator_shell__";
let preparing = false,
  accountGeneration = 0,
  clearingAccount = Promise.resolve();
const notPrepared = { state: "Not prepared", done: 0, total: 0 };
const report = async (status, generation = accountGeneration) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  if (generation !== accountGeneration) return;
  for (const c of clients) c.postMessage({ type: "OFFLINE_STATUS", status });
};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
const clearAccount = async (generation) => {
  for (const key of await caches.keys())
    if (key.startsWith("calculator-core-")) {
      const cache = await caches.open(key);
      await cache.delete(SHELL);
      await cache.delete(READY);
    }
  await report(notPrepared, generation);
};
self.addEventListener("message", (event) => {
  if (event.data?.type === "SIGN_OUT") {
    const generation = ++accountGeneration;
    clearingAccount = clearingAccount
      .catch(() => {})
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
          const r = await (await caches.open(CACHE)).match(READY);
          await report(r ? await r.json() : notPrepared, generation);
        } catch {
          await report(notPrepared, generation);
        }
      })(),
    );
    return;
  }
  if (event.data?.type !== "PREPARE" || preparing) return;
  preparing = true;
  const generation = accountGeneration;
  event.waitUntil(
    (async () => {
      let done = 0,
        total = 0,
        bytes = 0;
      try {
        clearingAccount = clearingAccount.catch(() => clearAccount(generation));
        await clearingAccount;
        if (generation !== accountGeneration) return;
        const response = await fetch("/offline-manifest.json", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok)
          throw Error(
            "Offline manifest unavailable. Build the app before preparing offline.",
          );
        const manifest = await response.json();
        if (manifest.version !== VERSION)
          throw Error(
            "A new version is available. Reload online and prepare again.",
          );
        const cache = await caches.open(CACHE);
        total = manifest.assets.length + 1;
        const current = () => generation === accountGeneration;
        const clearShell = async () => {
          await cache.delete(SHELL);
          await cache.delete(READY);
        };
        const valid = async (r, hash) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                await r.clone().arrayBuffer(),
              ),
            ),
            (x) => x.toString(16).padStart(2, "0"),
          ).join("") === hash;
        for (let i = 0; i < manifest.assets.length; i += 3) {
          const batch = await Promise.allSettled(
            manifest.assets.slice(i, i + 3).map(async (asset) => {
              let r = await cache.match(asset.url);
              if (!r || !(await valid(r, asset.sha256))) {
                r = await fetch(asset.url, {
                  cache: "reload",
                  credentials: "same-origin",
                  headers: { "X-Requested-With": "XMLHttpRequest" },
                });
                if (
                  !r.ok ||
                  new URL(r.url).origin !== self.location.origin ||
                  !(await valid(r, asset.sha256))
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
        }
        if (!current()) return;
        const page = await fetch("/", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!page.ok || page.redirected)
          throw Error("Sign in before preparing offline reopening.");
        if (!current()) return;
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
        };
        await cache.put(READY, new Response(JSON.stringify(status)));
        if (!current()) {
          await clearShell();
          return;
        }
        await report(status, generation);
        for (const key of await caches.keys())
          if (key.startsWith("calculator-core-") && key !== CACHE)
            await caches.delete(key);
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
        preparing = false;
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
      const cache = await caches.open(CACHE),
        ready = await cache.match(READY);
      if (event.request.mode === "navigate") {
        try {
          return await fetch(event.request);
        } catch (error) {
          if (ready && generation === accountGeneration) {
            const page = await cache.match(
              u.pathname === "/" ? SHELL : event.request,
              { ignoreSearch: true },
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
      if (ready) {
        const response = await cache.match(event.request, {
          ignoreSearch: true,
        });
        if (response) return response;
      }
      return fetch(event.request);
    })(),
  );
});
