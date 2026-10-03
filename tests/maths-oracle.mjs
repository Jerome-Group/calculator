import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.env.CALCULATOR_ROOT || process.cwd();
const base = path.join(root, "public/engine/");
const { loadPyodide } = await import(pathToFileURL(base + "pyodide.mjs"));
let fetchAttempts = 0;
globalThis.fetch = async () => {
  fetchAttempts++;
  throw Error("Network forbidden in math fixture checks");
};
const py = await loadPyodide({ indexURL: base });
await py.loadPackage(["sympy", "scipy"]);
for (const wheel of [
  "networkx-3.4.2-py3-none-any.whl",
  "lark-1.2.2-py3-none-any.whl",
])
  py.unpackArchive(new Uint8Array(fs.readFileSync(base + wheel)), "zip", {
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
const selected = process.argv.indexOf("--fixture");
let fixtures = process.env.CALCULATOR_FIXTURES_FILE
  ? JSON.parse(fs.readFileSync(process.env.CALCULATOR_FIXTURES_FILE, "utf8"))
      .fixtures
  : ["maths-defaults.json", "maths-choices.json", "menu-math.json"].flatMap(
      (file) =>
        JSON.parse(fs.readFileSync(root + "/tests/fixtures/" + file, "utf8"))
          .fixtures,
    );
if (selected >= 0) {
  const id = process.argv[selected + 1];
  fixtures = fixtures.filter((f) => f.id === id);
  if (!fixtures.length) throw Error("Unknown fixture " + id);
}
py.FS.writeFile(
  "/home/pyodide/maths_assertions.py",
  fs.readFileSync(path.join(root, "tests/maths-assertions.py")),
);
await py.runPythonAsync("from calculator import compute_json as compute");
py.globals.set("fixture_json", JSON.stringify(fixtures));
py.globals.set("mutation", process.env.CALCULATOR_MUTATE_RESULT || "");
await py.runPythonAsync("import json; fixtures=json.loads(fixture_json)");
const result = JSON.parse(
  await py.runPythonAsync(
    fs.readFileSync(root + "/tests/maths-oracle.py", "utf8"),
  ),
);
result.fetchAttempts = fetchAttempts;
if (fetchAttempts) result.status = "fail";
console.log(JSON.stringify(result));
if (process.env.CALCULATOR_RESULT_FILE)
  fs.writeFileSync(
    process.env.CALCULATOR_RESULT_FILE,
    JSON.stringify(result, null, 2),
  );
process.exitCode = result.status === "pass" ? 0 : 1;
