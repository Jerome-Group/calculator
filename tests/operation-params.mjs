import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { operations } from "../lib/calculator/catalog.ts";
import {
  initialOperationParams,
  integralShortcutParams,
} from "../lib/calculator/operation-params.ts";
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
const integration = operations.find((entry) => entry.id === "integrate");
const enteredIntegral = "latex:\\int_3^41\\,\\mathrm{dx}";
const integralParams = initialOperationParams(
  integration,
  enteredIntegral,
  [],
  undefined,
  true,
);
assert.deepEqual(
  integralParams,
  { expression: "latex:1", variable: "x", lower: "latex:3", upper: "latex:4" },
  "Compact upper script consumes one token; the existing integral becomes one editable problem",
);
assert.equal(
  initialOperationParams(integration, enteredIntegral).expression,
  enteredIntegral,
  "Generic apply must preserve intentional nesting",
);
assert.deepEqual(
  integralShortcutParams("latex:\\int^{12}_{-3} \\frac{1}{t}\\,\\mathrm{d}t"),
  {
    expression: "latex:\\frac{1}{t}",
    variable: "t",
    lower: "latex:-3",
    upper: "latex:12",
  },
);
assert.deepEqual(integralShortcutParams("latex:\\int x^2 dx"), {
  expression: "latex:x^2",
  variable: "x",
  lower: "",
  upper: "",
});
const greekParams = integralShortcutParams(
  "latex:\\int_0^1\\theta^2\\,\\mathrm{d\\theta}",
);
assert.deepEqual(greekParams, {
  expression: "latex:\\theta^2",
  variable: "latex:\\theta",
  lower: "latex:0",
  upper: "latex:1",
});
assert.deepEqual(
  integralShortcutParams("latex:\\int_0^1\\theta^2\\,\\mathrm{d}\\theta"),
  greekParams,
);
assert.deepEqual(
  integralShortcutParams("latex:\\int_0^1\\theta^2 d\\theta"),
  greekParams,
);
for (const source of [
  "latex:\\int_3^4 1 dx+2",
  "latex:\\int_3 1 dx",
  "latex:\\int_3^4 dx",
  "latex:\\int_3^{4 1 dx",
  "latex:\\int_3^4 {1 dx",
  "latex:\\int_3^4 1 d\\thetaextra",
  "latex:\\int_3^4 1 \\mathrm{d\\unknown}",
  "latex:\\int_3^4 1 \\mathrm{d}\\frac",
  "latex:\\int_3^4 1 \\mathrm{dtheta}",
  "latex:\\int_3^4 \\int_0^1 x dx dy",
  "latex:\\int_3^4 \\placeholder{} dx",
  "latex:\\int_3^4 (x] dx",
  "latex:\\int_3^4 x",
  "latex:\\int_3^4 x+ dx",
  "latex:\\int_3^4 \\frac{1} dx",
  "latex:\\int_{(0}^4 x dx",
  "latex:\\int_3_2^4 x dx",
  "latex:" + "x".repeat(8001),
]) {
  assert.equal(
    integralShortcutParams(source),
    null,
    "Unsupported integral stays unchanged: " + source.slice(0, 100),
  );
  assert.equal(
    initialOperationParams(integration, source, [], undefined, true).expression,
    source,
  );
}
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
  const integralFixture = {
    id: "shortcut.integral.completed",
    surfaceId: "form.integrate",
    request: { operation: "integrate", params: integralParams, mode: "text" },
    expectedStatus: "exact",
    assertions: [{ kind: "mathEqual", path: ["text"], expected: "1" }],
  };
  const greekFixture = {
    id: "shortcut.integral.greek",
    surfaceId: "form.integrate",
    request: { operation: "integrate", params: greekParams, mode: "text" },
    expectedStatus: "exact",
    assertions: [{ kind: "mathEqual", path: ["text"], expected: "1/3" }],
  };
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
  fs.writeFileSync(
    fixtureFile,
    JSON.stringify({ fixtures: [fixture, integralFixture, greekFixture] }),
  );
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
  const integralResult = spawnSync(
    process.execPath,
    ["tests/maths-oracle.mjs", "--fixture", integralFixture.id],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CALCULATOR_FIXTURES_FILE: fixtureFile },
      timeout: 120000,
    },
  );
  assert.equal(
    integralResult.status,
    0,
    integralResult.stdout + integralResult.stderr,
  );
  const greekResult = spawnSync(
    process.execPath,
    ["tests/maths-oracle.mjs", "--fixture", greekFixture.id],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, CALCULATOR_FIXTURES_FILE: fixtureFile },
      timeout: 120000,
    },
  );
  assert.equal(greekResult.status, 0, greekResult.stdout + greekResult.stderr);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
console.log(
  "All128 operation defaults, selected matrix/dataset references and completed integral shortcuts (3→4 of1 =1; theta²0→1 =1/3) passed",
);
