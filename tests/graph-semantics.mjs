import assert from "node:assert/strict";
import {
  graphTable,
  graphFunctions,
  graphScope,
  graphDataRange,
  compileMath,
  numeric,
} from "../lib/calculator/graph.ts";
import { DEFAULT_SETTINGS } from "../lib/calculator/types.ts";
import { graphTableInterval } from "../lib/calculator/graph-table-interval.ts";
const settings = { ...DEFAULT_SETTINGS },
  scope = graphScope([], settings, 1);
const graph = (type, expression = "x^2", extra = {}) => ({
  id: type,
  type,
  expression,
  second: "t^2",
  min: "0",
  max: "pi",
  visible: true,
  color: "#123456",
  ...extra,
});
const table = (g, s = settings, lo = -2, hi = 2) =>
  graphTable(g, graphFunctions(g, graphScope([], s, 1)), scope, s, lo, hi);
assert.deepEqual(table(graph("cartesian")).rows[0].cells, [-2, 4]);
const sequence = table(graph("sequence", "n^2"), settings, -1.5, 2.5);
assert.deepEqual(
  sequence.rows.map((row) => row.cells),
  [
    [-1, 1],
    [0, 0],
    [1, 1],
    [2, 4],
  ],
);
const parametric = table(graph("parametric", "t", { max: "2" }));
assert.deepEqual(parametric.rows.at(-1).cells, [2, 2, 4]);
const polar = table(graph("polar", "2", { max: "pi/2", radians: true }), {
  ...settings,
  angle: "deg",
});
assert(Math.abs(polar.rows.at(-1).cells[2]) < 1e-12);
assert.equal(polar.rows.at(-1).cells[3], 2);
for (const [type, expression, expected] of [
  ["implicit", "x^2+y^2=1", 7],
  ["inequality", "x<y", 0],
  ["surface", "x+y", -4],
  ["field", "x-y", 0],
]) {
  const result = table(graph(type, expression));
  assert.equal(result.rows.length, 121);
  assert.deepEqual(result.rows[0].cells, [-2, -2, expected]);
  assert.equal(result.headers.length, 3);
}
const data = graph("data", "Trajectory", {
  points: Array.from({ length: 20000 }, (_, i) => [i, 2 * i]),
});
assert.equal(table(data).rows.length, 11);
assert.deepEqual(table(data).rows.at(-1).cells, [19999, 39998]);
assert.equal(table(graph("sequence"), settings, 0, 1e9).rows.length, 101);
assert.deepEqual(table(graph("cartesian"), settings, 2, -2).rows, []);
for (const invalid of ["", " ", "pi", "Infinity", "-Infinity", "NaN"])
  for (const bounds of [
    [invalid, "2"],
    ["-2", invalid],
  ])
    assert.equal(graphTableInterval(...bounds), null);
for (const [sources, expected] of [
  [
    ["-2e0", "2e0"],
    [-2, 2],
  ],
  [
    [" -3 ", "-1"],
    [-3, -1],
  ],
  [
    ["0", "0"],
    [0, 0],
  ],
]) {
  const bounds = graphTableInterval(...sources);
  assert.deepEqual(bounds, expected);
  const recovered = table(graph("cartesian"), settings, ...bounds);
  assert.equal(recovered.rows.length, 11);
  for (const row of recovered.rows)
    assert.equal(row.cells[1], row.cells[0] ** 2);
}
const dense = Array.from({ length: 100 }, (_, index) =>
  graph("data", "Data", {
    points: Array.from({ length: 20000 }, (_, i) => [index * 20000 + i, i]),
  }),
);
assert(graphDataRange(dense).every(Number.isFinite));
assert.deepEqual(
  graphDataRange([
    graph("data", "Data", { points: [[NaN, Infinity]], visible: true }),
  ]),
  null,
);
assert.equal(numeric(compileMath("200+10%"), scope), 220);
for (const source of ["missing*x", "missing(x)"]) {
  const unresolved = graphFunctions(graph("cartesian", source), scope);
  assert.match(unresolved.warning, /Undefined (?:symbol|function) missing/);
  assert(Number.isNaN(unresolved.f(2)));
}
const partlyDefined = graphFunctions(
  graph("cartesian", "x <= 0 ? missing : x^2"),
  scope,
);
assert.match(partlyDefined.warning, /Undefined symbol missing/);
assert.equal(
  partlyDefined.f(2),
  4,
  "warning must preserve valid curve regions",
);
assert(Number.isNaN(partlyDefined.f(-1)));
const singular = graphFunctions(graph("cartesian", "1/x"), scope);
assert.equal(singular.warning, "", "a pole is not an undefined reference");
assert.equal(singular.f(2), 0.5);
assert(Number.isNaN(singular.f(0)));
const resolved = graphFunctions(graph("cartesian", "missing*x"), {
  ...scope,
  missing: 3,
});
assert.equal(resolved.warning, "");
assert.equal(resolved.f(2), 6);
const missingSecond = graphFunctions(
  graph("parametric", "t", { second: "missing*t" }),
  scope,
);
assert.match(missingSecond.warning, /Undefined symbol missing/);
assert.equal(missingSecond.f(2), 2);
assert(Number.isNaN(missingSecond.second(2)));
const largePointRange = graphDataRange([
  graph("data", "Point", { points: [[1e20, -1e20]] }),
]);
assert(
  largePointRange[0] < largePointRange[1] &&
    largePointRange[2] < largePointRange[3],
);
assert.throws(
  () =>
    graphDataRange([
      graph("data", "Extreme", {
        points: [
          [-Number.MAX_VALUE, 0],
          [Number.MAX_VALUE, 1],
        ],
      }),
    ]),
  /drawable range/,
);
console.log(
  "Graph semantics passed: all nine types, bounded tables, 2M-point fit, legacy percentages.",
);
