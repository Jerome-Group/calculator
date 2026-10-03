import { uid } from "./types";
import type { Result } from "./types";
import { validateResult } from "./result-validation";

const PREPARATION_TIMEOUT = 120000;
let worker: Worker | null = null;
let preparationTimer: ReturnType<typeof setTimeout> | null = null;
const waiting = new Map<
  string,
  {
    resolve: (x: Result) => void;
    reject: (e: Error) => void;
    operation?: string;
  }
>();
let onStatus: (s: string) => void = () => {};
let ready = false;

function clearPreparationTimer() {
  if (preparationTimer !== null) clearTimeout(preparationTimer);
  preparationTimer = null;
}
function stopWorker(error: Error) {
  const previous = worker;
  worker = null;
  ready = false;
  clearPreparationTimer();
  previous?.terminate();
  for (const pending of waiting.values()) pending.reject(error);
  waiting.clear();
}
function failWorker(current: Worker, error: Error) {
  if (worker !== current) return;
  stopWorker(error);
  onStatus("Could not prepare tools. Tap Retry.");
}
export function startEngine(listener: (s: string) => void) {
  onStatus = listener;
  listener(ready ? "Ready" : "Loading local mathematics…");
  if (worker) return;
  let current: Worker;
  try {
    current = new Worker("/compute-worker.js");
  } catch {
    ready = false;
    listener("Could not prepare tools. Tap Retry.");
    return;
  }
  worker = current;
  preparationTimer = setTimeout(
    () =>
      failWorker(current, Error("Preparation timed out. Retry preparation.")),
    PREPARATION_TIMEOUT,
  );
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (!data || typeof data !== "object") {
      failWorker(current, Error("Computation worker sent an invalid message."));
      return;
    }
    if (data.type === "ready") {
      clearPreparationTimer();
      ready = true;
      onStatus("Ready");
    } else if (data.type === "status") {
      if (!ready && typeof data.message === "string") onStatus(data.message);
    } else if (data.type === "fatal") {
      failWorker(
        current,
        Error("Computation worker failed. Retry preparation."),
      );
    } else if (data.type === "result" && typeof data.id === "string") {
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
    const current = worker;
    if (!current) {
      reject(Error("Tools are not ready. Retry preparation."));
      return;
    }
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
