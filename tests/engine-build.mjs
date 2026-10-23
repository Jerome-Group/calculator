import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  generateEngineBuild,
  verifyEngineBuild,
} from "../scripts/engine-build.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await test("source closure is deterministic, complete and sensitive to every input class", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "calculator-build-"));
  try {
    await fs.cp(
      path.join(project, "public/engine"),
      path.join(fixture, "public/engine"),
      { recursive: true, filter: (source) => !source.includes("__pycache__") },
    );
    await fs.mkdir(path.join(fixture, "scripts"));
    for (const name of [
      "scripts/engine-assets.json",
      "scripts/prepare-engine.mjs",
      "scripts/engine-build.mjs",
      "public/compute-worker.js",
    ])
      await fs.copyFile(path.join(project, name), path.join(fixture, name));
    const initial = await generateEngineBuild(fixture);
    assert.deepEqual(
      (await generateEngineBuild(fixture)).engine,
      initial.engine,
    );
    for (const name of [
      "public/compute-worker.js",
      "public/engine/supplemental.py",
      "scripts/engine-build.mjs",
      "scripts/prepare-engine.mjs",
      "public/engine/licenses/Python-3.12.7.txt",
    ]) {
      const file = path.join(fixture, name),
        original = await fs.readFile(file);
      await fs.appendFile(file, "\n");
      assert.notEqual(
        (await generateEngineBuild(fixture)).engine.id,
        initial.engine.id,
        name,
      );
      await fs.writeFile(file, original);
    }
    const pinFile = path.join(fixture, "scripts/engine-assets.json");
    const pinBytes = await fs.readFile(pinFile),
      pins = JSON.parse(pinBytes);
    const lockFile = path.join(fixture, "public/engine/pyodide-lock.json");
    const lockBytes = await fs.readFile(lockFile);
    await fs.appendFile(lockFile, "\n");
    await assert.rejects(
      generateEngineBuild(fixture),
      /Unreviewed engine lock/,
    );
    pins.lockSha256 = digest(await fs.readFile(lockFile));
    await fs.writeFile(pinFile, JSON.stringify(pins));
    assert.notEqual(
      (await generateEngineBuild(fixture)).engine.id,
      initial.engine.id,
      "reviewed lock",
    );
    await fs.writeFile(lockFile, lockBytes);
    await fs.writeFile(pinFile, pinBytes);
    const artifactFile = path.join(fixture, "public/engine/pyodide.js");
    const artifactBytes = await fs.readFile(artifactFile);
    await fs.appendFile(artifactFile, "\n");
    await assert.rejects(
      generateEngineBuild(fixture),
      /Changed engine artifact/,
    );
    pins.lockSha256 = JSON.parse(pinBytes).lockSha256;
    pins.assets.find((asset) => asset.file === "pyodide.js").sha256 = digest(
      await fs.readFile(artifactFile),
    );
    await fs.writeFile(pinFile, JSON.stringify(pins));
    assert.notEqual(
      (await generateEngineBuild(fixture)).engine.id,
      initial.engine.id,
      "pinned runtime",
    );
    await fs.writeFile(artifactFile, artifactBytes);
    await fs.writeFile(pinFile, pinBytes);
    await fs.writeFile(
      path.join(fixture, "public/engine/new_helper.py"),
      "value = 7\n",
    );
    const helper = await generateEngineBuild(fixture);
    assert.notEqual(helper.engine.id, initial.engine.id);
    assert(helper.assets.some((asset) => asset.url.endsWith("/new_helper.py")));
    await fs.rm(path.join(fixture, "public/engine/new_helper.py"));
    const emitted = path.join(fixture, "emitted");
    await fs.cp(initial.directory, emitted, { recursive: true });
    await verifyEngineBuild({ ...initial, directory: emitted });
    await fs.appendFile(
      path.join(emitted, "calculator.py"),
      "\n# emitted mutation\n",
    );
    await assert.rejects(
      verifyEngineBuild({ ...initial, directory: emitted }),
      /Changed emitted engine artifact/,
    );
    await fs.appendFile(path.join(initial.directory, "calculator.py"), "\n");
    await assert.rejects(
      generateEngineBuild(fixture),
      /Changed emitted engine artifact/,
    );
    await fs.rm(path.join(initial.directory, "calculator.py"));
    await assert.rejects(
      generateEngineBuild(fixture),
      /Changed engine artifact inventory/,
    );
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

await test("real generated worker resolves all explicit requests within its immutable root and identifies Ready after imports", async () => {
  const build = await generateEngineBuild();
  const urls = [],
    messages = [],
    writes = [];
  let initialized = false;
  const context = vm.createContext({
    URL,
    Error,
    JSON,
    self: {
      location: {
        href: "https://calculator.test" + build.root + "compute-worker.js",
      },
      postMessage: (message) => {
        if (message.type === "ready") assert(initialized);
        messages.push(message);
      },
    },
    importScripts: (url) => urls.push(url),
    fetch: async (url) => {
      urls.push(String(url));
      return new Response("fixture");
    },
    loadPyodide: async ({ indexURL }) => {
      assert.equal(indexURL, "https://calculator.test" + build.root);
      return {
        loadPackage: async (packages) =>
          assert.deepEqual([...packages], ["sympy", "scipy"]),
        unpackArchive() {},
        FS: { writeFile: (file) => writes.push(file) },
        runPythonAsync: async (code) => {
          assert.equal(code, "from calculator import compute_json");
          initialized = true;
        },
      };
    },
  });
  vm.runInContext(
    await fs.readFile(path.join(build.directory, "compute-worker.js"), "utf8"),
    context,
  );
  await vm.runInContext("ready", context);
  assert(
    urls.every((url) => url.startsWith("https://calculator.test" + build.root)),
  );
  assert.equal(
    writes.length,
    build.assets.filter((asset) => asset.url.endsWith(".py")).length,
  );
  assert.equal(messages.at(-1).engineId, build.engine.id);
  assert.equal(messages.at(-1).protocol, 1);
  assert(!urls.some((url) => new URL(url).pathname.startsWith("/engine/")));
});
