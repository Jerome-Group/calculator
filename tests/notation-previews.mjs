import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { operations } from "../lib/calculator/catalog.ts";
import {
  sourceToLatex,
  matrixRowsToLatex,
} from "../lib/calculator/notation.ts";
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  fs.readFileSync(
    new URL("../components/calculator/StructuredFields.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const loadedModule = { exports: {} };
const MathView = () => null;
new Function("require", "module", "exports", compiled)(
  (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "@/lib/calculator/notation")
      return { sourceToLatex, matrixRowsToLatex };
    if (name === "./MathView") return { default: MathView };
    if (name === "./Choice") return { default: () => null };
    throw Error(`Unexpected import ${name}`);
  },
  loadedModule,
  loadedModule.exports,
);
const { Preview, ProblemPreview } = loadedModule.exports;
const StructuredFields = loadedModule.exports.default;
function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...[tree.props?.children]
      .flat(Infinity)
      .flatMap((child) => elements(child, predicate)),
  ];
}
function math(tree) {
  return elements(tree, (node) => node.type === MathView).map(
    (node) => node.props.latex,
  );
}
for (const op of operations) {
  const params = Object.fromEntries(
    op.fields.map((field) => [field.key, field.value]),
  );
  assert(
    ProblemPreview({ op, params }),
    `${op.id} preview renders without an async state race`,
  );
  for (const field of op.fields) {
    const rendered = Preview({ source: field.value });
    if (rendered.type === "code")
      assert.equal(rendered.props.children, field.value);
    else assert.equal(rendered.type, MathView);
  }
}
const op = operations.find((entry) => entry.id === "differentiate");
const params = { expression: "sin(x^2)", variable: "x", order: "1" };
const first = math(ProblemPreview({ op, params }))[0];
const second = math(
  ProblemPreview({ op, params: { ...params, expression: "sin(x)^2" } }),
)[0];
assert(
  first && second && first !== second,
  "function power and argument power remain distinct",
);
const unknown = "Piecewise((sin(x^2),x<0),(0,True))";
const fallback = ProblemPreview({
  op,
  params: { ...params, expression: unknown },
});
assert.equal(math(fallback).length, 0);
assert(
  elements(fallback, (node) => node.type === Preview).some(
    (node) => node.props.source === unknown,
  ),
  "unsupported problem retains exact original source",
);
const matrix = Preview({ source: "[[sin(x^2),1/(x+1)],[2,3]]" });
assert(math(matrix)[0].includes("\\begin{pmatrix}"));
assert(math(matrix)[0].includes(sourceToLatex("sin(x^2)")));
const distribution = operations.find((entry) => entry.id === "distribution");
assert(
  math(
    ProblemPreview({
      op: distribution,
      params: {
        distribution: "binomial",
        parameters: "[10,0.5]",
        action: "pdf/pmf",
        value: "3",
      },
    }),
  )[0].includes("P(X="),
);
const inverse = math(
  ProblemPreview({
    op: distribution,
    params: {
      distribution: "normal",
      parameters: "[0,1]",
      action: "isf",
      value: "0.1",
    },
  }),
)[0];
assert(inverse.includes("inverse") && inverse.includes("tail"));
const logic = operations.find((entry) => entry.id === "logic");
function switchRelationship(value, relationship) {
  let changed;
  const field = StructuredFields({
    op: logic,
    params: { expression: value },
    definitions: [],
    onMath: () => {},
    onChange: (key, next) => {
      assert.equal(key, "expression");
      changed = next;
    },
  });
  const tree = field.type(field.props);
  const choice = elements(
    tree,
    (node) => node.props?.label === "Logical relationship",
  )[0];
  assert(choice, "rendered logical relationship selector exists");
  choice.props.onChange(relationship);
  return changed;
}
for (const relationship of ["Implies", "And", "Or", "Xor", "Equivalent"]) {
  assert.equal(
    switchRelationship("Implies(Not(r),s)", relationship),
    `${relationship}(Not(r),s)`,
    "switching relationship preserves nested and named operands",
  );
  assert.equal(
    switchRelationship("And(Or(r,t),Not(s))", relationship),
    `${relationship}(Or(r,t),Not(s))`,
    "commas inside nested operands remain scoped",
  );
}
assert.equal(switchRelationship("And(Not(r))", "Or"), "Or(Not(r),q)");
assert.equal(switchRelationship("And()", "Xor"), "Xor(p,q)");
assert.equal(switchRelationship("Implies(p,q)", "And"), "And(p,q)");
assert.equal(switchRelationship("And(Not(r),s)", "custom"), "p");
console.log(
  `All ${operations.length} default form previews render; grouping, matrix, exact fallback and probability labels passed`,
);
