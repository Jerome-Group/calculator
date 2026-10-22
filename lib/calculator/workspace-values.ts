import type { Definition, Settings } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown, length = 12000): value is string =>
  typeof value === "string" && value.length <= length;

export function isSettings(value: unknown): value is Settings {
  return (
    record(value) &&
    (value.angle === "rad" || value.angle === "deg") &&
    (value.domain === "real" || value.domain === "complex") &&
    typeof value.precision === "number" &&
    Number.isInteger(value.precision) &&
    value.precision >= 5 &&
    value.precision <= 200 &&
    (value.displayDecimals === undefined ||
      (typeof value.displayDecimals === "number" &&
        Number.isInteger(value.displayDecimals) &&
        value.displayDecimals >= 0 &&
        value.displayDecimals <= 30)) &&
    str(value.assumptions, 1000)
  );
}

export function isDefinition(value: unknown): value is Definition {
  return (
    record(value) &&
    str(value.id, 100) &&
    str(value.name, 24) &&
    /^[A-Za-z][A-Za-z0-9_]*$/.test(value.name) &&
    str(value.expression) &&
    (value.kind === "expression" ||
      value.kind === "matrix" ||
      value.kind === "dataset" ||
      value.kind === "function" ||
      value.kind === "object") &&
    (value.args === undefined || str(value.args, 100)) &&
    (value.updated === undefined ||
      (typeof value.updated === "number" &&
        Number.isSafeInteger(value.updated) &&
        value.updated >= 0))
  );
}
