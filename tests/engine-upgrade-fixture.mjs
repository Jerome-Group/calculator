import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const project = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = path.join(project, "outputs");
await fs.mkdir(outputRoot, { recursive: true });
const fixture = await fs.mkdtemp(path.join(outputRoot, "fixture-path-"));
const refused = /must remain in ignored root outputs/;
const capture = (output) =>
  spawnSync(
    process.execPath,
    [
      "scripts/engine-upgrade-fixture.mjs",
      "capture",
      "--project",
      path.join(fixture, "missing-project"),
      "--origin",
      "http://127.0.0.1:1",
      "--output",
      output,
    ],
    { cwd: project, encoding: "utf8" },
  );
try {
  await test("captured private files stay beneath the ignored checkout outputs", async () => {
    for (const output of [
      path.join(project, "public/outputs/probe"),
      path.join(project, "scripts/outputs/probe"),
      path.join(fixture, "../..", "public/outputs/probe"),
      path.join(project, "outputs"),
    ]) {
      const result = capture(output);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, refused, output);
    }
    const result = capture(path.join(fixture, "new/nested/capture"));
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, refused);
    assert.match(result.stderr, /ENOENT.*offline-manifest/);
    assert.deepEqual(await fs.readdir(fixture), []);
  });
  await test("private paths reject existing symlink escapes", async () => {
    const escape = path.join(fixture, "escape");
    await fs.symlink(path.join(project, "public"), escape, "dir");
    for (const output of [escape, path.join(escape, "new/nested/capture")]) {
      const result = capture(output);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, refused, output);
    }
    assert.deepEqual(await fs.readdir(fixture), ["escape"]);
  });
  await test("private paths reject dangling file and directory symlinks", async () => {
    const outside = path.join(project, "public", path.basename(fixture));
    const file = path.join(fixture, "trace.jsonl");
    const directory = path.join(fixture, "dangling-directory");
    await fs.symlink(outside + ".jsonl", file, "file");
    await fs.symlink(outside, directory, "dir");
    for (const output of [file, path.join(directory, "new/capture")]) {
      const result = capture(output);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, refused, output);
    }
    await assert.rejects(fs.lstat(outside), { code: "ENOENT" });
    await assert.rejects(fs.lstat(outside + ".jsonl"), { code: "ENOENT" });
  });
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
