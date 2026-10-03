import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { prepareMathLiveMenu } from "../lib/calculator/mathlive-menu.ts";

const source = fs.readFileSync(
  new URL("../node_modules/mathlive/mathlive.mjs", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "mathlive.mjs",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const functions = new Map();
let insertionSelection;
function visit(node) {
  if (ts.isFunctionDeclaration(node))
    functions.set(node.name?.text, node.getText(ast));
  if (
    ts.isIfStatement(node) &&
    node.expression.getText(ast) ===
      'options.selectionMode === "placeholder"' &&
    node.getText(ast).includes("newAtoms.flatMap")
  )
    insertionSelection = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(
  insertionSelection,
  "Pinned mathematical insertion selection logic exists",
);
const names = [
  "getDecorationSubmenu",
  "getAccentSubmenu",
  "getVariantSubmenu",
  "variantMenuItem",
  "variantStyleMenuItem",
  "getInsertMatrixSubmenu",
  "leap",
  "leapTo",
  "leapTarget",
];
assert(names.every((name) => functions.has(name)));
const pinned = new Function(
  "environment",
  `with(environment) {
  ${names.map((name) => functions.get(name)).join("\n")}
  return {getDecorationSubmenu,getAccentSubmenu,getVariantSubmenu,getInsertMatrixSubmenu,leap};
}`,
)({
  convertLatexToMarkup: (latex) => "preview:" + latex,
  getSelectionPlainString: () => "x",
  validVariantAtom: () => true,
  localize: (key, rows, columns) => (rows ? `${rows} by ${columns}` : key),
  InsertMatrixMenuItem: class {},
});
const setInsertionSelection = new Function(
  "model",
  "newAtoms",
  "options",
  "const lastNewAtom = newAtoms[newAtoms.length - 1];\n" + insertionSelection,
);
function field(prefix = 0) {
  const calls = [];
  let atoms = [],
    ranges = [[prefix, prefix]];
  const model = {
    anchor: prefix,
    position: prefix,
    at: (offset) => atoms[offset],
    offsetOf: (atom) => atoms.indexOf(atom),
    findAtom: (predicate, origin) => atoms.slice(origin).find(predicate),
    setSelection(anchor, position) {
      this.anchor = anchor;
      this.position = position;
      ranges = [[anchor, position]];
    },
    announce() {},
    mathfield: { readOnly: false, stopCoalescingUndo() {} },
  };
  const value = {
    calls,
    getValue: () => "x",
    get selection() {
      return { ranges };
    },
    set position(offset) {
      model.setSelection(offset, offset);
    },
    insert(latex, options) {
      calls.push({ latex, options });
      atoms = Array.from({ length: prefix + 1 }, () => ({ type: "mord" }));
      if (prefix) atoms[1] = { type: "placeholder" };
      const children = [];
      const cells = [...latex.matchAll(/#\?/g)].length;
      for (let cell = 0; cell < cells; cell++) {
        const first = { type: "first", treeDepth: 2 };
        const placeholder = { type: "placeholder", treeDepth: 3 };
        children.push(first, placeholder);
      }
      const matrix = { type: "array", children };
      atoms.push(...children, matrix);
      model.setSelection(prefix, prefix);
      setInsertionSelection(model, [matrix], options);
    },
    executeCommand(command) {
      assert.equal(command, "moveToNextPlaceholder");
      return pinned.leap(model, "forward");
    },
  };
  value.menuItems = [
    { submenu: pinned.getDecorationSubmenu(value) },
    { submenu: pinned.getAccentSubmenu(value) },
    { submenu: pinned.getVariantSubmenu(value) },
    { submenu: pinned.getInsertMatrixSubmenu(value), columnCount: 5 },
    { id: "ordinary", label: "Ordinary command", onMenuSelect() {} },
  ];
  return value;
}
const baseline = field();
baseline.menuItems[3].submenu
  .find((item) => item.id === "insert-matrix-2x2")
  .onMenuSelect({});
assert.deepEqual(
  baseline.selection.ranges,
  [[0, 9]],
  "Actual pinned item insertion selects the whole matrix",
);
assert.equal(
  baseline.menuItems[0].submenu.every((item) => !item.ariaLabel),
  true,
);
assert.equal(
  baseline.menuItems[1].submenu.every((item) => !item.ariaLabel),
  true,
);

for (const prefix of [0, 6]) {
  const adapted = field(prefix);
  const original = adapted.menuItems;
  prepareMathLiveMenu(adapted);
  assert.equal(
    adapted.menuItems[4],
    original[4],
    "Unrelated commands are unchanged",
  );
  for (let group = 0; group < 4; group++) {
    for (let index = 0; index < original[group].submenu.length; index++) {
      const before = original[group].submenu[index];
      const after = adapted.menuItems[group].submenu[index];
      assert.equal(
        after.label,
        before.label,
        `${before.id} retains its visual preview`,
      );
      assert.equal(after.visible, before.visible);
      assert.equal(after.checked, before.checked);
      assert(after.ariaLabel, `${before.id} has an accessible name`);
      if (group < 3) assert.equal(after.onMenuSelect, before.onMenuSelect);
      if (group === 2 || group === 3)
        assert.equal(after.ariaLabel, before.tooltip);
      if (group === 3) {
        assert.equal(
          after.onCreate,
          before.onCreate,
          "Pinned matrix grid creation is preserved",
        );
        assert.equal(after.data, before.data);
        after.onMenuSelect({ id: before.id, modifiers: {} });
        assert.deepEqual(
          adapted.selection.ranges,
          [[prefix + 1, prefix + 2]],
          "Pinned leap selects first new placeholder, skipping earlier placeholders",
        );
        const call = adapted.calls.at(-1);
        assert.deepEqual(
          call.options,
          { selectionMode: "item" },
          "Original insertion command semantics retained",
        );
        assert.equal(
          [...call.latex.matchAll(/#\?/g)].length,
          before.data.row * before.data.col,
        );
      }
    }
  }
  assert.equal(
    new Set(adapted.menuItems[0].submenu.map((item) => item.ariaLabel)).size,
    3,
  );
  assert.equal(
    new Set(adapted.menuItems[1].submenu.map((item) => item.ariaLabel)).size,
    12,
  );
}
console.log(
  "Pinned menu labels, matrix insertion selection and first-placeholder regressions passed",
);
