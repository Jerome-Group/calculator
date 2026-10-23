import assert from "node:assert/strict";
import { definitionDependenciesChanged } from "../lib/calculator/definition-dependencies.ts";
import {
  componentHarness,
  definition,
  notebook,
  settings,
  workspace,
} from "./component-harness.mjs";

const original = {
  ...definition("f", "x+2*y"),
  kind: "function",
  args: "x,y",
};
const reordered = { ...original, args: "y,x", updated: 2 };
const entry = {
  id: "original-result",
  input: "f(1,2)",
  mode: "text",
  operation: "evaluate",
  params: {},
  result: { status: "exact", text: "5", latex: "5", notes: [] },
  settings: { ...settings },
  definitions: [original],
  time: 1,
  revision: 0,
};
const a = definition("a", "2");
const changedA = { ...a, expression: "3" };
const f = { ...original, expression: "a*t", args: "t" };
const x = definition("x", "2");
const changedX = { ...x, expression: "3" };
const local = { ...original, expression: "x+1", args: "x" };
const nested = { ...local, expression: "b+x" };
const b = definition("b", "x+1");
const cases = [
  ["unchanged bindings", entry, [original], false],
  ["ordered function arguments", entry, [reordered], true],
  ["definition expression", entry, [{ ...original, expression: "x+y" }], true],
  ["definition kind", entry, [{ ...original, kind: "expression" }], true],
  ["renamed binding", entry, [{ ...original, name: "g" }], true],
  ["removed binding", entry, [], true],
  [
    "recreated identical binding",
    entry,
    [{ ...original, id: "new-id", updated: 9 }],
    false,
  ],
  [
    "normalized argument spacing",
    entry,
    [{ ...original, args: " x, y, " }],
    false,
  ],
  [
    "metadata and definition order",
    { ...entry, definitions: [original, a] },
    [
      { ...a, updated: 9 },
      { ...original, updated: 9 },
    ],
    false,
  ],
  [
    "unrelated edit",
    { ...entry, definitions: [original, a] },
    [original, changedA],
    false,
  ],
  [
    "transitive expression edit",
    { ...entry, input: "f(1)", definitions: [f, a] },
    [f, changedA],
    true,
  ],
  [
    "transitive removal",
    { ...entry, input: "f(1)", definitions: [f, a] },
    [f],
    true,
  ],
  [
    "newly resolved free name",
    { ...entry, input: "f(1)", definitions: [f] },
    [f, a],
    true,
  ],
  [
    "newly resolved root name",
    { ...entry, input: "a+1", definitions: [] },
    [a],
    true,
  ],
  [
    "still unresolved name",
    { ...entry, input: "a+1", definitions: [] },
    [],
    false,
  ],
  [
    "formal parameter shadows global",
    { ...entry, input: "f(1)", definitions: [local, x] },
    [local, changedX],
    false,
  ],
  [
    "formal scope stays local to body",
    { ...entry, input: "f(1)", definitions: [nested, b, x] },
    [nested, b, changedX],
    true,
  ],
  [
    "arguments on imported expression binding",
    {
      ...entry,
      input: "f(1)",
      definitions: [{ ...local, kind: "expression" }, x],
    },
    [{ ...local, kind: "expression" }, changedX],
    false,
  ],
  [
    "identifier boundaries",
    { ...entry, input: "aa+1", definitions: [a] },
    [changedA],
    false,
  ],
  [
    "math mode source",
    { ...entry, input: String.raw`f\left(1,2\right)`, mode: "math" },
    [reordered],
    true,
  ],
  [
    "prefixed definition source",
    {
      ...entry,
      input: "f(1)",
      definitions: [{ ...f, expression: "latex:a*t" }, a],
    },
    [{ ...f, expression: "latex:a*t" }, changedA],
    true,
  ],
  [
    "expression overrides background input",
    {
      ...entry,
      operation: "simplify",
      input: "a",
      params: { expression: "2" },
      definitions: [a],
    },
    [changedA],
    false,
  ],
  [
    "overridden expression retains its dependencies",
    {
      ...entry,
      operation: "simplify",
      input: "a",
      params: { expression: "f(1,2)" },
    },
    [reordered],
    true,
  ],
  [
    "literal catalogue selector",
    {
      ...entry,
      operation: "system",
      input: "",
      params: { equations: "[x-1]", variables: "[x]", kind: "linear" },
      definitions: [definition("linear", "2")],
    },
    [definition("linear", "3")],
    false,
  ],
  [
    "non-expression operation ignores composer draft",
    {
      ...entry,
      operation: "describe",
      input: "a",
      params: { data: "[1,2]" },
      definitions: [a],
    },
    [changedA],
    false,
  ],
  [
    "structured mathematical fields",
    {
      ...entry,
      operation: "system",
      params: { equations: "[a*x-1]", variables: "[x]", kind: "linear" },
      definitions: [a],
    },
    [changedA],
    true,
  ],
  [
    "dynamic structured fields stay conservative",
    {
      ...entry,
      operation: "ivp",
      params: { customEquation: "a*x" },
      definitions: [a],
    },
    [changedA],
    true,
  ],
  [
    "internal operation sources stay conservative",
    {
      ...entry,
      operation: "graph_analysis",
      params: { expression: "a*x", action: "roots" },
      definitions: [a],
    },
    [changedA],
    true,
  ],
];
for (const [name, problem, current, expected] of cases)
  assert.equal(definitionDependenciesChanged(problem, current), expected, name);

const cycle = [definition("a", "b"), definition("b", "a")];
assert.equal(
  definitionDependenciesChanged(
    { ...entry, input: "a", definitions: cycle },
    cycle,
  ),
  false,
  "Unchanged cyclic definitions terminate",
);
const chain = Array.from({ length: 500 }, (_, i) =>
  definition("a" + i, i === 499 ? "2" : "a" + (i + 1)),
);
assert.equal(
  definitionDependenciesChanged(
    { ...entry, input: "a0", definitions: chain },
    chain.map((binding, i) =>
      i === 499 ? { ...binding, expression: "3" } : binding,
    ),
  ),
  true,
  "The full notebook limit traverses transitively",
);

const savedSnapshot = structuredClone(entry);
for (const value of [
  original,
  entry.params,
  entry.result,
  entry.settings,
  entry.definitions,
  entry,
  reordered,
])
  Object.freeze(value);
const currentDefinitions = Object.freeze([reordered]);
assert.equal(definitionDependenciesChanged(entry, currentDefinitions), true);
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
const book = notebook("A", currentDefinitions);
book.history = [entry];
const state = workspace([book]);
state.settings.precision = 50;
const answer = componentHarness("CalculationAnswer", []);
const harness = componentHarness(
  "Calculator",
  ["run"],
  { state },
  {
    "./CalculationAnswer": answer.exports,
    "@/lib/calculator/definition-dependencies": {
      definitionDependenciesChanged,
    },
  },
);
const tree = harness.render().tree;
assert.equal(
  elements(tree).filter((element) => element.props?.className === "stale-note")
    .length,
  1,
  "Reordered function arguments must expose the saved result's stale warning",
);
const savedAnswer = elements(tree).find(
  (element) => element.type === answer.exports.default,
);
assert(savedAnswer, "History renders its shared saved answer");
assert.equal(savedAnswer.props.result, entry.result);
assert(
  elements(answer.render(savedAnswer.props).tree).some(
    (element) => element.props?.latex === "5",
  ),
  "The shared History answer retains the original saved LaTeX",
);
const button = (text) =>
  elements(tree).find(
    (element) => element.type === "button" && element.props.children === text,
  );
const recalculate = button("Recalculate").props.onClick();
assert.deepEqual(harness.requests[0].request.definitions, [reordered]);
assert.equal(harness.requests[0].request.settings.precision, 50);
harness.requests[0].resolve({ ...entry.result, text: "4", latex: "4" });
await recalculate;
let history = harness.state.get("state").notebooks[0].history;
assert.deepEqual(
  history.map((result) => result.result.text),
  ["4", "5"],
);
assert.equal(history.at(-1), entry);
harness.render();
const repeat = button("Repeat original settings").props.onClick();
assert.deepEqual(harness.requests[1].request.definitions, [original]);
assert.equal(harness.requests[1].request.settings.precision, 30);
harness.requests[1].resolve(entry.result);
await repeat;
history = harness.state.get("state").notebooks[0].history;
assert.deepEqual(
  history.map((result) => result.result.text),
  ["5", "4", "5"],
);
assert.deepEqual(
  entry,
  savedSnapshot,
  "Historical input, result and settings remain frozen",
);
console.log(
  `${cases.length} definition dependency cases, cycles, 500 bindings and actual history JSX passed; recalculation uses current definitions and Repeat retains the original snapshot.`,
);
