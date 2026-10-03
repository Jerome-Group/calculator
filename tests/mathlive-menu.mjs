import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

await import("./resolve-types.mjs");
const { prepareMathLiveMenu } = await import(
  "../lib/calculator/mathlive-menu.ts"
);

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
  "getDefaultMenuItems",
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
  return {getDefaultMenuItems,getDecorationSubmenu,getAccentSubmenu,getVariantSubmenu,getInsertMatrixSubmenu,leap};
}`,
)({
  convertLatexToMarkup: (latex) => "preview:" + latex,
  getSelectionPlainString: () => "x",
  validVariantAtom: () => true,
  localize: (key, rows, columns) => (rows ? `${rows} by ${columns}` : key),
  InsertMatrixMenuItem: class {},
  getColorSubmenu: () => [],
  getBackgroundColorSubmenu: () => [],
  insertMenu: () => [],
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
  value.menuItems.push(
    pinned
      .getDefaultMenuItems(value)
      .find((item) =>
        item.submenu?.some((child) => child.id === "environment-no-border"),
      ),
  );
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
  const borderLabels = [
    "No border",
    "Parentheses",
    "Square brackets",
    "Determinant bars",
    "Braces",
  ];
  const borders = adapted.menuItems[5];
  assert.equal(borders.visible, original[5].visible);
  assert.equal(borders.submenuClass, original[5].submenuClass);
  assert.equal(borders.submenu.length, 5);
  for (let index = 0; index < borders.submenu.length; index++) {
    const before = original[5].submenu[index];
    const { ariaLabel, ...unchanged } = borders.submenu[index];
    assert.equal(ariaLabel, borderLabels[index]);
    assert.equal(unchanged.onMenuSelect, before.onMenuSelect);
    assert.deepEqual(
      unchanged,
      before,
      "Border callback and visual glyph remain pinned",
    );
  }
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

const { cutMathLiveSelection } = await import(
  "../lib/calculator/mathlive-cut.ts"
);
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const setClipboard = (clipboard) =>
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
class CutField extends EventTarget {
  value = String.raw`\textcolor{dark-grey}{3+1}`;
  selection = { ranges: [[0, 3]], direction: "forward" };
  readOnly = false;
  isConnected = true;
  commands = [];
  history = [];
  selectedLatex;
  remainder = "";
  get selectionIsCollapsed() {
    return this.selection.ranges.every(([start, end]) => start === end);
  }
  getValue(selection, format) {
    assert.deepEqual(selection, this.selection);
    assert.equal(format, "latex");
    return this.selectedLatex ?? this.value;
  }
  executeCommand(command) {
    this.commands.push(command);
    if (command === "deleteBackward") {
      const before = new Event("beforeinput", { cancelable: true });
      if (!this.dispatchEvent(before)) return false;
      this.history.push(this.value);
      this.value = this.remainder;
      this.selection = { ranges: [[0, 0]], direction: "forward" };
      this.dispatchEvent(new Event("input"));
    } else if (command === "undo") {
      this.value = this.history.pop();
      this.dispatchEvent(new Event("input"));
    }
    return true;
  }
}
try {
  const write = deferred(),
    writes = [];
  setClipboard({
    writeText: (text) => {
      writes.push(text);
      return write.promise;
    },
  });
  const field = new CutField(),
    originalValue = field.value;
  const events = [];
  for (const type of ["beforeinput", "input"])
    field.addEventListener(type, () => events.push(type));
  const vendorCut = pinned
    .getDefaultMenuItems(field)
    .find((item) => item.id === "cut");
  field.menuItems = [vendorCut];
  const originalCommand = field.executeCommand;
  prepareMathLiveMenu(field);
  const { onMenuSelect, ...props } = field.menuItems[0];
  assert.deepEqual(
    props,
    Object.fromEntries(
      Object.entries(vendorCut).filter(([key]) => key !== "onMenuSelect"),
    ),
  );
  const cutting = onMenuSelect({});
  assert.deepEqual(writes, [originalValue]);
  assert.equal(
    field.value,
    originalValue,
    "Pending clipboard write cannot remove input",
  );
  assert.deepEqual(field.commands, []);
  assert.equal(
    await onMenuSelect({}),
    false,
    "Repeated activation cannot schedule a second deletion",
  );
  assert.equal(writes.length, 1);
  write.resolve();
  assert.equal(await cutting, true);
  assert.equal(field.value, "");
  assert.deepEqual(field.commands, ["deleteBackward"]);
  assert.deepEqual(
    events,
    ["beforeinput", "input"],
    "Public deletion emits normal editor source events",
  );
  assert.equal(
    field.executeCommand,
    originalCommand,
    "Keyboard Cut command path remains untouched",
  );
  field.executeCommand("undo");
  assert.equal(
    field.value,
    originalValue,
    "Public undo restores exact styled source",
  );

  const partial = new CutField();
  partial.value = "3+1+2";
  partial.selectedLatex = "3+1";
  partial.remainder = "+2";
  const partialWrites = [];
  setClipboard({
    writeText: async (text) => {
      partialWrites.push(text);
    },
  });
  assert.equal(await cutMathLiveSelection(partial), true);
  assert.deepEqual(
    partialWrites,
    ["3+1"],
    "Clipboard receives selected LaTeX only",
  );
  assert.equal(
    partial.value,
    "+2",
    "Public delete command applies only to selected content",
  );
  setClipboard({
    writeText: async () => {
      throw Error("Denied");
    },
  });
  const retry = new CutField();
  assert.equal(await cutMathLiveSelection(retry), false);
  retry.dispatchEvent(new Event("selection-change"));
  setClipboard({ writeText: async () => {} });
  assert.equal(
    await cutMathLiveSelection(retry),
    true,
    "Failed transaction releases pending lock and listeners",
  );

  for (const clipboard of [
    undefined,
    {},
    { writeText: () => Promise.reject(Error("Denied")) },
    {
      writeText: () => {
        throw Error("Unavailable");
      },
    },
  ]) {
    setClipboard(clipboard);
    const field = new CutField(),
      before = field.value;
    assert.equal(await cutMathLiveSelection(field), false);
    assert.equal(field.value, before);
    assert.deepEqual(
      field.commands,
      ["plonk"],
      "Existing public failure feedback, no deletion",
    );
  }
  for (const interrupt of [
    (field) => {
      field.selection = { ranges: [[1, 2]] };
      field.dispatchEvent(new Event("selection-change"));
      field.selection = { ranges: [[0, 3]], direction: "forward" };
    },
    (field) => {
      field.dispatchEvent(new Event("input"));
    },
    (field) => {
      field.dispatchEvent(new Event("beforeinput"));
    },
    (field) => {
      field.dispatchEvent(new Event("blur"));
    },
    (field) => {
      field.value = "x+2";
    },
    (field) => {
      field.selection = { ranges: [[1, 2]] };
    },
    (field) => {
      field.isConnected = false;
    },
    (field) => {
      field.readOnly = true;
    },
  ]) {
    const write = deferred();
    setClipboard({ writeText: () => write.promise });
    const field = new CutField();
    const cutting = cutMathLiveSelection(field);
    interrupt(field);
    const value = field.value,
      selection = structuredClone(field.selection);
    write.resolve();
    assert.equal(await cutting, false);
    assert.equal(
      field.value,
      value,
      "Interrupted Cut preserves current content",
    );
    assert.deepEqual(
      field.selection,
      selection,
      "Interrupted Cut never restores or deletes a newer selection",
    );
    assert(!field.commands.includes("deleteBackward"));
  }
  let writesCount = 0;
  setClipboard({
    writeText: async () => {
      writesCount++;
    },
  });
  for (const adjust of [
    (field) => {
      field.selection = { ranges: [[1, 1]] };
    },
    (field) => {
      field.readOnly = true;
    },
  ]) {
    const field = new CutField();
    adjust(field);
    assert.equal(await cutMathLiveSelection(field), false);
  }
  assert.equal(
    writesCount,
    0,
    "Collapsed/read-only Cut neither copies nor deletes",
  );
  const prevented = new CutField();
  prevented.addEventListener("beforeinput", (event) => event.preventDefault());
  const before = prevented.value;
  assert.equal(await cutMathLiveSelection(prevented), false);
  assert.equal(
    prevented.value,
    before,
    "Host beforeinput cancellation remains respected",
  );
} finally {
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete navigator.clipboard;
}
console.log(
  "Menu Cut clipboard transaction, interruption, repetition and undo regressions passed",
);
