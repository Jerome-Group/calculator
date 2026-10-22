import assert from "node:assert/strict";
import * as displayFormat from "../lib/calculator/display-format.ts";
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
function copyResult(clipboard, latex = String.raw`\frac{x+1}{2}`) {
  const book = notebook("clipboard");
  book.history.push({
    id: "result",
    input: "(x+1)/2",
    mode: "text",
    operation: "evaluate",
    params: {},
    result: { ...exact, text: "(x+1)/2", latex },
    settings,
    time: 1,
    revision: 0,
    definitions: [],
  });
  const downloads = [];
  const harness = componentHarness(
    "Calculator",
    [],
    { state: workspace([book]) },
    {
      "@/lib/calculator/storage": {
        readDeviceSave: () => null,
        download: (...args) => downloads.push(args),
      },
    },
  );
  harness.navigator.clipboard = clipboard;
  function findCopy(tree) {
    if (!tree || typeof tree !== "object") return null;
    if (tree.type === "button" && tree.props.children === "Copy LaTeX")
      return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
      const button = findCopy(child);
      if (button) return button;
    }
    return null;
  }
  const button = findCopy(harness.render().tree);
  assert(button, "The result card renders its Copy LaTeX button");
  return { harness, downloads, copy: button.props.onClick };
}
for (const latex of [String.raw`\frac{x+1}{2}`, ""]) {
  const payload = latex || "(x+1)/2";
  await check(
    `Copy LaTeX downloads ${latex ? "LaTeX" : "text"} when clipboard is unavailable`,
    async () => {
      const { harness, downloads, copy } = copyResult(undefined, latex);
      await copy();
      await flush();
      assert.deepEqual(downloads, [["expression.tex", payload, "text/plain"]]);
      assert.equal(harness.state.get("notice"), "");
    },
  );
  await check(
    `Copy LaTeX writes ${latex ? "LaTeX" : "text"} and confirms clipboard success`,
    async () => {
      const writes = [];
      const { harness, downloads, copy } = copyResult(
        { writeText: async (text) => writes.push(text) },
        latex,
      );
      await copy();
      await flush();
      assert.deepEqual(writes, [payload]);
      assert.deepEqual(downloads, []);
      assert.equal(harness.state.get("notice"), "Copied.");
    },
  );
  for (const failure of ["rejected", "thrown"]) {
    await check(
      `Copy LaTeX downloads ${latex ? "LaTeX" : "text"} after a ${failure} clipboard write`,
      async () => {
        const writes = [];
        const { harness, downloads, copy } = copyResult(
          {
            writeText(text) {
              writes.push(text);
              if (failure === "thrown") throw Error("Clipboard unavailable");
              return Promise.reject(Error("Clipboard permission denied"));
            },
          },
          latex,
        );
        await copy();
        await flush();
        assert.deepEqual(writes, [payload]);
        assert.deepEqual(downloads, [
          ["expression.tex", payload, "text/plain"],
        ]);
        assert.equal(harness.state.get("notice"), "");
      },
    );
  }
}
await check(
  "Copy LaTeX waits for the clipboard write before confirming",
  async () => {
    const writes = [];
    let resolveWrite;
    const { harness, downloads, copy } = copyResult({
      writeText(text) {
        writes.push(text);
        return new Promise((resolve) => (resolveWrite = resolve));
      },
    });
    const pending = copy();
    await flush();
    assert.deepEqual(writes, [String.raw`\frac{x+1}{2}`]);
    assert.deepEqual(downloads, []);
    assert.equal(harness.state.get("notice"), "");
    resolveWrite();
    await pending;
    await flush();
    assert.deepEqual(downloads, []);
    assert.equal(harness.state.get("notice"), "Copied.");
  },
);
await check(
  "protected mode conversion retains source and explains its Text notation",
  async () => {
    const latex = String.raw`\begin{vmatrix}1&2\\3&4\end{vmatrix}`;
    const harness = componentHarness(
      "Calculator",
      ["switchMode"],
      {
        state: workspace([notebook("A")]),
        mode: "math",
        latex,
        input: "",
      },
      {
        "@/lib/calculator/notation": {
          mathToSource: async () => "latex:" + latex,
        },
      },
    );
    assert.equal(await harness.render().actions.switchMode("text"), true);
    assert.equal(harness.state.get("input"), "latex:" + latex);
    assert.equal(harness.state.get("mode"), "text");
    assert.equal(
      harness.state.get("notice"),
      "Original LaTeX retained to preserve this expression.",
    );
  },
);
await check(
  "stale protected conversion cannot replace a new draft or another notebook",
  async () => {
    for (const change of ["draft", "notebook", "newer conversion"]) {
      const pending = [],
        latex = String.raw`\lvert x\rvert`;
      const harness = componentHarness(
        "Calculator",
        ["switchMode"],
        {
          state: workspace([notebook("A"), notebook("B")]),
          mode: "math",
          latex,
          input: "original",
        },
        {
          "@/lib/calculator/notation": {
            mathToSource: () => new Promise((resolve) => pending.push(resolve)),
          },
        },
      );
      const first = harness.render().actions.switchMode("text");
      if (change === "draft") harness.state.set("latex", "x+2");
      if (change === "notebook")
        harness.state.set("state", {
          ...harness.state.get("state"),
          active: "B",
        });
      const latest = harness.render().actions;
      const second =
        change === "newer conversion" ? latest.switchMode("text") : null;
      pending[0]("latex:" + latex);
      assert.equal(await first, false);
      assert.equal(harness.state.get("input"), "original");
      assert.equal(harness.state.get("mode"), "math");
      assert(!harness.state.get("notice"));
      if (second) {
        pending[1]("latex:" + latex);
        assert.equal(await second, true);
        assert.equal(harness.state.get("input"), "latex:" + latex);
      }
    }
  },
);
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
function graphTrace(expressions = ["x^2"]) {
  const harness = componentHarness(
      "GraphWorkspace",
      [],
      {},
      {
        "@/lib/calculator/display-format": displayFormat,
      },
    ),
    reused = [];
  let graphs = expressions.map((expression) =>
      harness.exports.makeGraph(expression),
    ),
    definitions = [],
    graphSettings = settings;
  const render = () =>
    harness.render({
      graphs,
      onChange: (value) => (graphs = value),
      definitions,
      settings: graphSettings,
      onAnalyze() {},
      onReuse: (value) => reused.push(JSON.parse(value)),
    }).tree;
  const nodes = (tree) =>
    !tree || typeof tree !== "object"
      ? []
      : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const control = (label) =>
    nodes(render()).find(
      (node) =>
        node.props?.["aria-label"] === label || node.props?.label === label,
    );
  const usePoint = () =>
    nodes(render()).find(
      (node) => node.type === "button" && node.props.children === "Use point",
    );
  const text = (tree) =>
    tree && typeof tree === "object"
      ? [tree.props?.children].flat(Infinity).map(text).join("")
      : String(tree ?? "");
  return {
    control,
    usePoint,
    reused,
    traceText: () =>
      text(
        nodes(render()).find((node) => node.props?.className === "trace-bar"),
      ),
    definitions: (value) => (definitions = value),
    settings: (value) => (graphSettings = value),
    select(index) {
      nodes(render())
        .filter((node) =>
          node.props?.className?.startsWith("graph-expression "),
        )
        [index].props.onClick();
    },
    trace(x) {
      control("Trace graph").props.onClick();
      const canvas = nodes(render()).find((node) => node.type === "canvas");
      canvas.props.ref.current = {
        setPointerCapture() {},
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      };
      canvas.props.onPointerDown({
        pointerId: 1,
        clientX: ((x + 6) / 12) * 640,
        clientY: 200,
      });
      canvas.props.onPointerUp({ pointerId: 1 });
    },
  };
}
await check(
  "trace and Use point follow expression and scope edits",
  async () => {
    const graph = graphTrace();
    graph.trace(0);
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [0, 0]);
    graph.control("Graph 1 expression").props.onChange({
      target: { value: "x^2+1" },
    });
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [0, 1]);
    assert.match(graph.traceText(), /x = 0 · y = 1/);
    graph.definitions([definition("b", "1")]);
    graph.control("Graph 1 expression").props.onChange({
      target: { value: "a*x+b+sin(30)" },
    });
    graph.trace(3);
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [3, 4 + Math.sin(30)]);
    graph.control("Parameter a").props.onValueChange([2]);
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [3, 7 + Math.sin(30)]);
    graph.definitions([definition("b", "5")]);
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [3, 11 + Math.sin(30)]);
    graph.settings({ ...settings, angle: "deg" });
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [3, 11.5]);
  },
);
await check(
  "trace follows the selected curve and sequence domain",
  async () => {
    const graph = graphTrace(["x^2", "2*x"]);
    graph.trace(1.5);
    graph.select(1);
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [1.5, 3]);
    graph.control("Graph 2 type").props.onChange("sequence");
    graph.control("Graph 2 expression").props.onChange({
      target: { value: "n^2" },
    });
    graph.usePoint().props.onClick();
    assert.deepEqual(graph.reused.at(-1), [2, 4]);
  },
);
await check("trace hides stale points for unavailable curves", async () => {
  for (const change of [
    (graph) => graph.control("Hide graph 1").props.onClick(),
    (graph) => graph.control("Graph 1 type").props.onChange("parametric"),
    (graph) => graph.control("Delete graph 1").props.onClick(),
    ...["x+", "missing(x)", "1/0"].map(
      (expression) => (graph) =>
        graph.control("Graph 1 expression").props.onChange({
          target: { value: expression },
        }),
    ),
  ]) {
    const graph = graphTrace(["x^2", "2*x"]);
    graph.trace(0);
    assert(graph.usePoint());
    change(graph);
    assert.equal(graph.usePoint(), undefined);
  }
});
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
  "saved function Graph uses unary and two-argument coordinates, and guides larger arities",
  async () => {
    for (const [args, expression, type] of [
      ["u", "f(x)", "cartesian"],
      ["u, v", "f(x,y)", "surface"],
      ["u, v, w", null, null],
    ]) {
      const saved = { ...definition("f", "u^2"), kind: "function", args };
      const graphWorkspace = componentHarness("GraphWorkspace", []);
      const harness = componentHarness(
        "Calculator",
        [],
        { state: workspace([notebook("A", [saved])]), view: "objects" },
        { "./GraphWorkspace": graphWorkspace.exports },
      );
      const findGraph = (node) => {
        if (!node || typeof node !== "object") return null;
        if (node.type === "button" && node.props.children === "Graph")
          return node;
        return [node.props?.children]
          .flat(Infinity)
          .map(findGraph)
          .find(Boolean);
      };
      const button = findGraph(harness.render().tree);
      assert(button, "Saved function exposes a Graph action");
      button.props.onClick();
      const graphs = harness.state.get("state").notebooks[0].graphs;
      if (expression) {
        assert.equal(graphs.length, 1);
        assert.equal(graphs[0].expression, expression);
        assert.equal(graphs[0].type, type);
        assert.equal(harness.state.get("view"), "graphs");
      } else {
        assert.equal(
          graphs.length,
          0,
          "A higher-arity function created a malformed graph",
        );
        assert.match(harness.state.get("notice"), /argument|parameter/i);
      }
    }
  },
);
await check(
  "reversed graph table bounds warn and valid bounds recover all rows",
  async () => {
    const harness = componentHarness("GraphWorkspace", [], {
      lower: "2",
      upper: "-2",
      table: true,
    });
    const props = {
      graphs: [harness.exports.makeGraph("x^2")],
      onChange() {},
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    };
    const text = (node) => {
      if (node === null || node === undefined || typeof node === "boolean")
        return "";
      if (typeof node !== "object") return String(node);
      return [node.props?.children].flat(Infinity).map(text).join(" ");
    };
    const alerts = [];
    const collectAlerts = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.props?.role === "alert") alerts.push(text(node));
      for (const child of [node.props?.children].flat(Infinity))
        collectAlerts(child);
    };
    collectAlerts(harness.render(props).tree);
    assert.match(alerts.join(" "), /start.*end/i);
    harness.state.set("lower", "-2");
    harness.state.set("upper", "2");
    const tree = harness.render(props).tree;
    assert.doesNotMatch(text(tree), /Use finite numbers/);
    const rows = [];
    const collect = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "tbody")
        rows.push(...[node.props.children].flat(Infinity));
      for (const child of [node.props?.children].flat(Infinity)) collect(child);
    };
    collect(tree);
    assert.equal(rows.length, 11);
  },
);
await check(
  "Fit combines visible data, Cartesian and integer sequence samples",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["fit"]);
    const graphs = [
      { ...harness.exports.makeGraph("Data", "data"), points: [[100, 10]] },
      harness.exports.makeGraph("x^2", "cartesian"),
      harness.exports.makeGraph("n%2 == 0 ? -80 : -40", "sequence"),
      {
        ...harness.exports.makeGraph("Hidden", "data"),
        visible: false,
        points: [[-1000, -1000]],
      },
    ];
    harness
      .render({
        graphs,
        onChange() {},
        definitions: [],
        settings,
        onAnalyze() {},
        onReuse() {},
      })
      .actions.fit();
    const [left, right, bottom, top] = harness.state.get("range");
    assert(left <= -6 && right > 100);
    assert(bottom < -80 && top > 36);
    assert(left > -1000 && bottom > -1000, "Hidden data affected Fit");
    assert.equal(harness.state.get("error"), "");
  },
);
await check(
  "Fit samples declared parametric and polar domains in matching angle units",
  async () => {
    for (const angle of ["rad", "deg"]) {
      for (const radians of [false, true]) {
        const harness = componentHarness("GraphWorkspace", ["fit"]);
        const quarter = angle === "deg" && !radians ? "90" : "pi/2";
        const graphs = [
          {
            ...harness.exports.makeGraph("100+cos(t)", "parametric"),
            second: "200+sin(t)",
            min: "0",
            max: quarter,
            radians,
          },
          {
            ...harness.exports.makeGraph("10", "polar"),
            min: "0",
            max: quarter,
            radians,
          },
        ];
        harness
          .render({
            graphs,
            onChange() {},
            definitions: [],
            settings: { ...settings, angle },
            onAnalyze() {},
            onReuse() {},
          })
          .actions.fit();
        const [left, right, bottom, top] = harness.state.get("range");
        assert(left < 0 && right > 101);
        assert(bottom < 0 && top > 201);
        assert(bottom > -100, "Polar angle units changed the sampled quadrant");
        assert.equal(harness.state.get("error"), "");
        harness
          .render({
            graphs: [graphs[0]],
            onChange() {},
            definitions: [],
            settings: { ...settings, angle },
            onAnalyze() {},
            onReuse() {},
          })
          .actions.fit();
        harness.state.get("range").forEach((bound, i) => {
          assert(Math.abs(bound - [99.9, 101.1, 199.9, 201.1][i]) < 1e-8);
        });
        harness
          .render({
            graphs: [graphs[1]],
            onChange() {},
            definitions: [],
            settings: { ...settings, angle },
            onAnalyze() {},
            onReuse() {},
          })
          .actions.fit();
        const polarRange = harness.state.get("range");
        assert(polarRange[0] >= -1.00001 && polarRange[1] <= 11.00001);
        assert(polarRange[2] > -2 && polarRange[3] < 12);
      }
    }
  },
);
await check(
  "Fit draws finite parametric and polar segments over extreme finite domains",
  async () => {
    const originalPixelRatio = Object.getOwnPropertyDescriptor(
      globalThis,
      "devicePixelRatio",
    );
    globalThis.devicePixelRatio = 1;
    try {
      for (const [type, expression, min, max] of [
        ["parametric", "t/1e308", "-1e308", "1e308"],
        ["parametric", "t/1e308", "1e308", "1.5e308"],
        ["polar", "1", "-1e308", "1e308"],
        ["polar", "1", "1e308", "1.5e308"],
      ]) {
        const harness = componentHarness("GraphWorkspace", ["fit"]);
        const graph = {
          ...harness.exports.makeGraph(expression, type),
          second: "0",
          min,
          max,
        };
        const props = {
          graphs: [graph],
          onChange() {},
          definitions: [],
          settings,
          onAnalyze() {},
          onReuse() {},
        };
        const paths = [];
        let path = [];
        const context = {
          scale() {},
          fillRect() {},
          fillText() {},
          beginPath() {
            path = [];
          },
          moveTo(x, y) {
            path.push({ x, y, connected: false });
          },
          lineTo(x, y) {
            path.push({ x, y, connected: true });
          },
          stroke() {
            if (this.strokeStyle === graph.color) paths.push(path);
          },
        };
        const nodes = (tree) =>
          !tree || typeof tree !== "object"
            ? []
            : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
        const initial = harness.render(props);
        initial.actions.fit();
        assert.equal(harness.state.get("error"), "");
        const canvas = nodes(initial.tree).find(
          (node) => node.type === "canvas",
        );
        canvas.props.ref.current = { getContext: () => context };
        harness.render(props);
        harness.runEffects();
        const points = paths.flat();
        assert.equal(points.length, 1001, `${type} lost its finite samples`);
        assert(
          points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
          `${type} sent nonfinite coordinates to the canvas`,
        );
        assert(
          points.some((point) => point.connected),
          `${type} has no segments`,
        );
        if (type === "parametric") {
          assert.equal(points.filter((point) => point.connected).length, 1000);
          assert(points[0].x < points.at(-1).x);
          assert(points.every(({ y }) => Math.abs(y - 200) < 1e-10));
        }
      }
    } finally {
      if (originalPixelRatio)
        Object.defineProperty(
          globalThis,
          "devicePixelRatio",
          originalPixelRatio,
        );
      else delete globalThis.devicePixelRatio;
    }
  },
);
await check(
  "Fit reports unsupported and empty curves then recovers on a finite curve",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["fit"]);
    const props = {
      onChange() {},
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    };
    const previous = [-6, 6, -4, 4];
    for (const graph of [
      harness.exports.makeGraph("x+y", "surface"),
      harness.exports.makeGraph("sqrt(-1)", "cartesian"),
      { ...harness.exports.makeGraph("t", "parametric"), min: "3", max: "1" },
    ]) {
      harness.render({ ...props, graphs: [graph] }).actions.fit();
      assert.deepEqual(harness.state.get("range"), previous);
      assert.match(harness.state.get("error"), /Fit|fit|finite/);
    }
    harness
      .render({ ...props, graphs: [harness.exports.makeGraph("x^2")] })
      .actions.fit();
    assert.equal(harness.state.get("error"), "");
    assert(harness.state.get("range")[3] > 36);
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
  "Cartesian Fit retains finite bounds after extreme samples",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["fit"]);
    const graph = {
      ...harness.exports.makeGraph("1e308*x", "cartesian"),
      visible: true,
    };
    const props = {
      graphs: [graph],
      onChange() {},
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    };
    harness.render(props);
    const previous = [...harness.state.get("range")];
    harness.render(props).actions.fit();
    assert.deepEqual(harness.state.get("range"), previous);
    assert.match(harness.state.get("error"), /drawable range/);
    harness
      .render({ ...props, graphs: [{ ...graph, expression: "1.4e307*x" }] })
      .actions.fit();
    assert.deepEqual(harness.state.get("range"), previous);
    assert.match(harness.state.get("error"), /drawable range/);
    harness
      .render({ ...props, graphs: [{ ...graph, expression: "x^2" }] })
      .actions.fit();
    assert(harness.state.get("range").every(Number.isFinite));
    assert(harness.state.get("range")[2] < harness.state.get("range")[3]);
    assert.equal(harness.state.get("error"), "");
  },
);
await check(
  "graph viewport stays drawable through extreme zoom and data Fit",
  async () => {
    const harness = componentHarness("GraphWorkspace", ["zoom", "fit"], {
      range: [1e308 - 1e293, 1e308 + 1e293, -1, 1],
    });
    const props = {
      graphs: [],
      onChange() {},
      definitions: [],
      settings,
      onAnalyze() {},
      onReuse() {},
    };
    harness.render(props).actions.zoom(0.67);
    const next = [...harness.state.get("range")];
    assert(next.every(Number.isFinite), "Finite large midpoint overflowed");
    assert(next[1] > next[0]);
    harness.render(props).actions.zoom(1e300);
    assert.deepEqual(
      harness.state.get("range"),
      next,
      "Overflowing zoom replaced drawable range",
    );
    const graph = {
      ...harness.exports.makeGraph("Data", "data"),
      points: [
        [-8e307, 0],
        [8e307, 1],
      ],
    };
    harness.render({ ...props, graphs: [graph] }).actions.fit();
    assert.deepEqual(
      harness.state.get("range"),
      next,
      "Padded data span overflowed",
    );
    assert.match(harness.state.get("error"), /drawable range/);
    harness.state.set("range", [-6, 6, -4, 4]);
    harness.render(props).actions.zoom(0.5);
    assert.deepEqual(harness.state.get("range"), [-3, 3, -2, 2]);
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
