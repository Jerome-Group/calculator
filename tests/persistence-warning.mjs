import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const filename = new URL(
    "../components/calculator/Calculator.tsx",
    import.meta.url,
  ),
  source = fs.readFileSync(filename, "utf8"),
  ast = ts.createSourceFile(
    "Calculator.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
let callback;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === "useEffect" &&
    node.arguments[0]?.getText(ast).includes("persist(state)")
  )
    callback = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(callback, "Actual autosave effect missing");
const compiled = ts.transpileModule(`return (${callback});`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;
let warning = "",
  failure = true,
  timer,
  saved = 0;
const effect = new Function(
  "state",
  "paused",
  "persist",
  "setWarning",
  "setTimeout",
  "clearTimeout",
  compiled,
)(
  { id: "fixture" },
  false,
  () => {
    saved++;
    if (failure) throw Error("Quota");
  },
  (update) =>
    (warning = typeof update === "function" ? update(warning) : update),
  (callback) => (timer = callback),
  () => (timer = null),
);
effect();
timer();
assert.match(warning, /latest changes could not be saved/);
failure = false;
effect();
timer();
assert.equal(warning, "");
assert.equal(saved, 2);
for (const retained of [
  "Saved data could not be read. It is preserved; automatic saving is paused.",
  "Recovered the previous valid save. Export a backup now.",
]) {
  warning = retained;
  effect();
  timer();
  assert.equal(warning, retained);
}
const cancel = effect();
cancel();
assert.equal(timer, null);
console.log(
  "Actual autosave effect: quota warning clears after successful persistence; corrupt/recovered-data warnings retained; timer cleanup passed.",
);
