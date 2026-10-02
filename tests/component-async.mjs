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
console.log(JSON.stringify(results, null, 2));
if (results.some((entry) => !entry.passed)) process.exitCode = 1;
