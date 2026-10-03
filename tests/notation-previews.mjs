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
let advancedMode = false;
new Function("require", "module", "exports", compiled)(
  (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react")
      return {
        useState: () => [advancedMode, (value) => (advancedMode = value)],
      };
    if (name === "@/lib/calculator/notation")
      return { sourceToLatex, matrixRowsToLatex };
    if (name === "./MathView") return { default: MathView };
    if (name === "./Choice") return { default: () => null };
    throw Error(`Unexpected import ${name}`);
  },
  loadedModule,
  loadedModule.exports,
);
const {
  Preview,
  ProblemPreview,
  ListInput,
  MatrixInput,
  listItems,
  matrixRows,
} = loadedModule.exports;
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
function expressionFields(expression) {
  return StructuredFields({
    op,
    params: { ...params, expression },
    definitions: [],
    onMath: () => {},
    onChange: () => {},
  });
}
for (const source of [
  "(12)/(3+1)",
  "(x)/(y)",
  "(x)*(y)",
  "(x+y)",
  "(x)",
  "sin(x)",
  "([x,y])",
  "[x,y)",
  "[(x,y])",
  "[x,y",
  '["unclosed,x]',
  "[x]+[y]",
  "(x,y)+(z,w)",
  String.raw`['unclosed\',x]`,
]) {
  const tree = expressionFields(source);
  const input = elements(
    tree,
    (node) =>
      node.type === "input" && node.props["aria-label"] === "Expression",
  )[0];
  assert(input, `${source} retains the scalar Expression input`);
  assert.equal(input.props.value, source, "scalar source remains unchanged");
  assert.equal(
    elements(
      tree,
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "Math editor for Expression",
    ).length,
    1,
    "scalar Math editor remains available",
  );
  assert.equal(
    elements(tree, (node) => [ListInput, MatrixInput].includes(node.type))
      .length,
    0,
    "scalar input is not rewritten as list or matrix",
  );
  assert.equal(listItems(source), null);
}
for (const [source, expected] of [
  ["(x,y)", ["x", "y"]],
  ["(x,)", ["x"]],
  ["()", []],
  ["[x]", ["x"]],
  ["[]", []],
  ["[(x,y),(z,w)]", ["(x,y)", "(z,w)"]],
  ['["a,b",x]', ['"a,b"', "x"]],
  [String.raw`["a\",b",x]`, [String.raw`"a\",b"`, "x"]],
  [String.raw`["a\\",x]`, [String.raw`"a\\"`, "x"]],
  [String.raw`['a\',b',x]`, [String.raw`'a\',b'`, "x"]],
]) {
  assert.deepEqual(listItems(source), expected, source);
  const field = elements(
    expressionFields(source),
    (node) => node.type === ListInput,
  )[0];
  if (matrixRows(source)) continue;
  assert(field, `${source} retains list controls`);
  assert.equal(field.props.value, source);
  assert.deepEqual(
    elements(ListInput(field.props), (node) => node.type === "input").map(
      (node) => node.props.value,
    ),
    expected,
  );
}
for (const source of ["[[x,1],[2,y]]", "((x,1),(2,y))"]) {
  assert.deepEqual(matrixRows(source), [
    ["x", "1"],
    ["2", "y"],
  ]);
  const field = elements(
    expressionFields(source),
    (node) => node.type === MatrixInput,
  )[0];
  assert(field, "nested rows retain matrix controls");
  assert.equal(field.props.value, source);
  assert.deepEqual(
    elements(
      MatrixInput(field.props),
      (node) => node.type === "input" && node.props.type !== "number",
    ).map((node) => node.props.value),
    ["x", "1", "2", "y"],
  );
}
for (const tupleRows of [true, false]) {
  const row = (cells) =>
    (tupleRows ? "(" : "[") + cells + (tupleRows ? ")" : "]");
  let value = `[${["0,1", "1,2", "2,5"].map(row).join(",")}]`;
  function gridChange(label, next) {
    const tree = MatrixInput({
      value,
      label: "Points",
      onChange: (source) => (value = source),
    });
    const input = elements(
      tree,
      (node) => node.type === "input" && node.props["aria-label"] === label,
    )[0];
    assert(input, label);
    input.props.onChange({ target: { value: next } });
  }
  gridChange("Points rows", "4");
  assert.equal(
    value,
    `[${["0,1", "1,2", "2,5", "0,0"].map(row).join(",")}]`,
    "new rows preserve tuple/list shape",
  );
  gridChange("Points rows", "3");
  gridChange("Points columns", "3");
  assert.equal(
    value,
    `[${["0,1,0", "1,2,0", "2,5,0"].map(row).join(",")}]`,
    "new columns preserve tuple/list shape",
  );
  gridChange("Points columns", "2");
  gridChange("Points columns", "1");
  assert.equal(
    value,
    `[${["0", "1", "2"].map((cell) => row(cell + (tupleRows ? "," : ""))).join(",")}]`,
    "single-column tuples retain their required comma",
  );
  gridChange("Points columns", "2");
  gridChange("Points row 1 column 2", "1");
  gridChange("Points row 2 column 2", "2");
  gridChange("Points row 3 column 2", "5");
  gridChange("Points row 3 column 2", "6");
  assert.equal(
    value,
    `[${["0,1", "1,2", "2,6"].map(row).join(",")}]`,
    "edited cells preserve tuple/list shape",
  );
  gridChange("Points row 3 column 2", "5");
  assert.equal(
    value,
    `[${["0,1", "1,2", "2,5"].map(row).join(",")}]`,
    "resizing and editing can restore original point/matrix input",
  );
}
for (const [source, expected] of [
  ["[(0,1),[1,2]]", "[(0,1),[1,2],(0,0)]"],
  ["[[0,1],(1,2)]", "[[0,1],(1,2),[0,0]]"],
  ["Matrix([[0,1],[1,2]])", "Matrix([[0,1],[1,2],[0,0]])"],
  ["ImmutableMatrix([[0,1],[1,2]])", "ImmutableMatrix([[0,1],[1,2],[0,0]])"],
]) {
  let changed;
  const tree = MatrixInput({
    value: source,
    label: "Data",
    onChange: (value) => (changed = value),
  });
  elements(
    tree,
    (node) => node.type === "input" && node.props["aria-label"] === "Data rows",
  )[0].props.onChange({ target: { value: "3" } });
  assert.equal(
    changed,
    expected,
    "each existing row retains its shape; new rows follow the first",
  );
}
let singleTuple;
const outerTuple = MatrixInput({
  value: "((x,y),(z,w))",
  onChange: (value) => (singleTuple = value),
});
elements(
  outerTuple,
  (node) => node.type === "input" && node.props["aria-label"] === "Matrix rows",
)[0].props.onChange({ target: { value: "1" } });
assert.equal(
  singleTuple,
  "((x,y),)",
  "one-row outer tuples retain their required comma",
);
let copiedMatrix;
const namedMatrix = MatrixInput({
  value: "A",
  definitions: [
    { name: "A", kind: "matrix", expression: "Matrix([[1,2],[3,4]])" },
  ],
  onChange: (value) => (copiedMatrix = value),
});
elements(
  namedMatrix,
  (node) => node.type === "button" && node.props.children === "Edit a copy",
)[0].props.onClick();
assert.equal(
  copiedMatrix,
  "Matrix([[1,2],[3,4]])",
  "named matrix copy retains square matrix rows",
);
for (const [id, key, source, labels, values] of [
  [
    "multiple_integral",
    "bounds",
    "[(x,0,1),(y,0,x)]",
    [
      "Variable 1",
      "Lower bound 1",
      "Upper bound 1",
      "Variable 2",
      "Lower bound 2",
      "Upper bound 2",
    ],
    ["x", "0", "1", "y", "0", "x"],
  ],
  [
    "piecewise",
    "cases",
    "[(x,x<0),(0,True)]",
    ["Formula 1", "Condition 1", "Formula 2", "Condition 2"],
    ["x", "x<0", "0", "True"],
  ],
]) {
  const operation = operations.find((entry) => entry.id === id);
  assert(operation, id);
  const tree = StructuredFields({
    op: operation,
    params: { [key]: source },
    definitions: [],
    onMath: () => {},
    onChange: () => {},
  });
  assert.deepEqual(
    labels.map(
      (label) =>
        elements(
          tree,
          (node) => node.type === "input" && node.props["aria-label"] === label,
        )[0]?.props.value,
    ),
    values,
    "nested bounds and branches retain editable values",
  );
}
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
  advancedMode = false;
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
assert.equal(
  switchRelationship("And(Not(r),s)", "custom"),
  "And(Not(r),s)",
  "advanced mode retains the complete proposition",
);
advancedMode = false;
let proposition = "Equivalent(a,b)";
function logicTree() {
  const field = StructuredFields({
    op: logic,
    params: { expression: proposition },
    definitions: [],
    onMath: () => {},
    onChange: (key, next) => {
      assert.equal(key, "expression");
      proposition = next;
    },
  });
  return field.type(field.props);
}
function relationship(tree) {
  return elements(
    tree,
    (node) => node.props?.label === "Logical relationship",
  )[0];
}
relationship(logicTree()).props.onChange("custom");
const advancedTree = logicTree();
assert.equal(relationship(advancedTree).props.value, "custom");
const rawInput = elements(
  advancedTree,
  (node) => node.type === "input" && node.props["aria-label"] === "Proposition",
)[0];
assert(
  rawInput,
  "advanced mode exposes raw input for a recognized relationship",
);
assert.equal(rawInput.props.value, "Equivalent(a,b)");
rawInput.props.onChange({ target: { value: "And(a,b,c)" } });
assert.equal(proposition, "And(a,b,c)");
assert.equal(relationship(logicTree()).props.value, "custom");
advancedMode = false;
for (const source of [
  "And(a,b,c)",
  "Or(a,b,c)",
  "Xor(a,b,c)",
  "Equivalent(a,b,c)",
]) {
  proposition = source;
  const tree = logicTree();
  assert.equal(relationship(tree).props.value, "custom");
  assert.equal(
    elements(
      tree,
      (node) =>
        node.type === "input" && node.props["aria-label"] === "Proposition",
    )[0]?.props.value,
    source,
    "multiargument propositions remain complete raw expressions",
  );
}
proposition = "Equivalent(a,b)";
relationship(logicTree()).props.onChange("custom");
relationship(logicTree()).props.onChange("And");
assert.equal(proposition, "And(a,b)");
assert.equal(relationship(logicTree()).props.value, "And");
console.log(
  `All ${operations.length} default form previews render; scalar/grouped source, tuple/matrix/bounds/cases controls, exact fallback and probability labels passed`,
);
