import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const digest = (data) => createHash("sha256").update(data).digest("hex");
export const enginePackages = ["sympy", "scipy"];

async function ownedFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__pycache__") continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(
        ...(await ownedFiles(path.join(directory, entry.name), relative + "/")),
      );
    else if (
      entry.isFile() &&
      (relative.endsWith(".py") ||
        relative.startsWith("licenses/") ||
        ["package.json", "pyodide-lock.json"].includes(relative))
    )
      files.push(relative);
  }
  return files.sort();
}

export async function generateEngineBuild(project = projectRoot) {
  const source = path.join(project, "public/engine");
  const pinsBytes = await fs.readFile(
    path.join(project, "scripts/engine-assets.json"),
  );
  const pins = JSON.parse(pinsBytes);
  const lockBytes = await fs.readFile(path.join(source, "pyodide-lock.json"));
  if (digest(lockBytes) !== pins.lockSha256)
    throw Error("Unreviewed engine lock");
  const lock = JSON.parse(lockBytes);
  const pinned = new Map(pins.assets.map((asset) => [asset.file, asset]));
  const selected = new Set(await ownedFiles(source));
  for (const asset of pins.assets) {
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(asset.file) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    )
      throw Error("Invalid engine build pin");
    const data = await fs.readFile(path.join(source, asset.file));
    if (digest(data) !== asset.sha256)
      throw Error("Changed engine artifact " + asset.file);
    selected.add(asset.file);
  }
  const seen = new Set();
  function includePackage(name) {
    if (seen.has(name)) return;
    seen.add(name);
    const dependency = lock.packages[name];
    if (
      !dependency ||
      pinned.get(dependency.file_name)?.sha256 !== dependency.sha256
    )
      throw Error("Unpinned engine package " + name);
    dependency.depends.forEach(includePackage);
  }
  enginePackages.forEach(includePackage);
  const runtime = new Map();
  const inputs = [];
  const addInput = (name, data) =>
    inputs.push({ path: name, sha256: digest(data) });
  for (const name of [...selected].sort()) {
    const data = await fs.readFile(path.join(source, name));
    runtime.set(name, data);
    addInput("public/engine/" + name, data);
  }
  for (const name of [
    "scripts/engine-build.mjs",
    "scripts/prepare-engine.mjs",
    "scripts/engine-assets.json",
    "public/compute-worker.js",
  ]) {
    addInput(name, await fs.readFile(path.join(project, name)));
  }
  inputs.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const engine = {
    id: digest(JSON.stringify({ schema: 1, protocol: 1, inputs })),
    protocol: 1,
  };
  const root = "/engine-build/" + engine.id + "/";
  const template = await fs.readFile(
    path.join(project, "public/compute-worker.js"),
    "utf8",
  );
  const python = [...selected].filter((name) => name.endsWith(".py")).sort();
  const worker = template
    .replace("__ENGINE_BUILD__", JSON.stringify(engine))
    .replace("__ENGINE_PACKAGES__", JSON.stringify(enginePackages))
    .replace("__ENGINE_PYTHON__", JSON.stringify(python));
  if (/__ENGINE_/.test(worker)) throw Error("Unresolved engine template input");
  runtime.set("compute-worker.js", Buffer.from(worker));
  const assets = [...runtime]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([name, data]) => ({
      url: root + name,
      sha256: digest(data),
      bytes: data.length,
    }));
  const directory = path.join(project, "public", root);
  const exists = await fs.stat(directory).then(
    () => true,
    (error) => {
      if (error.code !== "ENOENT") throw error;
      return false;
    },
  );
  if (exists) await verifyEngineBuild({ directory, root, assets });
  else {
    const staging = path.join(
      project,
      ".sites-runtime/engine-build-" + randomUUID(),
    );
    try {
      for (const [name, data] of runtime) {
        const target = path.join(staging, name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data, { flag: "wx" });
      }
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.rename(staging, directory);
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
  return { engine, root, directory, assets, inputs };
}

export async function verifyEngineBuild({ directory, root, assets }) {
  const entries = await fs.readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const actual = entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => {
      if (!entry.isFile()) throw Error("Invalid engine artifact type");
      return path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/");
    })
    .sort();
  const expected = assets.map((asset) => asset.url.slice(root.length)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error("Changed engine artifact inventory");
  for (const asset of assets) {
    const data = await fs.readFile(
      path.join(directory, asset.url.slice(root.length)),
    );
    if (data.length !== asset.bytes || digest(data) !== asset.sha256)
      throw Error("Changed emitted engine artifact " + asset.url);
  }
}
