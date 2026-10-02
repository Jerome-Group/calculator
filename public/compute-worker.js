importScripts("/engine/pyodide.js");
let ready;
async function init() {
  self.postMessage({ type: "status", message: "Loading local mathematics…" });
  const py = await loadPyodide({
    indexURL: new URL("/engine/", self.location.href).href,
  });
  self.postMessage({
    type: "status",
    message: "Preparing symbolic and numerical tools…",
  });
  await py.loadPackage(["sympy", "scipy"]);
  for (const file of [
    "networkx-3.4.2-py3-none-any.whl",
    "lark-1.2.2-py3-none-any.whl",
  ]) {
    const r = await fetch("/engine/" + file);
    if (!r.ok) throw Error("Could not load " + file);
    py.unpackArchive(await r.arrayBuffer(), "zip", {
      extractDir: "/lib/python3.12/site-packages",
    });
  }
  for (const file of [
    "latex_adapter.py",
    "supplemental.py",
    "presentation.py",
    "extended.py",
    "calculator.py",
  ]) {
    const r = await fetch("/engine/" + file);
    if (!r.ok) throw Error("Missing computation module");
    py.FS.writeFile("/home/pyodide/" + file, await r.text());
  }
  await py.runPythonAsync("from calculator import compute_json");
  self.postMessage({ type: "ready" });
  return py;
}
ready = init();
ready.catch((e) => self.postMessage({ type: "fatal", message: String(e) }));
self.onmessage = async ({ data }) => {
  if (data.type !== "compute") return;
  try {
    const py = await ready;
    py.globals.set("request_json", JSON.stringify(data.request));
    const result = await py.runPythonAsync("compute_json(request_json)");
    self.postMessage({
      type: "result",
      id: data.id,
      result: JSON.parse(result),
    });
  } catch (e) {
    self.postMessage({
      type: "result",
      id: data.id,
      result: {
        status: "error",
        text: String(e),
        latex: "",
        notes: [
          "The request was retained. Try a simpler expression or explicit parameters.",
        ],
      },
    });
  }
};
