import assert from "node:assert/strict";
import {
  createInvestigationNotebook,
  setInvestigationParameters,
  addInvestigationStep,
  prepareInvestigationRun,
} from "../lib/calculator/investigations.ts";
import {
  generateInvestigationCases,
  investigationEvidence,
  investigationTrend,
  exportInvestigationRun,
  exportInvestigationTrend,
} from "../lib/calculator/investigation-analysis.ts";
import { DEFAULT_SETTINGS } from "../lib/calculator/types.ts";
import { validateState } from "../lib/calculator/storage.ts";
const book = createInvestigationNotebook({
  seed: { kind: "custom" },
  workspaceSettings: DEFAULT_SETTINGS,
});
const plan = book.investigation.plan;
assert.equal(plan.cases[0].values.p, "1", "Custom seed starts at p = 1");
assert.equal(plan.steps[0].request.input, "p^2");
assert.equal(plan.steps[0].request.params.expression, "p^2");
const draft = {
  kind: "linear",
  parameter: "p",
  baseCaseId: plan.cases[0].id,
  start: "1/10",
  end: "1/2",
  count: "5",
};
const sources = (result) => {
  assert.equal(result.kind, "ready");
  return result.plan.cases.map((c) => c.values.p);
};
assert.deepEqual(sources(generateInvestigationCases({ plan, draft })), [
  "1/10",
  "1/5",
  "3/10",
  "2/5",
  "1/2",
]);
assert.deepEqual(
  sources(
    generateInvestigationCases({
      plan,
      draft: { ...draft, start: "5e-1", end: "0.1" },
    }),
  ),
  ["1/2", "2/5", "3/10", "1/5", "1/10"],
);
assert.deepEqual(
  sources(
    generateInvestigationCases({
      plan,
      draft: {
        ...draft,
        kind: "geometric",
        start: "1/10",
        multiplier: "1/10",
        count: "3",
      },
    }),
  ),
  ["1/10", "1/100", "1/1000"],
);
assert.deepEqual(
  sources(
    generateInvestigationCases({
      plan,
      draft: {
        ...draft,
        kind: "geometric",
        start: "-2",
        multiplier: "2",
        count: "3",
      },
    }),
  ),
  ["-2", "-4", "-8"],
);
const unchanged = JSON.stringify(plan);
for (const changes of [
  { count: "0" },
  { count: "1" },
  { count: "9" },
  { count: "2.5" },
  { start: "" },
  { end: "" },
  { start: "1/0" },
  { end: "1e1000000" },
  { start: "NaN" },
  { start: "Infinity" },
  { start: "0.1 + 0.2" },
  { end: "1/10" },
  { parameter: "missing" },
  { baseCaseId: "missing" },
  { start: "1".repeat(257) },
]) {
  assert.equal(
    generateInvestigationCases({ plan, draft: { ...draft, ...changes } }).kind,
    "invalid",
    JSON.stringify(changes),
  );
  assert.equal(JSON.stringify(plan), unchanged);
}
for (const changes of [
  { start: "0" },
  { multiplier: "0" },
  { multiplier: "1" },
  { multiplier: "-2" },
  { multiplier: "2/2" },
])
  assert.equal(
    generateInvestigationCases({
      plan,
      draft: {
        ...draft,
        kind: "geometric",
        start: "1",
        multiplier: "2",
        ...changes,
      },
    }).kind,
    "invalid",
  );
const roster = setInvestigationParameters({ plan, parameters: ["p", "q"] });
assert.equal(roster.kind, "ready");
assert.equal(roster.plan.cases[0].values.q, "0");
roster.plan.cases[0].values.q = "7";
const removed = setInvestigationParameters({
  plan: roster.plan,
  parameters: ["q"],
});
assert.equal(removed.kind, "ready");
assert.deepEqual(removed.plan.cases[0].values, { q: "7" });
for (const parameters of [
  ["p", "p"],
  ["1bad"],
  ["constructor", "x", "y", "z", "a", "b", "c"],
  ["a".repeat(25)],
])
  assert.equal(
    setInvestigationParameters({ plan, parameters }).kind,
    "invalid",
  );
let steps = plan;
while (steps.steps.length < 6) {
  const next = addInvestigationStep(steps);
  assert.equal(next.kind, "ready");
  steps = next.plan;
}
assert.equal(addInvestigationStep(steps).kind, "invalid");
assert.equal(JSON.stringify(plan), unchanged);
const result = (text, extra = {}) => ({
  status: "exact",
  text,
  latex: "",
  notes: [],
  ...extra,
});
function fixture(values, results) {
  const notebook = createInvestigationNotebook({
    seed: { kind: "custom" },
    workspaceSettings: DEFAULT_SETTINGS,
  });
  notebook.name = "=FORMULA(1)\nname";
  const plan = notebook.investigation.plan;
  plan.cases = values.map((value, i) => ({
    id: "case-" + i,
    label: i === 0 ? '\t=SUM(1,2)\n"quoted"' : "Case " + i,
    values: { p: value },
  }));
  const prepared = prepareInvestigationRun({
    notebook,
    action: { kind: "new" },
  });
  notebook.investigation.runs.push(prepared.run);
  prepared.missing.forEach(({ cell, request, context }, i) => {
    if (results[i])
      notebook.history.push({
        ...request,
        ...context,
        id: "entry-" + i,
        time: 1,
        investigation: cell,
        result: results[i],
      });
  });
  const evidence = investigationEvidence({ notebook, runId: prepared.run.id });
  const trend = (measure = { kind: "result" }) =>
    investigationTrend({
      evidence,
      parameter: "p",
      stepId: plan.steps[0].id,
      measure,
    });
  return { notebook, evidence, trend, runId: prepared.run.id };
}
const a = fixture(
  ["0", "1/2", "2", "3", "4", "5", "6", "7"],
  [
    result("0"),
    result("1/3"),
    result("cos(1)", { approx: "0.5403023058681397174" }),
    result("2.75", { status: "numeric" }),
    result("Matrix([[1]])"),
    result("True"),
    result("{1, 2}"),
    result("1 + 2*I"),
  ],
);
assert.equal(a.evidence.total, 8);
assert.equal(a.evidence.saved, 8);
const rows = a.trend().rows;
assert.deepEqual(
  rows.slice(0, 4).map((row) => [row.kind, row.x, row.y.value]),
  [
    ["point", 0, 0],
    ["point", 0.5, 1 / 3],
    ["point", 2, Math.cos(1)],
    ["point", 3, 2.75],
  ],
);
assert.equal(rows[2].y.origin, "approx");
assert(rows.slice(4).every((row) => row.kind === "excluded"));
const b = fixture(
  ["pi/2", "1e-1000", "1e1000", "3", "4", "5", "6", "7"],
  [
    result("1"),
    result("1"),
    result("1"),
    result(""),
    result("12junk"),
    result("0", { status: "conditional", details: { count: 3 } }),
    result("0", { status: "error" }),
    null,
  ],
);
assert.match(b.trend().rows[0].reason, /Parameter source/);
assert(
  b
    .trend()
    .rows.slice(1, 3)
    .every((row) => row.kind === "excluded" && row.reason.includes("range")),
);
assert(
  b
    .trend()
    .rows.slice(3, 5)
    .every((row) => row.kind === "excluded"),
);
assert.equal(b.trend().rows[7].kind, "missing");
assert.equal(
  b.trend({ kind: "detail", key: "count" }).rows[5].kind,
  "excluded",
);
const c = fixture(
  ["1", "2", "3", "4", "5", "6", "7", "8"],
  [
    result("unknown", { details: { measure: 0 } }),
    result("unknown", { details: { measure: "1/2" } }),
    result("unknown", { details: { measure: "1.5junk" } }),
    result("unknown", { details: { measure: [1] } }),
    result("unknown", { details: { other: 3 } }),
    result("unknown", { status: "unresolved", details: { measure: 3 } }),
    result("unknown", { status: "divergent", details: { measure: 3 } }),
    result("unknown", { details: { measure: "1e-1000" } }),
  ],
);
const details = c.trend({ kind: "detail", key: "measure" });
assert.deepEqual(
  details.rows.slice(0, 2).map((row) => row.y.value),
  [0, 0.5],
);
assert(details.rows.slice(2).every((row) => row.kind === "excluded"));
assert.match(details.rows[4].reason, /absent/);
const d = fixture(
  ["1", "1.0", "9007199254740992", "9007199254740993"],
  [
    result("1"),
    result("1.0"),
    result("9007199254740992"),
    result("9007199254740993"),
  ],
);
const original = JSON.stringify(d.notebook);
assert(d.trend().rows.every((row) => row.kind === "point"));
assert.equal(d.trend().rows[2].x, d.trend().rows[3].x);
assert.deepEqual(d.trend().precisionCollisions, [
  { axis: "x", caseIds: ["case-2", "case-3"] },
  { axis: "y", caseIds: ["case-2", "case-3"] },
]);
const equivalent = fixture(
  ["1", "1.0", "2/2", "10e-1"],
  [result("1"), result("1.0"), result("2/2"), result("10e-1")],
);
assert.deepEqual(equivalent.trend().precisionCollisions, []);
function csvRecords(source) {
  const rows = [];
  let cells = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\r" || char === "\n")) {
      cells.push(cell);
      cell = "";
      if (char !== ",") {
        rows.push(cells);
        cells = [];
        if (char === "\r" && source[i + 1] === "\n") i++;
      }
    } else cell += char;
  }
  assert.equal(quoted, false, "CSV quotes must close");
  assert.equal(cell, "");
  assert.deepEqual(cells, []);
  const [header, ...records] = rows;
  return records.map((record) => {
    assert.equal(record.length, header.length);
    return Object.fromEntries(header.map((key, i) => [key, record[i]]));
  });
}
const collisionCsv = csvRecords(exportInvestigationTrend(d.trend()));
assert.deepEqual(
  collisionCsv.map((row) => row["parameter:p"]),
  ["1", "1.0", "9007199254740992", "9007199254740993"],
);
assert.deepEqual(
  collisionCsv.map((row) => row.numeric_source),
  ["1", "1.0", "9007199254740992", "9007199254740993"],
);
assert.deepEqual(
  collisionCsv.map((row) => row.precision_notice),
  [
    "",
    "",
    "Browser number precision collapses distinct x and y source values.",
    "Browser number precision collapses distinct x and y source values.",
  ],
);
const collisionBackup = validateState(
  JSON.parse(exportInvestigationRun({ notebook: d.notebook, runId: d.runId })),
);
assert.deepEqual(collisionBackup.notebooks[0].history, d.notebook.history);
assert.equal(JSON.stringify(d.notebook), original);
for (const timestamp of [0, Number.MAX_SAFE_INTEGER]) {
  d.evidence.run.createdAt = timestamp;
  const imported = validateState(
    JSON.parse(
      exportInvestigationRun({ notebook: d.notebook, runId: d.runId }),
    ),
  );
  const trend = investigationTrend({
    evidence: investigationEvidence({
      notebook: imported.notebooks[0],
      runId: d.runId,
    }),
    parameter: "p",
    stepId: d.evidence.run.snapshot.plan.steps[0].id,
    measure: { kind: "result" },
  });
  const records = csvRecords(exportInvestigationTrend(trend));
  assert.equal(records.length, 4);
  assert(records.every((record) => record.run_epoch_ms === String(timestamp)));
  assert(
    records.every(
      (record) =>
        record.run_timestamp_iso ===
        (timestamp === 0 ? "1970-01-01T00:00:00.000Z" : ""),
    ),
  );
}
const csv = exportInvestigationTrend(a.trend());
assert(csv.includes('"\'=FORMULA(1)\nname"'));
assert(csv.includes('"\'\t=SUM(1,2)\n""quoted"""'));
assert(csv.includes('"cos(1)","0.5403023058681397174"'));
const missingCsv = exportInvestigationTrend(b.trend());
assert(missingCsv.includes('"missing"'));
assert(missingCsv.includes(',,,"No saved result"'));
const exported = validateState(
  JSON.parse(exportInvestigationRun({ notebook: a.notebook, runId: a.runId })),
);
assert.deepEqual(exported.notebooks[0].history, a.notebook.history);
assert.deepEqual(exported.notebooks[0].graphs, []);
assert.equal(exported.notebooks[0].investigation.runs.length, 1);
console.log(
  JSON.stringify({
    suite: "investigation-analysis",
    passed: true,
    exactSequences: 4,
    caseRows: 32,
  }),
);
