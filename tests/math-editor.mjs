import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  checkExternalMenuGeometry,
  checkKeyboardActionRow,
} from "./verification/editor-geometry.mjs";

await import("./resolve-types.mjs");
const { prepareMathLiveMenu } = await import(
  "../lib/calculator/mathlive-menu.ts"
);

const phoneMenuGeometry = {
  context: "composer",
  field: { bottom: 333 },
  menu: { top: 341, left: 29, right: 159, width: 130, height: 44 },
  internalMenu: { display: "none", width: 0, height: 0 },
  composer: { borderWidth: 0, boxShadow: "none" },
  hitTarget: true,
  viewport: { width: 390 },
};
assert.deepEqual(checkExternalMenuGeometry(phoneMenuGeometry), []);
for (const missing of [
  { composer: undefined },
  { context: undefined },
  { field: { bottom: NaN } },
])
  assert.deepEqual(
    checkExternalMenuGeometry({ ...phoneMenuGeometry, ...missing }),
    ["Expression menu geometry observation is incomplete"],
  );
for (const [property, value, message] of [
  [
    "composer",
    { borderWidth: 1, boxShadow: "none" },
    "Expression-box framing still encloses the menu action bar",
  ],
  [
    "internalMenu",
    { display: "flex", width: 24, height: 24 },
    "The internal expression menu toggle is still visible",
  ],
  ["hitTarget", false, "Another element intercepts the expression menu target"],
])
  assert(
    checkExternalMenuGeometry({
      ...phoneMenuGeometry,
      [property]: value,
    }).includes(message),
    "Browser geometry detector must reject " + message,
  );

const actionRow = {
  viewport: { width: 844, height: 390 },
  keyboardPaintTop: 119,
  caret: { x: 230, y: 40, width: 2, height: 25 },
  tools: { x: 344, y: 71, width: 346, height: 44 },
  buttons: Object.fromEntries(
    [
      ["Math keyboard", { x: 216, y: 71, width: 120, height: 44 }],
      ["Expression menu", { x: 344, y: 71, width: 129, height: 44 }],
      ["Structures & editing", { x: 481, y: 71, width: 147, height: 44 }],
      ["Calculate", { x: 698, y: 69, width: 130, height: 46 }],
    ].map(([name, rect]) => [name, { rect, hits: Array(9).fill(true) }]),
  ),
};
assert.deepEqual(checkKeyboardActionRow(actionRow), []);
const invisibleTooltipRow = structuredClone(actionRow);
invisibleTooltipRow.buttons.Calculate.hits[3] = false;
assert.equal(invisibleTooltipRow.buttons.Calculate.hits[8], true);
assert.deepEqual(checkKeyboardActionRow(invisibleTooltipRow), [
  "Calculate interior8px/edge-midpoint/center hits are not all correct",
]);
const coveredRow = structuredClone(actionRow);
coveredRow.tools = { x: 216, y: 47, width: 612, height: 44 };
coveredRow.buttons["Expression menu"].rect = {
  x: 216,
  y: 47,
  width: 129,
  height: 44,
};
coveredRow.buttons["Math keyboard"].hits[0] = false;
const coveredFailures = checkKeyboardActionRow(coveredRow);
assert(
  coveredFailures.includes("Expression menu overlaps Math keyboard") ||
    coveredFailures.includes("Math keyboard overlaps Expression menu"),
);
assert(coveredFailures.includes("Editor tools container overlaps Calculate"));
assert(
  coveredFailures.includes(
    "Math keyboard interior8px/edge-midpoint/center hits are not all correct",
  ),
);
for (const changed of [
  { ...actionRow, keyboardPaintTop: 110 },
  { ...actionRow, caret: { x: 230, y: 85, width: 2, height: 25 } },
  {
    ...actionRow,
    buttons: {
      ...actionRow.buttons,
      "Math keyboard": {
        rect: { x: 216, y: 71, width: 43, height: 44 },
        hits: Array(9).fill(true),
      },
    },
  },
])
  assert(checkKeyboardActionRow(changed).length > 0);

const require = createRequire(import.meta.url);
const loaderChecks = spawnSync(
  process.execPath,
  [
    "--experimental-vm-modules",
    fileURLToPath(new URL("./mathlive-loader.mjs", import.meta.url)),
  ],
  { encoding: "utf8" },
);
assert.equal(
  loaderChecks.status,
  0,
  loaderChecks.stderr || loaderChecks.stdout,
);
const lifecycleChecks = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./mathlive-lifecycle.mjs", import.meta.url))],
  { encoding: "utf8" },
);
const menuChecks = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./mathlive-menu.mjs", import.meta.url))],
  { encoding: "utf8" },
);
assert.equal(menuChecks.status, 0, menuChecks.stderr || menuChecks.stdout);
assert.equal(
  lifecycleChecks.status,
  0,
  lifecycleChecks.stderr || lifecycleChecks.stdout,
);
const source = fs.readFileSync(
  process.env.CALCULATOR_MATH_EDITOR_SOURCE ??
    new URL("../components/calculator/MathEditor.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Execute the actual geometry/cleanup block with controlled public DOM/API bounds.
const geometrySource = ts.createSourceFile(
  "MathEditor.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let geometryStart, geometryEnd;
function geometryNodes(node) {
  if (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (d) => d.name.getText(geometrySource) === "frame",
    )
  )
    geometryStart = node.getStart(geometrySource);
  if (
    ts.isExpressionStatement(node) &&
    ts.isBinaryExpression(node.expression) &&
    node.expression.left.getText(geometrySource) === "cleanup" &&
    node
      .getText(geometrySource)
      .includes('removeEventListener("geometrychange"')
  )
    geometryEnd = node.end;
  ts.forEachChild(node, geometryNodes);
}
geometryNodes(geometrySource);
assert(Number.isInteger(geometryStart) && Number.isInteger(geometryEnd));
const geometryCode = ts.transpileModule(
  source.slice(geometryStart, geometryEnd),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
function geometryHarness({
  standalone = false,
  focused = true,
  fieldFocused = focused,
  visible = true,
  mediaMatches = true,
  calculateLeft = 698,
} = {}) {
  class Surface extends EventTarget {
    listeners = new Set();
    addEventListener(name, fn) {
      this.listeners.add(name);
      super.addEventListener(name, fn);
    }
    removeEventListener(name, fn) {
      this.listeners.delete(name);
      super.removeEventListener(name, fn);
    }
  }
  const attributes = new Map(),
    styles = new Map(),
    frames = new Map(),
    scrolls = [],
    commands = [];
  let frameId = 0;
  const caret = { top: 185.89, bottom: 218.89 },
    position = 66,
    value = "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}";
  const makeScroller = (name) => ({
    scrollBy(x, y) {
      scrolls.push({ name, x, y });
      caret.top -= y;
      caret.bottom -= y;
    },
  });
  const page = makeScroller("page"),
    dialog = makeScroller("dialog"),
    composer = new Surface();
  composer.matches = () => focused;
  composer.querySelector = (selector) => ({
    getBoundingClientRect: () =>
      selector.includes("first-child")
        ? { right: 336, bottom: 115 }
        : { left: calculateLeft },
  });
  const editor = new Surface();
  editor.matches = () => focused;
  editor.closest = (selector) =>
    selector === ".composer"
      ? standalone
        ? null
        : composer
      : standalone
        ? dialog
        : null;
  editor.setAttribute = (name, value) => attributes.set(name, value);
  editor.removeAttribute = (name) => attributes.delete(name);
  editor.getBoundingClientRect = () => ({ left: 16, width: 812 });
  editor.querySelectorAll = () => [
    { getBoundingClientRect: () => ({ width: 129, height: 44 }) },
    { getBoundingClientRect: () => ({ width: 147, height: 44 }) },
  ];
  editor.style = {
    setProperty: (name, value) => styles.set(name, value),
    removeProperty: (name) => styles.delete(name),
  };
  const keyboard = new Surface();
  keyboard.visible = visible;
  keyboard.boundingRect = { height: 266 };
  keyboard.hide = () => {
    keyboard.visible = false;
    keyboard.dispatchEvent(new Event("geometrychange"));
  };
  const el = new Surface();
  el.matches = () => fieldFocused;
  el.position = position;
  el.value = value;
  el.executeCommand = (command) => commands.push(command);
  el.getElementInfo = (offset) => {
    assert.equal(offset, 66);
    return { bounds: caret };
  };
  el.scrollIntoView = () => {};
  const win = new Surface();
  win.innerWidth = 844;
  win.innerHeight = 390;
  const media = new Surface();
  media.matches = mediaMatches;
  const doc = new Surface();
  Object.assign(doc, {
    documentElement: {
      style: { getPropertyValue: () => "266px", setProperty() {} },
    },
    scrollingElement: page,
  });
  const scope = {
    k: keyboard,
    el,
    window: win,
    host: { current: { parentElement: editor } },
    globalThis: { matchMedia: () => media },
    document: doc,
    requestAnimationFrame: (fn) => {
      const id = ++frameId;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    cleanupMenu() {},
  };
  const result = new Function(
    "scope",
    `with(scope){let cleanup;${geometryCode};return{geometry,cleanup};}`,
  )(scope);
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  return {
    ...result,
    el,
    editor,
    composer,
    win,
    media,
    doc,
    keyboard,
    attributes,
    styles,
    caret,
    scrolls,
    commands,
    frames,
    flushFrames,
    position,
    value,
  };
}
{
  const main = geometryHarness();
  assert.equal(
    main.frames.size,
    1,
    "Initial geometry synchronizes without waiting for keyboard event",
  );
  main.flushFrames();
  assert.equal(main.attributes.get("data-keyboard-tools"), "composer");
  assert.equal(main.styles.get("--math-tools-left"), "344px");
  assert.equal(main.styles.get("--math-tools-width"), "346px");
  assert.equal(
    main.styles.get("--math-tools-bottom"),
    "275px",
    "Measured button bottom, not guessed footer64",
  );
  assert.deepEqual(
    main.commands,
    ["scrollIntoView"],
    "Public native scroll command first",
  );
  assert.equal(main.scrolls[0].name, "page");
  assert(
    main.caret.bottom <= 63,
    "Tall active caret recovered above action row",
  );
  assert.equal(main.el.position, main.position);
  assert.equal(main.el.value, main.value);
  main.el.dispatchEvent(new Event("selection-change"));
  assert.equal(main.frames.size, 1);
  main.cleanup();
  assert.equal(main.frames.size, 0);
  assert.equal(main.attributes.size, 0);
  assert.equal(main.styles.size, 0);
  assert.equal(main.keyboard.listeners.size, 0);
  assert.equal(main.el.listeners.size, 0);
  assert.equal(main.composer.listeners.size, 0);
  assert.equal(main.win.listeners.size, 0);
  assert.equal(main.media.listeners.size, 0);
  assert.equal(main.doc.listeners.size, 0);
  main.keyboard.dispatchEvent(new Event("geometrychange"));
  assert.equal(main.frames.size, 0);
  const inactive = geometryHarness({ focused: false });
  inactive.flushFrames();
  assert.equal(inactive.attributes.size, 0);
  assert.equal(inactive.scrolls.length, 0);
  inactive.cleanup();
  const hidden = geometryHarness({ visible: false });
  hidden.flushFrames();
  assert.equal(hidden.attributes.size, 0);
  assert.equal(hidden.commands.length, 0);
  hidden.cleanup();
  const nested = geometryHarness({ standalone: true });
  nested.flushFrames();
  assert.equal(nested.attributes.get("data-keyboard-tools"), "standalone");
  assert.equal(nested.styles.get("--math-tools-left"), "16px");
  assert.equal(
    nested.scrolls[0].name,
    "dialog",
    "Nested editor scrolls its owning dialog, not main workspace",
  );
  nested.cleanup();
  const keyboardButtonFocus = geometryHarness({ fieldFocused: false });
  keyboardButtonFocus.flushFrames();
  assert.equal(
    keyboardButtonFocus.attributes.get("data-keyboard-tools"),
    "composer",
  );
  keyboardButtonFocus.keyboard.hide();
  keyboardButtonFocus.flushFrames();
  assert.equal(keyboardButtonFocus.attributes.size, 0);
  keyboardButtonFocus.cleanup();
  const nestedInactive = geometryHarness({
    standalone: true,
    fieldFocused: false,
  });
  nestedInactive.flushFrames();
  assert.equal(
    nestedInactive.attributes.get("data-keyboard-tools"),
    "standalone",
    "Tab from field to external editor button retains row ownership",
  );
  nestedInactive.editor.matches = () => false;
  nestedInactive.doc.dispatchEvent(new Event("focusin"));
  nestedInactive.flushFrames();
  assert.equal(
    nestedInactive.attributes.size,
    0,
    "Focus transferred outside the editor revokes ownership",
  );
  nestedInactive.cleanup();
  const otherEditor = geometryHarness({
    standalone: true,
    focused: false,
    fieldFocused: false,
  });
  otherEditor.flushFrames();
  assert.equal(
    otherEditor.attributes.size,
    0,
    "Another focused editor cannot grant this editor ownership",
  );
  otherEditor.cleanup();
  const resized = geometryHarness();
  resized.flushFrames();
  resized.win.innerWidth = 800;
  resized.win.dispatchEvent(new Event("resize"));
  resized.flushFrames();
  assert.equal(resized.attributes.get("data-keyboard-tools"), "composer");
  resized.media.matches = false;
  resized.media.dispatchEvent(new Event("change"));
  resized.flushFrames();
  assert.equal(resized.attributes.size, 0);
  resized.media.matches = true;
  resized.media.dispatchEvent(new Event("change"));
  resized.flushFrames();
  assert.equal(resized.attributes.get("data-keyboard-tools"), "composer");
  resized.composer.matches = () => false;
  resized.doc.dispatchEvent(new Event("focusin"));
  resized.flushFrames();
  assert.equal(resized.attributes.size, 0);
  resized.cleanup();
  const insufficient = geometryHarness({ calculateLeft: 380 });
  insufficient.flushFrames();
  assert.equal(insufficient.attributes.has("data-keyboard-tools"), false);
  assert.equal(
    insufficient.attributes.get("data-keyboard-tools-fit"),
    "insufficient",
  );
  assert.equal(insufficient.styles.size, 0);
  assert.equal(insufficient.scrolls.length, 0);
  insufficient.cleanup();
}

function harness({ failImport = false } = {}) {
  const refs = [],
    states = [],
    effects = [],
    fields = [];
  let refIndex = 0,
    stateIndex = 0,
    effectIndex = 0;
  let importFailure = failImport;
  let currentHandle;
  class Field extends EventTarget {
    value = "";
    selection = { ranges: [[0, 0]] };
    attributes = new Map();
    removed = false;
    focusCalls = 0;
    events = [];
    menuEntries = [];
    menuAdaptations = 0;
    mode = "math";
    constructor() {
      super();
      fields.push(this);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    remove() {
      this.removed = true;
    }
    focus() {
      this.events.push("focus");
      this.focusCalls++;
      this.selection = { ranges: [[0, 0]] };
    }
    insert(value) {
      this.inserted = { value, selection: this.selection };
    }
    executeCommand(value) {
      this.command = { value, selection: this.selection };
    }
    get menuItems() {
      assert(
        this.mounted,
        "Public menu API is used only after mounting the field",
      );
      this.events.push("menuItems");
      this.menuInitialized = true;
      return this.menuEntries;
    }
    set menuItems(items) {
      this.menuEntries = items;
      this.menuAdaptations++;
    }
    showMenu(options) {
      this.events.push("showMenu");
      assert(
        this.focusCalls > 0,
        "menu must capture the focused mathfield before vendor activation",
      );
      if (!this.menuInitialized) throw TypeError("Menu is not initialized");
      this.menu = { options, selection: this.selection };
      return true;
    }
  }
  const react = {
    forwardRef: (component) => component,
    useRef: (initial) => (refs[refIndex++] ??= { current: initial }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useImperativeHandle: (_, create) => {
      currentHandle = create();
    },
    useEffect(run, dependencies) {
      const index = effectIndex++;
      const previous = effects[index];
      if (
        !previous ||
        dependencies.some((value, i) => value !== previous.dependencies[i])
      ) {
        previous?.cleanup?.();
        effects[index] = { dependencies, run, pending: true };
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return require(name);
      if (name.endsWith(".css")) return {};
      if (name === "../../lib/calculator/mathlive-menu")
        return { prepareMathLiveMenu };
      if (name === "../../lib/calculator/mathlive-loader") {
        return {
          async loadMathLive() {
            if (importFailure) {
              importFailure = false;
              throw Error("Unavailable");
            }
            return { MathfieldElement: Field };
          },
        };
      }
      throw Error(`Unexpected module ${name}`);
    },
    loadedModule,
    loadedModule.exports,
  );
  const render = (props) => {
    refIndex = stateIndex = effectIndex = 0;
    const tree = loadedModule.exports.default(props, {});
    refs[0].current ??= {
      replaceChildren(field) {
        field.mounted = true;
      },
    };
    for (const effect of effects)
      if (effect.pending) {
        effect.pending = false;
        effect.cleanup = effect.run();
      }
    return tree;
  };
  return {
    render,
    fields,
    handle: () => currentHandle,
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...[tree.props?.children]
      .flat(Infinity)
      .flatMap((child) => nodes(child, predicate)),
  ];
}
const dialogSource = fs.readFileSync(
  new URL("../components/ui/dialog.tsx", import.meta.url),
  "utf8",
);
const dialogModule = { exports: {} };
const primitive = { Content: () => null };
new Function(
  "require",
  "module",
  "exports",
  ts.transpileModule(dialogSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
)(
  (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "radix-ui") return { Dialog: primitive };
    if (name === "@/lib/utils") return { cn: (...values) => values.join(" ") };
    if (name === "react" || name === "lucide-react") return {};
    if (name === "@/components/ui/button") return { Button: () => null };
    throw Error(`Unexpected dialog import ${name}`);
  },
  dialogModule,
  dialogModule.exports,
);
const priorElement = globalThis.Element;
class MenuTarget {
  constructor(mathMenu = false) {
    this.mathMenu = mathMenu;
  }
  matches(selector) {
    assert.equal(selector, '.ui-menu-container[role="menu"]');
    return this.mathMenu;
  }
}
globalThis.Element = MenuTarget;
try {
  let callerCount = 0;
  const tree = dialogModule.exports.DialogContent({
    children: "Unsaved nested expression",
    onEscapeKeyDown: () => callerCount++,
  });
  const content = nodes(tree, (node) => node.type === primitive.Content)[0];
  const menu = new MenuTarget(true);
  const input = new MenuTarget();
  let menuOpen = true,
    editorOpen = true,
    draft = "x^{2}+1";
  function escape(path) {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "key", { value: "Escape" });
    event.composedPath = () => path;
    // Installed Radix captures first; MathLive hides its menu during bubbling.
    content.props.onEscapeKeyDown?.(event);
    if (!event.defaultPrevented) {
      editorOpen = false;
      draft = null;
    }
    if (path.includes(menu)) menuOpen = false;
    return event;
  }
  const firstEscape = escape([input, menu]);
  assert.equal(
    menuOpen,
    false,
    "Escape still reaches MathLive to close its menu",
  );
  assert.equal(editorOpen, true, "menu Escape must retain the nested editor");
  assert.equal(draft, "x^{2}+1", "unsaved expression remains available");
  assert.equal(
    firstEscape.cancelBubble,
    false,
    "vendor bubbling is not blocked",
  );
  const secondEscape = escape([input]);
  assert.equal(secondEscape.defaultPrevented, false);
  assert.equal(editorOpen, false, "next Escape dismisses the editor normally");
  assert.equal(callerCount, 2, "existing dialog Escape handler is preserved");
  const preventedTree = dialogModule.exports.DialogContent({
    onEscapeKeyDown: (event) => event.preventDefault(),
  });
  const preventedContent = nodes(
    preventedTree,
    (node) => node.type === primitive.Content,
  )[0];
  const prevented = new Event("keydown", { cancelable: true });
  prevented.composedPath = () => [input];
  preventedContent.props.onEscapeKeyDown(prevented);
  assert.equal(
    prevented.defaultPrevented,
    true,
    "caller cancellation is retained",
  );
} finally {
  if (priorElement === undefined) delete globalThis.Element;
  else globalThis.Element = priorElement;
}
const flush = () => new Promise(setImmediate);
const priorWindow = globalThis.window;
const priorMatchMedia = globalThis.matchMedia;
const menuMediaListeners = new Set();
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener: (_, listener) => menuMediaListeners.add(listener),
  removeEventListener: (_, listener) => menuMediaListeners.delete(listener),
});
globalThis.window = {};
globalThis.window.parent = globalThis.window;
try {
  const changes = [];
  const editor = harness();
  editor.render({
    value: "old",
    label: "Original field",
    onChange: (value) => changes.push(value),
  });
  editor.render({
    value: "new",
    label: "Current field",
    onChange: (value) => changes.push(value),
  });
  await flush();
  const field = editor.fields[0];
  assert.equal(
    field.value,
    "new",
    "late import must initialize latest supplied value",
  );
  assert.equal(field.attributes.get("aria-label"), "Current field");
  assert.equal(
    field.menuAdaptations,
    1,
    "Actual editor prepares its public menu once after mounting",
  );
  field.selection = { ranges: [[1, 3]], direction: "backward" };
  field.dispatchEvent(new Event("selection-change"));
  editor.handle().insert("\\frac{#@}{#?}");
  assert.deepEqual(
    field.inserted.selection,
    { ranges: [[1, 3]], direction: "backward" },
    "insertion restores selection after focus",
  );
  const loadedTree = editor.render({
    value: "new",
    label: "Current field",
    onChange: (value) => changes.push(value),
  });
  const menuButton = nodes(
    loadedTree,
    (node) =>
      node.type === "button" && node.props["aria-label"] === "Expression menu",
  )[0];
  assert(menuButton, "existing context menu has a separate application button");
  assert.equal(menuButton.props["aria-haspopup"], "menu");
  let pointerDefaultPrevented = false;
  menuButton.props.onPointerDown({
    preventDefault() {
      pointerDefaultPrevented = true;
    },
  });
  assert(
    pointerDefaultPrevented,
    "menu activation must preserve field selection",
  );
  const focusCalls = field.focusCalls;
  const priorValue = field.value;
  globalThis.window.mathVirtualKeyboard = {
    visible: true,
    hide() {
      field.events.push("hideKeyboard");
      this.visible = false;
      field.selection = { ranges: [[0, 0]] };
    },
  };
  field.selection = { ranges: [[0, 0]] };
  field.events.length = 0;
  menuButton.props.onClick({
    currentTarget: {
      getBoundingClientRect: () => {
        field.events.push("bounds");
        return { left: 29, bottom: 390 };
      },
    },
    altKey: false,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
  });
  assert.equal(
    field.focusCalls,
    focusCalls + 1,
    "opening the external menu synchronously focuses the preserved field selection",
  );
  assert.deepEqual(
    field.events,
    ["hideKeyboard", "focus", "bounds", "menuItems", "showMenu"],
    "hide keyboard before restoring selection, geometry and menu focus capture",
  );
  assert.equal(field.value, priorValue, "menu opening preserves expression");
  assert.deepEqual(field.menu, {
    options: {
      location: { x: 29, y: 390 },
      modifiers: { alt: false, control: false, shift: true, meta: false },
    },
    selection: { ranges: [[1, 3]], direction: "backward" },
  });
  const toolsButton = nodes(
    loadedTree,
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "Structures & editing",
  )[0];
  globalThis.window.mathVirtualKeyboard.visible = true;
  field.events.length = 0;
  toolsButton.props.onClick();
  assert.deepEqual(
    field.events,
    ["hideKeyboard", "focus"],
    "opening structures hides keyboard before focus",
  );
  assert.deepEqual(
    field.selection,
    { ranges: [[1, 3]], direction: "backward" },
    "opening structures retains selected expression",
  );
  assert.equal(field.value, priorValue);
  const expandedTree = editor.render({ value: "new", onChange() {} });
  const closeTools = nodes(
    expandedTree,
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "Structures & editing",
  )[0];
  assert.equal(closeTools.props["aria-expanded"], true);
  field.events.length = 0;
  closeTools.props.onClick();
  assert.deepEqual(
    field.events,
    [],
    "closing structures does not refocus or toggle keyboard",
  );
  delete globalThis.window.mathVirtualKeyboard;
  const enter = new Event("keydown", { cancelable: true });
  Object.defineProperty(enter, "key", { value: "Enter" });
  field.dispatchEvent(enter);
  assert.equal(
    enter.defaultPrevented,
    false,
    "nested editor without submit must retain Enter behavior",
  );
  editor.unmount();
  assert.equal(field.removed, true);
  assert.equal(
    menuMediaListeners.size,
    0,
    "unmount removes phone-menu listener",
  );

  const unfocused = harness();
  const unfocusedProps = { value: "", onChange() {} };
  unfocused.render(unfocusedProps);
  await flush();
  const unfocusedField = unfocused.fields[0];
  const unfocusedMenu = nodes(
    unfocused.render(unfocusedProps),
    (node) =>
      node.type === "button" && node.props["aria-label"] === "Expression menu",
  )[0];
  unfocusedMenu.props.onClick({
    currentTarget: {
      getBoundingClientRect: () => ({ left: 29, bottom: 390 }),
    },
  });
  assert.equal(
    unfocusedField.focusCalls,
    1,
    "menu opened from an unfocused empty field must establish field ownership before vendor focus capture",
  );
  assert(unfocusedField.menu, "an unfocused field still opens its owned menu");
  assert.equal(unfocusedField.value, "");
  unfocused.handle().insert("x");
  assert.equal(
    unfocusedField.focusCalls,
    2,
    "subsequent editing still explicitly focuses the field",
  );
  unfocused.unmount();

  const inline = harness();
  const submitted = [];
  const committed = [];
  let inlineField;
  inline.render({
    value: String.raw`\int_3^41\,\mathrm{d}`,
    onChange: (value) => committed.push(value),
    onSubmit: () => submitted.push(inlineField.value),
  });
  await flush();
  inlineField = inline.fields[0];
  inlineField.mode = "latex";
  const commandEnter = new Event("keydown", { cancelable: true });
  Object.defineProperty(commandEnter, "key", { value: "Enter" });
  inlineField.dispatchEvent(commandEnter);
  assert.equal(
    submitted.length,
    0,
    "Temporary LaTeX Return must not submit incomplete mathematical source",
  );
  assert.equal(
    commandEnter.defaultPrevented,
    false,
    "Return remains available to the vendor command completer",
  );

  const vendorSource = fs.readFileSync(
    new URL("../node_modules/mathlive/mathlive.mjs", import.meta.url),
    "utf8",
  );
  const vendorAst = ts.createSourceFile(
    "mathlive.mjs",
    vendorSource,
    ts.ScriptTarget.Latest,
    true,
  );
  let complete;
  const commitKeys = [];
  function inspectVendor(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "complete")
      complete = node.getText(vendorAst);
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map((property) => [
            property.name.getText(vendorAst),
            property.initializer,
          ]),
      );
      if (
        properties.get("ifMode")?.getText(vendorAst) === '"latex"' &&
        properties.get("command")?.getText(vendorAst) ===
          '["complete", "accept-all"]'
      )
        commitKeys.push(properties.get("key").text);
    }
    ts.forEachChild(node, inspectVendor);
  }
  inspectVendor(vendorAst);
  assert(commitKeys.includes("[Enter]") && commitKeys.includes("[Return]"));
  assert(complete);
  const group = { leftSibling: {}, parent: { removeChild() {} } };
  const commandBody = [...String.raw`\theta`].map((value) => ({ value }));
  let insertion;
  const pinnedComplete = new Function(
    "environment",
    `with(environment){${complete};return complete;}`,
  )({
    hideSuggestionPopover() {},
    getLatexGroup: () => group,
    getLatexGroupBody: () => commandBody,
    __spreadValues: Object.assign,
    computeInsertStyle: () => ({}),
    ModeEditor: {
      insert(model, latex, options) {
        insertion = { latex, options };
        inlineField.value += latex;
        inlineField.dispatchEvent(new Event("input"));
      },
    },
  });
  assert.equal(
    pinnedComplete(
      {
        model: { offsetOf: () => 0, announce() {} },
        switchMode: (mode) => {
          inlineField.mode = mode;
        },
        snapshot() {},
        styleBias: "none",
      },
      "accept-all",
    ),
    true,
  );
  assert.equal(insertion.latex, String.raw`\theta`);
  assert.equal(insertion.options.selectionMode, "placeholder");
  assert.equal(inlineField.mode, "math");
  assert.equal(committed.at(-1), String.raw`\int_3^41\,\mathrm{d}\theta`);
  // The vendor keyboard sink consumes completion in capture phase, before the
  // host's bubbling handler sees the same Enter with the field back in math mode.
  commandEnter.preventDefault();
  inlineField.dispatchEvent(commandEnter);
  assert.equal(
    submitted.length,
    0,
    "Vendor-consumed completion Enter must not calculate the stale React draft",
  );
  const calculateEnter = new Event("keydown", { cancelable: true });
  Object.defineProperty(calculateEnter, "key", { value: "Enter" });
  inlineField.dispatchEvent(calculateEnter);
  assert.deepEqual(
    submitted,
    [inlineField.value],
    "A subsequent math-mode Enter submits the completed source once",
  );
  assert.equal(calculateEnter.defaultPrevented, true);
  inline.unmount();

  const retry = harness({ failImport: true });
  const props = { value: "x^2", onChange() {} };
  retry.render(props);
  await flush();
  const failed = retry.render(props);
  const button = nodes(
    failed,
    (node) => node.type === "button" && node.props.children === "Retry editor",
  )[0];
  assert(button, "failed import must expose retry");
  button.props.onClick();
  retry.render({ ...props, value: "x^3" });
  await flush();
  assert.equal(retry.fields[0].value, "x^3", "retry retains latest expression");
  retry.unmount();
  assert.equal(
    menuMediaListeners.size,
    0,
    "retry cleanup removes phone-menu listener",
  );
  console.log("Math editor lifecycle and selection regressions passed");
} finally {
  if (priorMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = priorMatchMedia;
  if (priorWindow === undefined) delete globalThis.window;
  else globalThis.window = priorWindow;
}
