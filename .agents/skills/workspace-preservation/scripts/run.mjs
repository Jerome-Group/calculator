import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { verifierPaths } from "./verifier.mjs";
const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(skill, "../../..");
const output = path.join(
  root,
  "outputs/workspace-preservation",
  process.argv.includes("--mutations") ? "mutations" : "check",
  new Date().toISOString().replaceAll(":", "").replaceAll(".", "") +
    "-" +
    process.pid,
);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "../latest.json"),
  JSON.stringify({ evidence: output }) + "\n",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const coverage = JSON.parse(
  await fs.readFile(path.join(skill, "coverage.json"), "utf8"),
);
const sourceFiles = [
  "components/calculator/Calculator.tsx",
  "components/calculator/CalculatorGate.tsx",
  "lib/calculator/sync.ts",
  "lib/calculator/storage.ts",
  "lib/calculator/drafts.ts",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    Object.keys(coverage.files).map(async (file) => [
      file,
      hash(await fs.readFile(path.join(root, file))),
    ]),
  ),
);
function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 12 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.signal)
    throw result.error || Error(`Process ended with ${result.signal}`);
  return result;
}
async function scenarios(name, group, sourceRoot = root) {
  const result = execute(
    process.execPath,
    [path.join(skill, "scripts/scenarios.mjs"), group],
    { env: { ...process.env, WORKSPACE_SOURCE_ROOT: sourceRoot } },
  );
  await fs.writeFile(path.join(output, name + ".json"), result.stdout);
  await fs.writeFile(path.join(output, name + ".stderr.txt"), result.stderr);
  const records = JSON.parse(result.stdout);
  if (records.some((record) => record.error))
    throw Error(`${name} has a harness error. Read its evidence.`);
  return { exit: result.status, records };
}
const mutations = [
  {
    name: "committed-stage-removed",
    group: "stage",
    file: sourceFiles[0],
    before:
      "if (state && mounted.current) saveLease.stageCommittedWorkspace(state);",
    after: "void state;",
    property: "latest-committed-guard-and-export",
  },
  {
    name: "pagehide-not-saved",
    group: "pagehide",
    file: sourceFiles[0],
    before: 'window.addEventListener("pagehide", flushSave);',
    after: "void flushSave;",
    property: "committed-preserved",
  },
  {
    name: "mount-lease-removed",
    group: "epoch",
    file: sourceFiles[0],
    before: " || !saveLease.isCurrent()",
    after: "",
    property: "stale-mount-inert",
  },
  {
    name: "ack-snapshot-check-removed",
    group: "ack",
    file: sourceFiles[4],
    before:
      "if (covered && JSON.stringify(draft.state) === JSON.stringify(state))",
    after: "if (covered)",
    property: "acknowledgement-matches",
  },
  {
    name: "response-epoch-check-removed",
    group: "response",
    file: sourceFiles[2],
    before:
      "const stillCurrent = () =>\n    user?.id === owner && generation === accountGeneration;",
    after: "const stillCurrent = () => true;",
    property: "stale-response-inert",
  },
];
const drift = [];
for (const [file, expected] of Object.entries(coverage.files)) {
  if (hash(await fs.readFile(path.join(root, file))) !== expected)
    drift.push(file);
}
const report = {
  syncCommit: coverage.syncCommit,
  sourceHashes,
  verificationHashes: Object.fromEntries(
    await Promise.all(
      (await fs.readdir(skill, { recursive: true }))
        .filter((file) => /\.(mjs|tla|cfg|md|json)$/.test(file))
        .sort()
        .map(async (file) => [
          file,
          hash(await fs.readFile(path.join(skill, file))),
        ]),
    ),
  ),
  drift,
  node: process.version,
};
if (process.argv.includes("--mutations")) {
  report.mutations = [];
  for (const mutation of mutations) {
    const clean = await scenarios(mutation.name + "-clean", mutation.group);
    if (clean.exit !== 0 || clean.records.some((record) => !record.passed))
      throw Error(`${mutation.name}: clean source already fails this check`);
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "calculator-formal-"),
    );
    try {
      await fs.mkdir(path.join(temporary, "lib"), { recursive: true });
      await fs.cp(
        path.join(root, "lib/calculator"),
        path.join(temporary, "lib/calculator"),
        { recursive: true },
      );
      for (const file of [
        sourceFiles[0],
        sourceFiles[1],
        "tests/component-harness.mjs",
        "tests/resolve-types.mjs",
      ]) {
        await fs.mkdir(path.dirname(path.join(temporary, file)), {
          recursive: true,
        });
        await fs.copyFile(path.join(root, file), path.join(temporary, file));
      }
      await fs.writeFile(
        path.join(temporary, "package.json"),
        '{"type":"module"}',
      );
      await fs.symlink(
        await fs.realpath(path.join(root, "node_modules")),
        path.join(temporary, "node_modules"),
        "dir",
      );
      const target = path.join(temporary, mutation.file);
      const source = await fs.readFile(target, "utf8");
      if (source.split(mutation.before).length !== 2)
        throw Error(`${mutation.name}: mutation anchor drifted`);
      const changed = source.replace(mutation.before, mutation.after);
      await fs.writeFile(target, changed);
      const broken = await scenarios(
        mutation.name + "-broken",
        mutation.group,
        temporary,
      );
      const killed =
        broken.exit === 1 &&
        broken.records.some(
          (record) => record.property === mutation.property && !record.passed,
        );
      report.mutations.push({
        ...mutation,
        sourceSha256: hash(changed),
        killed,
      });
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  report.passed =
    !drift.length && report.mutations.every((mutation) => mutation.killed);
} else {
  report.verifier = await verifierPaths();
  report.models = [];
  for (const config of ["preservation", "guards"]) {
    const result = execute(report.verifier.java, [
      "-XX:+UseParallelGC",
      "-cp",
      report.verifier.jar,
      "tlc2.TLC",
      "-workers",
      "1",
      "-config",
      path.join(skill, "model", config + ".cfg"),
      "-metadir",
      path.join(output, config + "-states"),
      path.join(skill, "model/Workspace.tla"),
    ]);
    await fs.writeFile(
      path.join(output, config + "-tlc.txt"),
      result.stdout + result.stderr,
    );
    if (result.status !== 0 && !/Invariant \w+ is violated/.test(result.stdout))
      throw Error(`${config}: TLC failed without a property counterexample`);
    report.models.push({
      config,
      exit: result.status,
      passed: result.status === 0,
    });
  }
  report.code = await scenarios("actual-code", "all");
  report.passed =
    !drift.length &&
    report.models.every((model) => model.passed) &&
    report.code.exit === 0;
}
await fs.writeFile(
  path.join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      evidence: output,
      drift,
      models: report.models,
      mutations: report.mutations?.map(({ name, killed }) => ({
        name,
        killed,
      })),
      codeFailures: report.code?.records.filter((record) => !record.passed),
    },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
