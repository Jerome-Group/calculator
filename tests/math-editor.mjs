import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
const source = fs.readFileSync(
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
      this.selection = { ranges: [[0, 0]] };
    }
    insert(value) {
      this.inserted = { value, selection: this.selection };
    }
    executeCommand(value) {
      this.command = { value, selection: this.selection };
    }
    get menuItems() {
      this.menuInitialized = true;
      return [];
    }
    showMenu(options) {
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
    refs[0].current ??= { replaceChildren() {} };
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
const flush = () => new Promise(setImmediate);
const priorWindow = globalThis.window;
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
  menuButton.props.onClick({
    currentTarget: {
      getBoundingClientRect: () => ({ left: 29, bottom: 390 }),
    },
    altKey: false,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
  });
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
  console.log("Math editor lifecycle and selection regressions passed");
} finally {
  if (priorWindow === undefined) delete globalThis.window;
  else globalThis.window = priorWindow;
}
