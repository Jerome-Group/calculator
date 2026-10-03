import assert from "node:assert/strict";
import { pnpmInvocation } from "../../scripts/verification-runner.mjs";
import { browserContractChecks } from "./browser-contract.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateMap } from "../../scripts/verification-contract.mjs";
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
  assert.equal(parsed.schemaVersion, 1);
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
check("cli.evidence.metadata", () => {
  const report = cli(["list"], 0);
  const suite = (id) => report.suites.find((row) => row.id === id);
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
check("cli.unknown.argument", () => cli(["--unknown"], 2));
check("cli.conflicting.group", () =>
  cli(["run", "--suite", "math", "--group", "core"], 2),
);
check("cli.missing.browser.blocked", () => cli(["browser", "validate"], 3));
check("cli.duplicate.argument", () => cli(["--json"], 2));
check("map.unsupported.version", () =>
  assert.throws(() => validateMap({ schemaVersion: 99 }, [])),
);
check("map.empty.assertions", () =>
  assert.throws(() =>
    validateMap({ schemaVersion: 1, suites: [], surfaces: [] }, [
      {
        id: "fixture",
        request: { operation: "simplify" },
        expectedStatus: "exact",
        assertions: [],
      },
    ]),
  ),
);
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
checks.push(...browserContractChecks(root));
console.log(
  JSON.stringify({
    schemaVersion: 1,
    suite: "verification-cli",
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
  }),
);
if (checks.some((check) => check.status !== "pass")) process.exitCode = 1;
