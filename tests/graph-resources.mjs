import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
for (const name of [
  "ones",
  "zeros",
  "identity",
  "resize",
  "range",
  "kron",
  "diag",
  "concat",
  "subset",
  "add",
  "dotMultiply",
  "dotPow",
]) {
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
  const target = source.includes(":") ? "range" : source.split("(")[0];
  const before = calls[target] || 0;
  assert.throws(() => evaluate(source), GraphResourceError, source);
  assert.equal(calls[target] || 0, before, source + " reached allocator");
}
assert.deepEqual(math.range(0, 3).toArray(), [0, 1, 2]);
assert.deepEqual(evaluate("range(0,3)").toArray(), [0, 1, 2, 3]);
assert.deepEqual(evaluate("range(0,3,false)").toArray(), [0, 1, 2]);
assert.deepEqual(evaluate("0:1:3").toArray(), [0, 1, 2, 3]);
assert.deepEqual(evaluate("3:-1:0").toArray(), [3, 2, 1, 0]);
assert.equal(evaluate("det(ones(3,3)+identity(3))"), 4);
assert.equal(evaluate("sum(zeros(2,3))+sum(ones([2,3]))"), 6);
assert.equal(evaluate("200+10%"), 220);
for (const expression of [
  "isPrime(Infinity)",
  "isPrime(-Infinity)",
  "isPrime(NaN)",
  "isPrime([Infinity])",
  'isPrime("Infinity")',
])
  assert.throws(() => evaluate(expression), /primality inputs must be finite/);
assert.equal(evaluate("isPrime(17)"), true);
assert.equal(evaluate("isPrime(18)"), false);
assert.equal(evaluate('isPrime("2")'), true);
assert.equal(evaluate("isPrime(Infinity)", { isPrime: () => 42 }), 42);
// A pinned MathJS scalar path, rather than allocation, can block forever.
// Isolate the old path with an external process watchdog; never run it in UI.
const oldPrime = spawnSync(
  process.execPath,
  [
    "--max-old-space-size=128",
    "--input-type=module",
    "-e",
    'import {create,all} from "mathjs"; create(all).evaluate("isPrime(Infinity)");',
  ],
  { cwd: new URL("..", import.meta.url), timeout: 1200, encoding: "utf8" },
);
assert.equal(oldPrime.error?.code, "ETIMEDOUT");
const guardedPrime = spawnSync(
  process.execPath,
  [
    "--max-old-space-size=128",
    "--import",
    "./tests/resolve-types.mjs",
    "--input-type=module",
    "-e",
    'import assert from "node:assert/strict"; import {compileMath,graphFunctions} from "./lib/calculator/graph.ts"; assert.throws(()=>graphFunctions({type:"cartesian",expression:"isPrime(Infinity)"},{}),/primality inputs must be finite/); assert.equal(compileMath("isPrime(17)").evaluate({}),true);',
  ],
  { cwd: new URL("..", import.meta.url), timeout: 5000, encoding: "utf8" },
);
assert.equal(
  guardedPrime.status,
  0,
  guardedPrime.stderr || guardedPrime.error?.message,
);
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
for (const source of [
  "kron(ones(20,20),ones(20,20))",
  "diag([1],1e8)",
  "subset([1],index(1e8),2,0)",
  'subset("1",index(1e8),"2","0")',
  "concat(ones(5000),ones(5000))",
  "ones(200,1)+ones(1,200)",
  "ones(200,1).*ones(1,200)",
  "ones(200,1).^ones(1,200)",
]) {
  const target = source.startsWith("ones")
    ? source.includes(".*")
      ? "dotMultiply"
      : source.includes(".^")
        ? "dotPow"
        : "add"
    : source.split("(")[0];
  const before = calls[target] || 0;
  assert.throws(() => evaluate(source), GraphResourceError, source);
  assert.equal(
    calls[target] || 0,
    before,
    source + " reached output allocator",
  );
}
assert.equal(evaluate("sum(diag([1],9999))"), 1);
assert.throws(() => evaluate("diag([1],10000)"), GraphResourceError);
assert.equal(evaluate("sum(kron([1,2],[3,4]))"), 21);
assert.equal(evaluate("sum(kron(ones(2,2),ones(2,2)))"), 16);
assert.equal(evaluate("sum(diag([1,2],-2))"), 3);
assert.equal(evaluate("sum(diag(ones(2,2)))"), 2);
assert.equal(evaluate("sum(subset([1],index(3),2,0))"), 3);
assert.equal(evaluate('subset("1",index(3),"2","0")'), "102");
assert.equal(evaluate("sum(subset([1,2,3],index([1,3])))"), 4);
assert.deepEqual(math.concat([[1]], [[2]], 0), [[1], [2]]);
assert.deepEqual(evaluate("concat([[1]],[[2]],1)").toArray(), [[1], [2]]);
assert.equal(evaluate("sum(ones(2,1)+ones(1,3))"), 12);
assert.equal(evaluate("sum(ones(2,1).*ones(1,3))"), 6);
assert.equal(evaluate("sum(ones(2,1).^ones(1,3))"), 6);
assert.equal(evaluate("kron(1e8)", { kron: (n) => n + 1 }), 1e8 + 1);
assert.equal(evaluate("diag(1e8)", { diag: (n) => n + 1 }), 1e8 + 1);
assert.equal(evaluate("concat(1e8)", { concat: (n) => n + 1 }), 1e8 + 1);
assert.equal(evaluate("subset(1e8)", { subset: (n) => n + 1 }), 1e8 + 1);
// A rejected evaluation releases its budget; recovery never requires a reload.
assert.equal(evaluate("det(ones(3,3)+identity(3))"), 4);
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
