import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const maximumBytes = 25 * 1024 * 1024;
const digest = (data) => createHash("sha256").update(data).digest("hex");

async function download(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Engine download failed: ${response.status}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length >= maximumBytes)
      throw new Error("Engine asset exceeds size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Cached artifacts are verified too: a prepared checkout must not mask tampering.
export async function prepareEngine({
  destination,
  npmRoot,
  assets,
  fetchArtifact = download,
  stagingDirectory = path.join(
    path.dirname(destination),
    ".engine-preparation",
  ),
}) {
  await fs.mkdir(destination, { recursive: true });
  for (const asset of assets) {
    if (
      !/^[a-zA-Z0-9_.-]+$/.test(asset.file) ||
      asset.file === "." ||
      asset.file === ".." ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      Boolean(asset.npm) === Boolean(asset.url) ||
      (asset.npm && asset.npm !== asset.file)
    )
      throw new Error("Invalid engine artifact pin");
    const target = path.join(destination, asset.file);
    let data;
    try {
      data = await fs.readFile(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (data) {
      if (digest(data) !== asset.sha256)
        throw new Error(`Corrupt cached engine asset: ${asset.file}`);
      continue;
    }
    data = asset.npm
      ? await fs.readFile(path.join(npmRoot, asset.npm))
      : await fetchArtifact(asset.url);
    if (data.length >= maximumBytes || digest(data) !== asset.sha256)
      throw new Error(`Engine artifact verification failed: ${asset.file}`);
    await fs.mkdir(stagingDirectory, { recursive: true });
    const temporary = path.join(stagingDirectory, `${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o644 });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
}

async function main() {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const npmRoot = path.join(project, "node_modules/pyodide");
  const destination = path.join(project, "public/engine");
  const manifest = JSON.parse(
    await fs.readFile(new URL("engine-assets.json", import.meta.url), "utf8"),
  );
  const installed = JSON.parse(
    await fs.readFile(path.join(npmRoot, "package.json"), "utf8"),
  );
  if (installed.version !== manifest.pyodideVersion)
    throw new Error("Install the pinned Pyodide dependency before preparation");
  for (const base of [npmRoot, destination]) {
    const lock = await fs.readFile(path.join(base, "pyodide-lock.json"));
    if (digest(lock) !== manifest.lockSha256)
      throw new Error("Pyodide package lock differs from the reviewed pin");
  }
  await prepareEngine({
    destination,
    npmRoot,
    assets: manifest.assets,
    stagingDirectory: path.join(project, ".sites-runtime/engine-artifacts"),
  });
  console.log(`Verified ${manifest.assets.length} pinned engine artifacts`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
