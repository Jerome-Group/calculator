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

// Execute the pinned caret/capture/menu methods, with controlled DOM geometry and
// pointer-capture routing. Actual browser pointer activation remains a separate gate.
{
  const vendor = fs.readFileSync(
    new URL("../node_modules/mathlive/mathlive.mjs", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "mathlive.mjs",
    vendor,
    ts.ScriptTarget.Latest,
    true,
  );
  const functions = new Map();
  let tracker, menuItem;
  function visit(node) {
    if (ts.isFunctionDeclaration(node))
      functions.set(node.name?.text, node.getText(ast));
    if (ts.isClassExpression(node)) {
      if (node.name?.text === "_PointerTracker") tracker = node.getText(ast);
      if (
        node.members.some(
          (member) => member.name?.getText(ast) === "dispatchSelect",
        )
      )
        menuItem = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(tracker && menuItem && functions.has("onPointerDown"));
  const appSource = fs.readFileSync(
    process.env.CALCULATOR_MATH_EDITOR_SOURCE ??
      new URL("../components/calculator/MathEditor.tsx", import.meta.url),
    "utf8",
  );
  const appAst = ts.createSourceFile(
    "MathEditor.tsx",
    appSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let guard;
  function findGuard(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(appAst) === "el.addEventListener" &&
      node.arguments[0]?.getText(appAst) === '"pointerdown"'
    ) {
      assert.equal(
        node.arguments[2].getText(appAst).replace(/\s/g, ""),
        "{capture:true}",
      );
      guard = ts.transpileModule(
        "const guard = " + node.arguments[1].getText(appAst),
        {
          compilerOptions: { target: ts.ScriptTarget.ES2022 },
        },
      ).outputText;
    }
    ts.forEachChild(node, findGuard);
  }
  findGuard(appAst);
  assert(
    guard,
    "Actual app registers the menu pointer guard during field setup",
  );
  class Element extends EventTarget {
    constructor(role) {
      super();
      this.role = role;
    }
    getAttribute(name) {
      return name === "role" ? this.role : null;
    }
  }
  class PointerEvent extends Event {
    constructor(type, path) {
      super(type, { cancelable: true });
      Object.assign(this, {
        buttons: 1,
        pointerId: 1,
        clientX: 100,
        clientY: 270,
        detail: 1,
        isPrimary: true,
      });
      this.path = path;
    }
    composedPath() {
      return this.path;
    }
  }
  const appGuard = new Function("Element", guard + ";return guard;")(Element);
  const methods = menuItem.members
    .filter((member) =>
      ["handleEvent", "select"].includes(member.name?.getText(ast)),
    )
    .map((member) => member.getText(ast))
    .join("\n");
  function replay(protectMenu, pressMenu, menuState = "open") {
    const timers = [];
    let captured = null,
      insertions = 0;
    const field = new Element();
    const leaf = new Element("menuitem");
    const menu = new Element("menu");
    const host = new Element();
    field.getBoundingClientRect = () => ({
      left: 25,
      top: 254,
      right: 365,
      bottom: 326,
    });
    field.setPointerCapture = () => {
      captured = field;
    };
    field.releasePointerCapture = () => {
      captured = null;
    };
    host.getBoundingClientRect = field.getBoundingClientRect;
    host.classList = { add() {}, remove() {} };
    const environment = {
      BLINK_SPEED: Number(/var BLINK_SPEED = (\d+)/.exec(vendor)?.[1]),
      window: { PointerEvent },
      globalThis: { PointerEvent },
      PointerEvent,
      AbortController,
      Map,
      Date,
      Math,
      setTimeout: (callback) => timers.push(callback),
      setInterval: () => 1,
      clearInterval() {},
      offsetFromPoint: () => 0,
      acceptCommandSuggestion: () => false,
      requestUpdate() {},
      selectGroup() {},
    };
    const pinned = new Function(
      "environment",
      `with(environment) {
      let gLastTap=null, gTapCount=0;
      const PointerTracker=${tracker};
      ${["isPointerEvent", "pointInRect", "clamp", "onPointerDown"].map((name) => functions.get(name)).join("\n")}
      return {onPointerDown, Item:class {${methods}}};
    }`,
    )(environment);
    const item = new pinned.Item();
    Object.assign(item, {
      visible: true,
      enabled: true,
      type: "command",
      rootMenu: { state: menuState, cancelDelayedOperation() {}, hide() {} },
      dispatchSelect: () => insertions++,
    });
    const mathfield = {
      field,
      container: host,
      element: host,
      defaultStyle: {},
      model: {
        anchor: 0,
        at: () => ({ type: "mord" }),
        selectionIsCollapsed: true,
      },
      hasFocus: () => true,
      flushInlineShortcutBuffer() {},
      stopCoalescingUndo() {},
    };
    const down = new PointerEvent(
      "pointerdown",
      pressMenu ? [leaf, menu, host] : [field, host],
    );
    if (protectMenu) appGuard(down);
    const stopped = down.cancelBubble;
    const defaultBeforeVendor = down.defaultPrevented;
    if (!stopped) pinned.onPointerDown(mathfield, down);
    const releaseTarget = captured ?? (pressMenu ? leaf : field);
    const up = new PointerEvent("pointerup", [releaseTarget]);
    if (releaseTarget === field) field.dispatchEvent(up);
    else {
      item.handleEvent(up);
      item.handleEvent(new PointerEvent("click", [leaf, menu, host]));
    }
    while (timers.length) timers.shift()();
    return {
      releaseTarget,
      field,
      leaf,
      insertions,
      stopped,
      defaultBeforeVendor,
      captured,
    };
  }
  const baseline = replay(false, true);
  assert.equal(
    baseline.releaseTarget,
    baseline.field,
    "Pinned caret handler captures overlapping menu press",
  );
  assert.equal(
    baseline.insertions,
    0,
    "Captured release never reaches the menu command",
  );
  const fixed = replay(true, true);
  assert.equal(fixed.releaseTarget, fixed.leaf);
  assert.equal(
    fixed.insertions,
    1,
    "Pinned menu handler receives uncaptured release and selects command",
  );
  assert.equal(
    fixed.defaultBeforeVendor,
    false,
    "Menu press keeps default focus behavior",
  );
  const modal = replay(true, true, "modal");
  assert.equal(
    modal.insertions,
    1,
    "Modal menus retain their pinned click activation",
  );
  const caret = replay(true, false);
  assert.equal(caret.stopped, false);
  assert.equal(
    caret.releaseTarget,
    caret.field,
    "Ordinary caret presses retain pinned pointer capture",
  );
  assert.equal(
    caret.captured,
    null,
    "Pinned pointer-up releases ordinary caret capture",
  );
}
console.log(
  "Pinned overlapping-menu capture detector and app guard regressions passed",
);
