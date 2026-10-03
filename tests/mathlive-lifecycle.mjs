import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { fileURLToPath } from "node:url";

function vendorHarness(file) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let mathfield;
  let menuList;
  function inspect(node) {
    if (
      ts.isClassExpression(node) &&
      node.members.some((member) => member.name?.getText(ast) === "onFocus") &&
      node.members.some((member) => member.name?.getText(ast) === "dispose")
    )
      mathfield = node;
    if (
      ts.isClassExpression(node) &&
      node.members.some(
        (member) => member.name?.getText(ast) === "updateElement",
      ) &&
      node.members.some((member) => member.name?.getText(ast) === "dispose")
    )
      menuList = node;
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
  assert(mathfield, "actual vendor Mathfield class exists");
  assert(menuList, "actual vendor menu disposal exists");
  const menuDispose = new Function(
    `return ({ ${menuList.members.find((member) => member.name?.getText(ast) === "dispose").getText(ast)} }).dispose;`,
  )();
  const methods = mathfield.members
    .filter((member) =>
      ["dispose", "onFocus", "onBlur", "hasFocus", "disabled"].includes(
        member.name?.getText(ast),
      ),
    )
    .map((member) => member.getText(ast))
    .join("\n");
  const validity = methods.match(/if\s*\(!([\w$]+)\(this\)\)/)?.[1];
  assert(validity, "actual vendor disposal validity guard exists");
  const timers = [];
  const noop = () => {};
  noop.unsubscribe = noop;
  const environment = new Proxy(
    {
      [validity]: (field) => field.element?.mathfield === field,
      setTimeout: (callback) => timers.push(callback),
      window: { mathVirtualKeyboard: { removeEventListener: noop } },
      Event,
      UIEvent: Event,
    },
    {
      has: () => true,
      get: (target, name) =>
        name === Symbol.unscopables ? undefined : (target[name] ?? noop),
    },
  );
  // Execute unchanged method bodies from both distributed artifacts, with controlled DOM/timers.
  const Field = new Function(
    "environment",
    `with (environment) { return class ${mathfield.name.text} { ${methods} }; }`,
  )(environment);
  const events = [];
  function field(menu = false) {
    const value = new Field();
    let disposed = false;
    const model = {
      getValue() {
        if (disposed) throw Error("Disposed model read");
        return "x^2";
      },
      dispose() {
        events.push("model.dispose");
        disposed = true;
      },
    };
    Object.assign(value, {
      blurred: true,
      focusBlurInProgress: false,
      element: { mathfield: value },
      host: { dispatchEvent: noop },
      model,
      keyboardDelegate: { dispose: noop, focus: noop },
      eventController: { abort: noop },
      resizeObserver: { disconnect: noop },
      disconnectFromVirtualKeyboard: noop,
      connectToVirtualKeyboard: noop,
      stopCoalescingUndo: noop,
    });
    if (menu)
      value._menu = {
        state: "open",
        hide() {
          this.state = "closed";
          events.push("menu.dispose");
        },
        _element: {
          remove() {
            events.push("menu.element.remove");
          },
        },
        _abortController: {
          abort() {
            events.push("menu.listeners.abort");
          },
        },
        _menuItems: [],
        dispose: menuDispose,
      };
    return value;
  }
  return { Field, field, timers, events };
}

for (const name of ["mathlive.mjs", "mathlive.min.mjs"]) {
  const file = process.env.CALCULATOR_MATHLIVE_LIFECYCLE_DIRECTORY
    ? process.env.CALCULATOR_MATHLIVE_LIFECYCLE_DIRECTORY + "/" + name
    : fileURLToPath(
        new URL("../node_modules/mathlive/" + name, import.meta.url),
      );
  const { Field, field, timers, events } = vendorHarness(file);
  for (const duringFocus of [true, false]) {
    const original = field(true);
    const originalMenu = original._menu;
    original.onFocus();
    if (!duringFocus) while (timers.length) timers.shift()();
    assert.equal(Field._globallyFocusedMathfield, original);
    original.dispose();
    assert.equal(
      Field._globallyFocusedMathfield,
      undefined,
      "disposal clears focused owner even during the 60ms focus transition",
    );
    assert.equal(original._menu, undefined, "disposal releases the owned menu");
    assert.equal(
      originalMenu.state,
      "closed",
      "owned open menu closes on teardown",
    );
    assert(
      events.includes("menu.element.remove") &&
        events.includes("menu.listeners.abort"),
      "actual vendor menu disposal removes elements and listeners",
    );
    assert(
      events.lastIndexOf("menu.dispose") < events.lastIndexOf("model.dispose"),
      "owned menu closes before model destruction",
    );
    while (timers.length) timers.shift()();
    const next = field(true);
    assert.doesNotThrow(
      () => next.onFocus(),
      "next editor never blurs a disposed model",
    );
    assert.equal(Field._globallyFocusedMathfield, next);
    const inactive = field(true);
    inactive.dispose();
    assert.equal(
      Field._globallyFocusedMathfield,
      next,
      "inactive disposal preserves the active editor",
    );
    assert(
      next._menu,
      "inactive disposal does not dispose another editor's menu",
    );
    assert.equal(
      next._menu.state,
      "open",
      "next editor's menu remains usable after unrelated teardown",
    );
    next.dispose();
    assert.doesNotThrow(
      () => next.dispose(),
      "repeat disposal remains guarded",
    );
    while (timers.length) timers.shift()();
  }
}
console.log(
  "Actual development/production MathLive disposal, focus-window and menu ownership regressions passed",
);
