import type { Result } from "./types";

type RecordValue = Record<string, unknown>;
type Budget = { remaining: number; ancestors: Set<object> };
const MAX_DEPTH = 48;
const MAX_VALUES = 200000;
const MAX_STRING = 100000;
const STATUSES = new Set([
  "exact",
  "numeric",
  "unresolved",
  "conditional",
  "divergent",
  "error",
]);

function invalid(): never {
  throw Error("Invalid mathematical result data.");
}
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown, limit = MAX_STRING): value is string {
  return typeof value === "string" && value.length <= limit;
}
function finiteNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isFinite);
}
function validateJson(value: unknown, budget: Budget, depth = 0): void {
  if (depth > MAX_DEPTH || --budget.remaining < 0) invalid();
  if (value === null || typeof value === "boolean" || string(value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null) invalid();
  if (budget.ancestors.has(value)) invalid();
  budget.ancestors.add(value);
  if (Array.isArray(value)) {
    if (value.length > budget.remaining) invalid();
    for (const item of value) validateJson(item, budget, depth + 1);
  } else {
    if (Object.prototype.toString.call(value) !== "[object Object]") invalid();
    for (const [key, item] of Object.entries(value)) {
      if (!string(key)) invalid();
      if (item !== undefined) validateJson(item, budget, depth + 1);
    }
  }
  budget.ancestors.delete(value);
}
function validateDisplay(value: unknown): void {
  if (!record(value)) invalid();
  switch (value.type) {
    case "math":
      if (!string(value.latex, 50000)) invalid();
      if (value.text !== undefined && !string(value.text)) invalid();
      return;
    case "text":
      if (!string(value.text)) invalid();
      return;
    case "fields":
      if (!Array.isArray(value.items)) invalid();
      for (const item of value.items) {
        if (!record(item) || !string(item.label)) invalid();
        validateDisplay(item.value);
      }
      return;
    case "list":
      if (!Array.isArray(value.items)) invalid();
      for (const item of value.items) validateDisplay(item);
      return;
    case "table":
      if (
        !Array.isArray(value.headers) ||
        !value.headers.every((header) => string(header)) ||
        !Array.isArray(value.rows)
      )
        invalid();
      for (const row of value.rows) {
        if (!Array.isArray(row) || row.length !== value.headers.length)
          invalid();
        for (const cell of row) validateDisplay(cell);
      }
      return;
    default:
      invalid();
  }
}
function validatePlot(details: unknown, operation?: string): void {
  if (
    !operation ||
    !["histogram", "boxplot", "poisson", "ivp", "bvp"].includes(operation)
  )
    return;
  if (!record(details)) invalid();
  if (operation === "histogram") {
    const counts = details.counts;
    const lower = details["bin lower bounds"];
    const upper = details["bin upper bounds"];
    if (
      !finiteNumbers(counts) ||
      !counts.length ||
      counts.length > 100 ||
      !counts.every((count) => Number.isSafeInteger(count) && count >= 0) ||
      !finiteNumbers(lower) ||
      lower.length !== counts.length ||
      (upper !== undefined &&
        (!finiteNumbers(upper) || upper.length !== counts.length))
    )
      invalid();
  } else if (operation === "boxplot") {
    for (const key of [
      "minimum",
      "lower whisker",
      "Q1",
      "median",
      "Q3",
      "upper whisker",
      "maximum",
    ])
      if (!Number.isFinite(details[key])) invalid();
    if (details.outliers !== undefined && !finiteNumbers(details.outliers))
      invalid();
  } else if (operation === "poisson") {
    const grid = details["interior solution"];
    if (
      !Array.isArray(grid) ||
      !grid.length ||
      grid.length > 35 ||
      !grid.every((row) => finiteNumbers(row) && row.length === grid.length)
    )
      invalid();
  } else {
    const times = details.t;
    const values = details.values;
    if (
      !finiteNumbers(times) ||
      !times.length ||
      !Array.isArray(values) ||
      !values.length ||
      !values.every((row) => finiteNumbers(row) && row.length === times.length)
    )
      invalid();
  }
}

export function validateResult(value: unknown, operation?: string): Result {
  if (
    !record(value) ||
    typeof value.status !== "string" ||
    !STATUSES.has(value.status) ||
    !string(value.text) ||
    !string(value.latex, 50000) ||
    !Array.isArray(value.notes) ||
    !value.notes.every((note) => string(note, 5000))
  )
    invalid();
  validateJson(value, { remaining: MAX_VALUES, ancestors: new Set() });
  for (const key of ["approx", "inputLatex", "reusable"])
    if (value[key] !== undefined && value[key] !== null && !string(value[key]))
      invalid();
  for (const key of ["display", "detailDisplay"])
    if (value[key] !== undefined && value[key] !== null)
      validateDisplay(value[key]);
  if (value.detailSources !== undefined && value.detailSources !== null) {
    if (
      !record(value.detailSources) ||
      !Object.values(value.detailSources).every((source) => string(source))
    )
      invalid();
  }
  if (value.details !== undefined && value.details !== null)
    validatePlot(value.details, operation);
  return value as Result;
}
