import fs from "node:fs/promises";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const root = "dist/client";
const manifest = JSON.parse(
  await fs.readFile(root + "/offline-manifest.json", "utf8"),
);
const assets = new Map(manifest.assets.map((a) => [a.url, a]));
for (const p of [
  "/compute-worker.js",
  "/engine/calculator.py",
  "/engine/latex_adapter.py",
  "/engine/supplemental.py",
  "/engine/presentation.py",
  "/engine/extended.py",
  "/engine/pyodide.js",
  "/engine/pyodide.asm.js",
  "/engine/pyodide.asm.wasm",
  "/engine/python_stdlib.zip",
  "/engine/pyodide-lock.json",
  "/engine/networkx-3.4.2-py3-none-any.whl",
  "/engine/lark-1.2.2-py3-none-any.whl",
  "/coverage.html",
  "/licenses.txt",
  "/engine/licenses/Pyodide-MPL-2.0.txt",
])
  assert(assets.has(p), "Missing " + p);
const lock = JSON.parse(
  await fs.readFile("public/engine/pyodide-lock.json", "utf8"),
);
const seen = new Set();
function closure(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const p = lock.packages[name];
  assert(assets.has("/engine/" + p.file_name), "Missing package " + name);
  p.depends.forEach(closure);
}
closure("sympy");
closure("scipy");
const pins = JSON.parse(
  await fs.readFile("scripts/engine-assets.json", "utf8"),
);
for (const pin of pins.assets) {
  const asset = assets.get("/engine/" + pin.file);
  assert(asset, "Missing pinned engine artifact " + pin.file);
  assert.equal(asset.sha256, pin.sha256, "Changed engine artifact " + pin.file);
}
for (const asset of assets.values()) {
  const data = await fs.readFile(root + asset.url);
  assert.equal(
    crypto.createHash("sha256").update(data).digest("hex"),
    asset.sha256,
  );
  assert(data.length < 25 * 1024 * 1024);
}
const coverage = await fs.readFile(root + "/coverage.html", "utf8");
const coverageUrl = new URL("https://calculator.test/coverage.html");
const runtimeRoutes = new Set(["/", "/coverage"]);
for (const [, , href] of coverage.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)) {
  const target = new URL(href, coverageUrl);
  if (
    target.origin !== coverageUrl.origin ||
    runtimeRoutes.has(target.pathname)
  )
    continue;
  const pathname = decodeURIComponent(target.pathname);
  assert(assets.has(pathname), "Missing coverage link target " + pathname);
  await fs.access(root + pathname);
}
const sw = await fs.readFile(root + "/sw.js", "utf8");
assert(!sw.includes("__BUILD_VERSION__"));
assert(sw.includes(manifest.version));
console.log(
  JSON.stringify({
    assets: assets.size,
    MiB: manifest.bytes / 1048576,
    version: manifest.version,
    verified: true,
  }),
);

const worker = JSON.parse(
  await fs.readFile("dist/server/wrangler.json", "utf8"),
);
assert(worker.main, "Worker entrypoint missing");
await fs.access("dist/server/" + worker.main);
const hosting = JSON.parse(
  await fs.readFile("dist/.openai/hosting.json", "utf8"),
);
assert.equal(hosting.d1, "DB");
assert.equal(
  hosting.project_id,
  JSON.parse(await fs.readFile(".openai/hosting.json", "utf8")).project_id,
);
await fs.access("dist/.openai/drizzle/0000_careless_thena.sql");
