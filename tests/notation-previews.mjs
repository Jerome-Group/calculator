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
const scalarNotation = { current: new Set() };
new Function("require", "module", "exports", compiled)(
  (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react")
      return {
        useState: () => [advancedMode, (value) => (advancedMode = value)],
        useRef: () => scalarNotation,
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
  DistributionFields,
  listItems,
  matrixRows,
} = loadedModule.exports;
const StructuredFields = loadedModule.exports.default;
assert.equal(
  loadedModule.exports.scalarFieldText("latex:\\frac{1}{x}"),
  "\\frac{1}{x}",
);
assert.equal(
  loadedModule.exports.scalarFieldSource("latex:x", "x+1"),
  "latex:x+1",
);
assert.equal(loadedModule.exports.scalarFieldSource("latex:x", ""), "");
assert.equal(loadedModule.exports.scalarFieldSource("x", "x+1"), "x+1");
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
{
  const integration = operations.find((entry) => entry.id === "integrate");
  const params = {
    expression: "latex:1",
    variable: "x",
    lower: "latex:3",
    upper: "latex:4",
  };
  const changes = [];
  const rendered = StructuredFields({
    op: integration,
    params,
    definitions: [],
    onChange: (...args) => changes.push(args),
    onMath: () => {},
  });
  const inputs = elements(rendered, (node) => node.type === "input");
  assert.equal(
    inputs.find((node) => node.props["aria-label"] === "Expression").props
      .value,
    "1",
  );
  const lower = inputs.find(
    (node) => node.props["aria-label"] === "Lower bound",
  );
  assert.equal(lower.props.value, "3");
  const notationHints = elements(
    rendered,
    (node) => node.type === "span" && node.props.id,
  );
  assert.equal(notationHints.length, 3);
  assert.equal(new Set(notationHints.map((node) => node.props.id)).size, 3);
  for (const label of ["Expression", "Lower bound", "Upper bound"]) {
    const input = inputs.find((node) => node.props["aria-label"] === label);
    const hint = notationHints.find(
      (node) => node.props.id === input.props["aria-describedby"],
    );
    assert(hint, `${label} associates its visible notation hint`);
    assert.equal(hint.props.children, "LaTeX · Use Math to edit visually");
  }
  assert.equal(
    inputs.find((node) => node.props["aria-label"] === "Variable").props[
      "aria-describedby"
    ],
    undefined,
    "Ordinary text fields have no LaTeX mode hint",
  );
  lower.props.onChange({ target: { value: "2" } });
  assert.deepEqual(changes, [["lower", "latex:2"]]);
  lower.props.onChange({ target: { value: "" } });
  assert.deepEqual(changes.at(-1), ["lower", ""]);
  const cleared = StructuredFields({
    op: integration,
    params: { ...params, lower: "" },
    definitions: [],
    onChange: (...args) => changes.push(args),
    onMath: () => {},
  });
  const clearedLower = elements(cleared, (node) => node.type === "input").find(
    (node) => node.props["aria-label"] === "Lower bound",
  );
  assert.equal(
    clearedLower.props["aria-describedby"],
    lower.props["aria-describedby"],
    "Clearing retains the associated mode hint and its stable ID",
  );
  assert.equal(
    elements(
      cleared,
      (node) => node.props?.id === clearedLower.props["aria-describedby"],
    ).length,
    1,
  );
  clearedLower.props.onChange({ target: { value: "\\pi" } });
  assert.deepEqual(
    changes.at(-1),
    ["lower", "latex:\\pi"],
    "Clearing and retyping retains field notation without sending an empty LaTeX marker as a bound",
  );
  assert.equal(
    math(ProblemPreview({ op: integration, params }))[0],
    "\\int_{3}^{4} 1\\,d x",
  );
  const plain = StructuredFields({
    op: integration,
    params: { ...params, expression: "x+1" },
    definitions: [],
    onChange: () => {},
    onMath: () => {},
  });
  assert.equal(
    elements(plain, (node) => node.type === "input").find(
      (node) => node.props["aria-label"] === "Expression",
    ).props["aria-describedby"],
    undefined,
    "An explicitly plain source removes its LaTeX mode hint",
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
{
  const defaults = {
    normal: "[0,1]",
    "student-t": "[5]",
    "chi-square": "[3]",
    F: "[5,10]",
    binomial: "[10,0.5]",
    poisson: "[3]",
    geometric: "[0.5]",
    hypergeometric: "[20,7,5]",
    uniform: "[0,1]",
    exponential: "[1]",
    gamma: "[2,1]",
    beta: "[2,3]",
    "negative-binomial": "[3,0.5]",
  };
  const initial = Object.fromEntries(
    distribution.fields.map((field) => [field.key, field.value]),
  );
  for (const [name, expected] of Object.entries(defaults)) {
    const params = { ...initial };
    const tree = DistributionFields({
      params,
      set: (key, value) => (params[key] = value),
    });
    const choice = elements(
      tree,
      (node) => node.props?.label === "Distribution",
    )[0];
    choice.props.onChange(name);
    assert.equal(params.parameters, expected);
    assert.equal(params.distribution, name);
    const displayed = elements(
      DistributionFields({
        params,
        set: () => assert.fail("Render wrote params"),
      }),
      (node) => node.type === "input" && node.props["aria-label"] !== "Value x",
    ).map((node) => node.props.value);
    assert.deepEqual(displayed, listItems(expected));
  }
  for (const [parameters, expected] of [
    ["[0,1]", ["0", "1", ""]],
    ["[20]", ["20", "", ""]],
    ["[]", ["", "", ""]],
    ["[20,7,]", ["20", "7", ""]],
    ["[20,,5]", ["20", "", "5"]],
    [undefined, ["0", "1", ""]],
  ]) {
    const params = {
      distribution: "hypergeometric",
      action: "cdf",
      value: "0",
    };
    if (parameters !== undefined) params.parameters = parameters;
    const before = structuredClone(params),
      changes = [];
    const tree = DistributionFields({
      params,
      set: (...args) => changes.push(args),
    });
    const inputs = elements(tree, (node) => node.type === "input");
    assert.deepEqual(
      inputs.slice(0, 3).map((node) => node.props.value),
      expected,
    );
    assert.deepEqual(params, before);
    assert.equal(changes.length, 0);
    inputs[0].props.onChange({ target: { value: "21" } });
    assert.deepEqual(changes, [
      ["parameters", `[21,${expected.slice(1).join(",")}]`],
    ]);
  }
  for (const [name, parameters] of [
    ["hypergeometric", "[20,7,5,99]"],
    ["hypergeometric", "[20,7"],
    ["hypergeometric", ""],
    ["student-t", "[5,2]"],
    ["normal", "[0,1,99]"],
  ]) {
    const params = { ...initial, distribution: name, parameters },
      changes = [];
    const tree = DistributionFields({
      params,
      set: (...args) => changes.push(args),
    });
    const fields = elements(tree, (node) => node.type === "input");
    assert.equal(
      fields.length,
      2,
      "Only exact raw Parameters and Value x appear",
    );
    assert.equal(fields[0].props["aria-label"], "Parameters");
    assert.equal(fields[0].props.value, parameters);
    assert.equal(changes.length, 0);
    fields[0].props.onChange({ target: { value: parameters + " " } });
    assert.deepEqual(changes, [["parameters", parameters + " "]]);
    const preview = ProblemPreview({ op: distribution, params });
    assert.equal(math(preview).length, 0);
    assert(
      elements(preview, (node) => node.type === "code").some(
        (node) => node.props.children === parameters,
      ),
    );
  }
  const params = {
    ...initial,
    distribution: "hypergeometric",
    parameters: "[20]",
  };
  for (const [label, value] of [
    ["Successes in population K", "7"],
    ["Draws n", "5"],
  ]) {
    const tree = DistributionFields({
      params,
      set: (key, next) => (params[key] = next),
    });
    elements(
      tree,
      (node) => node.type === "input" && node.props["aria-label"] === label,
    )[0].props.onChange({ target: { value } });
  }
  assert.equal(
    params.parameters,
    "[20,7,5]",
    "Explicit fills recover the complete tuple",
  );
  for (const source of ["[20,7", "[20,7,5,99]"]) {
    const recovering = {
      ...initial,
      distribution: "hypergeometric",
      parameters: source,
    };
    const tree = DistributionFields({
      params: recovering,
      set: (key, value) => (recovering[key] = value),
    });
    elements(
      tree,
      (node) =>
        node.type === "input" && node.props["aria-label"] === "Parameters",
    )[0].props.onChange({ target: { value: "[20,7,5]" } });
    assert.equal(recovering.parameters, "[20,7,5]");
    assert.deepEqual(
      elements(
        DistributionFields({
          params: recovering,
          set: () => assert.fail("Recovered render wrote params"),
        }),
        (node) => node.type === "input",
      ).map((node) => node.props.value),
      ["20", "7", "5", "0"],
    );
  }
  const absentNormal = { distribution: "normal", action: "cdf", value: "0" };
  assert.deepEqual(
    elements(
      DistributionFields({
        params: absentNormal,
        set: () => assert.fail("Absent render wrote a key"),
      }),
      (node) => node.type === "input",
    ).map((node) => node.props.value),
    ["0", "1", "0"],
  );
  assert(
    math(
      ProblemPreview({ op: distribution, params: absentNormal }),
    )[0].includes("N(0,"),
  );
  const absentFamily = { action: "pdf/pmf", value: "0" };
  assert.deepEqual(
    elements(
      DistributionFields({
        params: absentFamily,
        set: () => assert.fail("Absent family render wrote params"),
      }),
      (node) => node.type === "input",
    ).map((node) => node.props.value),
    ["0", "1", "0"],
  );
  const absentPreview = math(
    ProblemPreview({ op: distribution, params: absentFamily }),
  )[0];
  assert(absentPreview.includes("N(0,") && absentPreview.includes("f(0)"));
  assert(!absentPreview.includes("undefined"));
}
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
