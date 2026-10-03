import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkExternalMenuGeometry } from "./verification/editor-geometry.mjs";

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
      node.type === "button" && node.props.children === "Expression menu",
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
    ["focus", "bounds", "menuItems", "showMenu"],
    "focus precedes geometry, lazy menu initialization and vendor focus capture",
  );
  assert.equal(field.value, priorValue, "menu opening preserves expression");
  assert.deepEqual(field.menu, {
    options: {
      location: { x: 29, y: 390 },
      modifiers: { alt: false, control: false, shift: true, meta: false },
    },
    selection: { ranges: [[1, 3]], direction: "backward" },
  });
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
      node.type === "button" && node.props.children === "Expression menu",
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
