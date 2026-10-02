import assert from "node:assert/strict";
import {
  convertAsciiMathToLatex,
  convertLatexToAsciiMath,
  convertLatexToMarkup,
  convertLatexToMathMl,
} from "mathlive";
import { graphScope, graphFunctions } from "../lib/calculator/graph.ts";

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

// GHSA-fm7p-gw32-828p: test serializer output without inserting it into a DOM.
check("MathLive text and mbox cannot emit an injected HTML element", () => {
  for (const command of ["text", "mbox"]) {
    const latex = `\\${command}{<img src=x data-probe=x>}`;
    const html = convertLatexToMarkup(latex);
    assert(!/<img\b/i.test(html));
    assert(html.includes("&lt;img"));
    assert(html.includes("&gt;"));
    assert(!/<img\b/i.test(convertLatexToMathMl(latex)));
  }
});
check("MathLive HTML and MathML escape ampersands in text", () => {
  for (const convert of [convertLatexToMarkup, convertLatexToMathMl]) {
    const result = convert("\\text{a&b}");
    assert(result.includes("a&amp;b"));
    assert(!result.includes("a&b"));
  }
});
check("ASCII/LaTeX conversion preserves values used by graph editing", () => {
  const scope = graphScope(
    [],
    { angle: "rad", domain: "real", precision: 30, assumptions: "" },
    0,
  );
  for (const [ascii, x, expected] of [
    ["x^2+1", 3, 10],
    ["sin(x)", Math.PI / 2, 1],
    ["(1)/(2)", 0, 0.5],
    ["sqrt(x)", 9, 3],
    ["pi", 0, Math.PI],
  ]) {
    const latex = convertAsciiMathToLatex(ascii);
    assert(latex.length > 0);
    const restored = convertLatexToAsciiMath(latex);
    const result = graphFunctions(
      { type: "cartesian", expression: restored },
      scope,
    ).f(x);
    assert(Number.isFinite(result), `${ascii} became ${restored}`);
    assert(Math.abs(result - expected) < 1e-12, `${ascii} changed value`);
  }
});

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
