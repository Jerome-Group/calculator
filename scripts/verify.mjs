import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  failure,
  readJson,
  sourceIdentity,
  validateMap,
} from "./verification-contract.mjs";
import { checkCoverage } from "./verification-coverage.mjs";
import { checkBrowserEvidence } from "./verification-browser.mjs";
import { checkPrerequisites, runSuite } from "./verification-runner.mjs";

async function main() {
  const root = process.env.CALCULATOR_ROOT || process.cwd();
  const map = readJson(path.join(root, "docs/verification-map.json"));
  const fixtures = [
    "maths-defaults.json",
    "maths-choices.json",
    "maths-invalid.json",
  ].flatMap(
    (file) => readJson(path.join(root, "tests/fixtures", file)).fixtures,
  );
  const args = process.argv.slice(2),
    flags = new Map(),
    positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags.has(arg)) failure(`Duplicate ${arg}`);
    if (["--json", "--help"].includes(arg)) flags.set(arg, true);
    else if (
      [
        "--suite",
        "--group",
        "--fixture",
        "--evidence-dir",
        "--evidence",
        "--case",
      ].includes(arg)
    ) {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        failure(`Missing ${arg}`);
      flags.set(arg, args[++i]);
    } else if (arg.startsWith("--")) failure(`Unknown ${arg}`);
    else positional.push(arg);
  }
  validateMap(map, fixtures);
  if (
    flags.has("--fixture") &&
    !fixtures.some((fixture) => fixture.id === flags.get("--fixture"))
  )
    failure(`Unknown fixture ${flags.get("--fixture")}`);
  if (flags.has("--suite") && flags.has("--group"))
    failure("Choose --suite or --group");
  if (
    flags.has("--fixture") &&
    !["math", "math-invalid"].includes(flags.get("--suite"))
  )
    failure("--fixture requires --suite math or math-invalid");
  if (
    flags.has("--fixture") &&
    !map.suites
      .find((suite) => suite.id === flags.get("--suite"))
      ?.fixtures.includes(flags.get("--fixture"))
  )
    failure("Fixture does not belong to selected suite");
  if (
    flags.has("--case") &&
    !["math.scalar", "catalogue.mapping", "evidence.stale"].includes(
      flags.get("--case"),
    )
  )
    failure("Unknown detector case");
  if (flags.has("--group") && !Object.hasOwn(map.groups, flags.get("--group")))
    failure(`Unknown group ${flags.get("--group")}`);
  const command = flags.has("--help") ? "help" : positional[0] || "help",
    startedAt = new Date().toISOString();
  if (positional.length > (["show", "browser"].includes(command) ? 2 : 1))
    failure("Unexpected positional argument");
  let report;
  if (command === "help")
    report = { commands: map.commands, examples: map.examples };
  else if (command === "list")
    report = {
      suites: map.suites,
      surfaces: map.surfaces,
      controls: map.controls,
      routes: map.routes,
      features: map.features,
      groups: map.groups,
    };
  else if (command === "show") {
    const id = positional[1];
    report =
      map.suites.find((row) => row.id === id) ||
      map.surfaces.find((row) => row.id === id) ||
      [
        ...(map.controls || []),
        ...(map.features || []),
        ...(map.routes || []),
      ].find((row) => row.id === id) ||
      fixtures.find((row) => row.id === id) ||
      (Object.hasOwn(map.groups, id) ? { id, suites: map.groups[id] } : null);
    if (!report) failure(`Unknown ID ${id}`);
  } else if (command === "doctor") {
    if (
      flags.has("--suite") &&
      !map.suites.some((suite) => suite.id === flags.get("--suite"))
    )
      failure(`Unknown suite ${flags.get("--suite")}`);
    if (flags.has("--group")) {
      const suites = map.groups[flags.get("--group")].map((id) => ({
        id,
        ...checkPrerequisites(
          root,
          map.suites.find((suite) => suite.id === id),
        ),
      }));
      report = {
        ...sourceIdentity(root),
        group: flags.get("--group"),
        suites,
        status: suites.every((suite) => suite.status === "pass")
          ? "pass"
          : "blocked",
      };
    } else
      report = {
        ...sourceIdentity(root),
        ...checkPrerequisites(
          root,
          map.suites.find((suite) => suite.id === flags.get("--suite")),
        ),
      };
  } else if (command === "coverage")
    report = await checkCoverage(root, map, fixtures);
  else if (command === "browser" && positional[1] === "validate")
    report = checkBrowserEvidence(root, map, flags.get("--evidence"));
  else if (command === "browser" && positional[1] === "match")
    report = await (
      await import("./verification-observed.mjs")
    ).reviewBrowserMath(root, flags.get("--evidence"));
  else if (["run", "prove-detectors"].includes(command)) {
    const ids =
      command === "prove-detectors"
        ? ["detectors"]
        : flags.has("--group")
          ? map.groups[flags.get("--group")]
          : flags.has("--suite")
            ? [flags.get("--suite")]
            : null;
    if (!ids) failure("Specify known --suite or --group");
    const evidenceDirectory =
      flags.get("--evidence-dir") ||
      fs.mkdtempSync(path.join(os.tmpdir(), "calculator-verification-"));
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const identity = sourceIdentity(root),
      suites = [];
    for (const id of ids) {
      const result =
        id === "coverage"
          ? { id, ...(await checkCoverage(root, map, fixtures)) }
          : runSuite(root, map, flags, id, evidenceDirectory);
      suites.push(result);
      if (result.status !== "pass") break;
    }
    const completedIdentity = sourceIdentity(root);
    const sourceChanged =
      completedIdentity.revision !== identity.revision ||
      completedIdentity.sourceFingerprint !== identity.sourceFingerprint;
    report = {
      ...identity,
      completedIdentity,
      sourceChanged,
      evidenceDirectory,
      suites,
      status: sourceChanged
        ? "fail"
        : suites.every((suite) => suite.status === "pass")
          ? "pass"
          : suites.some((suite) => suite.status === "blocked")
            ? "blocked"
            : suites.some((suite) => suite.status === "error")
              ? "error"
              : "fail",
      browser: "not-run",
    };
    fs.writeFileSync(
      path.join(evidenceDirectory, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          command,
          startedAt,
          completedAt: new Date().toISOString(),
          ...report,
        },
        null,
        2,
      ),
    );
  } else failure(`Unknown command ${command}`);
  const exitCode =
    report.status === "blocked"
      ? 3
      : report.status === "error"
        ? 4
        : report.status === "fail"
          ? 1
          : 0;
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        command,
        startedAt,
        completedAt: new Date().toISOString(),
        node: process.versions.node,
        ...report,
        exitCode,
      },
      null,
      flags.has("--json") ? 0 : 2,
    ),
  );
  process.exitCode = exitCode;
}
main().catch((error) => {
  const exitCode = error.exitCode || 4;
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      status: exitCode === 3 ? "blocked" : "error",
      exitCode,
      error: error.message,
    }),
  );
  process.exitCode = exitCode;
});
