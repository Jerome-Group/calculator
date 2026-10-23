import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "../public/engine/pyodide.mjs";
import {
  createInvestigationNotebook,
  prepareInvestigationRun,
  investigationIsCurrent,
  removeInvestigation,
  setInvestigationParameters,
  addInvestigationStep,
} from "../lib/calculator/investigations.ts";
import {
  generateInvestigationCases,
  investigationTrend,
  exportInvestigationRun,
  investigationEvidence,
} from "../lib/calculator/investigation-analysis.ts";
import { validateState } from "../lib/calculator/storage.ts";
import { DEFAULT_SETTINGS } from "../lib/calculator/types.ts";
const base = fileURLToPath(new URL("../public/engine/", import.meta.url));
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts++;
  throw Error("Network disabled");
};
const py = await loadPyodide({ indexURL: base });
await py.loadPackage(["sympy", "scipy"]);
for (const name of [
  "networkx-3.4.2-py3-none-any.whl",
  "lark-1.2.2-py3-none-any.whl",
])
  py.unpackArchive(new Uint8Array(fs.readFileSync(base + name)), "zip", {
    extractDir: "/lib/python3.12/site-packages",
  });
for (const name of [
  "calculator.py",
  "latex_adapter.py",
  "supplemental.py",
  "extended.py",
  "presentation.py",
])
  py.FS.writeFile("/home/pyodide/" + name, fs.readFileSync(base + name));
await py.runPythonAsync("from calculator import compute_json");
const compute = py.globals.get("compute_json");
const notebook = createInvestigationNotebook({
  seed: { kind: "lab", labId: "singular-matrix" },
  workspaceSettings: DEFAULT_SETTINGS,
});
assert.equal(notebook.history.length, 0);
const prepared = prepareInvestigationRun({ notebook, action: { kind: "new" } });
assert.equal(prepared.missing.length, 9);
notebook.investigation.runs.push(prepared.run);
for (const { cell, request, context } of prepared.missing) {
  const result = JSON.parse(
    compute(JSON.stringify({ ...request, ...context })),
  );
  notebook.history.push({
    ...request,
    ...context,
    result,
    investigation: cell,
    id: String(notebook.history.length),
    time: 1,
  });
}
const by = (caseId, stepId) =>
  notebook.history.find(
    (e) =>
      e.investigation.caseId === caseId && e.investigation.stepId === stepId,
  ).result;
assert.equal(by("regular", "determinant").text, "1");
assert.equal(by("singular", "determinant").text, "0");
assert.equal(by("near", "determinant").text, "1/1000");
assert.deepEqual(
  ["regular", "singular", "near"].map((c) => by(c, "rank").text),
  ["2", "1", "2"],
);
assert.equal(by("regular", "solve").text, "{(1, 1)}");
assert.equal(by("singular", "solve").text, "EmptySet");
assert.equal(by("near", "solve").text, "{(-998, 1000)}");
assert.equal(
  investigationEvidence({ notebook, runId: prepared.run.id }).saved,
  9,
);
assert.equal(
  prepareInvestigationRun({
    notebook,
    action: { kind: "resume", runId: prepared.run.id },
  }).missing.length,
  0,
);
const state = {
  version: 1,
  active: notebook.id,
  settings: DEFAULT_SETTINGS,
  notebooks: [notebook],
};
assert.deepEqual(validateState(structuredClone(state)), state);
const legacy = structuredClone(state);
delete legacy.notebooks[0].investigation;
for (const definition of legacy.notebooks[0].definitions)
  delete definition.updated;
for (const entry of legacy.notebooks[0].history) {
  delete entry.investigation;
  for (const definition of entry.definitions) delete definition.updated;
}
assert.deepEqual(validateState(legacy), legacy);
const snapshot = JSON.stringify(prepared.run);
notebook.investigation.plan.cases[0].values.a = "3";
assert.equal(investigationIsCurrent(notebook, prepared.run), false);
notebook.investigation.plan.cases[0].values.a = "2";
notebook.definitions.forEach((d) => d.updated++);
notebook.investigation.plan.settings.displayDecimals = 2;
assert.equal(investigationIsCurrent(notebook, prepared.run), true);
assert.equal(JSON.stringify(prepared.run), snapshot);
notebook.history.shift();
const resumed = prepareInvestigationRun({
  notebook,
  action: { kind: "resume", runId: prepared.run.id },
});
assert.equal(resumed.missing.length, 1);
assert.equal(
  resumed.missing[0].context.definitions.find((d) => d.name === "a").expression,
  "2",
);
for (const mutate of [
  (s) =>
    s.notebooks[0].investigation.runs.push(
      s.notebooks[0].investigation.runs[0],
    ),
  (s) =>
    s.notebooks[0].investigation.plan.cases.push(
      s.notebooks[0].investigation.plan.cases[0],
    ),
  (s) =>
    s.notebooks[0].history.push({
      ...s.notebooks[0].history[0],
      id: "duplicate-cell",
    }),
  (s) => (s.notebooks[0].history[0].investigation.runId = "absent"),
  (s) => (s.notebooks[0].investigation.plan.cases[0].values.extra = "1"),
  (s) => (s.notebooks[0].investigation.plan.settings.precision = 201),
  (s) => (s.notebooks[0].investigation.plan.parameters = ["a", "a"]),
  (s) => (s.notebooks[0].investigation.plan.question = "x".repeat(4001)),
  (s) =>
    (s.notebooks[0].investigation.plan.steps = Array.from(
      { length: 7 },
      (_, i) => ({
        ...s.notebooks[0].investigation.plan.steps[0],
        id: String(i),
      }),
    )),
  (s) =>
    (s.notebooks[0].investigation.plan.cases = Array.from(
      { length: 9 },
      (_, i) => ({
        ...s.notebooks[0].investigation.plan.cases[0],
        id: String(i),
      }),
    )),
  (s) =>
    (s.notebooks[0].investigation.runs = Array.from({ length: 21 }, (_, i) => ({
      ...s.notebooks[0].investigation.runs[0],
      id: String(i),
    }))),
  (s) => (s.notebooks[0].investigation.runs[0].notebookId = "foreign"),
  (s) => (s.notebooks[0].history[0].investigation.stepId = "absent"),
  (s) => (s.notebooks[0].history[0].investigation.caseId = "absent"),
  (s) => (s.notebooks[0].history[0].operation = "approx"),
  (s) => (s.notebooks[0].history[0].input = "A+1"),
  (s) => (s.notebooks[0].history[0].mode = "math"),
  (s) => {
    s.notebooks[0].history[0].params = {
      ...s.notebooks[0].history[0].params,
      expression: "A+1",
    };
  },
  (s) => {
    s.notebooks[0].history[0].settings = {
      ...s.notebooks[0].history[0].settings,
      precision: 20,
    };
  },
  (s) => s.notebooks[0].history[0].revision++,
  (s) => {
    s.notebooks[0].history[0].definitions = structuredClone(
      s.notebooks[0].history[0].definitions,
    );
    s.notebooks[0].history[0].definitions.find(
      (d) => d.name === "a",
    ).expression = "99";
  },
  (s) =>
    s.notebooks[0].investigation.runs[0].snapshot.context.definitions.push(
      s.notebooks[0].definitions[0],
    ),
]) {
  const invalid = structuredClone(state);
  mutate(invalid);
  assert.throws(() => validateState(invalid));
}
const copied = structuredClone(state);
copied.notebooks[0].id = "imported";
copied.active = "imported";
validateState(copied);
const cosmetic = structuredClone(state);
for (const entry of cosmetic.notebooks[0].history) {
  entry.definitions = structuredClone(entry.definitions).reverse();
  entry.definitions.forEach((d, i) => {
    d.id = "copied-" + i;
    delete d.updated;
  });
}
validateState(cosmetic);
const collision = structuredClone(state);
const collisionBook = collision.notebooks[0];
collisionBook.investigation.runs = [];
collisionBook.history = [];
collisionBook.definitions = [
  { id: "parameter:a", name: "A", kind: "matrix", expression: "Matrix([[a]])" },
  { id: "parameter:a:1", name: "b", kind: "expression", expression: "1" },
];
validateState(collision);
const collisionRun = prepareInvestigationRun({
  notebook: collisionBook,
  action: { kind: "new" },
});
collisionBook.investigation.runs.push(collisionRun.run);
const collisionCell = collisionRun.missing[0];
assert.equal(
  collisionCell.context.definitions.find((d) => d.name === "a").id,
  "parameter:a:2",
);
collisionBook.history.push({
  ...collisionCell.request,
  ...collisionCell.context,
  id: "collision-cell",
  time: 1,
  investigation: collisionCell.cell,
  result: JSON.parse(
    compute(
      JSON.stringify({ ...collisionCell.request, ...collisionCell.context }),
    ),
  ),
});
assert.equal(collisionBook.history[0].result.text, "2");
assert.deepEqual(validateState(collision), collision);
const kept = removeInvestigation(notebook, true);
assert.equal(kept.investigation, undefined);
assert(kept.history.every((e) => e.investigation === undefined));
const dropped = removeInvestigation(notebook, false);
assert.equal(dropped.history.length, 0);
const labs = [];
for (const labId of [
  "derivative-approximations",
  "path-limits",
  "probability-tails",
]) {
  const book = createInvestigationNotebook({
    seed: { kind: "lab", labId },
    workspaceSettings: DEFAULT_SETTINGS,
  });
  const run = prepareInvestigationRun({
    notebook: book,
    action: { kind: "new" },
  });
  book.investigation.runs.push(run.run);
  for (const { cell, request, context } of run.missing) {
    const result = JSON.parse(
      compute(JSON.stringify({ ...request, ...context })),
    );
    assert.notEqual(
      result.status,
      "error",
      labId + " " + cell.caseId + " " + cell.stepId + " " + result.text,
    );
    book.history.push({
      ...request,
      ...context,
      id: String(book.history.length),
      time: 1,
      result,
      investigation: cell,
    });
  }
  const result = (caseId, stepId) =>
    book.history.find(
      (e) =>
        e.investigation.caseId === caseId && e.investigation.stepId === stepId,
    ).result;
  const near = (actual, expected, tolerance = 1e-12) =>
    assert(
      Math.abs(Number(actual) - expected) < tolerance,
      `${actual} versus ${expected}`,
    );
  if (labId === "path-limits") {
    for (const [caseId, expected] of [
      ["axis", "0"],
      ["diagonal", "1/2"],
      ["steeper", "2/5"],
    ])
      for (const stepId of ["far", "near", "limit"])
        assert.equal(result(caseId, stepId).text, expected);
  }
  if (labId === "derivative-approximations") {
    for (const [caseId, h] of [
      ["tenth", 0.1],
      ["hundredth", 0.01],
      ["thousandth", 0.001],
    ]) {
      assert.equal(result(caseId, "reference").text, "cos(1)");
      near(result(caseId, "forward").text, (Math.sin(1 + h) - Math.sin(1)) / h);
      near(
        result(caseId, "central").details["central difference"],
        (Math.cos(1) * Math.sin(h / 2)) / (h / 2),
      );
      near(
        result(caseId, "central").details["step comparison"],
        Math.abs(
          (Math.cos(1) * Math.sin(h / 2)) / (h / 2) -
            (Math.cos(1) * Math.sin(h)) / h,
        ),
      );
    }
    const invalid = run.missing.find((c) => c.cell.stepId === "central");
    const response = JSON.parse(
      compute(
        JSON.stringify({
          ...invalid.request,
          ...invalid.context,
          definitions: [
            {
              id: "h",
              name: "h",
              kind: "expression",
              expression: "0",
              updated: 1,
            },
          ],
        }),
      ),
    );
    assert.equal(response.status, "error");
    assert.match(response.text, /positive/);
  }
  if (labId === "probability-tails") {
    const choose = (n, k) => {
      let v = 1;
      for (let j = 1; j <= k; j++) v = (v * (n - j + 1)) / j;
      return v;
    };
    const tail = (k) =>
      Array.from({ length: 21 - k }, (_, j) => choose(20, k + j)).reduce(
        (a, b) => a + b,
        0,
      ) /
      2 ** 20;
    for (const [caseId, k] of [
      ["middle", 10],
      ["tail", 15],
      ["far-tail", 18],
    ]) {
      near(result(caseId, "inclusive").text, tail(k));
      near(result(caseId, "strict").text, tail(k + 1));
      assert.equal(result(caseId, "inclusive").status, "numeric");
    }
    near(result("tail", "inclusive").text, 21700 / 1048576);
    near(result("far-tail", "strict").text, 21 / 1048576);
  }
  validateState({
    version: 1,
    active: book.id,
    settings: DEFAULT_SETTINGS,
    notebooks: [book],
  });
  labs.push({ id: labId, history: book.history });
}
const custom = createInvestigationNotebook({
  seed: { kind: "custom" },
  workspaceSettings: DEFAULT_SETTINGS,
});
assert.equal(custom.investigation.source, undefined);
assert.deepEqual(custom.definitions, []);
const edited = setInvestigationParameters({
  plan: custom.investigation.plan,
  parameters: ["p", "q"],
});
assert.equal(edited.kind, "ready");
custom.investigation.plan = edited.plan;
const generated = generateInvestigationCases({
  plan: custom.investigation.plan,
  draft: {
    kind: "linear",
    parameter: "p",
    baseCaseId: custom.investigation.plan.cases[0].id,
    start: "0",
    end: "4",
    count: "5",
  },
});
assert.equal(generated.kind, "ready");
custom.investigation.plan = generated.plan;
const question = custom.investigation.plan.steps[0];
question.request.input = "p^2";
question.request.params.expression = "p^2";
question.question = "Square p";
const second = addInvestigationStep(custom.investigation.plan);
assert.equal(second.kind, "ready");
assert.equal(second.plan.steps.length, 2);
const original = prepareInvestigationRun({
  notebook: custom,
  action: { kind: "new" },
});
custom.investigation.runs.push(original.run);
for (const { cell, request, context } of original.missing)
  custom.history.push({
    ...request,
    ...context,
    investigation: cell,
    result: JSON.parse(compute(JSON.stringify({ ...request, ...context }))),
    id: "custom-" + custom.history.length,
    time: 1,
  });
assert.deepEqual(
  custom.history.map((entry) => entry.result.text),
  ["0", "1", "4", "9", "16"],
);
const frozen = JSON.stringify(original.run);
custom.investigation.plan.steps[0].request.input = "p^3";
custom.investigation.plan.steps[0].request.params.expression = "p^3";
custom.definitions.push({
  id: "unrelated",
  name: "r",
  expression: "99",
  kind: "expression",
  updated: 2,
});
const evidence = investigationEvidence({
  notebook: custom,
  runId: original.run.id,
});
const trend = investigationTrend({
  evidence,
  parameter: "p",
  stepId: question.id,
  measure: { kind: "result" },
});
assert.deepEqual(
  trend.rows.map((row) => [row.kind, row.x, row.y.value]),
  [
    ["point", 0, 0],
    ["point", 1, 1],
    ["point", 2, 4],
    ["point", 3, 9],
    ["point", 4, 16],
  ],
);
const imported = validateState(
  JSON.parse(
    exportInvestigationRun({ notebook: custom, runId: original.run.id }),
  ),
).notebooks[0];
assert.deepEqual(imported.history, custom.history);
assert.equal(
  imported.investigation.plan.steps[0].request.params.expression,
  "p^2",
);
assert.deepEqual(imported.definitions, []);
assert.equal(JSON.stringify(original.run), frozen);
const rerun = prepareInvestigationRun({
  notebook: imported,
  action: { kind: "new" },
});
assert.deepEqual(
  rerun.missing.map(
    ({ request, context }) =>
      JSON.parse(compute(JSON.stringify({ ...request, ...context }))).text,
  ),
  ["0", "1", "4", "9", "16"],
);
custom.history.splice(2, 1);
const partial = validateState(
  JSON.parse(
    exportInvestigationRun({ notebook: custom, runId: original.run.id }),
  ),
).notebooks[0];
const resume = prepareInvestigationRun({
  notebook: partial,
  action: { kind: "resume", runId: original.run.id },
});
assert.equal(resume.missing.length, 1);
assert.equal(
  JSON.parse(
    compute(
      JSON.stringify({
        ...resume.missing[0].request,
        ...resume.missing[0].context,
      }),
    ),
  ).text,
  "4",
);
const derivative = labs.find((lab) => lab.id === "derivative-approximations");
assert(derivative);
const derivativeBook = createInvestigationNotebook({
  seed: { kind: "lab", labId: "derivative-approximations" },
  workspaceSettings: DEFAULT_SETTINGS,
});
const derivativeRun = prepareInvestigationRun({
  notebook: derivativeBook,
  action: { kind: "new" },
});
derivativeBook.investigation.runs.push(derivativeRun.run);
for (const { cell, request, context } of derivativeRun.missing)
  derivativeBook.history.push({
    ...request,
    ...context,
    investigation: cell,
    id: "detail-" + derivativeBook.history.length,
    time: 1,
    result: JSON.parse(compute(JSON.stringify({ ...request, ...context }))),
  });
const derivativeEvidence = investigationEvidence({
  notebook: derivativeBook,
  runId: derivativeRun.run.id,
});
const detailTrend = investigationTrend({
  evidence: derivativeEvidence,
  parameter: "h",
  stepId: "central",
  measure: { kind: "detail", key: "central difference" },
});
assert.equal(detailTrend.rows.filter((row) => row.kind === "point").length, 3);
assert(
  detailTrend.measures.some((measure) => measure.key === "step comparison"),
);
const approximationTrend = investigationTrend({
  evidence: derivativeEvidence,
  parameter: "h",
  stepId: "reference",
  measure: { kind: "result" },
});
assert(
  approximationTrend.rows.every(
    (row) =>
      row.kind === "point" && row.y.origin === "approx" && row.y.approximate,
  ),
);
console.log(
  JSON.stringify({
    studio: {
      squares: trend.rows.map((row) => row.y.value),
      partialResume: resume.missing.length,
      detailRows: detailTrend.rows.length,
    },
  }),
);

console.log(JSON.stringify({ labs }));
assert.equal(networkAttempts, 0);
console.log(
  JSON.stringify({
    matrix: notebook.history.map((e) => ({
      cell: e.investigation,
      result: e.result,
    })),
    domain: "passed",
    networkAttempts,
  }),
);
