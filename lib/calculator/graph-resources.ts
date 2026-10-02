import type { MathJsInstance } from "mathjs";

type Callable = ((...args: unknown[]) => unknown) & {
  transform?: (...args: unknown[]) => unknown;
};
export const MAX_GRAPH_ELEMENTS = 10000;
export class GraphResourceError extends Error {
  constructor() {
    super(
      "Graph matrix and range allocations are limited to 10,000 elements per evaluation.",
    );
  }
}
let remaining: number | null = null;
function reserve(count: number) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_GRAPH_ELEMENTS ||
    (remaining !== null && count > remaining)
  )
    throw new GraphResourceError();
  if (remaining !== null) remaining -= count;
}
function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  )
    return value.toNumber();
  return NaN;
}
function dimensions(args: unknown[], square = false): number {
  let sizes = [...args];
  if (typeof sizes.at(-1) === "string") sizes.pop();
  if (
    sizes.length === 1 &&
    sizes[0] &&
    typeof sizes[0] === "object" &&
    "toArray" in sizes[0] &&
    typeof sizes[0].toArray === "function"
  )
    sizes = sizes[0].toArray();
  if (sizes.length === 1 && Array.isArray(sizes[0])) sizes = sizes[0];
  if (square && sizes.length === 1) sizes = [sizes[0], sizes[0]];
  if (sizes.length > 48) throw new GraphResourceError();
  let count = sizes.length ? 1 : 0;
  let containers = 0;
  for (const [index, size] of sizes.entries()) {
    const n = number(size);
    if (!Number.isSafeInteger(n) || n < 0 || n > MAX_GRAPH_ELEMENTS)
      throw new GraphResourceError();
    count *= n;
    if (index < sizes.length - 1) containers += count;
    if (count > MAX_GRAPH_ELEMENTS || containers > MAX_GRAPH_ELEMENTS)
      throw new GraphResourceError();
  }
  return Math.max(count, containers);
}
function rangeCount(
  args: unknown[],
  transformed: boolean,
  math: MathJsInstance,
): number {
  let values = [...args],
    includeEnd = transformed;
  if (typeof values.at(-1) === "boolean") includeEnd = values.pop() as boolean;
  if (typeof values[0] === "string") {
    const parts = values[0].split(":").map(Number);
    values =
      parts.length === 2
        ? [parts[0], parts[1]]
        : [parts[0], parts[2], parts[1]];
  }
  const [start, end, step = 1] = values;
  const call = (
    name:
      | "isZero"
      | "isPositive"
      | "smaller"
      | "smallerEq"
      | "larger"
      | "largerEq"
      | "add",
    ...items: unknown[]
  ) => (math[name] as unknown as Callable)(...items);
  if (call("isZero", step)) return 0;
  const comparison = call("isPositive", step)
    ? includeEnd
      ? "smallerEq"
      : "smaller"
    : includeEnd
      ? "largerEq"
      : "larger";
  let value = start,
    count = 0;
  const limit = remaining ?? MAX_GRAPH_ELEMENTS;
  // Match MathJS's endpoint tolerances; arithmetic estimates can undercount.
  // This loop counts without constructing a result array and always terminates.
  while (call(comparison, value, end)) {
    if (++count > limit) throw new GraphResourceError();
    const next = call("add", value, step);
    if (typeof next === "number" && Object.is(next, value))
      throw new GraphResourceError();
    value = next;
  }
  return count;
}
export function installGraphResourceGuards(math: MathJsInstance) {
  for (const name of ["ones", "zeros", "identity", "resize", "range"]) {
    const original = math[name as keyof MathJsInstance] as unknown as Callable;
    const transform = (
      math.expression as unknown as {
        transform: Record<string, Callable | undefined>;
      }
    ).transform[name];
    const count = (args: unknown[], transformed: boolean) =>
      name === "range"
        ? rangeCount(args, transformed, math)
        : dimensions(name === "resize" ? [args[1]] : args, name === "identity");
    const guarded: Callable = (...args: unknown[]) => {
      reserve(count(args, false));
      return original(...args);
    };
    if (transform)
      guarded.transform = (...args: unknown[]) => {
        reserve(count(args, true));
        return transform(...args);
      };
    math.import({ [name]: guarded }, { override: true });
  }
  // Bound multiplication outputs before two small matrices amplify their shape.
  const multiply = math.multiply as unknown as Callable;
  const shape = (value: unknown): number[] =>
    value &&
    typeof value === "object" &&
    "size" in value &&
    typeof value.size === "function"
      ? value.size()
      : Array.isArray(value)
        ? [value.length, ...(Array.isArray(value[0]) ? [value[0].length] : [])]
        : [];
  const outputShape = (a: number[], b: number[]): number[] =>
    !a.length
      ? b
      : !b.length
        ? a
        : a.length === 1 && b.length === 1
          ? []
          : a.length === 1 && b.length === 2
            ? [b[1]]
            : a.length === 2 && b.length === 1
              ? [a[0]]
              : a.length === 2 && b.length === 2
                ? [a[0], b[1]]
                : [];
  math.import(
    {
      multiply: (...args: unknown[]) => {
        let size = shape(args[0]);
        for (const operand of args.slice(1)) {
          size = outputShape(size, shape(operand));
          if (size.length) reserve(dimensions(size));
        }
        return multiply(...args);
      },
    },
    { override: true },
  );
}
export function graphEvaluation<T>(action: () => T): T {
  const outer = remaining === null;
  if (outer) remaining = MAX_GRAPH_ELEMENTS;
  try {
    return action();
  } finally {
    if (outer) remaining = null;
  }
}
