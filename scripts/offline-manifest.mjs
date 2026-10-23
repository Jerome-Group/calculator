import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateEngineBuild, verifyEngineBuild } from "./engine-build.mjs";
const root = process.argv[2] || "dist/client";
const build = await generateEngineBuild();
await verifyEngineBuild({ ...build, directory: path.join(root, build.root) });
await fs.rm(path.join(root, "engine"), { recursive: true, force: true });
await fs.rm(path.join(root, "compute-worker.js"), { force: true });
for (const entry of await fs.readdir(path.join(root, "engine-build")))
  if (entry !== build.engine.id)
    await fs.rm(path.join(root, "engine-build", entry), {
      recursive: true,
      force: true,
    });
const ignored = new Set([
  "sw.js",
  "offline-manifest.json",
  "_headers",
  "_redirects",
  "__pycache__",
]);
async function files(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (
      e.name.startsWith(".") ||
      ignored.has(e.name) ||
      /\.(map|pyc)$/.test(e.name)
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
const assets = [];
let bytes = 0;
for (const f of (await files(root)).sort()) {
  const data = await fs.readFile(f);
  bytes += data.length;
  assets.push({
    url: "/" + path.relative(root, f).split(path.sep).join("/"),
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    bytes: data.length,
  });
}
for (const required of [...build.assets.map((asset) => asset.url)])
  if (!assets.some((a) => a.url === required))
    throw Error("Offline build is missing " + required);
const version = crypto
  .createHash("sha256")
  .update(JSON.stringify(assets))
  .digest("hex")
  .slice(0, 16);
await fs.writeFile(
  path.join(root, "offline-manifest.json"),
  JSON.stringify({ version, engine: build.engine, bytes, assets }),
);
await fs.writeFile(
  path.join(root, "sw.js"),
  (await fs.readFile("public/sw.js", "utf8"))
    .replace("__BUILD_VERSION__", version)
    .replace("__ENGINE_ID__", build.engine.id),
);
console.log(
  JSON.stringify({ offlineVersion: version, assetCount: assets.length, bytes }),
);
