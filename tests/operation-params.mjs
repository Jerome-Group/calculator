import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { operations } from "../lib/calculator/catalog.ts";
import { initialOperationParams } from "../lib/calculator/operation-params.ts";
import {
  componentHarness,
  definition,
  notebook,
  workspace,
} from "./component-harness.mjs";

for (const operation of operations) {
  assert.deepEqual(
    initialOperationParams(operation),
    Object.fromEntries(
      operation.fields.map((field) => [field.key, field.value]),
    ),
    `${operation.id} defaults must remain unchanged`,
  );
}
const dataset = { ...definition("D", "[1,2,3]"), kind: "dataset" };
const operation = operations.find((entry) => entry.id === "describe");
const harness = componentHarness("Calculator", ["choose"], {
  state: workspace([notebook("A", [dataset])]),
});
harness.render().actions.choose(operation, dataset.name);
const params = harness.state.get("params");
assert.equal(
  params.data,
  "[1,2,3]",
  "Statistics must seed the selected dataset, not default data",
);
assert.equal(harness.state.get("modal"), "operation");
const matrix = { ...definition("M", "[[1,2],[3,4]]"), kind: "matrix" };
const inverse = operations.find((entry) => entry.id === "matrix_inverse");
assert.equal(initialOperationParams(inverse, "M", [matrix]).expression, "M");
assert.equal(
  initialOperationParams(inverse, undefined, [matrix], matrix.id).expression,
  "M",
);
assert.equal(
  initialOperationParams(operation, "D", [
    { ...dataset, expression: "[0.1234567890123456789,2,3]" },
  ]).data,
  "[0.1234567890123456789,2,3]",
  "Source expansion must retain exact literals",
);

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "calculator-selected-dataset-"),
);
try {
  const fixtureFile = path.join(directory, "fixtures.json");
  const fixture = {
    id: "selected.dataset.statistics",
    surfaceId: "form.describe",
    request: {
      operation: operation.id,
      params,
      definitions: [dataset],
      mode: "text",
    },
    expectedStatus: "numeric",
    assertions: [
      {
        kind: "partialObject",
        path: ["details"],
        expected: {
          n: 3,
          sum: { $near: 6, atol: 1e-12 },
          mean: { $near: 2, atol: 1e-12 },
        },
      },
    ],
  };
  fs.writeFileSync(fixtureFile, JSON.stringify({ fixtures: [fixture] }));
  const result = spawnSync(
    process.execPath,
    ["tests/maths-oracle.mjs", "--fixture", fixture.id],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CALCULATOR_FIXTURES_FILE: fixtureFile },
      timeout: 120000,
    },
  );
  assert.equal(
    result.status,
    0,
    result.stdout + result.stderr + (result.error?.message || ""),
  );
  const report = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(report.status, "pass");
  assert.equal(report.fetchAttempts, 0);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log(
  "All128 operation defaults, selected matrix references and Objects→Statistics dataset mean2 passed",
);
