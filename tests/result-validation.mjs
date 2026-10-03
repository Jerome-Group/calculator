import assert from "node:assert/strict";
import { validateState } from "../lib/calculator/storage.ts";
import { DEFAULT_SETTINGS, newNotebook } from "../lib/calculator/types.ts";

function savedResult(result, operation = "evaluate") {
  const book = newNotebook();
  book.history.push({
    id: "history",
    input: "1",
    mode: "text",
    operation,
    params: {},
    settings: { ...DEFAULT_SETTINGS },
    definitions: [],
    revision: 0,
    time: 1,
    result: { status: "exact", text: "1", latex: "1", notes: [], ...result },
  });
  return {
    version: 1,
    notebooks: [book],
    active: book.id,
    settings: { ...DEFAULT_SETTINGS },
  };
}
const results = [];
function check(name, action) {
  try {
    action();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
check("recursive display width and nonfinite details are bounded", () => {
  const display = {
    type: "list",
    items: Array.from({ length: 100000 }, () => ({ type: "text", text: "1" })),
  };
  assert.throws(() => validateState(savedResult({ display })));
  assert.throws(() =>
    validateState(savedResult({ details: { value: Infinity } })),
  );
});
check(
  "current recursive mathematical display survives a backup round trip",
  () => {
    const state = savedResult({
      display: {
        type: "fields",
        items: [
          {
            label: "Solution",
            value: {
              type: "list",
              items: [
                { type: "math", latex: "x=1", text: "Eq(x,1)" },
                { type: "text", text: "Conditional on the saved assumptions" },
                {
                  type: "table",
                  headers: ["x", "y"],
                  rows: [
                    [
                      { type: "math", latex: "1" },
                      { type: "math", latex: "2" },
                    ],
                  ],
                },
              ],
            },
          },
        ],
      },
      detailDisplay: null,
      details: { roots: [1], condition: null },
      detailSources: { roots: "[1]" },
      inputLatex: "x",
      reusable: "1",
    });
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  },
);
check("malformed recursive displays are rejected before rendering", () => {
  for (const display of [
    { type: "fields", items: null },
    { type: "list", items: [null] },
    {
      type: "fields",
      items: [{ label: "x", value: { type: "math", latex: {} } }],
    },
    { type: "table", headers: ["x"], rows: [null] },
    { type: "table", headers: [null], rows: [] },
    { type: "unknown", text: "1" },
  ])
    assert.throws(
      () => validateState(savedResult({ display })),
      JSON.stringify(display),
    );
});
check("optional result strings and detail sources cannot carry objects", () => {
  for (const extra of [
    { reusable: { expression: "1" } },
    { approx: [] },
    { inputLatex: {} },
    { detailDisplay: { type: "list", items: null } },
    { detailSources: { x: { source: "1" } } },
  ])
    assert.throws(
      () => validateState(savedResult(extra)),
      JSON.stringify(extra),
    );
});
check("recursive display depth is bounded", () => {
  let display = { type: "text", text: "1" };
  for (let i = 0; i < 500; i++) display = { type: "list", items: [display] };
  assert.throws(() => validateState(savedResult({ display })));
});
check(
  "plot and trajectory data are validated before reaching consumers",
  () => {
    for (const [operation, details] of [
      ["histogram", { counts: {}, "bin lower bounds": [0] }],
      ["histogram", { counts: [1], "bin lower bounds": [] }],
      ["poisson", { "interior solution": [[1], null] }],
      [
        "poisson",
        {
          "interior solution": Array.from({ length: 36 }, () =>
            Array(36).fill(1),
          ),
        },
      ],
      [
        "histogram",
        { counts: Array(101).fill(1), "bin lower bounds": Array(101).fill(0) },
      ],
      ["ivp", { t: "time", values: [[1]] }],
      ["bvp", { t: [0, 1], values: [[1]] }],
    ])
      assert.throws(
        () => validateState(savedResult({ details }, operation)),
        operation,
      );
  },
);
check("history metadata and IDs satisfy the current persisted contract", () => {
  for (const mutation of [
    (entry) => (entry.mode = "unknown"),
    (entry) => (entry.revision = -1),
    (entry) => (entry.time = Infinity),
  ]) {
    const state = savedResult({});
    mutation(state.notebooks[0].history[0]);
    assert.throws(() => validateState(state));
  }
  const state = savedResult({});
  state.notebooks[0].history.push(
    structuredClone(state.notebooks[0].history[0]),
  );
  assert.throws(
    () => validateState(state),
    "Duplicate history IDs were accepted",
  );
});
check("definition and graph IDs cannot collide within one notebook", () => {
  const definitions = savedResult({});
  definitions.notebooks[0].definitions = ["A", "B"].map((name) => ({
    id: "shared",
    name,
    expression: "1",
    kind: "expression",
    args: "",
    updated: 1,
  }));
  assert.throws(() => validateState(definitions));
  const graphs = savedResult({});
  const graph = {
    id: "shared",
    expression: "x",
    type: "cartesian",
    second: "",
    visible: true,
    color: "#123456",
    min: "0",
    max: "1",
  };
  graphs.notebooks[0].graphs = [graph, { ...graph, expression: "x^2" }];
  assert.throws(() => validateState(graphs));
});
console.log(JSON.stringify(results, null, 2));
if (results.some((entry) => !entry.passed)) process.exitCode = 1;
