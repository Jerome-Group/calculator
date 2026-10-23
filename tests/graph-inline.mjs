import assert from "node:assert/strict";
import * as displayFormat from "../lib/calculator/display-format.ts";
import {
  componentHarness,
  notebook,
  workspace,
  settings,
  definition,
} from "./component-harness.mjs";

const exact = {
  status: "exact",
  text: "1/3",
  latex: String.raw`\frac{1}{3}`,
  notes: [],
};
const nodes = (tree) =>
  !tree || typeof tree !== "object"
    ? []
    : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text = (tree) =>
  tree && typeof tree === "object"
    ? [tree.props?.children].flat(Infinity).map(text).join("")
    : String(tree ?? "");
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.stack });
  }
}
function saved(result = exact, id = "saved-graph", params = {}) {
  return {
    id,
    operation: "graph_analysis",
    params,
    input: "",
    mode: "text",
    result,
    settings,
    definitions: [],
    revision: 0,
    time: 1,
  };
}
function GraphMarker() {
  return null;
}
function AnswerMarker() {
  return null;
}
function StatusMarker() {
  return null;
}
function parent(books = [notebook("A")], options = {}) {
  let lease = true;
  const registered = new Map();
  const harness = componentHarness(
    "Calculator",
    ["run"],
    { state: workspace(books), view: "graphs" },
    {
      "./GraphWorkspace": { default: GraphMarker, makeGraph: () => ({}) },
      ...(options.webmcp
        ? {
            "@/lib/calculator/storage": {
              accountStorage: (key) => key,
              readDeviceSave: () => null,
              loadState: () => ({ state: workspace(books), warning: "" }),
              persist() {},
              STORAGE_KEY: "state",
              BACKUP_KEY: "backup",
            },
          }
        : {}),
      "@/lib/calculator/sync": {
        sessionWorkspace: () => null,
        captureAccountSession: () => ({
          isCurrent: () => lease,
          stageCommittedWorkspace: () => lease,
        }),
        workspaceFitsCloud: () => true,
      },
    },
    options.webmcp
      ? {
          effects: "all",
          window: { addEventListener() {}, removeEventListener() {} },
          document: {
            documentElement: { classList: { toggle() {} } },
            modelContext: {
              registerTool: (tool) => registered.set(tool.name, tool),
            },
          },
          localStorage: { getItem: () => null },
          ...options.environment,
        }
      : {},
  );
  const render = () => harness.render();
  const graph = () =>
    nodes(render().tree).find((node) => node.type === GraphMarker);
  return {
    harness,
    render,
    graph,
    registered,
    invalidate: () => {
      lease = false;
    },
  };
}
function graphFixture(initial = {}, analyze) {
  const harness = componentHarness("GraphWorkspace", ["derived"], initial, {
    "./CalculationAnswer": {
      default: AnswerMarker,
      CalculationStatus: StatusMarker,
    },
    "@/lib/calculator/display-format": displayFormat,
  });
  const requests = [],
    opened = [];
  let stops = 0;
  const props = {
    graphs: [harness.exports.makeGraph("x^2")],
    history: [],
    definitions: [],
    settings,
    onChange: (value) => {
      props.graphs = value;
    },
    onReuse() {},
    onStop: () => {
      stops++;
    },
    onOpenHistory: (id) => opened.push(id),
    async onAnalyze(params) {
      requests.push(params);
      const entry = analyze
        ? await analyze(params)
        : saved(exact, `saved-${requests.length}`, params);
      if (entry) props.history = [entry, ...props.history];
      return entry;
    },
  };
  const render = () => nodes(harness.render(props).tree);
  const button = (label) =>
    render().find((node) => node.type === "button" && text(node) === label);
  const panel = () =>
    render().find(
      (node) => node.props?.["aria-label"] === "Graph analysis result",
    );
  return {
    harness,
    props,
    render,
    button,
    panel,
    requests,
    opened,
    stops: () => stops,
    analyze: () => button("Calculate").props.onClick(),
  };
}

await check(
  "actual parent graph callback stays in Graphs and returns the sole canonical saved entry",
  async () => {
    const app = parent();
    const props = app.graph().props;
    const pending = props.onAnalyze({
      expression: "x^2",
      action: "integral",
      lower: "0",
      upper: "1",
    });
    assert.equal(
      app.harness.state.get("view"),
      "graphs",
      "Graph analysis navigated away before completion",
    );
    assert.equal(app.harness.requests.length, 1);
    assert.equal(app.harness.requests[0].request.operation, "graph_analysis");
    app.harness.requests[0].resolve(exact);
    const entry = await pending;
    const history = app.harness.state.get("state").notebooks[0].history;
    assert.equal(history.length, 1, "Analysis appended duplicate entries");
    assert.equal(entry, history[0], "Completion was not the exact saved Entry");
    assert.equal(entry.result, exact);
    assert.equal(
      app.graph().props.history,
      history,
      "Graph did not receive canonical History",
    );
    assert.equal(
      app.harness.state.get("view"),
      "graphs",
      "Completion changed tabs",
    );
  },
);
await check(
  "ordinary composer and repeated operation retain Calculate navigation and saved-entry return",
  async () => {
    for (const operation of ["evaluate", "differentiate"]) {
      const app = parent();
      const pending = app
        .render()
        .actions.run(operation, {}, { input: "x^2", mode: "text" });
      assert.equal(app.harness.state.get("view"), "calculate");
      app.harness.requests[0].resolve(exact);
      const receipt = await pending;
      assert.equal(
        receipt,
        app.harness.state.get("state").notebooks[0].history[0],
      );
    }
  },
);
await check(
  "captured notebook append never navigates a later workspace or bypasses account lease",
  async () => {
    for (const change of ["tab", "notebook", "lease", "unmount"]) {
      const app = parent([notebook("A"), notebook("B")]);
      const pending = app.graph().props.onAnalyze({ expression: "x^2" });
      if (change === "tab") app.harness.state.set("view", "objects");
      if (change === "notebook")
        app.harness.state.set("state", {
          ...app.harness.state.get("state"),
          active: "B",
        });
      if (change === "lease") app.invalidate();
      if (change === "unmount") app.harness.unmount();
      app.render();
      app.harness.requests[0].resolve(exact);
      const receipt = await pending;
      const state = app.harness.state.get("state");
      assert.equal(state.notebooks[1].history.length, 0);
      assert.equal(
        state.notebooks[0].history.length,
        ["lease", "unmount"].includes(change) ? 0 : 1,
      );
      if (["lease", "unmount"].includes(change))
        assert.equal(receipt, undefined);
      assert.equal(
        app.harness.state.get("view"),
        change === "tab" ? "objects" : "graphs",
      );
    }
  },
);
await check(
  "parent Stop invalidates old completion while an identical replacement owns busy and its single append",
  async () => {
    const app = parent();
    const params = {
      expression: "x^2",
      action: "integral",
      lower: "0",
      upper: "1",
    };
    const first = app.graph().props.onAnalyze(params);
    assert.equal(
      typeof app.graph().props.onStop,
      "function",
      "Graph has no parent Stop callback",
    );
    app.graph().props.onStop();
    const second = app.graph().props.onAnalyze(params);
    app.harness.requests[0].resolve(exact);
    assert.equal(await first, undefined);
    assert.equal(app.harness.state.get("busy"), true);
    assert.equal(app.harness.state.get("state").notebooks[0].history.length, 0);
    app.harness.requests[1].resolve({ ...exact, text: "new result" });
    const entry = await second;
    assert.equal(entry.result.text, "new result");
    assert.equal(app.harness.state.get("busy"), false);
    assert.equal(app.harness.state.get("state").notebooks[0].history.length, 1);
  },
);
await check(
  "capacity refusal and worker rejection yield no graph receipt or append",
  async () => {
    const book = notebook("A");
    book.history = Array.from({ length: 10000 }, (_, i) =>
      saved(exact, `old-${i}`),
    );
    const full = parent([book]);
    assert.equal(
      await full.graph().props.onAnalyze({ expression: "x" }),
      undefined,
    );
    assert.equal(full.harness.requests.length, 0);
    assert.equal(
      full.harness.state.get("state").notebooks[0].history.length,
      10000,
    );
    assert.match(full.harness.state.get("notice"), /10,000/);
    const app = parent();
    const pending = app.graph().props.onAnalyze({ expression: "x" });
    app.harness.requests[0].reject(Error("worker stopped"));
    assert.equal(await pending, undefined);
    assert.equal(app.harness.state.get("state").notebooks[0].history.length, 0);
    assert.equal(app.harness.state.get("busy"), false);
  },
);
await check(
  "explicit History destination expands the exact old article and consumes focus once",
  async () => {
    const book = notebook("A");
    book.history = Array.from({ length: 45 }, (_, i) =>
      saved(exact, `entry-${i}`),
    );
    const app = parent([book]);
    assert.equal(
      typeof app.graph().props.onOpenHistory,
      "function",
      "No exact saved-entry destination",
    );
    app.graph().props.onOpenHistory("entry-41");
    assert.equal(app.harness.state.get("historyCount"), 42);
    assert.equal(app.harness.state.get("view"), "calculate");
    const focused = [];
    const oldRender = app.harness.render;
    const tree = oldRender().tree;
    const articles = nodes(tree).filter((node) => node.type === "article");
    const article = articles.find((node) => node.key === "entry-41");
    assert(article, "Target remained outside the visible History window");
    article.props.ref({
      focus: () => focused.push("focus"),
      scrollIntoView: () => focused.push("scroll"),
    });
    assert.deepEqual(
      focused,
      ["focus", "scroll"],
      "A delayed article mount lost the one-shot focus request",
    );
    app.render();
    assert.deepEqual(
      focused,
      ["focus", "scroll"],
      "Focus target was not consumed",
    );
    app.harness.state.set("view", "graphs");
    const initialTree = app.render().tree;
    const graph = nodes(initialTree).find((node) => node.type === GraphMarker);
    const tabs = nodes(initialTree).find(
      (node) => node.props?.className === "workbench",
    );
    graph.props.onOpenHistory("entry-41");
    tabs.props.onValueChange("objects");
    app.render();
    assert.deepEqual(
      focused,
      ["focus", "scroll"],
      "Intervening tab consumed stale focus",
    );
    app.harness.state.set("view", "calculate");
    app.render();
    assert.equal(
      focused.length,
      2,
      "Intervening tab resurrected a focus request",
    );
    app.harness.state.set("view", "graphs");
    app.graph().props.onOpenHistory("missing");
    assert.equal(app.harness.state.get("view"), "graphs");
  },
);
await check(
  "inline answer derives every mathematical status, approximation and diagnostics from canonical History",
  async () => {
    for (const status of [
      "exact",
      "numeric",
      "conditional",
      "divergent",
      "unresolved",
      "error",
    ]) {
      const result = {
        ...exact,
        status,
        approx: "0.3333333333",
        notes: ["Captured condition"],
      };
      const entry = saved(result);
      const graph = graphFixture(
        { action: "integral", lower: "0", upper: "1" },
        async () => entry,
      );
      await graph.analyze();
      const panel = graph.panel();
      assert(panel, `Missing ${status} inline result`);
      const answer = nodes(panel).find((node) => node.type === AnswerMarker);
      const badge = nodes(panel).find((node) => node.type === StatusMarker);
      assert.equal(answer.props.result, result);
      assert.equal(badge.props.status, status);
      assert.match(text(panel), /Decimal approximation/);
      assert.match(text(panel), /Captured condition/);
      assert.equal(
        Boolean(graph.harness.state.get("shade")),
        ["exact", "numeric"].includes(status),
      );
      assert.equal(graph.harness.state.get("analysis").entryId, entry.id);
      assert(!("result" in graph.harness.state.get("analysis")));
      graph.button("Open saved calculation in Calculate").props.onClick();
      assert.deepEqual(graph.opened, [entry.id]);
      graph.props.history = [];
      assert.equal(
        graph
          .render()
          .find((node) => typeof node.props?.onCheckedChange === "function")
          .props.checked,
        false,
        "Deleted History retained automatic shade selection",
      );
      assert.equal(
        graph.panel(),
        undefined,
        "Deleted History retained an orphan inline answer",
      );
    }
  },
);
await check(
  "graph Stop is visible and old finally cannot clear an immediate same-input restart",
  async () => {
    const pending = [];
    const graph = graphFixture(
      {},
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const first = graph.analyze();
    assert.equal(graph.button("Calculate").props.disabled, false);
    assert.equal(graph.button("Calculate").props["aria-disabled"], true);
    await graph.analyze();
    assert.equal(
      graph.requests.length,
      1,
      "Pending activation duplicated analysis",
    );
    assert(
      graph.button("Stop calculation"),
      "Graph lacks visible cancellation",
    );
    graph.button("Stop calculation").props.onClick();
    assert.equal(graph.stops(), 1);
    const second = graph.analyze();
    pending[0](saved(exact, "obsolete"));
    await first;
    assert.equal(
      graph.harness.state.get("analysis").kind,
      "running",
      "Old finally cleared the replacement pending state",
    );
    assert.equal(graph.panel(), undefined);
    pending[1](saved(exact, "replacement"));
    await second;
    assert.equal(graph.harness.state.get("analysis").entryId, "replacement");
    assert.equal(graph.button("Stop calculation"), undefined);
    assert.equal(graph.button("Calculate").props["aria-disabled"], false);
  },
);
await check(
  "changed input and unmount refuse stale inline selection while pan retains current answer",
  async () => {
    const changes = [
      (g) => g.harness.state.set("lower", "1"),
      (g) => g.harness.state.set("upper", "2"),
      (g) => g.harness.state.set("point", "1"),
      (g) => g.harness.state.set("a", 2),
      (g) => {
        g.props.definitions = [definition("b", "2")];
      },
      (g) => {
        g.props.settings = { ...settings, angle: "deg" };
      },
      (g) => {
        g.props.graphs = [{ ...g.props.graphs[0], expression: "x^3" }];
      },
      (g) => g.harness.unmount(),
    ];
    for (const change of changes) {
      let complete;
      const graph = graphFixture(
        { action: "integral", lower: "0", upper: "1" },
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const pending = graph.analyze();
      change(graph);
      graph.render();
      complete(saved());
      await pending;
      assert.equal(graph.panel(), undefined);
      assert.equal(graph.harness.state.get("shade"), null);
    }
    const graph = graphFixture();
    await graph.analyze();
    graph.harness.state.set("range", [-3, 3, -2, 2]);
    assert(graph.panel(), "Pan/zoom hid an input-identical answer");
    graph.harness.state.set("point", "1");
    assert.equal(graph.panel(), undefined);
    graph.harness.state.set("point", "0");
    assert.equal(
      graph.panel(),
      undefined,
      "Restoring input resurrected a cleared answer",
    );
  },
);
await check(
  "changed graph inputs retain an accessible pending status and Stop while the parent worker is busy",
  async () => {
    let complete;
    const graph = graphFixture(
      {},
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = graph.analyze();
    graph.props.workerBusy = true;
    graph.harness.state.set("point", "2");
    graph.render();
    const pendingStatus = graph
      .render()
      .find((node) => node.props?.role === "status");
    assert.match(text(pendingStatus), /Calculating locally/);
    assert.equal(pendingStatus.props["aria-live"], "polite");
    assert(graph.button("Stop calculation"));
    assert.equal(graph.button("Calculate").props["aria-disabled"], true);
    complete(saved());
    await pending;
    assert.equal(graph.panel(), undefined);
  },
);
await check(
  "changing inputs away and back cannot resurrect an in-flight graph result",
  async () => {
    let complete;
    const graph = graphFixture(
      { action: "integral", lower: "0", upper: "1" },
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = graph.analyze();
    graph.harness.state.set("lower", "2");
    graph.render();
    graph.harness.state.set("lower", "0");
    graph.render();
    complete(saved());
    await pending;
    assert.equal(graph.panel(), undefined);
    assert.equal(graph.harness.state.get("shade"), null);
  },
);
await check(
  "derivative refuses changed settings, definitions, parameter, radians and tangent point",
  async () => {
    const changes = [
      (g) => {
        g.props.settings = { ...settings, angle: "deg" };
      },
      (g) => {
        g.props.definitions = [definition("b", "2")];
      },
      (g) => g.harness.state.set("a", 2),
      (g) => {
        g.props.graphs = [{ ...g.props.graphs[0], radians: true }];
      },
      (g) => g.harness.state.set("point", "1"),
    ];
    for (const change of changes) {
      const graph = graphFixture();
      const pending = graph.harness
        .render(graph.props)
        .actions.derived("graph_derivative");
      change(graph);
      graph.render();
      graph.harness.requests[0].resolve({ ...exact, reusable: "2*x" });
      await pending;
      assert.equal(
        graph.props.graphs.length,
        1,
        "Derivative appended against changed context",
      );
      assert.equal(graph.harness.state.get("busy"), false);
    }
  },
);
await check(
  "WebMCP still returns the public Result without an Entry envelope",
  async () => {
    const app = parent(undefined, { webmcp: true });
    app.render();
    const tool = app.registered.get("calculate_expression");
    assert(tool, "WebMCP calculate tool was not registered");
    const pending = tool.execute({ expression: "1/3" });
    app.harness.requests[0].resolve(exact);
    assert.equal(await pending, exact);
    assert.equal(app.harness.state.get("state").notebooks[0].history.length, 1);
    assert.equal(app.harness.state.get("view"), "calculate");
    app.harness.unmount();
  },
);
await check(
  "shared answer preserves structured Save value only for History and all primary result forms",
  async () => {
    function MathMarker() {
      return null;
    }
    function RichMarker() {
      return null;
    }
    const harness = componentHarness(
      "CalculationAnswer",
      [],
      {},
      {
        "./MathView": { default: MathMarker },
        "./RichResult": { default: RichMarker },
        "@/lib/calculator/display-format": displayFormat,
      },
    );
    for (const result of [
      exact,
      { ...exact, display: { type: "text", text: "rich" } },
      { ...exact, status: "error", text: "bad" },
      { ...exact, latex: "", text: "plain" },
    ]) {
      const tree = harness.render({ result, displayDecimals: 9 }).tree;
      if (result.status === "error") assert.equal(text(tree), "bad");
      else if (result.display)
        assert(nodes(tree).some((node) => node.type === RichMarker));
      else if (result.latex)
        assert(nodes(tree).some((node) => node.type === MathMarker));
      else assert.equal(text(tree), "plain");
    }
    const savedSources = [];
    const props = {
      data: { value: "1/3" },
      sources: { value: "Rational(1,3)" },
      displayDecimals: 9,
    };
    const readOnly = harness.exports.CalculationDetails(props);
    assert(!nodes(readOnly).some((node) => node.type === "button"));
    const editable = harness.exports.CalculationDetails({
      ...props,
      onSave: (source) => savedSources.push(source),
    });
    nodes(editable)
      .find((node) => node.type === "button")
      .props.onClick();
    assert.deepEqual(savedSources, ["Rational(1,3)"]);
  },
);

console.log(JSON.stringify(checks, null, 2));
if (checks.some((check) => !check.passed)) process.exitCode = 1;
