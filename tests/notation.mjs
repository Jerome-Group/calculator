import assert from "node:assert/strict";
import { abs, parse, subtract } from "mathjs";
import {
  mathToSource,
  matrixRowsToLatex,
  sourceToLatex,
  sourceToMath,
} from "../lib/calculator/notation.ts";

const grouped = [
  "sin(x^2)",
  "sin(x)^2",
  "exp(-x^2)",
  "exp(-x)^2",
  "-x^2",
  "(-x)^2",
  "1/(x+1)",
  "sqrt(x+1)",
  "log(sin(x)+1)",
  "(x+1)^2",
  "cos(x^3)+2*sin(x)",
  "exp(z)/z^2",
  "sin(x)/x",
];
for (const original of grouped) {
  const preview = sourceToLatex(original);
  assert(preview, `${original} should have grouped mathematical display`);
  const editor = await sourceToMath(original);
  assert(editor.latex, `${original} should safely enter the editor`);
  const restored = await mathToSource(editor.latex);
  for (const x of [-1.5, 0.25, 1.75]) {
    const before = parse(original).evaluate({ x, z: x });
    const after = parse(restored).evaluate({ x, z: x });
    assert(
      abs(subtract(before, after)) < 1e-10,
      `${original} changed at x=${x}: ${restored}`,
    );
  }
}
assert.notEqual(sourceToLatex("sin(x^2)"), sourceToLatex("sin(x)^2"));
assert.notEqual(sourceToLatex("exp(-x^2)"), sourceToLatex("exp(-x)^2"));
for (const original of [
  "f(x+1)",
  "Abs(x)",
  "Matrix([[1,2],[3,4]])",
  "{x:2,y:3}",
  "f(x):=x^2",
  "integrate(x,x)",
  "x.subs({x:2})",
]) {
  assert.equal(sourceToLatex(original), null);
  const editor = await sourceToMath(original);
  assert.equal(
    editor.latex,
    undefined,
    `${original} must not enter through lossy conversion`,
  );
  assert(editor.reason);
}
for (const original of [
  "1.2345678901234567890123456789",
  "9007199254740993",
  "1234e-25",
  "sin(1.2345678901234567890123456789*x)",
  "[[9007199254740993,1],[2,3]]",
  "1e309",
  "1e-999",
  "0x20000000000001",
]) {
  assert.equal(
    sourceToLatex(original),
    null,
    `${original} must retain exact digits`,
  );
  assert.equal(
    (await sourceToMath(original)).latex,
    undefined,
    `${original} must not lose digits on editor conversion`,
  );
}
for (const exact of [
  "0.1",
  "0.000001234",
  "1234.000",
  "9007199254740991",
  "0.123456789012345",
]) {
  assert(sourceToLatex(exact), `${exact} has unchanged decimal value`);
}
for (const blank of ["", " ", "\n\t  "]) {
  assert.deepEqual(
    await sourceToMath(blank),
    { latex: "" },
    "blank mode switching must remain available",
  );
}
assert.equal(sourceToLatex("latex:\\sin(x^{2})"), "\\sin(x^{2})");
assert.deepEqual(await sourceToMath("latex:\\frac{1}{2}"), {
  latex: "\\frac{1}{2}",
});
assert(sourceToLatex("x^2+y^2=1")?.includes("="));
assert(sourceToLatex("[[sin(x^2),1/(x+1)],[2,3]]"));
assert.equal(sourceToLatex("x = y = z"), null);
assert.equal(sourceToLatex("x".repeat(4001)), null);
console.log(
  "Source grouping, exact fallback and editor round-trip regressions passed",
);

assert(
  matrixRowsToLatex([
    ["sin(x^2)", "1/(x+1)"],
    ["2", "3"],
  ]),
);
assert.equal(matrixRowsToLatex([["9007199254740993"]]), null);
assert.equal(matrixRowsToLatex([["f(x)"]]), null);
