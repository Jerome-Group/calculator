import { checkBrowserEvidence } from "../../scripts/verification-browser.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  digest,
  sourceIdentity,
  mathContractFingerprint,
} from "../../scripts/verification-contract.mjs";
import {
  checkRuntimeProvenance,
  inspectRuntimeProvenance,
  runtimeArtifactFingerprint,
} from "../../scripts/verification-source-provenance.mjs";

// Disposable Git fixtures exercise lineage ingestion, never browser execution.
export function sourceProvenanceChecks() {
  const checks = [],
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "calculator-provenance-"),
    ),
    root = path.join(directory, "source"),
    original = path.join(directory, "observed-runtime");
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "Synthetic provenance fixture");
  };
  const check = (id, run) => {
    try {
      run();
      checks.push({ id: "provenance." + id, status: "pass" });
    } catch (error) {
      checks.push({
        id: "provenance." + id,
        status: "fail",
        error: error.message,
      });
    }
  };
  fs.mkdirSync(root);
  git("init", "-q");
  git("config", "user.name", "Synthetic fixture");
  git("config", "user.email", "fixture@example.invalid");
  write(path.join(root, ".gitignore"), "dist/\n");
  write(path.join(root, "docs/verification.md"), "Original contract");
  write(path.join(root, "runtime.js"), "Original runtime");
  fs.symlinkSync("runtime.js", path.join(root, "runtime-link"));
  const map = {
    evidenceSchema: {
      requiredBrowserFixtureIds: ["fixture"],
      requiredBrowserScenarioIds: ["scenario"],
      requiredPhoneModalIds: ["modal"],
    },
    controls: [{ id: "control" }],
  };
  write(path.join(root, "docs/verification-map.json"), JSON.stringify(map));
  for (const file of [
    "tests/fixtures/maths-defaults.json",
    "tests/fixtures/maths-choices.json",
    "tests/fixtures/maths-invalid.json",
    "tests/fixtures/menu-math.json",
    "tests/maths-oracle.py",
    "tests/maths-assertions.py",
    "tests/verification/observed-matcher.mjs",
    "tests/verification/latex-observed.py",
    "tests/verification/observed-display.py",
    "scripts/verification-observed.mjs",
  ])
    write(path.join(root, file), "Synthetic contract");
  commit();
  const observed = sourceIdentity(root);
  write(path.join(root, "docs/verification.md"), "Revised evidence contract");
  commit();
  write(
    path.join(root, "dist/client/offline-manifest.json"),
    JSON.stringify({
      assets: [
        {
          url: "/runtime.js",
          sha256: digest("Original compiled runtime"),
          bytes: 25,
        },
      ],
    }),
  );
  write(path.join(root, "dist/client/runtime.js"), "Original compiled runtime");
  fs.cpSync(path.join(root, "dist"), original, { recursive: true });
  const current = sourceIdentity(root),
    evidence = {
      ...current,
      buildFingerprint: digest(
        fs.readFileSync(path.join(original, "client/offline-manifest.json")),
      ),
    };
  evidence.runtimeProvenance = {
    schemaVersion: 1,
    observationRevision: observed.revision,
    observationSourceFingerprint: observed.sourceFingerprint,
    currentRevision: current.revision,
    currentSourceFingerprint: current.sourceFingerprint,
    observationBuildFingerprint: evidence.buildFingerprint,
    observationRuntimeDirectory: original,
    runtimeArtifactFingerprint: runtimeArtifactFingerprint(original),
    changedPaths: [
      {
        path: "docs/verification.md",
        baseSHA256: digest("Original contract"),
        currentSHA256: digest("Revised evidence contract"),
      },
    ],
  };
  const baseline = { ...evidence.runtimeProvenance };
  const evaluate = (candidate = evidence) =>
    inspectRuntimeProvenance(root, candidate, sourceIdentity(root), baseline);
  const mutate = (change) => {
    const candidate = structuredClone(evidence);
    change(candidate.runtimeProvenance);
    assert.equal(evaluate(candidate).valid, false);
  };
  try {
    check("valid-contract-only-with-symlink", () => {
      const result = evaluate();
      assert.equal(result.valid, true, JSON.stringify(result.checks));
      assert.deepEqual(result.observationIdentity, {
        ...observed,
        buildFingerprint: evidence.buildFingerprint,
      });
    });
    check("capture-epoch-refuses-unsupported-lineage", () => {
      const captures = path.join(directory, "captures.json"),
        matcherPath = path.join(directory, "matcher.json"),
        evidencePath = path.join(directory, "evidence.json");
      write(
        captures,
        JSON.stringify({
          schemaVersion: 1,
          ...observed,
          buildFingerprint: evidence.buildFingerprint,
          runtime: "production-build",
          captures: [
            {
              fixtureId: "fixture",
              observed: {
                status: "exact",
                display: { type: "math", latex: "2" },
              },
            },
          ],
        }),
      );
      write(
        matcherPath,
        JSON.stringify({
          schemaVersion: 1,
          kind: "observed-math-match",
          status: "pass",
          mathContractFingerprint: mathContractFingerprint(root),
          captureArtifact: {
            path: captures,
            sha256: digest(fs.readFileSync(captures)),
          },
          checks: [{ id: "fixture", status: "pass" }],
        }),
      );
      const candidate = {
        ...structuredClone(evidence),
        mathMatcher: {
          path: matcherPath,
          sha256: digest(fs.readFileSync(matcherPath)),
        },
      };
      const identityStatus = () => {
        write(evidencePath, JSON.stringify(candidate));
        return checkBrowserEvidence(root, map, evidencePath).checks.find(
          (row) => row.id === "mathMatcher.captureIdentity",
        )?.status;
      };
      assert.equal(identityStatus(), "fail");
      assert.equal(
        checkRuntimeProvenance(root, candidate, sourceIdentity(root)).valid,
        false,
      );
      candidate.runtimeProvenance.observationSourceFingerprint = "0".repeat(64);
      assert.equal(identityStatus(), "fail");
      delete candidate.runtimeProvenance;
      assert.equal(identityStatus(), "fail");
      const unchanged = { ...candidate, ...observed };
      write(evidencePath, JSON.stringify(unchanged));
      assert.equal(
        checkBrowserEvidence(root, map, evidencePath).checks.find(
          (row) => row.id === "revision",
        ).status,
        "fail",
      );
    });
    check("unsupported-production-cohort", () => {
      assert.equal(
        checkRuntimeProvenance(root, evidence, sourceIdentity(root)).valid,
        false,
      );
    });
    check("both-server-artifacts-changed-and-hash-recomputed", () => {
      const a = path.join(root, "dist/server/runtime.js"),
        b = path.join(original, "server/runtime.js");
      write(a, "Injected server");
      write(b, "Injected server");
      const candidate = structuredClone(evidence);
      candidate.runtimeProvenance.runtimeArtifactFingerprint =
        runtimeArtifactFingerprint(original);
      assert.equal(evaluate(candidate).valid, false);
      fs.rmSync(path.join(root, "dist/server"), { recursive: true });
      fs.rmSync(path.join(original, "server"), { recursive: true });
    });
    check("wrong-base-revision", () =>
      mutate((row) => {
        row.observationRevision = "0".repeat(40);
      }),
    );
    check("wrong-base-fingerprint", () =>
      mutate((row) => {
        row.observationSourceFingerprint = "0".repeat(64);
      }),
    );
    check("wrong-current-revision", () =>
      mutate((row) => {
        row.currentRevision = observed.revision;
      }),
    );
    check("wrong-current-fingerprint", () =>
      mutate((row) => {
        row.currentSourceFingerprint = "0".repeat(64);
      }),
    );
    check("wrong-path-hash", () =>
      mutate((row) => {
        row.changedPaths[0].currentSHA256 = "0".repeat(64);
      }),
    );
    check("wrong-base-path-hash", () =>
      mutate((row) => {
        row.changedPaths[0].baseSHA256 = "0".repeat(64);
      }),
    );
    check("original-runtime-must-be-separate", () =>
      mutate((row) => {
        row.observationRuntimeDirectory = path.join(root, "dist");
      }),
    );
    check("missing-changed-path", () =>
      mutate((row) => {
        row.changedPaths = [];
      }),
    );
    check("caller-whitelist-cannot-expand", () =>
      mutate((row) => {
        row.changedPaths.push({
          path: "runtime.js",
          baseSHA256: digest("Original runtime"),
          currentSHA256: digest("Original runtime"),
        });
      }),
    );
    check("wrong-build-fingerprint", () =>
      mutate((row) => {
        row.observationBuildFingerprint = "0".repeat(64);
      }),
    );
    check("wrong-runtime-tree-fingerprint", () =>
      mutate((row) => {
        row.runtimeArtifactFingerprint = "0".repeat(64);
      }),
    );
    check("changed-runtime-artifact", () => {
      const file = path.join(root, "dist/client/runtime.js");
      write(file, "Tampered runtime");
      assert.equal(evaluate().valid, false);
      write(file, "Original compiled runtime");
      assert.equal(evaluate().valid, true);
    });
    check("both-runtime-trees-tampered", () => {
      const currentFile = path.join(root, "dist/client/runtime.js"),
        observedFile = path.join(original, "client/runtime.js");
      write(currentFile, "Both tampered");
      write(observedFile, "Both tampered");
      const candidate = structuredClone(evidence);
      candidate.runtimeProvenance.runtimeArtifactFingerprint =
        runtimeArtifactFingerprint(original);
      assert.equal(evaluate(candidate).valid, false);
      write(currentFile, "Original compiled runtime");
      write(observedFile, "Original compiled runtime");
    });
    check("required-id-removal", () => {
      const file = path.join(root, "docs/verification-map.json"),
        removed = structuredClone(map);
      removed.evidenceSchema.requiredBrowserScenarioIds = [];
      write(file, JSON.stringify(removed));
      commit();
      const identity = sourceIdentity(root),
        candidate = structuredClone(evidence);
      Object.assign(candidate, identity);
      Object.assign(candidate.runtimeProvenance, {
        currentRevision: identity.revision,
        currentSourceFingerprint: identity.sourceFingerprint,
      });
      candidate.runtimeProvenance.changedPaths.push({
        path: "docs/verification-map.json",
        baseSHA256: digest(JSON.stringify(map)),
        currentSHA256: digest(JSON.stringify(removed)),
      });
      assert.equal(evaluate(candidate).valid, false);
      git("reset", "--hard", current.revision);
    });
    check("extra-runtime-artifact", () => {
      const file = path.join(root, "dist/client/extra.js");
      write(file, "Extra runtime");
      assert.equal(evaluate().valid, false);
      fs.unlinkSync(file);
    });
    check("runtime-artifact-symlink", () => {
      const file = path.join(root, "dist/client/link");
      fs.symlinkSync("runtime.js", file);
      assert.equal(evaluate().valid, false);
      fs.unlinkSync(file);
    });
    check("dirty-tracked-source", () => {
      const file = path.join(root, "runtime.js");
      write(file, "Dirty runtime");
      assert.equal(evaluate().valid, false);
      write(file, "Original runtime");
    });
    check("dirty-untracked-source", () => {
      const file = path.join(root, "new-runtime.js");
      write(file, "Untracked runtime");
      assert.equal(evaluate().valid, false);
      fs.unlinkSync(file);
    });
    check("disallowed-committed-runtime-change", () => {
      write(path.join(root, "runtime.js"), "Changed runtime");
      commit();
      const changed = sourceIdentity(root),
        candidate = structuredClone(evidence);
      Object.assign(candidate, changed);
      Object.assign(candidate.runtimeProvenance, {
        currentRevision: changed.revision,
        currentSourceFingerprint: changed.sourceFingerprint,
      });
      candidate.runtimeProvenance.changedPaths.push({
        path: "runtime.js",
        baseSHA256: digest("Original runtime"),
        currentSHA256: digest("Changed runtime"),
      });
      assert.equal(evaluate(candidate).valid, false);
      git("reset", "--hard", current.revision);
    });
    check("non-ancestor-base", () => {
      git("checkout", "--orphan", "unrelated");
      write(path.join(root, "docs/verification.md"), "Unrelated contract");
      commit();
      const unrelated = sourceIdentity(root);
      git("checkout", "-q", current.revision);
      mutate((row) => {
        row.observationRevision = unrelated.revision;
        row.observationSourceFingerprint = unrelated.sourceFingerprint;
      });
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return checks;
}
