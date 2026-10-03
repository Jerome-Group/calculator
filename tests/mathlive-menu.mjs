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
const vendorClasses = new Map();
const vendorValues = new Map();
let insertionSelection;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer)
    vendorValues.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isClassExpression(node) && ts.isVariableDeclaration(node.parent))
    vendorClasses.set(node.parent.name.getText(ast), node);
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

function vendorMethod(className, name, environment) {
  const member = vendorClasses
    .get(className)
    ?.members.find(
      (node) => ts.isMethodDeclaration(node) && node.name.getText(ast) === name,
    );
  assert(member, `Pinned ${className}.${name} exists`);
  return new Function(
    "environment",
    `with(environment){return ({${member.getText(ast).replace(/^static /, "")}}).${name};}`,
  )(environment);
}
const VendorUndoManager = new Function(
  `return ${vendorClasses.get("_UndoManager").getText(ast)}`,
)();
VendorUndoManager.maximumDepth = 1000;
const commandEnvironment = {
  parseCommand: (command) => command,
  isArray: Array.isArray,
  removeSuggestion() {},
  updateAutocomplete() {},
  requestUpdate() {},
  range: (selection) => selection.ranges[0],
  ArrayAtom: class {},
};
const vendorCommands = new Function(
  "environment",
  `with(environment){${["perform", "deleteBackward", "deleteRange"].map((name) => functions.get(name)).join("\n")}return {perform,deleteBackward,deleteRange};}`,
)(commandEnvironment);
commandEnvironment.COMMANDS = {
  deleteBackward: {
    target: "model",
    changeContent: true,
    changeSelection: true,
    fn: vendorCommands.deleteBackward,
  },
  undo: {
    target: "mathfield",
    changeContent: true,
    fn: (field) => field.undoManager.undo(),
  },
  redo: {
    target: "mathfield",
    changeContent: true,
    fn: (field) => field.undoManager.redo(),
  },
  plonk: { target: "mathfield", fn: () => false },
};
const vendorCopy = vendorMethod("_ModeEditor", "copyToClipboard", {
  range: commandEnvironment.range,
});
const vendorCutEvent = vendorMethod("_Mathfield", "onCut", {
  ModeEditor: {
    copyToClipboard: vendorCopy,
    onCopy() {
      throw Error("This harness exercises absent clipboardData fallback");
    },
  },
  range: commandEnvironment.range,
  deleteRange: vendorCommands.deleteRange,
  requestUpdate() {},
});
let cutCommand;
function findCutCommand(node) {
  if (
    ts.isPropertyAssignment(node) &&
    node.name.getText(ast) === "cutToClipboard" &&
    node.getText(ast).includes("document.execCommand")
  )
    cutCommand = node.initializer.getText(ast);
  ts.forEachChild(node, findCutCommand);
}
findCutCommand(ast);
assert(cutCommand, "Pinned cutToClipboard command exists");
const cutDocument = {
  queryCommandSupported: () => true,
  execCommand: () => false,
};
const NativeClipboardEvent = class extends Event {
  clipboardData = null;
};
commandEnvironment.COMMANDS.cutToClipboard = {
  target: "mathfield",
  fn: new Function("document", "ClipboardEvent", `return (${cutCommand});`)(
    cutDocument,
    NativeClipboardEvent,
  ),
};
function initializeCutModel(field) {
  const parent = {
    type: "root",
    hasEmptyBranch: () => !field.value,
    addChildrenAfter(atoms) {
      assert.deepEqual(atoms, []);
    },
  };
  const cursor = { type: "first", parent, isLastSibling: true };
  field.model = {
    get selection() {
      return field.selection;
    },
    get selectionIsCollapsed() {
      return field.selectionIsCollapsed;
    },
    get position() {
      return field.selection.ranges[0][1];
    },
    set position(position) {
      field.selection = {
        ranges: [[position, position]],
        direction: "forward",
      };
    },
    root: parent,
    silenceNotifications: false,
    getValue: (range) =>
      field.atoms
        ? field.atoms
            .slice(...(Array.isArray(range) ? range : range.ranges[0]))
            .join("")
        : (field.selectedLatex ?? field.value),
    at: (offset) =>
      field.atoms && offset > 0
        ? {
            type:
              field.atoms[offset - 1] === String.raw`\placeholder{}`
                ? "placeholder"
                : "mord",
            parent,
            isLastSibling: offset === field.atoms.length,
          }
        : cursor,
    getAtoms(range) {
      return field.atoms
        ? field.atoms
            .slice(...range)
            .map((_, index) => this.at(range[0] + index + 1))
        : [{ type: "mord", parent: null }];
    },
    deleteAtoms(range) {
      field.deletedRanges.push([...range]);
      if (field.atoms) {
        field.atoms.splice(range[0], range[1] - range[0]);
        field.value = field.atoms.join("");
      } else field.value = field.remainder;
      this.position = range[0];
    },
    contentWillChange(options) {
      const event = new Event("beforeinput", { cancelable: true });
      event.inputType = options?.inputType;
      return field.dispatchEvent(event);
    },
    contentDidChange(options) {
      if (!this.silenceNotifications) {
        const event = new Event("input");
        event.inputType = options?.inputType;
        field.dispatchEvent(event);
      }
    },
    deferNotifications(options, run) {
      const result = run();
      this.contentDidChange({ inputType: options.type });
      return result;
    },
    getState: () =>
      structuredClone({
        value: field.value,
        selection: field.selection,
        atoms: field.atoms,
      }),
    setState(state) {
      field.value = state.value;
      field.atoms = structuredClone(state.atoms);
      field.selection = structuredClone(state.selection);
      field.dispatchEvent(new Event("input"));
    },
  };
  parent.firstChild = cursor;
  Object.defineProperty(cursor, "rightSibling", {
    get: () => field.model.at(1),
  });
  Object.defineProperty(parent, "lastChild", {
    get: () => field.model.at(field.atoms?.length ?? 0),
  });
  const undoManager = new VendorUndoManager(field.model);
  undoManager.startRecording();
  undoManager.snapshot();
  field.runtime = {
    model: field.model,
    undoManager,
    get isSelectionEditable() {
      return !field.readOnly;
    },
    flushInlineShortcutBuffer() {},
    snapshot: (op) => undoManager.snapshot(op),
    stopCoalescingUndo: () => undoManager.stopCoalescing(field.selection),
    scrollIntoView() {},
    focus() {},
    contentEditable: true,
    userSelect: "text",
  };
  field.model.announce = () => {};
  field.runtime.onCut = (event) => vendorCutEvent.call(field.runtime, event);
  const sink = new EventTarget();
  sink.addEventListener("cut", field.runtime.onCut);
  field.runtime.element = { querySelector: () => sink };
  field.model.mathfield = field.runtime;
}
class CutField extends EventTarget {
  value = String.raw`\textcolor{dark-grey}{3+1}`;
  selection = { ranges: [[0, 3]], direction: "forward" };
  readOnly = false;
  isConnected = true;
  commands = [];
  atoms;
  deletedRanges = [];
  selectedLatex;
  remainder = "";
  constructor() {
    super();
    initializeCutModel(this);
  }
  get selectionIsCollapsed() {
    return this.selection.ranges.every(([start, end]) => start === end);
  }
  getValue(selection, format) {
    assert.deepEqual(selection, this.selection);
    assert.equal(format, "latex");
    return this.atoms
      ? this.atoms.slice(...selection.ranges[0]).join("")
      : (this.selectedLatex ?? this.value);
  }
  executeCommand(command) {
    this.commands.push(command);
    return vendorCommands.perform(this.runtime, command);
  }
}
// The old path really fails redo with the pinned command and UndoManager.
const oldCut = new CutField(),
  oldSource = oldCut.value;
oldCut.executeCommand("deleteBackward");
assert.equal(oldCut.value, "");
oldCut.executeCommand("undo");
assert.equal(oldCut.value, oldSource);
oldCut.executeCommand("redo");
assert.equal(oldCut.value, oldSource, "Pre-delete snapshot cannot redo a cut");

try {
  let unconfirmedWrites = 0;
  setClipboard({
    writeText: async () => {
      unconfirmedWrites++;
      throw Error("Denied");
    },
  });
  const unsafeNative = new CutField();
  unsafeNative.executeCommand("cutToClipboard");
  await Promise.resolve();
  assert.equal(unconfirmedWrites, 1);
  assert.equal(
    unsafeNative.value,
    "",
    "Pinned native fallback deletes before its clipboard promise settles",
  );

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
    field.addEventListener(type, (event) =>
      events.push([type, event.inputType]),
    );
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
  assert.deepEqual(field.commands, ["cutToClipboard"]);
  assert.equal(
    writes.length,
    2,
    "Native fallback recopies the same already-secured source",
  );
  assert.equal(writes[1], originalValue);
  assert.deepEqual(
    events,
    [
      ["beforeinput", "deleteByCut"],
      ["input", "deleteByCut"],
    ],
    "Native Cut emits deleteByCut editor source events",
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
  field.executeCommand("redo");
  assert.equal(field.value, "", "Pinned UndoManager redoes the cut result");
  field.executeCommand("undo");
  assert.equal(
    field.value,
    originalValue,
    "Undo remains repeatable after redo",
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
    ["3+1", "3+1"],
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

  for (const [atoms, range, expected] of [
    [["x", String.raw`\placeholder{}`], [0, 1], String.raw`\placeholder{}`],
    [[String.raw`\placeholder{}`, "x"], [1, 2], String.raw`\placeholder{}`],
    [["3", "+", "1", "+", "2"], [0, 3], "+2"],
  ]) {
    const selected = new CutField();
    selected.atoms = [...atoms];
    selected.value = atoms.join("");
    selected.selection = { ranges: [range], direction: "forward" };
    selected.runtime.undoManager.reset();
    selected.runtime.undoManager.snapshot();
    const original = selected.value,
      source = atoms.slice(...range).join(""),
      copies = [];
    setClipboard({
      writeText: async (text) => {
        copies.push(text);
      },
    });
    assert.equal(await cutMathLiveSelection(selected), true);
    assert.equal(
      selected.value,
      expected,
      "Cut preserves every unselected adjacent atom/placeholder",
    );
    assert.deepEqual(
      selected.deletedRanges,
      [range],
      "Native deleteRange only removes selected offsets",
    );
    assert.deepEqual(copies, [source, source]);
    selected.executeCommand("undo");
    assert.equal(selected.value, original);
    selected.executeCommand("redo");
    assert.equal(selected.value, expected);
  }
  const secondaryDenied = new CutField(),
    secured = [];
  setClipboard({
    writeText: async (text) => {
      if (secured.length) throw Error("Second write denied");
      secured.push(text);
    },
  });
  assert.equal(await cutMathLiveSelection(secondaryDenied), true);
  assert.deepEqual(
    secured,
    [String.raw`\textcolor{dark-grey}{3+1}`],
    "Second copy refusal cannot erase the first confirmed clipboard payload",
  );
  assert.equal(secondaryDenied.value, "");

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
    assert(!field.commands.includes("cutToClipboard"));
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

// Actual pinned declarations, including context predicates and private matrix factory.
const phoneFunctions = [
  "getDefaultMenuItems",
  "getDecorationSubmenu",
  "getAccentSubmenu",
  "getVariantSubmenu",
  "variantMenuItem",
  "variantStyleMenuItem",
  "getInsertMatrixSubmenu",
  "getColorSubmenu",
  "getBackgroundColorSubmenu",
  "insertMenu",
  "insertLabel",
  "inMatrix",
  "isMatrixSelected",
  "shape",
  "minShape",
  "maxShape",
  "getSelectionPlainString",
  "getSelectionAtoms",
  "validVariantAtom",
  "isCommand",
  "isSubmenu",
  "isHeading",
  "isDivider",
  "dynamicValue",
];
const phoneEnvironment = {
  convertLatexToMarkup: (latex) => "preview:" + latex,
  localize: (key, row, col) => (row ? `${row} by ${col}` : key),
  contrast: () => "#000",
  asHexColor: (value) => value,
  InsertMatrixMenuItem: class {
    constructor() {
      throw Error("Private grid instantiated");
    }
  },
};
const vendorPhone = new Function(
  "environment",
  `with(environment) {
${["FOREGROUND_COLORS", "BACKGROUND_COLORS", "VARIANT_REPERTOIRE"].map((name) => `const ${name}=${vendorValues.get(name)};`).join("\n")}
${phoneFunctions.map((name) => functions.get(name)).join("\n")}
const NativeItem = ${vendorClasses.get("_MenuItemState").getText(ast)};
return {getDefaultMenuItems, NativeItem};
}`,
)(phoneEnvironment);
const priorMedia = globalThis.matchMedia;
const priorMathfield = globalThis.MathfieldElement;
const mediaListeners = new Set();
const media = {
  matches: false,
  addEventListener(name, listener) {
    assert.equal(name, "change");
    mediaListeners.add(listener);
  },
  removeEventListener(name, listener) {
    assert.equal(name, "change");
    mediaListeners.delete(listener);
  },
};
globalThis.matchMedia = (query) => {
  assert.equal(query, "(max-width: 480px)");
  return media;
};
globalThis.MathfieldElement = { computeEngine: null };
const modifiers = { shift: true, alt: false, control: false, meta: false };
const evaluate = (value) =>
  (typeof value === "function" ? value(modifiers) : value) ?? true;
const leaves = (items, parents = []) =>
  items.flatMap((item) =>
    "submenu" in item
      ? leaves(item.submenu, [...parents, item])
      : item.id
        ? [{ item, parents }]
        : [],
  );
try {
  const mf = field();
  mf.options = { readOnly: false };
  mf.isSelectionEditable = true;
  mf.hasEditableContent = true;
  mf.queryStyle = () => "all";
  mf.model = {
    selectionIsCollapsed: true,
    mode: "math",
    selection: { ranges: [[0, 1]] },
    position: 0,
    getAtoms: () => [{ type: "mord", value: "x" }],
    at: () => ({ type: "mord" }),
  };
  mf.menuItems = vendorPhone.getDefaultMenuItems(mf);
  const cleanupPhone = prepareMathLiveMenu(mf);
  const desktop = mf.menuItems;
  const originalLeaves = leaves(desktop);
  assert.equal(
    originalLeaves.length,
    115,
    "All pinned actionable variants inventoried",
  );
  media.matches = true;
  for (const listener of mediaListeners) listener();
  const flat = mf.menuItems;
  assert(
    flat.every((item) => !("submenu" in item)),
    "Phone has no child popover",
  );
  const flatLeaves = leaves(flat);
  assert.equal(flatLeaves.length, 115);
  assert.deepEqual(
    flatLeaves.map(({ item }) => item.id).sort(),
    originalLeaves.map(({ item }) => item.id).sort(),
  );
  assert(
    flat.findIndex((item) => item.id === "insert-abs") <
      flat.findIndex((item) => item.id === "insert-matrix-1x1"),
  );
  for (const { item, parents } of originalLeaves) {
    // Copy-as-LaTeX and Copy-as-Typst share the pinned copy-latex id.
    const projected = flatLeaves.find(
      (row) => row.item.onMenuSelect === item.onMenuSelect,
    ).item;
    for (const key of [
      "onMenuSelect",
      "data",
      "checked",
      "keyboardShortcut",
      "ariaLabel",
      "tooltip",
      "class",
    ])
      assert.equal(
        projected[key],
        item[key],
        `Public ${key} survives for ${item.id}`,
      );
    assert(!("onCreate" in projected), "Private grid factory omitted");
    assert.equal(
      evaluate(projected.visible),
      parents.every((p) => evaluate(p.visible)) && evaluate(item.visible),
    );
    assert.equal(
      evaluate(projected.enabled),
      parents.every((p) => evaluate(p.enabled)) && evaluate(item.enabled),
    );
    const state = new vendorPhone.NativeItem(projected, { dirty: false });
    Object.defineProperty(state, "element", { value: null });
    state.updateState(modifiers);
    assert.equal(state.visible, evaluate(projected.visible));
    assert.equal(state.enabled, evaluate(projected.enabled));
    state.active = true; // Actual ordinary item avoids private sibling-grid activation.
  }
  const matrixLabels = flatLeaves
    .filter(({ item }) => item.id.startsWith("insert-matrix-"))
    .map(({ item }) => evaluate(item.label));
  assert.equal(
    new Set(matrixLabels).size,
    25,
    "Matrix dimensions visible, not identical boxes",
  );
  for (const { item } of flatLeaves.filter(({ item }) =>
    /^(color-|background-color-|environment-)/.test(item.id),
  ))
    assert.equal(
      evaluate(item.label),
      evaluate(item.ariaLabel),
      "Named glyph rows support visible/typeahead discovery",
    );
  const nativeList = vendorClasses.get("_MenuListState");
  const nativeMethods = nativeList.members
    .filter(
      (member) =>
        (member.name?.getText(ast) === "menuItems" &&
          ts.isSetAccessorDeclaration(member)) ||
        member.name?.getText(ast) === "updateState",
    )
    .map((member) => member.getText(ast));
  const listMethods = new Function(
    "_MenuItemState",
    `return ({${nativeMethods.join(",")}})`,
  )(vendorPhone.NativeItem);
  const list = { parentMenu: null, dispose() {}, activeMenuItem: null };
  Object.getOwnPropertyDescriptor(listMethods, "menuItems").set.call(
    list,
    flat,
  );
  assert.equal(list._menuItems.length, flat.length);
  for (const item of list._menuItems)
    Object.defineProperty(item, "element", { value: null });
  listMethods.updateState.call(list, modifiers);
  assert(
    list._menuItems.every((item) => item.type !== "submenu"),
    "Native construction creates no submenu state",
  );
  assert(
    list._menuItems.filter((item) => item.visible && item.type === "heading")
      .length > 0,
    "Native headings retain eligible groups",
  );
  for (const prefix of [0, 6]) {
    const matrixField = field(prefix);
    const cleanupMatrix = prepareMathLiveMenu(matrixField);
    for (const command of matrixField.menuItems.filter((item) =>
      item.id?.startsWith("insert-matrix-"),
    )) {
      command.onMenuSelect({ id: command.id, modifiers });
      assert.deepEqual(
        matrixField.selection.ranges,
        [[prefix + 1, prefix + 2]],
        "Phone matrix retains native first-cell selection",
      );
      assert.equal(
        [...matrixField.calls.at(-1).latex.matchAll(/#\?/g)].length,
        command.data.row * command.data.col,
      );
    }
    cleanupMatrix();
  }
  for (const state of [
    { editable: false, collapsed: true, atoms: "x", matrix: false },
    { editable: true, collapsed: false, atoms: "x", matrix: false },
    { editable: true, collapsed: false, atoms: "xyz", matrix: false },
    { editable: true, collapsed: false, atoms: "A", matrix: false, ce: true },
    { editable: true, collapsed: true, atoms: "1", matrix: true },
    { editable: true, collapsed: true, atoms: "", matrix: true },
  ]) {
    mf.options.readOnly = !state.editable;
    globalThis.MathfieldElement.computeEngine = state.ce
      ? { box: (value) => ({ latex: value }) }
      : null;
    mf.expression = { unknowns: ["x"] };
    mf.isSelectionEditable = state.editable;
    mf.model.selectionIsCollapsed = state.collapsed;
    mf.model.getAtoms = () =>
      [...state.atoms].map((value) => ({ type: "mord", value }));
    mf.model.parentEnvironment = state.matrix
      ? {
          environmentName: "pmatrix",
          rows: [
            [1, 2],
            [3, 4],
          ],
          minRows: 1,
          minColumns: 1,
          maxRows: 5,
          maxColumns: 5,
        }
      : undefined;
    for (const { item, parents } of originalLeaves) {
      const projected = flatLeaves.find(
        (row) => row.item.onMenuSelect === item.onMenuSelect,
      ).item;
      assert.equal(
        evaluate(projected.visible),
        parents.every((p) => evaluate(p.visible)) && evaluate(item.visible),
        `${item.id} context visibility`,
      );
      assert.equal(
        evaluate(projected.enabled),
        parents.every((p) => evaluate(p.enabled)) && evaluate(item.enabled),
        `${item.id} context enabled`,
      );
    }
    const visible = (id) =>
      evaluate(flatLeaves.find((row) => row.item.id === id).item.visible);
    assert.equal(
      visible("color-red"),
      state.editable,
      "Colors require editable selection",
    );
    assert.equal(
      visible("mode-text"),
      state.editable && state.collapsed,
      "Modes require collapsed selection",
    );
    assert.equal(
      visible("accent-vec"),
      state.editable && state.atoms.length === 1,
      "Vector requires one selected character",
    );
    assert.equal(
      visible("accent-overrightarrow"),
      state.editable && state.atoms.length > 0,
      "Arrow accepts nonempty selection",
    );
    assert.equal(
      visible("variant-double-struck"),
      state.editable && /^[A-Z ]$/.test(state.atoms),
      "Blackboard retains pinned repertoire",
    );
    assert.equal(
      visible("environment-bar"),
      state.editable && state.matrix,
      "Determinant border remains matrix-only",
    );
    assert.equal(
      visible("ce-evaluate"),
      state.editable && !!state.ce,
      "Compute Engine context unchanged",
    );
  }
  media.matches = false;
  for (const listener of mediaListeners) listener();
  assert.equal(
    mf.menuItems,
    desktop,
    "Resize restores same adapted desktop tree",
  );
  const restored = mf.menuItems;
  cleanupPhone();
  assert.equal(mediaListeners.size, 0, "Media listener disposed");
  media.matches = true;
  for (const listener of mediaListeners) listener();
  assert.equal(mf.menuItems, restored, "Disposed field cannot update");
  const seen = [];
  const guarded = {
    menuItems: [
      {
        label: "Parent",
        visible: (m) => {
          seen.push(m);
          return m.shift;
        },
        enabled: false,
        submenu: [
          {
            label: "Nested",
            enabled: (m) => m.alt,
            submenu: [
              {
                id: "guarded",
                label: "Leaf",
                visible: undefined,
                enabled: undefined,
                onMenuSelect() {},
              },
            ],
          },
        ],
      },
    ],
  };
  const cleanupGuard = prepareMathLiveMenu(guarded);
  const guardedLeaf = guarded.menuItems.find((item) => item.id === "guarded");
  assert.equal(evaluate(guardedLeaf.visible), true);
  assert.equal(
    evaluate(guardedLeaf.enabled),
    false,
    "Disabled parent cannot expose active child",
  );
  assert.equal(guardedLeaf.visible({ ...modifiers, shift: false }), false);
  assert(
    seen.every((m) => m === modifiers || m.shift === false),
    "Modifiers forwarded unchanged",
  );
  cleanupGuard();
} finally {
  if (priorMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = priorMedia;
  if (priorMathfield === undefined) delete globalThis.MathfieldElement;
  else globalThis.MathfieldElement = priorMathfield;
}
console.log(
  "Phone projection preserves all115 pinned variants, dynamic contexts, native item state and responsive cleanup",
);
