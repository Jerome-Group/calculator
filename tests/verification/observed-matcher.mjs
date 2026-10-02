import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Match already observed, serialized results. Never invokes the calculator. */
export async function createObservedMatcher(root = process.cwd()) {
  const base = path.join(root, "public/engine/");
  const { loadPyodide } = await import(pathToFileURL(base + "pyodide.mjs"));
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Network forbidden in observed-result matching");
  };
  let py;
  try {
    py = await loadPyodide({ indexURL: base });
    await py.loadPackage(["sympy", "scipy"], { messageCallback: () => {} });
  } finally {
    globalThis.fetch = previousFetch;
  }
  py.FS.writeFile(
    "/home/pyodide/maths_assertions.py",
    fs.readFileSync(path.join(root, "tests/maths-assertions.py")),
  );
  await py.runPythonAsync(
    "import json; from maths_assertions import assert_fixture",
  );
  const matchObserved = async function (fixture, observedResult) {
    py.globals.set("observed_fixture_json", JSON.stringify(fixture));
    py.globals.set("observed_result_json", JSON.stringify(observedResult));
    return JSON.parse(
      await py.runPythonAsync(`
try:
 assert_fixture(json.loads(observed_fixture_json),json.loads(observed_result_json))
 observed_check={'id':json.loads(observed_fixture_json)['id'],'status':'pass'}
except Exception as error:
 observed_check={'id':json.loads(observed_fixture_json)['id'],'status':'fail','error':str(error)}
json.dumps(observed_check)
`),
    );
  };
  await py.runPythonAsync(
    fs.readFileSync(
      path.join(root, "tests/verification/latex-observed.py"),
      "utf8",
    ),
  );
  matchObserved.parseLatex = async (latex) => {
    py.globals.set("observed_latex", latex);
    return await py.runPythonAsync("str(latex_expression(observed_latex))");
  };
  await py.runPythonAsync(
    fs.readFileSync(
      path.join(root, "tests/verification/observed-display.py"),
      "utf8",
    ),
  );
  matchObserved.matchDisplay = async (fixture, observedDisplay) => {
    py.globals.set("observed_fixture_json", JSON.stringify(fixture));
    py.globals.set("observed_display_json", JSON.stringify(observedDisplay));
    let result;
    try {
      result = JSON.parse(
        await py.runPythonAsync(
          "json.dumps(observed_result(json.loads(observed_fixture_json),json.loads(observed_display_json)))",
        ),
      );
    } catch (error) {
      return {
        id: fixture.id,
        status: "blocked",
        reason: "Observed notation unsupported: " + error.message,
      };
    }
    return await matchObserved(fixture, result);
  };
  return matchObserved;
}
