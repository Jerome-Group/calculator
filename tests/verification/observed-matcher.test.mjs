import assert from "node:assert/strict";
import fs from "node:fs";
import { createObservedMatcher } from "./observed-matcher.mjs";
const match = await createObservedMatcher();
const checks = [];
for (const [latex, expected] of [
  [String.raw`-7.0 \cdot 10^{-17}`, "-7.00000000000000e-17"],
  [String.raw`\frac{2}{3}`, "2/3"],
  [String.raw`x^{2} - 2 x + 1`, "x**2 - 2*x + 1"],
  [String.raw`\left\{1, 2\right\}`, "{1, 2}"],
  [
    String.raw`\left[\begin{matrix}1 & 2\\3 & 4\end{matrix}\right]`,
    "Matrix([[1, 2], [3, 4]])",
  ],
]) {
  assert.equal(await match.parseLatex(latex), expected);
  checks.push({ id: "latex." + checks.length, status: "pass" });
}
await assert.rejects(match.parseLatex(String.raw`\unknown{x}`));
checks.push({ id: "latex.unsupported.blocked", status: "pass" });
const fixture = {
  id: "observed.scalar",
  expectedStatus: "exact",
  assertions: [{ kind: "mathEqual", path: ["text"], expected: "2/3" }],
};
const observed = {
  status: "exact",
  text: await match.parseLatex(String.raw`\frac{2}{3}`),
  display: { type: "math" },
};
assert.equal((await match(fixture, observed)).status, "pass");
assert.equal(
  (await match(fixture, { ...observed, text: "999" })).status,
  "fail",
);
checks.push({ id: "observed.independent.failure", status: "pass" });
const observedFields = {
  status: "exact",
  display: {
    type: "fields",
    items: [
      {
        label: "ratio",
        value: { type: "math", latex: String.raw`\frac{2}{3}` },
      },
      { label: "is_unit", value: { type: "text", text: "T" } },
    ],
  },
};
const fieldsFixture = {
  id: "observed.fields",
  request: { operation: "quotient", params: {} },
  expectedStatus: "exact",
  assertions: [
    {
      kind: "partialObject",
      path: ["details"],
      expected: { ratio: { $math: "2/3" }, is_unit: true },
    },
  ],
};
assert.equal(
  (await match.matchDisplay(fieldsFixture, observedFields)).status,
  "pass",
);
assert.equal(
  (
    await match.matchDisplay(fieldsFixture, {
      ...observedFields,
      display: { type: "math", latex: String.raw`\unknown{x}` },
    })
  ).status,
  "blocked",
);
checks.push(
  { id: "observed.fields.labels", status: "pass" },
  { id: "observed.unsupported.blocked", status: "pass" },
);
const result = {
  schemaVersion: 1,
  suite: "observed-matcher",
  status: "pass",
  checks,
};
console.log(JSON.stringify(result));
if (process.env.CALCULATOR_RESULT_FILE)
  fs.writeFileSync(process.env.CALCULATOR_RESULT_FILE, JSON.stringify(result));
