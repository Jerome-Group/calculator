import assert from "node:assert/strict";
import { all, create } from "mathjs";
import {
  compileMath,
  graphScope,
  graphFunctions,
  numeric,
} from "../lib/calculator/graph.ts";

const settings = {
  angle: "rad",
  domain: "real",
  precision: 30,
  assumptions: "",
};
const definition = (name, expression, args) => ({
  id: name,
  name,
  expression,
  kind: args ? "function" : "expression",
  ...(args ? { args } : {}),
  updated: 1,
});
const graph = (expression, extra = {}) => ({
  id: "graph",
  type: "cartesian",
  expression,
  second: "",
  visible: true,
  color: "#123456",
  min: "-5",
  max: "5",
  ...extra,
});
const near = (actual, expected) => {
  assert(Number.isFinite(actual), `Expected a finite value, got ${actual}`);
  assert(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
};
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

// Public parser primitives behind GHSA-29qv-4j9f-fjw5 and GHSA-jvff-x2qm-6286.
// These probes stop before invoking any escaped function or modifying global data.
check("MathJS cannot replace a native JavaScript array method", () => {
  const math = create(all),
    array = [];
  assert.throws(
    () => math.evaluate("array.map = 7", { array }),
    /No access to property "map"/,
  );
  assert.equal(array.map, Array.prototype.map);
});
check("MathJS rejects a forged matrix index that could expose Function", () => {
  const math = create(all);
  assert.throws(
    () =>
      math.evaluate(
        'matrix().get({length:1, reduce:f(callback,a)=callback(cos,"constructor")})',
      ),
    /Array expected for index/,
  );
});
check(
  "graph parsing rejects the vulnerable primitives and unsafe expressions",
  () => {
    for (const expression of [
      "array.map = 7",
      'matrix().get({length:1, reduce:f(callback,a)=callback(cos,"constructor")})',
      "f(x)=x",
      "x=2; x+1",
      "[1,2][1]",
      'evaluate("2")',
      'reviver("", {mathjs:"ArrayNode"})',
      "import({x:sin})",
    ])
      assert.throws(() => compileMath(expression), /without assignments/);
  },
);
check("graph syntax retains pi and Python-style powers", () => {
  near(numeric(compileMath("π + 2**3"), {}), Math.PI + 8);
});
check(
  "reusable functions resolve scalar dependencies regardless of order",
  () => {
    const scope = graphScope(
      [
        definition("f", "k*t^2+offset", "t"),
        definition("offset", "2"),
        definition("k", "4"),
      ],
      settings,
      0.5,
    );
    assert.equal(scope.f(3), 38);
    assert.equal(graphFunctions(graph("f(x)+a"), scope).f(3), 38.5);
  },
);
check(
  "function arguments shadow saved definitions and slider a stays current",
  () => {
    const scope = graphScope(
      [
        definition("t", "99"),
        definition("a", "100"),
        definition("f", "t+a", "t"),
      ],
      settings,
      0.25,
    );
    assert.equal(scope.f(2), 2.25);
  },
);
check(
  "degree trigonometry and explicit radians graph override remain distinct",
  () => {
    const scope = graphScope([], { ...settings, angle: "deg" }, 0);
    near(graphFunctions(graph("sin(x)"), scope).f(90), 1);
    near(
      graphFunctions(graph("sin(x)", { radians: true }), scope).f(Math.PI / 2),
      1,
    );
    near(numeric(compileMath("asin(0.5)+cos(60)"), scope), 30.5);
  },
);
check("implicit curves and inequality masks retain numerical semantics", () => {
  const scope = graphScope([], settings, 0);
  const circle = graphFunctions(
    graph("x^2+y^2=1", { type: "implicit" }),
    scope,
  );
  assert.equal(circle.f(1, 0), 0);
  assert.equal(circle.f(0, 0), -1);
  const mask = graphFunctions(graph("x^2<1", { type: "inequality" }), scope);
  assert.equal(mask.f(0.5), 1);
  assert.equal(mask.f(2), 0);
});
check(
  "parametric, polar, surface and sequence variables retain their bindings",
  () => {
    const scope = graphScope([], settings, 0);
    const parametric = graphFunctions(
      graph("cos(t)", { type: "parametric", second: "sin(t)" }),
      scope,
    );
    near(parametric.f(Math.PI / 2), 0);
    near(parametric.second(Math.PI / 2), 1);
    assert.equal(
      graphFunctions(graph("theta+1", { type: "polar" }), scope).f(2),
      3,
    );
    assert.equal(
      graphFunctions(graph("x+y", { type: "surface" }), scope).f(2, 3),
      5,
    );
    assert.equal(
      graphFunctions(graph("n^2", { type: "sequence" }), scope).f(3),
      9,
    );
  },
);
check(
  "non-real and non-finite samples become gaps; cycles do not poison other definitions",
  () => {
    const scope = graphScope(
      [definition("p", "q+1"), definition("q", "p+1"), definition("r", "3")],
      settings,
      0,
    );
    assert.equal(scope.p, undefined);
    assert.equal(scope.q, undefined);
    assert.equal(scope.r, 3);
    for (const expression of ["sqrt(-1)", "1/0", "unknown_symbol"])
      assert(Number.isNaN(numeric(compileMath(expression), scope)));
  },
);

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
