import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  hooks = [],
  listeners = new Map(),
  exports = [];
let cursor = 0,
  effectStarted = false,
  cleanup,
  volatile = true,
  forgot = 0;
const snapshot = {
  version: 1,
  active: "a",
  notebooks: [{ id: "a", name: "latest42" }],
};
const window = {
  confirm() {
    throw Error("Sign-out must use the accessible in-app dialog");
  },
  addEventListener(type, callback) {
    listeners.set(type, callback);
  },
  removeEventListener(type, callback) {
    assert.equal(listeners.get(type), callback);
    listeners.delete(type);
  },
};
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value) => (hooks[index] = value)];
  },
  useEffect(effect) {
    if (!effectStarted) {
      effectStarted = true;
      cleanup = effect();
    }
  },
};
const sync = {
  initializeAccount: async () => ({ name: "Scoped test" }),
  forgetAccount() {
    forgot++;
    volatile = false;
  },
  hasVolatileWorkspace: () => volatile,
  sessionWorkspace: () => snapshot,
};
const dialog = Object.fromEntries(
  [
    "Dialog",
    "DialogContent",
    "DialogHeader",
    "DialogTitle",
    "DialogDescription",
    "DialogFooter",
  ].map((name) => [name, "fixture-" + name]),
);
const loaded = { exports: {} };
const source = ts.transpileModule(
  fs.readFileSync(
    new URL("../components/calculator/CalculatorGate.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
new Function("require", "module", "exports", "window", source)(
  (name) =>
    name === "react"
      ? react
      : name === "react/jsx-runtime"
        ? require(name)
        : name === "@/lib/calculator/sync"
          ? sync
          : name === "@/components/ui/dialog"
            ? dialog
            : name === "@/lib/calculator/storage"
              ? { download: (name, body) => exports.push({ name, body }) }
              : { default: () => null },
  loaded,
  loaded.exports,
  window,
);
function render() {
  cursor = 0;
  return loaded.exports.default();
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat()) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const label = (tree, text) =>
  find(tree, (node) => node.props?.children === text);
render();
await new Promise(setImmediate);
const signout = label(render(), "Sign out");
assert(signout);
let prevented = false;
signout.props.onClick({
  preventDefault() {
    prevented = true;
  },
});
assert(prevented);
assert.equal(forgot, 0);
let tree = render();
assert.equal(
  find(tree, (node) => node.type === "fixture-Dialog").props.open,
  true,
);
label(tree, "Keep working").props.onClick();
assert.equal(
  find(render(), (node) => node.type === "fixture-Dialog").props.open,
  false,
);
assert.equal(forgot, 0);
signout.props.onClick({ preventDefault() {} });
tree = render();
label(tree, "Export backup").props.onClick();
assert.equal(exports.length, 1);
assert.deepEqual(JSON.parse(exports[0].body), snapshot);
assert.equal(forgot, 0);
const unload = {
  preventDefault() {
    this.prevented = true;
  },
  returnValue: null,
};
listeners.get("beforeunload")(unload);
assert(unload.prevented);
assert.equal(unload.returnValue, "");
find(tree, (node) => node.type === "fixture-Dialog").props.onOpenChange(false);
assert.equal(forgot, 0);
assert.equal(
  find(render(), (node) => node.type === "fixture-Dialog").props.open,
  false,
);
signout.props.onClick({ preventDefault() {} });
label(render(), "Sign out anyway").props.onClick();
assert.equal(forgot, 1);
const safeUnload = {
  preventDefault() {
    throw Error("Acknowledged/durable work needs no navigation warning");
  },
};
listeners.get("beforeunload")(safeUnload);
signout.props.onClick({
  preventDefault() {
    throw Error("Safe sign-out should proceed");
  },
});
assert.equal(forgot, 2);
cleanup();
assert(!listeners.has("beforeunload"));
console.log(
  "Actual Gate callbacks: accessible dialog Cancel/close retained work, backup exported latest snapshot, explicit Proceed signed out, beforeunload handler guarded volatile state, safe path stayed quiet, cleanup removed listener. Native browser prompt execution is separate.",
);
