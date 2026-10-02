import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadPyodide } from "../public/engine/pyodide.mjs";
import { operations } from "../lib/calculator/catalog.ts";
import {
  graphScope,
  graphFunctions,
  finiteSegment,
} from "../lib/calculator/graph.ts";
const base = fileURLToPath(new URL("../public/engine/", import.meta.url));
let attempts = 0;
globalThis.fetch = async () => {
  attempts++;
  throw Error("Network disabled for verification");
};
const py = await loadPyodide({ indexURL: base });
await py.loadPackage(["sympy", "scipy"]);
for (const file of [
  "networkx-3.4.2-py3-none-any.whl",
  "lark-1.2.2-py3-none-any.whl",
])
  py.unpackArchive(new Uint8Array(fs.readFileSync(base + file)), "zip", {
    extractDir: "/lib/python3.12/site-packages",
  });
for (const file of [
  "calculator.py",
  "latex_adapter.py",
  "supplemental.py",
  "extended.py",
  "presentation.py",
])
  py.FS.writeFile("/home/pyodide/" + file, fs.readFileSync(base + file));
for (const file of [
  "test_parser.py",
  "test_domain_helpers.py",
  "test_dispatch.py",
  "test_supplemental.py",
])
  py.FS.writeFile(
    "/home/pyodide/" + file,
    fs.readFileSync(new URL(file, import.meta.url)),
  );
await py.runPythonAsync(
  "import unittest\nimport test_parser,test_domain_helpers,test_dispatch,test_supplemental\nsuite=unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromModule(m) for m in [test_parser,test_domain_helpers,test_dispatch,test_supplemental]])\nresult=unittest.TextTestRunner(verbosity=1).run(suite)\nassert result.wasSuccessful()\nfrom calculator import compute_json",
);
const compute = py.globals.get("compute_json");
const cells = JSON.parse(
  compute(
    JSON.stringify({
      operation: "matrix_cells",
      params: { expression: "Matrix([[1,2],[3,4]])" },
    }),
  ),
);
assert.deepEqual(cells.details.cells, [
  ["1", "2"],
  ["3", "4"],
]);
const results = [];
for (const op of operations) {
  const r = JSON.parse(
    compute(
      JSON.stringify({
        operation: op.id,
        params: Object.fromEntries(op.fields.map((f) => [f.key, f.value])),
        settings: {
          precision: 30,
          angle: "rad",
          domain: "real",
          assumptions: "",
        },
        mode: "text",
      }),
    ),
  );
  results.push({ id: op.id, status: r.status });
  assert.notEqual(r.status, "error", op.id + ": " + r.text);
}
const deg = graphScope([], { angle: "deg" }, 1),
  rad = graphScope([], { angle: "rad" }, 1);
const graph = (expression, radians = false) => ({
  type: "cartesian",
  expression,
  radians,
});
assert(Math.abs(graphFunctions(graph("sec(x)"), deg).f(60) - 2) < 1e-12);
assert(
  Math.abs(graphFunctions(graph("acot(x)"), rad).f(-1) + Math.PI / 4) < 1e-12,
);
assert(
  Math.abs(
    graphFunctions(graph("pi*cos(pi*x/180)/180", true), deg).f(0) -
      Math.PI / 180,
  ) < 1e-12,
);
assert(!finiteSegment(-10, Infinity, 10, 8));
assert(!finiteSegment(-100, 0, 100, 8));
assert(finiteSegment(0, 0.5, 1, 8));
assert.equal(attempts, 0);
console.log(
  JSON.stringify({
    catalog: results.length,
    errors: 0,
    fetchAttempts: attempts,
    graphChecks: "passed",
  }),
);
