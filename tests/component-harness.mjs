import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
export const settings = {
  angle: "rad",
  domain: "real",
  precision: 30,
  assumptions: "",
};
export const definition = (name, expression = "1") => ({
  id: name,
  name,
  expression,
  kind: "expression",
  args: "",
  updated: 1,
});
export const notebook = (id, definitions = []) => ({
  id,
  name: id,
  definitions,
  history: [],
  graphs: [],
  revision: 0,
});
export const workspace = (notebooks, active = notebooks[0].id) => ({
  version: 1,
  notebooks,
  active,
  settings: { ...settings },
});

function instrument(source, component, actions) {
  const transform = (context) => {
    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === "useState"
      ) {
        const name = node.name.elements[0].name.text;
        return context.factory.updateVariableDeclaration(
          node,
          node.name,
          node.exclamationToken,
          node.type,
          context.factory.createCallExpression(
            context.factory.createIdentifier("auditState"),
            undefined,
            [
              context.factory.createStringLiteral(name),
              ...node.initializer.arguments,
            ],
          ),
        );
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === component) {
        const body = ts.visitNode(node.body, visit);
        const capture = context.factory.createExpressionStatement(
          context.factory.createCallExpression(
            context.factory.createIdentifier("auditActions"),
            undefined,
            [
              context.factory.createObjectLiteralExpression(
                actions.map((name) =>
                  context.factory.createShorthandPropertyAssignment(name),
                ),
              ),
            ],
          ),
        );
        const statements = [...body.statements];
        const firstReturn = statements.findIndex(ts.isReturnStatement);
        assert(firstReturn >= 0, `No component return in ${component}`);
        statements.splice(firstReturn, 0, capture);
        return context.factory.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          node.parameters,
          node.type,
          context.factory.updateBlock(body, statements),
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit);
  };
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    transformers: { before: [transform] },
  }).outputText;
}

export function componentHarness(
  component,
  actions,
  initialState = {},
  moduleOverrides = {},
) {
  const state = new Map(Object.entries(initialState)),
    refs = [],
    requests = [],
    effects = [],
    layouts = [],
    cleanups = [];
  let refIndex = 0,
    captured,
    nextId = 0;
  const source = fs.readFileSync(
    new URL(`../components/calculator/${component}.tsx`, import.meta.url),
    "utf8",
  );
  const auditState = (name, initial) => {
    if (!state.has(name))
      state.set(name, typeof initial === "function" ? initial() : initial);
    return [
      state.get(name),
      (value) =>
        state.set(
          name,
          typeof value === "function" ? value(state.get(name)) : value,
        ),
    ];
  };
  const react = {
    useState() {
      throw Error("Uninstrumented state hook");
    },
    useRef(initial) {
      return (refs[refIndex++] ??= { current: initial });
    },
    useEffect(callback) {
      if (component === "GraphWorkspace") effects.push(callback);
    },
    useLayoutEffect(callback) {
      layouts.push(callback);
    },
    useMemo: (calculate) => calculate(),
  };
  const placeholder = () => null;
  const ui = new Proxy(
    { default: placeholder },
    { get: (object, key) => object[key] || placeholder },
  );
  const engine = {
    calculate: (request) =>
      new Promise((resolve, reject) =>
        requests.push({ request, resolve, reject }),
      ),
    startEngine() {},
    cancelCalculation() {},
  };
  const modules = {
    react,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/lib/calculator/engine": engine,
    "@/lib/calculator/types": {
      uid: () => `created-${++nextId}`,
      DEFAULT_SETTINGS: settings,
      newNotebook: (name) => notebook(name || "new"),
    },
    "@/lib/calculator/catalog": { operations: [], categories: [] },
    "@/lib/calculator/operation-params": require("../lib/calculator/operation-params.ts"),
    "@/lib/calculator/storage": {
      accountStorage: (key) => key,
      readDeviceSave: () => null,
      writeDeviceSave: () => {},
      STORAGE_KEY: "state",
      BACKUP_KEY: "backup",
    },
  };
  const graphModule = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(
      fs.readFileSync(
        new URL("../lib/calculator/graph.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
  )(
    (name) =>
      name === "./graph-resources"
        ? require("../lib/calculator/graph-resources.ts")
        : require(name),
    graphModule,
    graphModule.exports,
  );
  modules["@/lib/calculator/graph"] = graphModule.exports;
  const loadedModule = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "auditState",
    "auditActions",
    "window",
    "document",
    "navigator",
    "localStorage",
    instrument(source, component, actions),
  )(
    (specifier) => moduleOverrides[specifier] || modules[specifier] || ui,
    loadedModule,
    loadedModule.exports,
    auditState,
    (value) => (captured = value),
    {},
    {},
    {},
    { getItem: () => null },
  );
  return {
    state,
    requests,
    unmount() {
      for (const cleanup of cleanups) cleanup?.();
    },
    render(props) {
      refIndex = 0;
      effects.length = 0;
      layouts.length = 0;
      const tree = loadedModule.exports.default(props);
      for (const layout of layouts) layout();
      if (component === "GraphWorkspace" && !cleanups.length)
        for (const effect of effects) cleanups.push(effect());
      return { tree, actions: captured };
    },
    exports: loadedModule.exports,
  };
}
