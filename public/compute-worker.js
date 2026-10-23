const engineBuild = __ENGINE_BUILD__;
const engineRoot = new URL("./", self.location.href);
importScripts(new URL("pyodide.js", engineRoot).href);
let ready;
async function init() {
  self.postMessage({ type: "status", stage: "runtime" });
  const py = await loadPyodide({
    indexURL: engineRoot.href,
  });
  self.postMessage({
    type: "status",
    stage: "packages",
  });
  await py.loadPackage(__ENGINE_PACKAGES__);
  for (const file of [
    "networkx-3.4.2-py3-none-any.whl",
    "lark-1.2.2-py3-none-any.whl",
  ]) {
    const r = await fetch(new URL(file, engineRoot));
    if (!r.ok) throw Error("Could not load " + file);
    py.unpackArchive(await r.arrayBuffer(), "zip", {
      extractDir: "/lib/python3.12/site-packages",
    });
  }
  for (const file of __ENGINE_PYTHON__) {
    const r = await fetch(new URL(file, engineRoot));
    if (!r.ok) throw Error("Missing computation module");
    py.FS.writeFile("/home/pyodide/" + file, await r.text());
  }
  await py.runPythonAsync("from calculator import compute_json");
  self.postMessage({
    type: "ready",
    protocol: engineBuild.protocol,
    engineId: engineBuild.id,
  });
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
