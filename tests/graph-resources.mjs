import assert from "node:assert/strict";
import { create, all } from "mathjs";
import {
  installGraphResourceGuards,
  graphEvaluation,
  GraphResourceError,
} from "../lib/calculator/graph-resources.ts";
import {
  compileMath,
  graphScope,
  graphFunctions,
} from "../lib/calculator/graph.ts";
const math = create(all, { number: "number" }),
  calls = {};
for (const name of ["ones", "zeros", "identity", "resize", "range"]) {
  const original = math[name],
    transform = math.expression.transform[name];
  const spy = (...args) => {
    calls[name] = (calls[name] || 0) + 1;
    return original(...args);
  };
  if (transform)
    spy.transform = (...args) => {
      calls[name] = (calls[name] || 0) + 1;
      return transform(...args);
    };
  math.import({ [name]: spy }, { override: true });
}
installGraphResourceGuards(math);
const evaluate = (source, scope = {}) =>
  graphEvaluation(() => math.compile(source).evaluate(scope));
for (const source of [
  "ones(1e8)",
  "zeros(1e8)",
  "identity(1e8)",
  "resize([1],[1e8])",
  "range(0,1e8)",
  "0:1:1e8",
]) {
  const before = { ...calls };
  assert.throws(() => evaluate(source), GraphResourceError, source);
  assert.deepEqual(calls, before, source + " reached allocator");
}
assert.deepEqual(math.range(0, 3).toArray(), [0, 1, 2]);
assert.deepEqual(evaluate("range(0,3)").toArray(), [0, 1, 2, 3]);
assert.deepEqual(evaluate("range(0,3,false)").toArray(), [0, 1, 2]);
assert.deepEqual(evaluate("0:1:3").toArray(), [0, 1, 2, 3]);
assert.deepEqual(evaluate("3:-1:0").toArray(), [3, 2, 1, 0]);
assert.equal(evaluate("det(ones(3,3)+identity(3))"), 4);
assert.equal(evaluate("sum(zeros(2,3))+sum(ones([2,3]))"), 6);
assert.equal(evaluate("200+10%"), 220);
assert.equal(evaluate("ones(1e8)", { ones: (n) => n + 1 }), 1e8 + 1);
assert.equal(evaluate("range(0,1e8)", { range: (a, b) => b - a }), 1e8);
assert.throws(() => evaluate("sum(ones(n))", { n: 1e8 }), GraphResourceError);
assert.throws(
  () => evaluate("sum(ones(6000))+sum(zeros(6000))"),
  GraphResourceError,
);
const child = math.compile("sum(ones(n))");
assert.throws(
  () =>
    evaluate("f(6000)+f(6000)", {
      f: (n) => graphEvaluation(() => child.evaluate({ n })),
    }),
  GraphResourceError,
);
assert.equal(
  evaluate("f(3)+f(3)", {
    f: (n) => graphEvaluation(() => child.evaluate({ n })),
  }),
  6,
);
assert.equal(evaluate("sum(ones(10000))"), 10000);
assert.equal(evaluate("sum(ones(100,100))"), 10000);
assert.throws(
  () => evaluate("sum(ones(10000,0))+sum(ones(10000,0))"),
  GraphResourceError,
);
assert.equal(evaluate("sum(ones(2,0))"), 0);
assert.throws(
  () => evaluate("sum(ones(200,1)*ones(1,200))"),
  GraphResourceError,
);
assert.equal(evaluate("sum(ones(3,1)*ones(1,3))"), 9);
assert.equal(evaluate("multiply(3,4)"), 12);
assert.throws(() => evaluate("range(3,0,0)"), /Step must be non-zero/);
assert.throws(() => evaluate("range(1e20,1e20)"), GraphResourceError);
assert.deepEqual(evaluate("range(1e12,1e12)").toArray(), [1e12, 1e12 + 1]);

const settings = {
  angle: "rad",
  precision: 30,
  domain: "real",
  assumptions: "",
};
const definition = (name, expression, args) => ({
  id: name,
  name,
  expression,
  args,
  kind: args ? "function" : "expression",
});
let scope = graphScope([definition("f", "sum(ones(n))", "n")], settings, 1);
assert.throws(() => compileMath("f(1e8)").evaluate(scope), GraphResourceError);
assert.equal(compileMath("f(3)").evaluate(scope), 3);
scope = graphScope(
  [definition("ones", "n+1", "n"), definition("range", "b-a", "a,b")],
  settings,
  1,
);
assert.equal(compileMath("ones(1e8)").evaluate(scope), 1e8 + 1);
assert.equal(compileMath("range(0,1e8)").evaluate(scope), 1e8);
const base = { type: "cartesian", expression: "ones(3)" };
assert.throws(() => graphFunctions(base, {}), /scalar values/);
assert.equal(
  graphFunctions({ ...base, expression: "det(ones(3,3)+identity(3))" }, {}).f(
    0,
  ),
  4,
);
assert.equal(graphFunctions({ ...base, expression: "ones(x)" }, scope).f(2), 3);
assert.equal(compileMath("sum(0:3)").evaluate({}), 6);
assert.equal(compileMath("200+10%").evaluate({}), 220);
assert.throws(
  () => graphFunctions({ ...base, expression: "sum(range(0,1e8))" }, {}),
  GraphResourceError,
);
assert.equal(graphFunctions({ ...base, expression: "sqrt(x)" }, {}).f(4), 2);
assert.equal(
  graphFunctions({ ...base, expression: "x<0 ? ones(3) : x" }, {}).f(2),
  2,
);
console.log(
  "Graph resource guards passed: pre-allocation rejection, nested budget, transforms, definitions, shadowing, matrix functions, scalar domains, legacy percentages.",
);
