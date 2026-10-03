import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";

const read = (file) =>
  stripTypeScriptTypes(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
async function engine({ constructorFailure = false } = {}) {
  const workers = [],
    timers = new Map();
  let timerId = 0;
  class Worker {
    constructor() {
      if (constructorFailure) throw Error("Worker unavailable");
      workers.push(this);
    }
    postMessage(message) {
      if (this.postError) throw this.postError;
      this.messages ??= [];
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    send(data) {
      this.onmessage?.({ data });
    }
  }
  const context = vm.createContext({
    Worker,
    Error,
    crypto: webcrypto,
    console,
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  const modules = {
    engine: new vm.SourceTextModule(read("../lib/calculator/engine.ts"), {
      context,
    }),
    types: new vm.SourceTextModule(read("../lib/calculator/types.ts"), {
      context,
    }),
  };
  modules["result-validation"] = new vm.SourceTextModule(
    read("../lib/calculator/result-validation.ts"),
    { context },
  );
  await modules.engine.link((specifier) => {
    const name = specifier.replace("./", "");
    if (!modules[name])
      throw Error(`Unexpected engine dependency: ${specifier}`);
    return modules[name];
  });
  await modules.engine.evaluate();
  return { api: modules.engine.namespace, workers, timers };
}
const result = { status: "exact", text: "4", latex: "4", notes: [] };
const results = [];
async function check(name, action) {
  try {
    await action();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
await check(
  "cancellation rejects pending work and replaces the worker",
  async () => {
    const { api, workers } = await engine();
    api.startEngine(() => {});
    workers[0].send({ type: "ready" });
    const pending = api.calculate({ input: "2+2" });
    const rejected = assert.rejects(
      pending,
      /cancelled.*retained|cancelled.*unchanged/i,
    );
    api.cancelCalculation();
    await rejected;
    assert.equal(workers[0].terminated, true);
    assert.equal(workers.length, 2);
  },
);
await check("a failed worker cannot report Ready when reopened", async () => {
  const { api, workers } = await engine();
  api.startEngine(() => {});
  workers[0].send({ type: "ready" });
  workers[0].onerror?.({ message: "Worker stopped" });
  const status = [];
  api.startEngine((message) => status.push(message));
  assert(!status.includes("Ready"), "Failed worker was advertised as Ready");
});
await check(
  "terminated worker messages cannot reject replacement requests",
  async () => {
    const { api, workers } = await engine();
    api.startEngine(() => {});
    const previous = workers[0];
    api.cancelCalculation();
    const replacement = workers[1];
    replacement.send({ type: "ready" });
    const pending = api.calculate({ input: "2+2" });
    void pending.catch(() => {});
    previous.send({ type: "fatal", message: "Old worker failed" });
    replacement.send({
      type: "result",
      id: replacement.messages.at(-1).id,
      result,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(await pending)), result);
  },
);
await check(
  "preparation has a bounded failure path when the worker stays silent",
  async () => {
    const { api, timers } = await engine(),
      status = [];
    api.startEngine((message) => status.push(message));
    assert(timers.size > 0, "No preparation deadline was scheduled");
    for (const [id, timer] of [...timers]) {
      assert(Number.isFinite(timer.delay) && timer.delay > 0);
      timers.delete(id);
      timer.callback();
    }
    assert(
      status.some((message) => /retry|fail|could not|timed out/i.test(message)),
    );
  },
);
await check("a postMessage failure rejects only its request", async () => {
  const { api, workers } = await engine();
  api.startEngine(() => {});
  workers[0].send({ type: "ready" });
  workers[0].postError = Error("Request could not be cloned");
  await assert.rejects(api.calculate({ input: "2+2" }), /cloned/);
  workers[0].postError = null;
  const pending = api.calculate({ input: "2+2" });
  workers[0].send({
    type: "result",
    id: workers[0].messages.at(-1).id,
    result,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await pending)), result);
});
await check(
  "malformed worker results are rejected before entering notebook history",
  async () => {
    const { api, workers } = await engine();
    api.startEngine(() => {});
    workers[0].send({ type: "ready" });
    const pending = api.calculate({ input: "2+2" });
    const rejected = assert.rejects(pending);
    workers[0].send({
      type: "result",
      id: workers[0].messages.at(-1).id,
      result: { ...result, display: { type: "fields", items: null } },
    });
    await rejected;
  },
);
await check(
  "fatal and unreadable messages reject pending work and allow retry",
  async () => {
    for (const failure of ["fatal", "messageerror", "invalid"]) {
      const { api, workers, timers } = await engine();
      api.startEngine(() => {});
      workers[0].send({ type: "ready" });
      assert.equal(timers.size, 0);
      const pending = api.calculate({ operation: "evaluate", input: "2+2" });
      const rejected = assert.rejects(pending, /worker/i);
      if (failure === "fatal")
        workers[0].send({ type: "fatal", message: "Failure" });
      else if (failure === "invalid") workers[0].send(null);
      else workers[0].onmessageerror?.({});
      await rejected;
      assert(workers[0].terminated);
      api.startEngine(() => {});
      workers[1].send({ type: "ready" });
      const retry = api.calculate({ operation: "evaluate", input: "2+2" });
      workers[1].send({
        type: "result",
        id: workers[1].messages.at(-1).id,
        result,
      });
      assert.deepEqual(JSON.parse(JSON.stringify(await retry)), result);
    }
  },
);
await check(
  "operation context validates plot data and retains legitimate failures",
  async () => {
    const { api, workers } = await engine();
    api.startEngine(() => {});
    workers[0].send({ type: "ready" });
    const malformed = api.calculate({ operation: "histogram", input: "[1]" });
    const rejected = assert.rejects(malformed, /Invalid mathematical result/);
    workers[0].send({
      type: "result",
      id: workers[0].messages.at(-1).id,
      result: { ...result, details: { counts: {}, "bin lower bounds": [1] } },
    });
    await rejected;
    const failure = api.calculate({ operation: "histogram", input: "bad" });
    const error = {
      status: "error",
      text: "Invalid data",
      latex: "",
      notes: [],
    };
    workers[0].send({
      type: "result",
      id: workers[0].messages.at(-1).id,
      result: error,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(await failure)), error);
  },
);
await check(
  "worker construction failure leaves preparation retryable",
  async () => {
    const { api, workers, timers } = await engine({ constructorFailure: true });
    const statuses = [];
    assert.doesNotThrow(() =>
      api.startEngine((message) => statuses.push(message)),
    );
    assert.equal(workers.length, 0);
    assert.equal(timers.size, 0);
    assert.match(statuses.at(-1), /Retry/);
    await assert.rejects(api.calculate({ input: "2+2" }), /not ready/);
  },
);
await check(
  "silent preparation rejects queued requests and stale callbacks preserve retry",
  async () => {
    const { api, workers, timers } = await engine();
    const statuses = [];
    api.startEngine((message) => statuses.push(message));
    const previous = workers[0];
    const queued = api.calculate({ input: "2+2" });
    const rejected = assert.rejects(queued, /timed out/);
    const timeout = [...timers.values()][0].callback;
    timeout();
    await rejected;
    assert(previous.terminated);
    api.startEngine((message) => statuses.push(message));
    workers[1].send({ type: "ready" });
    previous.onerror?.({});
    previous.onmessageerror?.({});
    timeout();
    previous.send({ type: "status", message: "Stale loading" });
    assert.equal(statuses.at(-1), "Ready");
    assert(!workers[1].terminated);
  },
);
console.log(JSON.stringify(results, null, 2));
if (results.some((entry) => !entry.passed)) process.exitCode = 1;
