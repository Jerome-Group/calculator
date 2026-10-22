import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  checkControlCoverage,
  checkScenarioCoverage,
  controlSourceSites,
} from "../../scripts/verification-coverage.mjs";

export function controlCoverageChecks(root) {
  const controls = JSON.parse(
    fs.readFileSync(root + "/docs/verification-map.json", "utf8"),
  ).controls;
  const checks = [];
  function check(id, run) {
    try {
      run();
      checks.push({ id, status: "pass" });
    } catch (error) {
      checks.push({ id, status: "fail", error: error.message });
    }
  }
  const passes = (rows) =>
    checkControlCoverage(root, rows).every((check) => check.status === "pass");
  const rejected = (rows, id) =>
    checkControlCoverage(root, rows).some(
      (check) => check.id === id && check.status === "fail",
    );
  const map = JSON.parse(
    fs.readFileSync(root + "/docs/verification-map.json", "utf8"),
  );
  const scenariosPass = (value) =>
    checkScenarioCoverage(value).every((row) => row.status === "pass");
  check("scenarios.current-owners", () => assert(scenariosPass(map)));
  for (const [id, mutate] of [
    [
      "missing-required",
      (value) => delete value.evidenceSchema.requiredBrowserScenarioIds,
    ],
    ["missing-schema", (value) => delete value.evidenceSchema],
    [
      "empty-required",
      (value) => (value.evidenceSchema.requiredBrowserScenarioIds = []),
    ],
    ["missing-features", (value) => delete value.features],
    ["empty-features", (value) => (value.features = [])],
    [
      "invalid-required-type",
      (value) =>
        (value.evidenceSchema.requiredBrowserScenarioIds = "graph-table"),
    ],
    ["invalid-features-type", (value) => (value.features = {})],
    ["invalid-feature-entry", (value) => (value.features = [null])],
  ]) {
    check("scenarios." + id, () => {
      const mutant = structuredClone(map);
      mutate(mutant);
      assert(
        checkScenarioCoverage(mutant).some(
          (row) =>
            row.id === "source.scenarios.inventory" && row.status === "fail",
        ),
      );
    });
  }

  check("scenarios.orphan-required", () => {
    const mutant = structuredClone(map);
    const required = mutant.evidenceSchema.requiredBrowserScenarioIds[0];
    const originalFeatures = structuredClone(mutant.features);
    for (const feature of mutant.features)
      feature.browserScenarioIds = (feature.browserScenarioIds || []).filter(
        (id) => id !== required,
      );
    assert(
      checkScenarioCoverage(mutant).some(
        (row) =>
          row.id === "source.scenario.owner." + required &&
          row.status === "fail",
      ),
    );
    mutant.features = originalFeatures;
    assert(scenariosPass(mutant));
  });
  check("scenarios.duplicate-required", () => {
    const mutant = structuredClone(map);
    mutant.evidenceSchema.requiredBrowserScenarioIds.push(
      mutant.evidenceSchema.requiredBrowserScenarioIds[0],
    );
    assert(
      checkScenarioCoverage(mutant).some(
        (row) => row.id === "source.scenarios.ids" && row.status === "fail",
      ),
    );
  });
  check("scenarios.shared-owner", () => {
    const mutant = structuredClone(map);
    const required = mutant.evidenceSchema.requiredBrowserScenarioIds[0];
    const other = mutant.features.find(
      (feature) => !feature.browserScenarioIds?.includes(required),
    );
    other.browserScenarioIds = [...(other.browserScenarioIds || []), required];
    assert(scenariosPass(mutant));
  });
  check("scenarios.custom-unrequired", () => {
    const mutant = structuredClone(map);
    mutant.features[0].browserScenarioIds.push("private.custom-observation");
    assert(scenariosPass(mutant));
  });
  check("controls.current-ast", () => assert(passes(controls)));
  check("controls.stale-line", () => {
    const mutant = structuredClone(controls);
    mutant.find((row) => row.id === "control.009").source.line = 948;
    assert(rejected(mutant, "source.control.control.009"));
  });
  check("controls.wrong-same-kind-site", () => {
    const mutant = structuredClone(controls);
    const columns = mutant.find((row) => row.id === "control.129");
    const cells = mutant.find((row) => row.id === "control.130");
    [columns.source.line, cells.source.line] = [
      cells.source.line,
      columns.source.line,
    ];
    assert(rejected(mutant, "source.control.control.129"));
  });
  check("controls.duplicate-id", () => {
    const mutant = structuredClone(controls);
    mutant[0].id = mutant[1].id;
    assert(rejected(mutant, "source.controls.ids"));
  });
  check("controls.missing-source-file", () => {
    const mutant = controls.filter(
      (row) => !row.source.file.endsWith("RecoveryBackups.tsx"),
    );
    assert(
      rejected(
        mutant,
        "source.controls.inventory.components/calculator/RecoveryBackups.tsx",
      ),
    );
  });
  check("controls.wrong-kind", () => {
    const mutant = structuredClone(controls);
    mutant[0].kind = "input";
    assert(rejected(mutant, "source.control." + mutant[0].id));
  });
  check("controls.literal-whitespace", () => {
    for (const [before, after] of [
      ['"a  b"', '"a b"'],
      ["`a  b`", "`a b`"],
    ]) {
      const signature = (literal) =>
        controlSourceSites(
          "literal.tsx",
          `const Control = <input onChange={() => use(${literal})} />;`,
        )[0].signature;
      assert.notEqual(signature(before), signature(after));
    }
  });
  check("controls.added-source-file", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calculator-controls-"));
    try {
      fs.mkdirSync(temp + "/components", { recursive: true });
      fs.cpSync(
        root + "/components/calculator",
        temp + "/components/calculator",
        { recursive: true },
      );
      fs.writeFileSync(
        temp + "/components/calculator/UnmappedControl.tsx",
        "export const Control = () => <button onClick={() => {}}>New action</button>;",
      );
      assert(
        checkControlCoverage(temp, controls).some(
          (row) =>
            row.id ===
              "source.controls.inventory.components/calculator/UnmappedControl.tsx" &&
            row.status === "fail",
        ),
      );
      fs.writeFileSync(
        temp + "/components/calculator/UnmappedControl.tsx",
        "export const Control = <",
      );
      assert(
        checkControlCoverage(temp, controls).some(
          (row) =>
            row.id ===
              "source.controls.read.components/calculator/UnmappedControl.tsx" &&
            row.status === "fail",
        ),
      );
      fs.unlinkSync(temp + "/components/calculator/UnmappedControl.tsx");
      fs.symlinkSync(
        temp + "/missing.tsx",
        temp + "/components/calculator/UnreadableControl.tsx",
      );
      assert(
        checkControlCoverage(temp, controls).some(
          (row) =>
            row.id ===
              "source.controls.read.components/calculator/UnreadableControl.tsx" &&
            row.status === "fail",
        ),
      );
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
  check("controls.restored", () => assert(passes(controls)));
  check("controls.refresh-file-ownership", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calculator-refresh-"));
    try {
      for (const directory of [
        "components/calculator",
        "docs",
        "scripts",
        "hooks",
      ])
        fs.mkdirSync(path.join(temp, directory), { recursive: true });
      const files = ["First", "Second"].map(
        (name) => "components/calculator/" + name + ".tsx",
      );
      const fixtureControls = files.map((file, index) => {
        const source = `export function Action${index}() {\n  return <button onClick={() => {}}>Action ${index}</button>;\n}\n`;
        fs.writeFileSync(path.join(temp, file), source);
        const { kind, ...site } = controlSourceSites(file, source)[0];
        return {
          id: "control.00" + (index + 1),
          kind,
          label: "Action " + index,
          source: { file, ...site },
        };
      });
      const fixtureMap = path.join(temp, "docs/verification-map.json");
      const write = (rows) =>
        fs.writeFileSync(
          fixtureMap,
          JSON.stringify({ controls: rows }, null, 2),
        );
      write(fixtureControls);
      fs.writeFileSync(
        path.join(temp, "scripts/verification-coverage.mjs"),
        `export { controlSourceSites, checkControlCoverage } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/verification-coverage.mjs")).href)};\n`,
      );
      const git = (...args) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=Verification fixture",
            "-c",
            "user.email=fixture@verification.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=" + path.join(temp, "hooks"),
            ...args,
          ],
          { cwd: temp, encoding: "utf8" },
        );
      git("init", "--quiet", "--initial-branch=main");
      git("add", "components", "docs", "scripts");
      git(
        "commit",
        "--quiet",
        "-m",
        "test: record control ownership fixture\n\nAssisted-by: gpt-6.1-sol xhigh\nCo-authored-by: Codex <noreply@openai.com>",
      );
      const base = git("rev-parse", "HEAD").trim();
      const refresh = (...ids) =>
        spawnSync(
          process.execPath,
          [
            path.join(root, "scripts/refresh-verification-controls.mjs"),
            base,
            ...ids,
          ],
          { cwd: temp, encoding: "utf8" },
        );
      const original = fs.readFileSync(fixtureMap, "utf8");
      const valid = refresh();
      assert.equal(valid.status, 0, valid.stderr);
      assert.deepEqual(JSON.parse(valid.stdout), {
        base,
        updated: 0,
        changed: [],
      });
      assert.equal(fs.readFileSync(fixtureMap, "utf8"), original);
      const swapped = structuredClone(fixtureControls);
      [swapped[0].source.file, swapped[1].source.file] = files.toReversed();
      write(swapped);
      const invalid = fs.readFileSync(fixtureMap, "utf8");
      for (const ids of [[], swapped.map((control) => control.id)]) {
        const rejected = refresh(...ids);
        assert.equal(rejected.status, 1);
        assert.match(
          rejected.stderr,
          /AssertionError \[ERR_ASSERTION\]: control\.001 recorded source file\n/,
        );
        assert.equal(fs.readFileSync(fixtureMap, "utf8"), invalid);
      }
      write(fixtureControls);
      for (const file of files)
        fs.writeFileSync(
          path.join(temp, file),
          "\n" + fs.readFileSync(path.join(temp, file), "utf8"),
        );
      const moved = refresh();
      assert.equal(moved.status, 0, moved.stderr);
      assert.equal(JSON.parse(moved.stdout).updated, 2);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(fixtureMap, "utf8")).controls.map(
          (control) => control.source,
        ),
        fixtureControls.map((control) => ({
          ...control.source,
          line: control.source.line + 1,
        })),
      );
      const updated = fs.readFileSync(fixtureMap, "utf8");
      const repeated = refresh();
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(JSON.parse(repeated.stdout).updated, 0);
      assert.equal(fs.readFileSync(fixtureMap, "utf8"), updated);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
  return checks;
}
