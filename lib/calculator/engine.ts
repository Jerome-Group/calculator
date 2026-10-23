import { uid } from "./types";
import type { Result } from "./types";
import { validateResult } from "./result-validation";
import { engineBuild, engineRoot } from "./engine-build";

const PREPARATION_TIMEOUT = 120000;
type EngineState =
  | { kind: "stopped" }
  | { kind: "preparing"; worker: Worker; timer: ReturnType<typeof setTimeout> }
  | { kind: "ready"; worker: Worker };
let state: EngineState = { kind: "stopped" };
const waiting = new Map<
  string,
  {
    resolve: (x: Result) => void;
    reject: (e: Error) => void;
    operation?: string;
  }
>();
let onStatus: (s: string) => void = () => {};
function stopWorker(error: Error) {
  const previous = state;
  state = { kind: "stopped" };
  if (previous.kind === "preparing") clearTimeout(previous.timer);
  if (previous.kind !== "stopped") previous.worker.terminate();
  for (const pending of waiting.values()) pending.reject(error);
  waiting.clear();
}
function failWorker(current: Worker, error: Error) {
  if (state.kind === "stopped" || state.worker !== current) return;
  stopWorker(error);
  onStatus("Could not prepare tools. Tap Retry.");
}
export function startEngine(listener: (s: string) => void) {
  onStatus = listener;
  listener(state.kind === "ready" ? "Ready" : "Loading local mathematics…");
  if (state.kind !== "stopped") return;
  let current: Worker;
  try {
    current = new Worker(engineRoot + "compute-worker.js");
  } catch {
    listener("Could not prepare tools. Tap Retry.");
    return;
  }
  const timer = setTimeout(
    () =>
      failWorker(current, Error("Preparation timed out. Retry preparation.")),
    PREPARATION_TIMEOUT,
  );
  state = { kind: "preparing", worker: current, timer };
  current.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (state.kind === "stopped" || state.worker !== current) return;
    if (!data || typeof data !== "object" || !("type" in data)) {
      failWorker(current, Error("Computation worker sent an invalid message."));
      return;
    }
    if (data.type === "ready") {
      if (
        !("protocol" in data) ||
        data.protocol !== engineBuild.protocol ||
        !("engineId" in data) ||
        data.engineId !== engineBuild.id
      ) {
        failWorker(
          current,
          Error("Computation worker identity differs. Retry preparation."),
        );
        return;
      }
      if (state.kind === "preparing") clearTimeout(state.timer);
      state = { kind: "ready", worker: current };
      onStatus("Ready");
    } else if (data.type === "status") {
      if (state.kind === "preparing") {
        if ("stage" in data && data.stage === "runtime")
          onStatus("Loading local mathematics…");
        else if ("stage" in data && data.stage === "packages")
          onStatus("Preparing symbolic and numerical tools…");
      }
    } else if (data.type === "fatal") {
      failWorker(
        current,
        Error("Computation worker failed. Retry preparation."),
      );
    } else if (
      data.type === "result" &&
      "id" in data &&
      typeof data.id === "string" &&
      "result" in data
    ) {
      if (state.kind !== "ready") return;
      const pending = waiting.get(data.id);
      if (!pending) return;
      waiting.delete(data.id);
      try {
        pending.resolve(validateResult(data.result, pending.operation));
      } catch {
        pending.reject(
          Error("Invalid mathematical result data. Retry calculation."),
        );
      }
    }
  };
  current.onerror = () =>
    failWorker(current, Error("Computation worker failed. Retry preparation."));
  current.onmessageerror = () =>
    failWorker(
      current,
      Error("Computation worker message could not be read. Retry preparation."),
    );
}
export function calculate(request: unknown): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (state.kind !== "ready") {
      reject(Error("Tools are not ready. Retry preparation."));
      return;
    }
    const current = state.worker;
    const id = uid();
    const operation =
      request &&
      typeof request === "object" &&
      "operation" in request &&
      typeof request.operation === "string"
        ? request.operation
        : undefined;
    waiting.set(id, { resolve, reject, operation });
    try {
      current.postMessage({ type: "compute", id, request });
    } catch (error) {
      waiting.delete(id);
      reject(
        error instanceof Error ? error : Error("Could not send calculation."),
      );
    }
  });
}
export function cancelCalculation() {
  stopWorker(
    Error("Calculation cancelled. Input and saved work are unchanged."),
  );
  startEngine(onStatus);
}
