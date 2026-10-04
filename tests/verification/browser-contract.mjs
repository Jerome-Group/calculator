import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkBrowserEvidence } from "../../scripts/verification-browser.mjs";
import {
  digest,
  sourceIdentity,
  mathContractFingerprint,
} from "../../scripts/verification-contract.mjs";

// Synthetic contract mutations only; never browser execution evidence.
export function browserContractChecks(root) {
  const checks = [],
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "calculator-contract-test-"));
  const captures = path.join(temp, "synthetic-captures.json"),
    report = path.join(temp, "synthetic-matcher.json"),
    file = path.join(temp, "synthetic-manifest.json");
  fs.writeFileSync(
    captures,
    JSON.stringify({
      schemaVersion: 1,
      captures: [
        {
          fixtureId: "form.simplify.default",
          observed: { status: "exact", display: { type: "math", latex: "2" } },
        },
      ],
      syntheticHarness: true,
    }),
  );
  const matcher = {
    schemaVersion: 1,
    kind: "observed-math-match",
    status: "pass",
    mathContractFingerprint: mathContractFingerprint(root),
    captureArtifact: {
      path: captures,
      sha256: digest(fs.readFileSync(captures)),
    },
    checks: [{ id: "form.simplify.default", status: "pass" }],
  };
  fs.writeFileSync(report, JSON.stringify(matcher));
  const map = {
    controls: [{ id: "control.001" }],
    evidenceSchema: {
      requiredBrowserFixtureIds: ["browser.form.simplify.default"],
      requiredBrowserScenarioIds: ["phone-modal"],
      requiredPhoneModalIds: ["finder"],
    },
  };
  const manifest = path.join(root, "dist/client/offline-manifest.json");
  const valid = {
    schemaVersion: 1,
    kind: "browser-runtime",
    ...sourceIdentity(root),
    buildFingerprint: fs.existsSync(manifest)
      ? digest(fs.readFileSync(manifest))
      : "unbuilt",
    startedAt: "fixture-start",
    completedAt: "fixture-end",
    status: "pass",
    origin: "http://localhost:4173",
    viewport: { width: 360, height: 800 },
    browser: "synthetic contract fixture",
    checks: [
      {
        id: "browser.form.simplify.default",
        status: "pass",
        steps: ["fixture"],
        assertions: ["fixture"],
      },
      {
        id: "phone-modal",
        status: "pass",
        steps: ["fixture"],
        assertions: ["fixture"],
      },
    ],
    controls: [
      {
        controlId: "control.001",
        status: "pass",
        scenarioIds: ["phone-modal"],
        actions: ["fixture open"],
        observations: ["fixture bounds"],
      },
    ],
    modalBounds: [
      {
        id: "finder",
        status: "pass",
        runtime: "production-build",
        finalCascade: true,
        computedTranslate: "none",
        rect: { x: 0, y: 0, width: 360, height: 800 },
        viewport: { width: 360, height: 800 },
        availableHeight: 800,
      },
    ],
    mathMatcher: { path: report, sha256: digest(fs.readFileSync(report)) },
    artifacts: [{ path: captures, sha256: digest(fs.readFileSync(captures)) }],
  };
  const captureBody = JSON.parse(fs.readFileSync(captures, "utf8"));
  Object.assign(captureBody, {
    revision: valid.revision,
    sourceFingerprint: valid.sourceFingerprint,
    buildFingerprint: valid.buildFingerprint,
    runtime: "production-build",
  });
  const captureText = JSON.stringify(captureBody);
  fs.writeFileSync(captures, captureText);
  matcher.captureArtifact.sha256 = digest(captureText);
  fs.writeFileSync(report, JSON.stringify(matcher));
  valid.mathMatcher.sha256 = digest(fs.readFileSync(report));
  valid.artifacts[0].sha256 = digest(captureText);
  const evaluate = (evidence) => {
    fs.writeFileSync(file, JSON.stringify(evidence));
    return checkBrowserEvidence(root, map, file).checks;
  };
  const status = (evidence, id) =>
    evaluate(evidence).find((check) => check.id === id)?.status;
  const check = (id, run) => {
    try {
      run();
      checks.push({ id, status: "pass" });
    } catch (error) {
      checks.push({ id, status: "fail", error: error.message });
    }
  };
  try {
    check("browser.control-mapping-mutation", () => {
      assert.equal(status(valid, "control.001"), "pass");
      const mutant = structuredClone(valid);
      mutant.controls = [];
      assert.equal(status(mutant, "control.001"), "fail");
      assert.equal(status(valid, "control.001"), "pass");
    });
    check("browser.offscreen-modal-mutation", () => {
      assert.equal(status(valid, "modal.finder"), "pass");
      const mutant = structuredClone(valid);
      mutant.modalBounds[0].rect.x = -195;
      assert.equal(status(mutant, "modal.finder"), "fail");
      mutant.modalBounds[0].rect.x = 0;
      mutant.modalBounds[0].computedTranslate = "-50%";
      assert.equal(status(mutant, "modal.finder"), "fail");
      assert.equal(status(valid, "modal.finder"), "pass");
    });
    check("browser.matcher-link-mutation", () => {
      assert.equal(status(valid, "mathMatcher.reportHash"), "pass");
      const mutant = structuredClone(valid);
      mutant.mathMatcher.sha256 = "stale";
      assert.equal(status(mutant, "mathMatcher.reportHash"), "fail");
      assert.equal(status(valid, "mathMatcher.reportHash"), "pass");
    });
    check("browser.capture-link-mutation", () => {
      assert.equal(status(valid, "mathMatcher.captureHash"), "pass");
      fs.writeFileSync(captures, "changed");
      assert.equal(status(valid, "mathMatcher.captureHash"), "fail");
      fs.writeFileSync(captures, captureText);
      assert.equal(status(valid, "mathMatcher.captureHash"), "pass");
    });
    check("browser.capture-identity-mutation", () => {
      assert.equal(status(valid, "mathMatcher.captureIdentity"), "pass");
      const changed = { ...captureBody, sourceFingerprint: "old-build" };
      fs.writeFileSync(captures, JSON.stringify(changed));
      assert.equal(status(valid, "mathMatcher.captureIdentity"), "fail");
      fs.writeFileSync(captures, captureText);
      assert.equal(status(valid, "mathMatcher.captureIdentity"), "pass");
    });
    check("browser.required-not-waived", () => {
      const disclosed = structuredClone(valid);
      disclosed.limitations = [
        {
          id: "physical.keyboard",
          status: "unsupported",
          kind: "physical-input",
          reason: "OS keyboard unavailable",
        },
      ];
      assert.equal(status(disclosed, "limitations.disclosed"), "pass");
      disclosed.limitations[0].id = "phone-modal";
      assert.equal(status(disclosed, "limitations.disclosed"), "fail");
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return checks;
}
