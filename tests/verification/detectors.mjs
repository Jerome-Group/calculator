import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = process.env.CALCULATOR_ROOT || process.cwd();
const caseIndex = process.argv.indexOf("--case");
const chosen = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
const checks = [];
function run(file, args, env = {}) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, CALCULATOR_ROOT: root, ...env },
  });
  let parsed;
  for (const line of result.stdout?.split("\n") || [])
    if (line.startsWith('{"schemaVersion"')) {
      try {
        parsed = JSON.parse(line);
      } catch {}
    }
  return {
    exitCode: result.status,
    result: parsed,
    runnerError: result.error?.message,
  };
}
function add(id, pass, evidence) {
  checks.push({ id, status: pass ? "pass" : "fail", evidence });
}
if (!chosen || chosen === "math.scalar") {
  const fixture = "form.matrix_inverse.default";
  const original = run(root + "/tests/maths-oracle.mjs", [
    "--fixture",
    fixture,
  ]);
  const mutant = run(root + "/tests/maths-oracle.mjs", ["--fixture", fixture], {
    CALCULATOR_MUTATE_RESULT: fixture,
  });
  const restored = run(root + "/tests/maths-oracle.mjs", [
    "--fixture",
    fixture,
  ]);
  add("math.scalar.original", original.exitCode === 0, original);
  add(
    "math.scalar.mutant",
    mutant.exitCode === 1 &&
      mutant.result?.checks.some(
        (c) => c.id === fixture && c.status === "fail",
      ),
    mutant,
  );
  add("math.scalar.restored", restored.exitCode === 0, restored);
}
if (!chosen || chosen === "catalogue.mapping") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calculator-detector-"));
  try {
    for (const dir of ["docs", "tests/fixtures", "lib/calculator", "scripts"])
      fs.mkdirSync(temp + "/" + dir, { recursive: true });
    for (const file of [
      "docs/verification-map.json",
      "tests/fixtures/maths-defaults.json",
      "tests/fixtures/maths-choices.json",
      "tests/fixtures/maths-invalid.json",
      "tests/fixtures/menu-math.json",
      "lib/calculator/catalog.ts",
      "scripts/verify.mjs",
      "scripts/verification-contract.mjs",
      "scripts/verification-coverage.mjs",
      "scripts/verification-browser.mjs",
      "scripts/verification-source-provenance.mjs",
      "scripts/verification-runner.mjs",
    ])
      fs.copyFileSync(root + "/" + file, temp + "/" + file);
    const mapFile = temp + "/docs/verification-map.json",
      map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
    fs.symlinkSync(root + "/node_modules", temp + "/node_modules", "dir");
    for (const file of new Set(map.controls.map((row) => row.source.file))) {
      fs.mkdirSync(path.dirname(temp + "/" + file), { recursive: true });
      fs.copyFileSync(root + "/" + file, temp + "/" + file);
    }
    const original = run(temp + "/scripts/verify.mjs", ["coverage", "--json"], {
      CALCULATOR_ROOT: temp,
    });
    const missing = map.surfaces.pop();
    fs.writeFileSync(mapFile, JSON.stringify(map));
    const mutant = run(temp + "/scripts/verify.mjs", ["coverage", "--json"], {
      CALCULATOR_ROOT: temp,
    });
    map.surfaces.push(missing);
    fs.writeFileSync(mapFile, JSON.stringify(map));
    const restored = run(temp + "/scripts/verify.mjs", ["coverage", "--json"], {
      CALCULATOR_ROOT: temp,
    });
    add("mapping.original", original.exitCode === 0, original);
    add(
      "mapping.mutant",
      mutant.exitCode === 1 &&
        mutant.result?.checks.some(
          (c) => c.id === "source." + missing.id && c.status === "fail",
        ),
      mutant,
    );
    add("mapping.restored", restored.exitCode === 0, restored);
    const control = map.controls.find((row) => row.id === "control.009");
    const originalLine = control.source.line;
    control.source.line = 948;
    fs.writeFileSync(mapFile, JSON.stringify(map));
    const stale = run(temp + "/scripts/verify.mjs", ["coverage", "--json"], {
      CALCULATOR_ROOT: temp,
    });
    add(
      "control-location.mutant",
      stale.exitCode === 1 &&
        stale.result?.checks.some(
          (check) =>
            check.id === "source.control.control.009" &&
            check.status === "fail",
        ),
      stale,
    );
    control.source.line = originalLine;
    fs.writeFileSync(mapFile, JSON.stringify(map));
    const current = run(temp + "/scripts/verify.mjs", ["coverage", "--json"], {
      CALCULATOR_ROOT: temp,
    });
    add("control-location.restored", current.exitCode === 0, current);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (!chosen || chosen === "evidence.stale") {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "calculator-evidence-detector-"),
  );
  try {
    const artifact = temp + "/screenshot.png";
    fs.writeFileSync(artifact, "fixture pixels");
    const evidence = temp + "/browser.json";
    fs.writeFileSync(
      evidence,
      JSON.stringify({
        schemaVersion: 1,
        kind: "browser-runtime",
        revision: "stale",
        sourceFingerprint: "stale",
        buildFingerprint: "0".repeat(64),
        completedAt: new Date().toISOString(),
        status: "pass",
        checks: [{ id: "browser.form.matrix_inverse.default", status: "pass" }],
        artifacts: [{ path: artifact, sha256: "incorrect" }],
      }),
    );
    const result = run(root + "/scripts/verify.mjs", [
      "browser",
      "validate",
      "--evidence",
      evidence,
      "--json",
    ]);
    add(
      "evidence.stale",
      result.exitCode === 1 &&
        result.result?.checks.some(
          (c) => c.id === "revision" && c.status === "fail",
        ),
      result,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (
  chosen &&
  !["math.scalar", "catalogue.mapping", "evidence.stale"].includes(chosen)
)
  add("unknown.case", false, { error: "unknown detector " + chosen });
const report = {
  schemaVersion: 1,
  suite: "detectors",
  status:
    checks.length && checks.every((c) => c.status === "pass") ? "pass" : "fail",
  checks,
  limitations: [
    "These prove math result assertion, catalogue mapping and stale evidence detectors; no browser runtime/offline/security mutation detector claim",
  ],
};
console.log(JSON.stringify(report));
if (process.env.CALCULATOR_RESULT_FILE)
  fs.writeFileSync(
    process.env.CALCULATOR_RESULT_FILE,
    JSON.stringify(report, null, 2),
  );
process.exitCode = report.status === "pass" ? 0 : 1;
