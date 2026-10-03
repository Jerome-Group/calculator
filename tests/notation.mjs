import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as displayFormat from "../lib/calculator/display-format.ts";
import * as displayColors from "../lib/calculator/display-colors.ts";
import { abs, parse, subtract } from "mathjs";
import {
  mathToSource,
  matrixRowsToLatex,
  sourceToLatex,
  sourceToMath,
} from "../lib/calculator/notation.ts";

const require = createRequire(import.meta.url);
const viewModule = { exports: {} };
const viewSource = fs.readFileSync(
  new URL("../components/calculator/MathView.tsx", import.meta.url),
  "utf8",
);
new Function(
  "require",
  "module",
  "exports",
  ts.transpileModule(viewSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
)(
  (name) =>
    name === "../../lib/calculator/display-format"
      ? displayFormat
      : name === "../../lib/calculator/display-colors"
        ? displayColors
        : name === "katex"
          ? { default: require(name) }
          : require(name),
  viewModule,
  viewModule.exports,
);
for (const [source, border] of [
  [String.raw`\bbox[5px,border: 2px solid red]{3+1}`, "2px solid red"],
  [String.raw`\bbox[5px,border: 2px dashed black]{3+1}`, "2px dashed black"],
  [
    String.raw`\bbox[5px,border: 2px solid red]{\frac{3+1}{2}}`,
    "2px solid red",
  ],
]) {
  const rendered = viewModule.exports.default({ latex: source });
  const box = rendered.props.children;
  assert(
    box?.props?.style,
    "Observed bbox variants render a visible enclosure",
  );
  assert.equal(box.props.style.border, border);
  assert.equal(box.props.style.padding, "5px");
  const html = box.props.dangerouslySetInnerHTML.__html;
  assert(
    html.includes('class="katex"'),
    "Actual pinned KaTeX renders the body",
  );
  assert(!html.includes("katex-error"));
  const visible = html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, "");
  assert(!visible.includes("bbox"));
  assert(!visible.includes("border:"));
  assert(!visible.includes("5px"));
  assert(visible.includes("<mn>3</mn><mo>+</mo><mn>1</mn>"));
  assert(
    html.includes(
      `<annotation encoding="application/x-tex">${source}</annotation>`,
    ),
    "Copy annotation preserves the exact original serialized source",
  );
}
for (const source of [
  String.raw`\bbox[5px,border: 2px solid red]{3+1}+2`,
  String.raw`\bbox[5px,border: 2px solid red]{3+1`,
  String.raw`\bbox[5px,border: 2px solid red;background:url(x)]{3+1}`,
]) {
  assert.equal(
    viewModule.exports.default({ latex: source }).props.children,
    undefined,
    "Malformed or unsupported metadata never becomes a CSS style",
  );
}
const escapedBox = viewModule.exports.default({
  latex: String.raw`\bbox[5px,border: 2px solid red]{a<b}`,
});
assert(
  escapedBox.props.children.props.dangerouslySetInnerHTML.__html.includes(
    String.raw`<annotation encoding="application/x-tex">\bbox[5px,border: 2px solid red]{a&lt;b}</annotation>`,
  ),
);
const untrustedBox = viewModule.exports.default({
  latex: String.raw`\bbox[5px,border: 2px solid red]{\href{javascript:alert(1)}{3+1}}`,
});
assert(
  !untrustedBox.props.children.props.dangerouslySetInnerHTML.__html.includes(
    '<a href="javascript:',
  ),
  "The display adaptation retains KaTeX trust:false",
);

const vendorSource = fs.readFileSync(
  new URL("../node_modules/mathlive/mathlive.mjs", import.meta.url),
  "utf8",
);
for (const [constant, command] of [
  ["FOREGROUND_COLORS", "textcolor"],
  ["BACKGROUND_COLORS", "colorbox"],
]) {
  const declaration = new RegExp(
    "var " + constant + " = (\\{[\\s\\S]*?\\n\\});",
  ).exec(vendorSource);
  assert(declaration, "Pinned vendor palette remains available");
  const palette = new Function("return " + declaration[1])();
  assert.equal(Object.keys(palette).length, 16);
  for (const [name, hex] of Object.entries(palette)) {
    const source =
      "\\" +
      command +
      "{" +
      name +
      "}{" +
      (command === "colorbox" ? "$3+1$" : "3+1") +
      "}";
    const rendered = viewModule.exports.default({ latex: source });
    const html = rendered.props.dangerouslySetInnerHTML.__html;
    assert(!html.includes("katex-error"), source);
    assert(
      html.includes(hex),
      "History uses the exact pinned vendor shade: " + source,
    );
    assert(
      html.includes(
        `<annotation encoding="application/x-tex">${source}</annotation>`,
      ),
      "Original palette source remains copyable",
    );
  }
}
for (const source of [
  String.raw`\colorbox{light-grey}{$\textcolor{dark-grey}{3+1}$}`,
  String.raw`\fcolorbox{dark-grey}{light-grey}{$3+1$}`,
  String.raw`\bbox[5px,border: 2px solid red]{\textcolor{dark-grey}{a<b}}`,
]) {
  const rendered = viewModule.exports.default({ latex: source });
  const html = (rendered.props.children ?? rendered).props
    .dangerouslySetInnerHTML.__html;
  assert(!html.includes("katex-error"));
  assert(html.includes("#666"));
  assert(
    html.includes(
      `<annotation encoding="application/x-tex">${source.replaceAll("<", "&lt;")}</annotation>`,
    ),
  );
}
for (const source of [
  String.raw`\textcolor{rebeccapurple}{3+1}`,
  String.raw`\textcolor{#abcdef}{3+1}`,
  String.raw`\colorbox{#abc}{$3+1$}`,
  String.raw`\text{dark-grey light-grey}`,
  String.raw`\\textcolor{dark-grey}{3+1}`,
  String.raw`\verb|\textcolor{dark-grey}{3+1}|`,
  String.raw`% \textcolor{dark-grey}{3+1}`,
  String.raw`\textcolor{__proto__}{3+1}`,
  String.raw`\textcolor{red;background:url(x)}{3+1}`,
  String.raw`\textcolor{dark-grey}{3+1`,
  String.raw`\textcolor{dark-grey}{3+1}}`,
  "{".repeat(65) + String.raw`\textcolor{dark-grey}{3+1}` + "}".repeat(65),
  String.raw`\textcolor{dark-grey}{` + "x".repeat(8000) + "}",
]) {
  assert.equal(
    displayColors.formatDisplayColors(source),
    source,
    "Unrelated, malformed or bounded-out source is unchanged",
  );
}
assert.equal(
  displayColors.formatDisplayColors(String.raw`\color{ dark-grey }3+1`),
  String.raw`\color{#666}3+1`,
);
const untrustedColorSource = String.raw`\textcolor{dark-grey}{\href{javascript:alert(1)}{a<b\&c}}`;
const untrustedColorHtml = viewModule.exports.default({
  latex: untrustedColorSource,
}).props.dangerouslySetInnerHTML.__html;
assert(!untrustedColorHtml.includes('<a href="javascript:'));
assert(
  untrustedColorHtml.includes(
    untrustedColorSource.replaceAll("&", "&amp;").replaceAll("<", "&lt;"),
  ),
);

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
