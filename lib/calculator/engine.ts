import { uid } from "./types";
import type { Result } from "./types";
let worker: Worker | null = null;
const waiting = new Map<
  string,
  { resolve: (x: Result) => void; reject: (e: Error) => void }
>();
let onStatus = (s: string) => {};
let ready = false;
export function startEngine(listener: (s: string) => void) {
  onStatus = listener;
  if (worker) {
    listener(ready ? "Ready" : "Loading local mathematics…");
    return;
  }
  worker = new Worker("/compute-worker.js");
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") {
      ready = true;
      onStatus("Ready");
    } else if (data.type === "status") onStatus(data.message);
    else if (data.type === "fatal") {
      onStatus("Could not prepare tools. Tap Retry.");
      waiting.forEach((p) => p.reject(Error(data.message)));
      waiting.clear();
    } else if (data.type === "result") {
      waiting.get(data.id)?.resolve(data.result);
      waiting.delete(data.id);
    }
  };
  worker.onerror = () => {
    onStatus("Could not prepare tools. Tap Retry.");
    waiting.forEach((p) =>
      p.reject(Error("Computation worker failed. Retry preparation.")),
    );
    waiting.clear();
  };
}
export function calculate(request: any): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(Error("Tools are not ready"));
      return;
    }
    const id = uid();
    waiting.set(id, { resolve, reject });
    worker.postMessage({ type: "compute", id, request });
  });
}
export function cancelCalculation() {
  worker?.terminate();
  worker = null;
  ready = false;
  waiting.forEach((p) =>
    p.reject(
      Error("Calculation cancelled. Input and saved work are unchanged."),
    ),
  );
  waiting.clear();
  startEngine(onStatus);
}
