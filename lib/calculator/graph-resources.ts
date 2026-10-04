import type { MathJsInstance } from "mathjs";

type Callable = ((...args: unknown[]) => unknown) & {
  transform?: (...args: unknown[]) => unknown;
};
export const MAX_GRAPH_ELEMENTS = 10000;
export class GraphResourceError extends Error {
  constructor(
    message = "Graph matrix and range allocations are limited to 10,000 elements per evaluation.",
  ) {
    super(message);
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
function shape(value: unknown): number[] {
  if (
    value &&
    typeof value === "object" &&
    "size" in value &&
    typeof value.size === "function"
  )
    return value.size();
  const sizes: number[] = [];
  while (Array.isArray(value)) {
    if (sizes.length >= 48) throw new GraphResourceError();
    sizes.push(value.length);
    value = value[0];
  }
  return sizes;
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
  const isPrime = math.isPrime as unknown as Callable;
  const checkPrimeInput = (value: unknown) => {
    if (
      ((typeof value === "number" || typeof value === "string") &&
        !Number.isFinite(Number(value))) ||
      (value &&
        typeof value === "object" &&
        "isFinite" in value &&
        typeof value.isFinite === "function" &&
        !value.isFinite())
    )
      throw new GraphResourceError("Graph primality inputs must be finite.");
  };
  math.import(
    {
      isPrime: (...args: unknown[]) => {
        const input = args[0];
        if (Array.isArray(input) || math.isMatrix(input))
          math.forEach(input, checkPrimeInput);
        else checkPrimeInput(input);
        return isPrime(...args);
      },
    },
    { override: true },
  );
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
  for (const name of [
    "add",
    "subtract",
    "dotMultiply",
    "dotDivide",
    "dotPow",
    "mod",
    "equal",
    "unequal",
    "smaller",
    "smallerEq",
    "larger",
    "largerEq",
    "and",
    "or",
    "xor",
  ] as const) {
    const original = math[name] as unknown as Callable;
    math.import(
      {
        [name]: (...args: unknown[]) => {
          let output = shape(args[0]);
          for (const value of args.slice(1)) {
            const next = shape(value);
            const rank = Math.max(output.length, next.length);
            const a = [...Array(rank - output.length).fill(1), ...output];
            const b = [...Array(rank - next.length).fill(1), ...next];
            // Let the original typed function diagnose incompatible dimensions.
            if (a.some((size, i) => size !== b[i] && size !== 1 && b[i] !== 1))
              return original(...args);
            output = a.map((size, i) => (size === 1 ? b[i] : size));
            if (output.length) reserve(dimensions(output));
          }
          return original(...args);
        },
      },
      { override: true },
    );
  }
  for (const name of ["kron", "diag", "concat", "subset"] as const) {
    const original = math[name] as unknown as Callable;
    const transform = (
      math.expression as unknown as { transform: Record<string, Callable> }
    ).transform[name];
    const count = (args: unknown[], transformed: boolean) => {
      const first =
        name === "subset" && typeof args[0] === "string"
          ? [args[0].length]
          : shape(args[0]);
      if (name === "kron") {
        const second = shape(args[1]);
        if (!first.length || !second.length) return;
        const rank = Math.max(first.length, second.length);
        const a = [...Array(rank - first.length).fill(1), ...first];
        const b = [...Array(rank - second.length).fill(1), ...second];
        reserve(dimensions(a.map((size, i) => size * b[i])));
      } else if (name === "diag" && first.length === 1) {
        const offset = typeof args[1] === "string" ? 0 : number(args[1] ?? 0);
        reserve(
          dimensions([
            first[0] + Math.max(0, -offset),
            first[0] + Math.max(0, offset),
          ]),
        );
      } else if (
        name === "concat" &&
        args.every((arg) => typeof arg === "string")
      ) {
        reserve(
          args.reduce<number>(
            (length, arg) => length + (arg as string).length,
            0,
          ),
        );
      } else if (name === "concat" && first.length) {
        const last = args.at(-1);
        const explicit =
          typeof last === "number" ||
          (last && typeof last === "object" && "toNumber" in last);
        const axis = explicit
          ? number(last) - (transformed ? 1 : 0)
          : first.length - 1;
        if (!Number.isInteger(axis) || axis < 0 || axis >= first.length) return;
        const output = [...first];
        for (const operand of args.slice(1, explicit ? -1 : undefined)) {
          const next = shape(operand);
          if (next.length !== first.length) return;
          output[axis] += next[axis];
        }
        reserve(dimensions(output));
      } else if (name === "subset" && first.length) {
        const index = args[1] as {
          size?: () => number[];
          max?: () => number[];
        } | null;
        if (
          typeof index?.size !== "function" ||
          typeof index?.max !== "function"
        )
          return;
        // Replacement may extend a tiny input to a very distant index.
        const output =
          args.length >= 3
            ? index.max().map((value, i) => Math.max(first[i] ?? 0, value + 1))
            : index.size();
        reserve(dimensions(output));
      }
    };
    const guarded: Callable = (...args) => {
      count(args, false);
      return original(...args);
    };
    if (transform)
      guarded.transform = (...args) => {
        count(args, true);
        return transform(...args);
      };
    math.import({ [name]: guarded }, { override: true });
  }
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
