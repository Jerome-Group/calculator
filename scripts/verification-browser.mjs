import fs from "node:fs";
import path from "node:path";
import {
  digest,
  failure,
  readJson,
  sourceIdentity,
  mathContractFingerprint,
} from "./verification-contract.mjs";
export function checkBrowserEvidence(root, map, file) {
  if (!file) failure("Browser evidence unavailable: --evidence required", 3);
  const evidence = readJson(file),
    current = sourceIdentity(root),
    checks = [];
  const add = (id, passed) =>
    checks.push({ id, status: passed ? "pass" : "fail" });
  add("schema", evidence.schemaVersion === 1);
  add("kind", evidence.kind === "browser-runtime");
  add("revision", evidence.revision === current.revision);
  add(
    "sourceFingerprint",
    evidence.sourceFingerprint === current.sourceFingerprint,
  );
  const manifest = path.join(root, "dist/client/offline-manifest.json");
  add(
    "buildFingerprint",
    fs.existsSync(manifest) &&
      evidence.buildFingerprint === digest(fs.readFileSync(manifest)),
  );
  add(
    "completed",
    !!evidence.startedAt &&
      !!evidence.completedAt &&
      evidence.status === "pass",
  );
  add("origin", /^https?:\/\//.test(evidence.origin || ""));
  add(
    "viewport",
    Number.isFinite(evidence.viewport?.width) &&
      Number.isFinite(evidence.viewport?.height),
  );
  add("browser", typeof evidence.browser === "string" && !!evidence.browser);
  add(
    "checks.nonempty",
    Array.isArray(evidence.checks) && evidence.checks.length > 0,
  );
  const checksList = Array.isArray(evidence.checks) ? evidence.checks : [];
  add(
    "checks.unique",
    new Set(checksList.map((check) => check.id)).size === checksList.length,
  );
  const passed = new Set(
    checksList
      .filter(
        (check) =>
          check.status === "pass" &&
          check.steps?.length &&
          check.assertions?.length,
      )
      .map((check) => check.id),
  );
  add(
    "checks.allPass",
    checksList.every((check) => check.status === "pass"),
  );
  for (const id of [
    ...map.evidenceSchema.requiredBrowserFixtureIds,
    ...(map.evidenceSchema.requiredBrowserScenarioIds || []),
  ])
    add(id, passed.has(id));
  const controls = Array.isArray(evidence.controls) ? evidence.controls : [];
  add(
    "controls.unique",
    new Set(controls.map((row) => row.controlId)).size === controls.length,
  );
  add(
    "controls.known",
    controls.every((row) =>
      map.controls.some((control) => control.id === row.controlId),
    ),
  );
  for (const control of map.controls) {
    const row = controls.find((row) => row.controlId === control.id);
    add(
      control.id,
      !!row &&
        row.status === "pass" &&
        row.scenarioIds?.length > 0 &&
        row.scenarioIds.every((id) => passed.has(id)) &&
        row.actions?.length > 0 &&
        row.actions.every(
          (action) => typeof action === "string" && action.trim(),
        ) &&
        row.observations?.length > 0 &&
        row.observations.every(
          (observation) =>
            typeof observation === "string" && observation.trim(),
        ),
    );
  }
  const modalBounds = Array.isArray(evidence.modalBounds)
    ? evidence.modalBounds
    : [];
  for (const id of map.evidenceSchema.requiredPhoneModalIds || []) {
    const modal = modalBounds.find((row) => row.id === id);
    const rect = modal?.rect,
      viewport = modal?.viewport;
    add(
      "modal." + id,
      !!modal &&
        modal.status === "pass" &&
        modal.runtime === "production-build" &&
        modal.finalCascade === true &&
        modal.computedTranslate === "none" &&
        [
          rect?.x,
          rect?.y,
          rect?.width,
          rect?.height,
          viewport?.width,
          viewport?.height,
          modal.availableHeight,
        ].every(Number.isFinite) &&
        viewport.width > 0 &&
        viewport.width <= 480 &&
        viewport.height > 0 &&
        modal.availableHeight > 0 &&
        modal.availableHeight <= viewport.height &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.width <= viewport.width &&
        rect.height <= modal.availableHeight &&
        rect.x + rect.width <= viewport.width &&
        rect.y + rect.height <= modal.availableHeight,
    );
  }
  const matcherLink = evidence.mathMatcher;
  let matcherReport = null;
  if (matcherLink?.path && fs.existsSync(matcherLink.path)) {
    const bytes = fs.readFileSync(matcherLink.path);
    add("mathMatcher.reportHash", digest(bytes) === matcherLink.sha256);
    try {
      matcherReport = JSON.parse(bytes);
    } catch {
      add("mathMatcher.reportJSON", false);
    }
  } else add("mathMatcher.reportPresent", false);
  add(
    "mathMatcher.contract",
    matcherReport?.schemaVersion === 1 &&
      matcherReport.kind === "observed-math-match" &&
      matcherReport.status === "pass" &&
      matcherReport.mathContractFingerprint === mathContractFingerprint(root),
  );
  const mathChecks = Array.isArray(matcherReport?.checks)
    ? matcherReport.checks
    : [];
  add(
    "mathMatcher.unique",
    new Set(mathChecks.map((row) => row.id)).size === mathChecks.length,
  );
  add(
    "mathMatcher.checksAllPass",
    mathChecks.length > 0 && mathChecks.every((row) => row.status === "pass"),
  );
  const matched = new Set(
    mathChecks.filter((row) => row.status === "pass").map((row) => row.id),
  );
  for (const id of map.evidenceSchema.requiredBrowserFixtureIds)
    add("matched." + id, matched.has(id.replace(/^browser\./, "")));
  const capture = matcherReport?.captureArtifact;
  add(
    "mathMatcher.captureHash",
    !!capture?.path &&
      fs.existsSync(capture.path) &&
      digest(fs.readFileSync(capture.path)) === capture.sha256,
  );
  if (capture?.path && fs.existsSync(capture.path)) {
    let captured = null;
    try {
      captured = JSON.parse(fs.readFileSync(capture.path, "utf8"));
    } catch {}
    add(
      "mathMatcher.captureIdentity",
      captured?.revision === evidence.revision &&
        captured?.sourceFingerprint === evidence.sourceFingerprint &&
        captured?.buildFingerprint === evidence.buildFingerprint &&
        captured?.runtime === "production-build",
    );
    const captures = Array.isArray(captured?.captures) ? captured.captures : [];
    const capturedIds = new Set(captures.map((row) => row.fixtureId));
    add(
      "mathMatcher.captureCoverage",
      captured?.schemaVersion === 1 &&
        captures.length > 0 &&
        capturedIds.size === captures.length &&
        capturedIds.size === matched.size &&
        captures.every(
          (row) =>
            matched.has(row.fixtureId) &&
            !!row.observed?.status &&
            !!row.observed?.display,
        ),
    );
  } else add("mathMatcher.captureCoverage", false);
  const limitations = evidence.limitations || [];
  add(
    "limitations.disclosed",
    Array.isArray(limitations) &&
      limitations.every(
        (row) =>
          row.status === "unsupported" &&
          typeof row.reason === "string" &&
          row.reason.trim() &&
          ["physical-input", "cdp-unavailable"].includes(row.kind) &&
          !passed.has(row.id) &&
          !map.evidenceSchema.requiredBrowserScenarioIds.includes(row.id) &&
          !map.evidenceSchema.requiredBrowserFixtureIds.includes(row.id) &&
          !map.controls.some((control) => control.id === row.id),
      ),
  );
  const artifacts = Array.isArray(evidence.artifacts) ? evidence.artifacts : [];
  add("artifacts.nonempty", artifacts.length > 0);
  for (const artifact of artifacts)
    add(
      `artifact.${artifact.path}`,
      typeof artifact.path === "string" &&
        fs.existsSync(artifact.path) &&
        digest(fs.readFileSync(artifact.path)) === artifact.sha256,
    );
  return {
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
    limitations: [
      "Evidence ingestion checks recorded browser observations; it does not execute a browser.",
    ],
  };
}
