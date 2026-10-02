import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/calculator/mathlive-loader.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const bundle = ts.createSourceFile(
  "mathlive.min.mjs",
  fs.readFileSync(
    new URL("../node_modules/mathlive/mathlive.min.mjs", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
function inspect(node) {
  assert(!ts.isImportDeclaration(node), "standalone bundle has no imports");
  assert(
    !ts.isExportDeclaration(node) || !node.moduleSpecifier,
    "standalone bundle has no re-exports",
  );
  assert(
    !ts.isMetaProperty(node),
    "standalone bundle does not depend on import.meta",
  );
  assert(
    !ts.isCallExpression(node) ||
      node.expression.kind !== ts.SyntaxKind.ImportKeyword,
    "standalone bundle has no dynamic dependencies",
  );
  ts.forEachChild(node, inspect);
}
inspect(bundle);

async function harness({ evaluationFails = false } = {}) {
  let requests = 0;
  let evaluations = 0;
  let created = 0;
  const revoked = [];
  const blobs = [];
  let available = false;
  let bodyFails = false;
  class AssetURL extends URL {
    static createObjectURL(blob) {
      assert.equal(blob.type, "text/javascript");
      blobs.push(blob);
      created++;
      return `blob:https://calculator.test/${created}`;
    }
    static revokeObjectURL(url) {
      revoked.push(url);
    }
  }
  const context = vm.createContext({
    URL: AssetURL,
    Blob,
    fetch: async (url) => {
      requests++;
      assert.equal(
        url.href,
        "https://calculator.test/node_modules/mathlive/mathlive.min.mjs",
      );
      return {
        ok: available,
        status: available ? 200 : 503,
        text: async () => {
          if (bodyFails) throw Error("Body interrupted");
          return "export const MathfieldElement = class {};";
        },
      };
    },
  });
  const loader = new vm.SourceTextModule(compiled, {
    context,
    initializeImportMeta(meta) {
      meta.url = "https://calculator.test/lib/calculator/mathlive-loader.ts";
    },
    importModuleDynamically: async () => {
      evaluations++;
      if (evaluationFails) throw Error("Evaluation failed");
      const evaluated = new vm.SyntheticModule(
        ["MathfieldElement"],
        function () {
          this.setExport("MathfieldElement", class {});
        },
        { context },
      );
      await evaluated.link(() => {});
      await evaluated.evaluate();
      return evaluated;
    },
  });
  await loader.link(() => {});
  await loader.evaluate();
  return {
    load: loader.namespace.loadMathLive,
    restore: () => {
      available = true;
    },
    interruptBody: (value) => {
      bodyFails = value;
    },
    counts: () => ({ requests, evaluations, created, revoked: [...revoked] }),
    sources: () => Promise.all(blobs.map((blob) => blob.text())),
  };
}

const retry = await harness();
const first = retry.load();
assert.equal(retry.load(), first, "concurrent failed requests share a fetch");
await assert.rejects(first, /download failed/);
assert.deepEqual(retry.counts(), {
  requests: 1,
  evaluations: 0,
  created: 0,
  revoked: [],
});
retry.restore();
retry.interruptBody(true);
await assert.rejects(retry.load(), /Body interrupted/);
retry.interruptBody(false);
const recovered = retry.load();
assert.equal(
  retry.load(),
  recovered,
  "concurrent successful requests share evaluation",
);
const evaluated = await recovered;
assert.deepEqual(await retry.sources(), [
  "export const MathfieldElement = class {};\n//# sourceURL=https://calculator.test/node_modules/mathlive/mathlive.min.mjs",
]);
assert.equal(
  await retry.load(),
  evaluated,
  "successful module remains a singleton",
);
assert.deepEqual(retry.counts(), {
  requests: 3,
  evaluations: 1,
  created: 1,
  revoked: ["blob:https://calculator.test/1"],
});

const badEvaluation = await harness({ evaluationFails: true });
badEvaluation.restore();
const failed = badEvaluation.load();
await assert.rejects(failed, /Evaluation failed/);
assert.equal(
  badEvaluation.load(),
  failed,
  "evaluation failure must not repeat bundle side effects",
);
await assert.rejects(badEvaluation.load(), /Evaluation failed/);
assert.deepEqual(badEvaluation.counts(), {
  requests: 1,
  evaluations: 1,
  created: 1,
  revoked: ["blob:https://calculator.test/1"],
});
console.log(
  "MathLive download retry, singleton, evaluation failure and standalone bundle checks passed",
);
