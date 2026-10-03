import assert from "node:assert/strict";
import {
  componentHarness,
  definition,
  notebook,
  workspace,
  settings,
} from "./component-harness.mjs";

const exact = { status: "exact", text: "42", latex: "42", notes: [] };
const actions = ["saveObject", "openObject", "run"];
function calculator(books, extra = {}) {
  return componentHarness("Calculator", actions, {
    state: workspace(books),
    obj: {},
    name: "New",
    kind: "expression",
    body: "42",
    ...extra,
  });
}
const flush = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};
const results = [];
async function check(name, action) {
  try {
    await action();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
await check(
  "object validation cannot overwrite a different notebook",
  async () => {
    const original = definition("B", "2");
    const harness = calculator([
      notebook("A", [definition("A")]),
      notebook("B", [original]),
    ]);
    const pending = harness.render().actions.saveObject();
    harness.state.set("state", { ...harness.state.get("state"), active: "B" });
    harness.render();
    harness.requests[0].resolve(exact);
    await pending;
    const books = harness.state.get("state").notebooks;
    assert.deepEqual(books.find((book) => book.id === "B").definitions, [
      original,
    ]);
    assert(
      books
        .find((book) => book.id === "A")
        .definitions.some((entry) => entry.name === "A"),
    );
  },
);
await check(
  "stale matrix failure cannot change a newer function editor",
  async () => {
    const harness = calculator([notebook("A")]);
    harness.render().actions.openObject({
      id: "matrix",
      name: "M",
      kind: "matrix",
      expression: "[[1,2],[3,4]]",
    });
    harness.render().actions.openObject({
      id: "function",
      name: "F",
      kind: "function",
      args: "x",
      expression: "x^2",
    });
    harness.requests[0].resolve({
      status: "error",
      text: "Matrix unavailable",
      notes: [],
    });
    await flush();
    assert.equal(harness.state.get("name"), "F");
    assert.equal(harness.state.get("kind"), "function");
    assert.equal(harness.state.get("body"), "x^2");
    assert(!/original matrix/i.test(harness.state.get("notice")));
  },
);
await check(
  "matrix cancellation is handled without an unhandled rejection",
  async () => {
    const harness = calculator([notebook("A")]),
      unhandled = [];
    const capture = (error) => unhandled.push(error.message);
    process.on("unhandledRejection", capture);
    try {
      harness.render().actions.openObject({
        id: "matrix",
        name: "M",
        kind: "matrix",
        expression: "[[1,2],[3,4]]",
      });
      harness.requests[0].reject(
        Error("Calculation cancelled. Input retained."),
      );
      await flush();
      assert.deepEqual(unhandled, []);
      assert.equal(harness.state.get("matrixLoading"), false);
    } finally {
      process.removeListener("unhandledRejection", capture);
    }
  },
);
function objectKindControl(tree) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.props?.label === "Object kind") return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const control = objectKindControl(child);
    if (control) return control;
  }
  return null;
}
await check(
  "assignment matrix draft survives object kind selection and save",
  async () => {
    const harness = calculator([notebook("A")]);
    harness
      .render()
      .actions.openObject({ name: "M", expression: "[[1,2],[3,4]]" });
    const control = objectKindControl(harness.render().tree);
    assert(control, "actual object kind control is rendered");
    control.props.onChange("matrix");
    assert.equal(
      harness.requests.at(-1)?.request.operation,
      "matrix_cells",
      "entered matrix is read before saving",
    );
    harness.requests.at(-1).resolve({
      status: "exact",
      details: {
        cells: [
          ["1", "2"],
          ["3", "4"],
        ],
      },
      notes: [],
    });
    await flush();
    assert.deepEqual(harness.state.get("grid"), [
      ["1", "2"],
      ["3", "4"],
    ]);
    const pending = harness.render().actions.saveObject();
    const request = harness.requests.at(-1);
    assert.equal(
      request.request.definitions.at(-1).expression,
      "Matrix([[1,2],[3,4]])",
    );
    request.resolve(exact);
    await pending;
    assert.equal(
      harness.state.get("state").notebooks[0].definitions.at(-1).expression,
      "Matrix([[1,2],[3,4]])",
    );
  },
);
await check(
  "switching from edited matrix retains cells in the expression draft",
  async () => {
    const harness = calculator([notebook("A")], {
      kind: "matrix",
      grid: [
        ["2", "3"],
        ["5", "7"],
      ],
      modal: "object",
    });
    objectKindControl(harness.render().tree).props.onChange("expression");
    assert.equal(harness.state.get("body"), "Matrix([[2,3],[5,7]])");
  },
);
await check(
  "kind changes cancel stale matrix conversion without losing the draft",
  async () => {
    const harness = calculator([notebook("A")]);
    harness
      .render()
      .actions.openObject({ name: "M", expression: "[[1,2],[3,4]]" });
    objectKindControl(harness.render().tree).props.onChange("matrix");
    const request = harness.requests.at(-1);
    assert(request, "matrix conversion starts");
    objectKindControl(harness.render().tree).props.onChange("function");
    request.resolve({
      status: "exact",
      details: { cells: [["9"]] },
      notes: [],
    });
    await flush();
    assert.equal(harness.state.get("kind"), "function");
    assert.equal(harness.state.get("body"), "[[1,2],[3,4]]");
    assert.equal(harness.state.get("matrixLoading"), false);
  },
);
await check(
  "dataset selection retains non-list entered source visibly",
  async () => {
    const harness = calculator([notebook("A")], {
      body: "sin(x)",
      modal: "object",
    });
    objectKindControl(harness.render().tree).props.onChange("dataset");
    assert.equal(harness.state.get("body"), "sin(x)");
    function expressionInput(tree) {
      if (!tree || typeof tree !== "object") return null;
      if (tree.props?.["aria-label"] === "Object expression") return tree;
      for (const child of [tree.props?.children].flat(Infinity)) {
        const input = expressionInput(child);
        if (input) return input;
      }
      return null;
    }
    assert.equal(expressionInput(harness.render().tree)?.props.value, "sin(x)");
  },
);
await check(
  "pristine matrix draft keeps the default grid without computation",
  async () => {
    const harness = calculator([notebook("A")]);
    harness.render().actions.openObject();
    objectKindControl(harness.render().tree).props.onChange("matrix");
    assert.deepEqual(harness.state.get("grid"), [
      ["1", "0"],
      ["0", "1"],
    ]);
    assert.equal(harness.requests.length, 0);
  },
);
await check(
  "unreadable matrix kind conversion preserves the original entered source",
  async () => {
    const harness = calculator([notebook("A")]);
    harness.render().actions.openObject({ expression: "sin(x)" });
    objectKindControl(harness.render().tree).props.onChange("matrix");
    harness.requests
      .at(-1)
      .resolve({ status: "error", text: "Not a matrix", notes: [] });
    await flush();
    assert.equal(harness.state.get("body"), "sin(x)");
    assert.equal(harness.state.get("kind"), "expression");
    assert.equal(harness.state.get("matrixLoading"), false);
  },
);
await check(
  "graph derivation preserves concurrent graph edits and additions",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["derived"]);
    const original = harness.exports.makeGraph("x^2"),
      added = harness.exports.makeGraph("sin(x)");
    let graphs = [original];
    const props = () => ({
      graphs,
      onChange: (value) => (graphs = value),
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    });
    const pending = harness.render(props()).actions.derived("graph_derivative");
    graphs = [{ ...original, visible: false }, added];
    harness.render(props());
    harness.requests[0].resolve({ ...exact, reusable: "2*x" });
    await pending;
    assert(
      graphs.some((graph) => graph.id === added.id),
      "Concurrent graph was lost",
    );
    assert.equal(
      graphs.find((graph) => graph.id === original.id).visible,
      false,
    );
  },
);
await check(
  "a full history stays exportable when another calculation is attempted",
  async () => {
    const book = notebook("A");
    book.history = Array.from({ length: 10000 }, (_, i) => ({
      id: `entry-${i}`,
      input: "1",
      mode: "text",
      operation: "evaluate",
      params: {},
      result: exact,
      settings,
      definitions: [],
      time: 1,
      revision: 0,
    }));
    const harness = calculator([book], { input: "1", mode: "text" });
    const pending = harness.render().actions.run();
    harness.requests[0]?.resolve(exact);
    await pending;
    assert.equal(harness.state.get("state").notebooks[0].history.length, 10000);
    assert.equal(
      harness.requests.length,
      0,
      "An unpersistable calculation was dispatched",
    );
  },
);
await check(
  "a full definition collection does not accept an unpersistable object",
  async () => {
    const book = notebook(
      "A",
      Array.from({ length: 500 }, (_, i) => definition(`D${i}`)),
    );
    const harness = calculator([book]);
    const pending = harness.render().actions.saveObject();
    harness.requests[0]?.resolve(exact);
    await pending;
    assert.equal(
      harness.state.get("state").notebooks[0].definitions.length,
      500,
    );
  },
);
await check(
  "Fit supports the valid combined graph-data limit without spread overflow",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["fit"]);
    const graphs = Array.from({ length: 10 }, (_, index) => ({
      ...harness.exports.makeGraph("Data", "data"),
      points: Array.from({ length: 20000 }, (_, i) => [index * 20000 + i, i]),
    }));
    const rendered = harness.render({
      graphs,
      onChange() {},
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    });
    assert.doesNotThrow(() => rendered.actions.fit());
    assert(harness.state.get("range").every(Number.isFinite));
  },
);
await check(
  "graph derivation ignores an unmounted notebook and respects the graph cap",
  async () => {
    for (const unmount of [true, false]) {
      const harness = componentHarness("GraphWorkspace", [
        "derived",
        "addGraph",
      ]);
      let graphs = [harness.exports.makeGraph("x^2")];
      const props = () => ({
        graphs,
        onChange: (value) => (graphs = value),
        definitions: [],
        settings,
        onAnalyze() {},
        onReuse() {},
      });
      const pending = harness
        .render(props())
        .actions.derived("graph_derivative");
      if (unmount) harness.unmount();
      else {
        graphs = Array.from({ length: 100 }, (_, i) =>
          i ? harness.exports.makeGraph("x") : graphs[0],
        );
        harness.render(props()).actions.addGraph();
        assert.equal(graphs.length, 100);
      }
      harness.requests[0].resolve({ ...exact, reusable: "2*x" });
      await pending;
      assert.equal(graphs.length, unmount ? 1 : 100);
    }
  },
);
await check(
  "graph derivation handles cancellation and changed source without a stale append",
  async () => {
    for (const cancel of [true, false]) {
      const harness = componentHarness("GraphWorkspace", ["derived"]);
      let graphs = [harness.exports.makeGraph("x^2")];
      const props = () => ({
        graphs,
        onChange: (value) => (graphs = value),
        definitions: [],
        settings,
        onAnalyze() {},
        onReuse() {},
      });
      const pending = harness
        .render(props())
        .actions.derived("graph_derivative");
      if (cancel)
        harness.requests[0].reject(
          Error("Calculation cancelled. Input retained."),
        );
      else {
        graphs = [{ ...graphs[0], expression: "x^3" }];
        harness.render(props());
        harness.requests[0].resolve({ ...exact, reusable: "2*x" });
      }
      await pending;
      assert.equal(graphs.length, 1);
      assert.equal(harness.state.get("busy"), false);
    }
  },
);
function fieldEditor() {
  const conversions = [];
  const operation = {
    id: "differentiate",
    name: "Differentiate",
    fields: [
      { key: "expression", label: "Expression", value: "x^2" },
      { key: "variable", label: "Variable", value: "x" },
    ],
  };
  const harness = componentHarness(
    "Calculator",
    ["openMathField", "closeModal", "choose"],
    {
      state: workspace([notebook("A")]),
      modal: "operation",
      op: operation,
      params: { expression: "x^2", variable: "x" },
    },
    {
      "@/lib/calculator/notation": {
        sourceToMath: (source) =>
          new Promise((resolve, reject) =>
            conversions.push({ source, resolve, reject }),
          ),
      },
    },
  );
  return { harness, conversions, operation };
}
await check("closing a form invalidates its pending field editor", async () => {
  for (const reject of [false, true]) {
    const { harness, conversions } = fieldEditor();
    const actions = harness.render().actions;
    const pending = actions.openMathField("expression", "Expression");
    actions.closeModal();
    // Closure invalidation is synchronous, before a subsequent render.
    if (reject) conversions[0].reject(Error("Import failed"));
    else conversions[0].resolve({ latex: "x^{2}" });
    await pending;
    assert.equal(harness.state.get("mathField"), null);
    assert.equal(harness.state.get("notice"), "");
  }
});
await check(
  "reopening the same operation discards its old conversion",
  async () => {
    const { harness, conversions, operation } = fieldEditor();
    const actions = harness.render().actions;
    const pending = actions.openMathField("expression", "Expression");
    actions.closeModal();
    actions.choose(operation);
    harness.render();
    conversions[0].resolve({ latex: "x^{2}" });
    await pending;
    assert.equal(harness.state.get("modal"), "operation");
    assert.equal(harness.state.get("mathField"), null);
    const current = harness
      .render()
      .actions.openMathField("expression", "Expression");
    conversions[1].resolve({ latex: "x^{2}" });
    await current;
    assert.equal(harness.state.get("mathField").key, "expression");
  },
);
await check(
  "the latest requested field wins out-of-order conversion",
  async () => {
    const { harness, conversions } = fieldEditor();
    const actions = harness.render().actions;
    const older = actions.openMathField("expression", "Expression");
    const newer = actions.openMathField("variable", "Variable");
    conversions[1].resolve({ latex: "x" });
    await newer;
    conversions[0].resolve({ latex: "x^{2}" });
    await older;
    assert.deepEqual(harness.state.get("mathField"), {
      key: "variable",
      label: "Variable",
      latex: "x",
    });
  },
);
await check(
  "leaving the operation invalidates conversion notices",
  async () => {
    const { harness, conversions } = fieldEditor();
    const pending = harness
      .render()
      .actions.openMathField("expression", "Expression");
    harness.state.set("modal", "search");
    harness.render();
    conversions[0].resolve({ reason: "Unsupported notation" });
    await pending;
    assert.equal(harness.state.get("mathField"), null);
    assert.equal(harness.state.get("notice"), "");
  },
);
console.log(JSON.stringify(results, null, 2));
if (results.some((entry) => !entry.passed)) process.exitCode = 1;
