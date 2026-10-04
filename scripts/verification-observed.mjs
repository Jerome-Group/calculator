import path from "node:path";
import fs from "node:fs";
import {
  failure,
  readJson,
  readFixtures,
  digest,
  mathContractFingerprint,
} from "./verification-contract.mjs";
import { createObservedMatcher } from "../tests/verification/observed-matcher.mjs";

/** Review observed mathematics; capture freshness is gated separately. */
export async function reviewBrowserMath(root, file) {
  if (!file)
    failure("Observed browser captures unavailable: --evidence required", 3);
  const evidence = readJson(file);
  if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.captures))
    failure("Expected schemaVersion 1 and captures array");
  const fixtures = readFixtures(root);
  const ids = new Set();
  for (const capture of evidence.captures) {
    if (ids.has(capture.fixtureId))
      failure("Duplicate observed fixture " + capture.fixtureId);
    if (!fixtures.some((fixture) => fixture.id === capture.fixtureId))
      failure("Unknown observed fixture " + capture.fixtureId);
    ids.add(capture.fixtureId);
  }
  if (!ids.size) failure("Empty observed captures");
  const match = await createObservedMatcher(root),
    checks = [];
  for (const capture of evidence.captures) {
    const fixture = fixtures.find((row) => row.id === capture.fixtureId);
    checks.push(
      capture.observed
        ? await match.matchDisplay(fixture, capture.observed)
        : {
            id: fixture.id,
            status: "blocked",
            reason: "Semantic DOM capture absent",
          },
    );
  }
  return {
    kind: "observed-math-match",
    captureArtifact: {
      path: path.resolve(file),
      sha256: digest(fs.readFileSync(file)),
    },
    mathContractFingerprint: mathContractFingerprint(root),
    status: checks.some((check) => check.status === "fail")
      ? "fail"
      : checks.some((check) => check.status === "blocked")
        ? "blocked"
        : "pass",
    checks,
    limitations: [
      "Matches recorded rendered mathematics only; does not execute a browser or certify input previews, interactions, provenance/freshness, offline or scoped identity. Use browser validate for the complete evidence contract.",
    ],
  };
}
