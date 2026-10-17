import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  pnpmInvocation,
  checkPrerequisites,
  runSuite,
} from "../../scripts/verification-runner.mjs";
import { sourceProvenanceChecks } from "./source-provenance.mjs";
import { browserContractChecks } from "./browser-contract.mjs";
import { controlCoverageChecks } from "./control-coverage.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readFixtures,
  readJson,
  validateMap,
} from "../../scripts/verification-contract.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const checks = [];
function check(id, run) {
  try {
    run();
    checks.push({ id, status: "pass" });
  } catch (error) {
    checks.push({ id, status: "fail", error: error.message });
  }
}
function cli(argv, expected, env = {}) {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify.mjs", ...argv, "--json"],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
  assert.equal(result.status, expected, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(
    parsed.schemaVersion,
    ["run", "prove-detectors", "list"].includes(parsed.command) ? 2 : 1,
  );
  assert.equal(parsed.exitCode, expected);
  return parsed;
}
check("cli.help.discovery", () =>
  assert(cli(["--help"], 0).commands.includes("list")),
);
check("cli.unknown.fixture", () =>
  cli(["run", "--suite", "math", "--fixture", "missing"], 2),
);
check("cli.unknown.suite", () => cli(["doctor", "--suite", "missing"], 2));
check("cli.unknown.group", () => cli(["doctor", "--group", "missing"], 2));
check("cli.group.prerequisite-blocked", () => {
  const report = cli(["doctor", "--group", "core"], 3, {
    CALCULATOR_PNPM: root + "/missing-pnpm",
  });
  assert.equal(report.group, "core");
  assert(report.suites.length > 1);
  assert(
    report.suites.some((suite) =>
      suite.checks.some(
        (check) => check.id === "pnpm" && check.status === "blocked",
      ),
    ),
  );
});
check("cli.show.group", () => {
  const report = cli(["show", "core"], 0);
  assert.equal(report.id, "core");
  assert(report.suites.includes("build"));
});
check("cli.show.fixture-group", () => {
  const map = readJson(root + "docs/verification-map.json");
  const grouped = cli(["show", "editor.menu"], 0);
  assert.equal(grouped.id, "editor.menu");
  assert.equal(grouped.kind, "fixture-group");
  assert.deepEqual(
    grouped.fixtures,
    readFixtures(root)
      .filter((fixture) => fixture.surfaceId === grouped.id)
      .map((fixture) => fixture.id),
  );
  assert(grouped.fixtures.includes("editor.menu.integral"));
  assert.deepEqual(grouped.featureIds, ["feature.editor"]);
  assert.deepEqual(
    cli(["show", "form.integrate"], 0).fixtures,
    map.surfaces.find((surface) => surface.id === "form.integrate").fixtures,
  );
  assert.equal(cli(["show", "editor.menu.missing"], 2).status, "error");
});
check("cli.menu.fixture.discovery", () => {
  const fixture = cli(["show", "editor.menu.integral"], 0);
  assert.equal(fixture.request.input, "\\int_3^41\\,\\mathrm{dx}");
  assert.equal(fixture.assertions[0].expected, "1");
  const report = cli(["show", "math"], 0);
  assert(report.fixtures.includes(fixture.id));
  const editor = cli(["show", "feature.editor"], 0);
  assert(editor.fixtures.includes(fixture.id));
  assert(editor.browserScenarioIds.includes("editor.integral-shortcut"));
  assert(editor.browserScenarioIds.includes("editor.vendor-presentation"));
  const map = readJson(root + "docs/verification-map.json");
  const menuFixtures = readFixtures(root).filter(
    (row) => row.surfaceId === "editor.menu",
  );
  for (const row of menuFixtures) {
    assert(report.fixtures.includes(row.id), `${row.id} is runnable in math`);
    assert(
      editor.fixtures.includes(row.id),
      `${row.id} is discoverable in editor`,
    );
    assert(
      map.evidenceSchema.requiredBrowserFixtureIds.includes(
        row.renderedEvidenceId,
      ),
      `${row.id} requires an independently matched rendered outcome`,
    );
  }
  assert(
    map.evidenceSchema.requiredBrowserScenarioIds.includes(
      "editor.vendor-presentation",
    ),
  );
});
check("cli.evidence.metadata", () => {
  const suite = (id) => cli(["show", id], 0);
  assert.deepEqual(suite("format").evidence, [
    "format.stdout.log",
    "format.stderr.log",
  ]);
  assert(suite("math").evidence.includes("math.result.json"));
  assert(suite("detectors").evidence.includes("detectors.result.json"));
  assert.deepEqual(suite("coverage").evidence, [
    "manifest.json suites[].checks",
  ]);
});
check("cli.discovery.summary", () => {
  const report = cli(["list"], 0);
  const map = readJson(root + "docs/verification-map.json");
  assert.equal(report.kind, "verification-discovery-summary");
  for (const field of ["suites", "surfaces", "controls", "routes", "features"])
    assert.deepEqual(
      report[field],
      map[field].map(({ id }) => ({ id })),
    );
  assert(JSON.stringify(report).length < 32768);
});
check("cli.run.summary-retains-evidence", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calculator-summary-"));
  try {
    const report = cli(
      ["run", "--suite", "coverage", "--evidence-dir", temp],
      0,
    );
    const full = readJson(report.manifest);
    assert.equal(report.kind, "verification-run-summary");
    assert.equal(full.schemaVersion, 1);
    assert.equal(full.status, report.status);
    assert.equal(full.sourceFingerprint, report.sourceFingerprint);
    assert(full.suites[0].checks.length > 100);
    assert.equal(report.suites[0].checkCount, full.suites[0].checks.length);
    assert.equal(report.suites[0].nonPassingCheckCount, 0);
    assert.equal(report.suites[0].checks, undefined);
    assert(JSON.stringify(report).length < 4096);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
check("cli.unknown.argument", () => cli(["--unknown"], 2));
check("cli.conflicting.group", () =>
  cli(["run", "--suite", "math", "--group", "core"], 2),
);
check("cli.missing.browser.blocked", () => cli(["browser", "validate"], 3));
check("cli.duplicate.argument", () => cli(["--json"], 2));
check("map.unsupported.version", () =>
  assert.throws(() => validateMap({ schemaVersion: 99 }, [])),
);
check("map.empty.assertions", () => {
  const map = readJson(root + "docs/verification-map.json");
  const fixtures = readFixtures(root);
  fixtures[0].assertions = [];
  assert.throws(() => validateMap(map, fixtures), /Incomplete fixture/);
});
check("map.invalid.groups", () => {
  const map = readJson(root + "docs/verification-map.json");
  for (const groups of [
    undefined,
    null,
    [],
    {},
    { core: [] },
    { core: "math" },
    { core: ["missing-suite"] },
    { core: ["math", "math"] },
    { " ": ["math"] },
  ])
    assert.throws(
      () => validateMap({ ...map, groups }, readFixtures(root)),
      /Invalid verification group/,
    );
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "calculator-empty-group-"),
  );
  try {
    fs.cpSync(root + "tests/fixtures", temp + "/tests/fixtures", {
      recursive: true,
    });
    fs.mkdirSync(temp + "/docs");
    fs.writeFileSync(
      temp + "/docs/verification-map.json",
      JSON.stringify({ ...map, groups: { core: [] } }),
    );
    for (const command of ["doctor", "run"])
      assert.match(
        cli([command, "--group", "core"], 2, { CALCULATOR_ROOT: temp }).error,
        /Invalid verification group/,
      );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
for (const field of ["requiredBrowserFixtureIds", "requiredPhoneModalIds"]) {
  for (const mutation of [
    "missing",
    "empty",
    "duplicate",
    "incomplete",
    "unknown",
  ]) {
    check(`map.${field}.${mutation}`, () => {
      const map = readJson(root + "docs/verification-map.json");
      const required = map.evidenceSchema[field];
      if (mutation === "missing") delete map.evidenceSchema[field];
      if (mutation === "empty") map.evidenceSchema[field] = [];
      if (mutation === "duplicate") required.push(required[0]);
      if (mutation === "incomplete") required.pop();
      if (mutation === "unknown") required[0] = "unknown-obligation";
      assert.throws(
        () => validateMap(map, readFixtures(root)),
        /required inventory/,
      );
    });
  }
}
check("runner.unknown-prerequisite", () => {
  const report = checkPrerequisites(root, {
    prerequisites: ["unchecked-typo"],
  });
  assert.equal(report.status, "blocked");
  assert(
    report.checks.some(
      (row) => row.id === "unchecked-typo" && row.status === "blocked",
    ),
  );
});
check("runner.stale-report", () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "calculator-stale-report-"),
  );
  try {
    fs.writeFileSync(
      path.join(temp, "math.result.json"),
      JSON.stringify({
        schemaVersion: 1,
        status: "pass",
        checks: [{ id: "old", status: "pass" }],
      }),
    );
    const map = {
      suites: [{ id: "math", argv: ["node", "-e", ""], prerequisites: [] }],
    };
    const result = runSuite(root, map, new Map(), "math", temp);
    assert.equal(result.status, "fail");
    assert(!fs.existsSync(path.join(temp, "math.result.json")));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
for (const [id, args, expected] of [
  ["pnpm.silent.success-json", ["--help"], 0],
  ["pnpm.silent.blocked-json", ["browser", "validate"], 3],
  ["pnpm.silent.usage-json", ["--unknown"], 2],
])
  check(id, () => {
    const { executable, prefix } = pnpmInvocation();
    const result = spawnSync(
      executable,
      [...prefix, "--silent", "verify", ...args, "--json"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, expected, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.exitCode, expected);
    assert.equal(result.stderr, "");
  });
checks.push(...sourceProvenanceChecks());
checks.push(...browserContractChecks(root));
checks.push(...controlCoverageChecks(root));
console.log(
  JSON.stringify({
    schemaVersion: 1,
    suite: "verification-cli",
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
  }),
);
if (checks.some((check) => check.status !== "pass")) process.exitCode = 1;
