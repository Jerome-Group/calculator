import assert from "node:assert/strict";
import * as investigations from "../lib/calculator/investigations.ts";
import { operations, categories } from "../lib/calculator/catalog.ts";
import {
  workspaceRequestFits,
  serializeWorkspaceRequest,
  WORKSPACE_SIZE_ERROR,
} from "../lib/calculator/workspace-request.ts";
import {
  componentHarness,
  notebook,
  workspace,
  settings,
} from "./component-harness.mjs";
const exact = { status: "exact", text: "1", latex: "1", notes: [] };
const flush = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (e) {
    checks.push({ name, passed: false, error: e.stack });
  }
}
function fixture() {
  const book = investigations.createInvestigationNotebook({
    seed: { kind: "lab", labId: "singular-matrix" },
    workspaceSettings: settings,
  });
  let generation = 0;
  const sync = {
    sessionWorkspace: () => null,
    captureAccountSession: () => {
      const captured = generation;
      return {
        isCurrent: () => captured === generation,
        stageCommittedWorkspace: () => captured === generation,
      };
    },
    workspaceFitsCloud: (s, additionalBytes = 0) =>
      workspaceRequestFits(
        serializeWorkspaceRequest(s, 1, "a"),
        additionalBytes,
      ),
  };
  const h = componentHarness(
    "Calculator",
    [
      "runInvestigation",
      "stopCalculation",
      "run",
      "computeAuxiliary",
      "saveObject",
    ],
    { state: workspace([book, notebook("other")]), status: "Ready" },
    {
      "@/lib/calculator/investigations": investigations,
      "@/lib/calculator/catalog": { operations, categories },
      "@/lib/calculator/sync": sync,
      "@/lib/calculator/workspace-request": { WORKSPACE_SIZE_ERROR },
    },
  );
  const target = () =>
    h.state.get("state").notebooks.find((b) => b.id === book.id);
  return { h, book, target, expire: () => generation++ };
}
await check(
  "sequential entries save mathematical errors and resume only missing frozen cells",
  async () => {
    const { h, book, target } = fixture();
    const pending = h
      .render()
      .actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve(exact);
    await flush();
    assert.equal(target().history.length, 1);
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve({
      ...exact,
      status: "error",
      text: "Invalid mathematical input",
    });
    await flush();
    assert.equal(target().history.length, 2);
    assert.equal(h.requests.length, 3);
    h.render().actions.stopCalculation();
    h.requests[2].reject(Error("Stopped"));
    await pending;
    assert.equal(target().history.length, 2);
    assert.equal(h.state.get("busy"), false);
    const run = target().investigation.runs[0];
    target().investigation.plan.cases[0].values.a = "99";
    target().definitions.find((d) => d.name === "A").expression =
      "Matrix([[9,0],[0,9]])";
    const resume = h
      .render()
      .actions.runInvestigation(book.id, { kind: "resume", runId: run.id });
    await flush();
    assert.equal(h.requests.length, 4);
    assert.equal(
      h.requests[3].request.definitions.find((d) => d.name === "a").expression,
      "2",
    );
    assert.equal(
      h.requests[3].request.definitions.find((d) => d.name === "A").expression,
      "Matrix([[1,1],[1,a]])",
    );
    for (let i = 3; i < 10; i++) {
      h.requests[i].resolve(exact);
      await flush();
    }
    await resume;
    assert.equal(target().history.length, 9);
    assert.equal(target().investigation.runs.length, 1);
    assert.equal(
      target().history.filter((e) => e.result.status === "error").length,
      1,
    );
  },
);
await check("worker rejection stops with current cell missing", async () => {
  const { h, book, target } = fixture();
  const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
  await flush();
  h.requests[0].reject(Error("Worker failed"));
  await p;
  assert.equal(target().history.length, 0);
  assert.equal(h.requests.length, 1);
  assert.match(h.state.get("notice"), /interrupted/);
});
await check(
  "switching notebook keeps original target and captured definitions",
  async () => {
    const { h, book, target } = fixture();
    const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    h.state.set("state", { ...h.state.get("state"), active: "other" });
    h.render();
    h.requests[0].resolve(exact);
    await flush();
    assert.equal(target().history.length, 1);
    assert.equal(h.state.get("state").active, "other");
    assert.equal(
      h.state.get("state").notebooks.find((b) => b.id === "other").history
        .length,
      0,
    );
    h.render().actions.stopCalculation();
    h.requests[1].reject(Error("Stopped"));
    await p;
  },
);
for (const stage of ["before commit", "inside updater"]) {
  await check("expired session refuses append " + stage, async () => {
    const { h, book, target, expire } = fixture();
    const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    if (stage === "inside updater") h.deferWorkspaceUpdates();
    else expire();
    h.requests[0].resolve(exact);
    await flush();
    if (stage === "inside updater") {
      expire();
      h.flushWorkspaceUpdates();
    }
    await p;
    assert.equal(target().history.length, 0);
    assert.equal(h.requests.length, 1);
  });
}
await check("removed run never receives late result", async () => {
  const { h, book, target } = fixture();
  const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
  await flush();
  target().investigation.runs = [];
  h.requests[0].resolve(exact);
  await p;
  assert.equal(target().history.length, 0);
  assert.equal(h.requests.length, 1);
});
await check(
  "double activation and competing worker actions cannot overlap batch",
  async () => {
    const { h, book, target } = fixture();
    const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    await h.render().actions.runInvestigation(book.id, { kind: "new" });
    await h.render().actions.run("evaluate", {}, { input: "2", mode: "text" });
    await assert.rejects(
      h.render().actions.computeAuxiliary({ operation: "matrix_cells" }),
      /running/,
    );
    assert.equal(h.requests.length, 1);
    assert.equal(target().investigation.runs.length, 1);
    h.render().actions.stopCalculation();
    h.requests[0].resolve(exact);
    await p;
    assert.equal(target().history.length, 0);
  },
);
await check(
  "history and request-size preflight leave workspace unchanged",
  async () => {
    for (const kind of ["history", "size"]) {
      const { h, book, target } = fixture();
      target().history = Array.from(
        { length: kind === "history" ? 9995 : 23 },
        (_, i) => ({
          id: "ordinary" + i,
          result: { ...exact, text: kind === "size" ? "x".repeat(80000) : "1" },
          input: "1",
          mode: "text",
          operation: "evaluate",
          params: {},
          settings,
          definitions: [],
          revision: 0,
          time: 1,
        }),
      );
      const before = JSON.stringify(h.state.get("state"));
      await h.render().actions.runInvestigation(book.id, { kind: "new" });
      assert.equal(h.requests.length, 0);
      assert.equal(JSON.stringify(h.state.get("state")), before);
    }
  },
);
await check(
  "oversized real response is retained and stops remaining cells",
  async () => {
    const { h, book, target } = fixture();
    target().history = Array.from({ length: 22 }, (_, i) => ({
      id: "ordinary" + i,
      result: { ...exact, text: "x".repeat(80000) },
      input: "1",
      mode: "text",
      operation: "evaluate",
      params: {},
      settings,
      definitions: [],
      revision: 0,
      time: 1,
    }));
    const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
    await flush();
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve({ ...exact, text: "y".repeat(80000) });
    await p;
    assert.equal(h.requests.length, 1);
    assert.equal(target().history.length, 23);
    assert.equal(target().history[0].result.text.length, 80000);
    assert.match(h.state.get("notice"), /Cloud save exceeds/);
  },
);
await check("unmount invalidates before worker completion", async () => {
  const { h, book, target } = fixture();
  const p = h.render().actions.runInvestigation(book.id, { kind: "new" });
  await flush();
  h.unmount();
  h.requests[0].resolve(exact);
  await p;
  assert.equal(target().history.length, 0);
  assert.equal(h.requests.length, 1);
});
console.log(JSON.stringify(checks, null, 2));
assert(checks.every((c) => c.passed));
