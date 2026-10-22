import { all, create } from "mathjs";
import type { ParenthesisNode, FunctionNode } from "mathjs";
import {
  installGraphResourceGuards,
  graphEvaluation,
  GraphResourceError,
} from "./graph-resources";
import type { GraphSpec, Definition, Settings } from "./types";
const math = create(all, { number: "number" }),
  forbidden = new Set([
    "import",
    "evaluate",
    "parse",
    "compile",
    "createUnit",
    "simplify",
    "derivative",
    "resolve",
    "reviver",
    "chain",
    "help",
    "random",
    "randomInt",
  ]);
installGraphResourceGuards(math);

export function compileMath(source: string) {
  if (source.length > 4000) throw Error("Graph expression is too long.");
  const node = math.parse(source.replaceAll("**", "^").replaceAll("π", "pi"));
  node.traverse((n: any) => {
    if (
      [
        "AssignmentNode",
        "FunctionAssignmentNode",
        "BlockNode",
        "AccessorNode",
        "IndexNode",
      ].includes(n.type) ||
      (n.isFunctionNode && forbidden.has(n.fn.name))
    )
      throw Error("Use a mathematical expression without assignments.");
  });
  const compiled = node.compile();
  return {
    evaluate: (scope: Record<string, unknown>) =>
      graphEvaluation(() => compiled.evaluate(scope)),
  };
}
const trig = (degree: boolean) => {
  const u = degree ? Math.PI / 180 : 1;
  return {
    sin: (x: number) => Math.sin(x * u),
    cos: (x: number) => Math.cos(x * u),
    tan: (x: number) => Math.tan(x * u),
    sec: (x: number) => 1 / Math.cos(x * u),
    csc: (x: number) => 1 / Math.sin(x * u),
    cot: (x: number) => 1 / Math.tan(x * u),
    asin: (x: number) => Math.asin(x) / u,
    acos: (x: number) => Math.acos(x) / u,
    atan: (x: number) => Math.atan(x) / u,
    atan2: (y: number, x: number) => Math.atan2(y, x) / u,
    asec: (x: number) => Math.acos(1 / x) / u,
    acsc: (x: number) => Math.asin(1 / x) / u,
    acot: (x: number) => (x === 0 ? Math.PI / 2 : Math.atan(1 / x)) / u,
  };
};
export function graphScope(defs: Definition[], settings: Settings, a: number) {
  const scope: Record<string, any> = {
      a,
      pi: Math.PI,
      e: Math.E,
      E: Math.E,
      ...trig(settings.angle === "deg"),
    },
    done = new Set<string>(),
    active = new Set<string>();
  const build = (d: Definition) => {
    if (done.has(d.name)) return;
    if (active.has(d.name)) throw Error("Circular definition");
    active.add(d.name);
    const args = (d.args || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    defs
      .filter(
        (x) =>
          x.id !== d.id &&
          !args.includes(x.name) &&
          new RegExp("\\b" + x.name + "\\b").test(d.expression),
      )
      .forEach(build);
    const c = compileMath(d.expression);
    scope[d.name] = args.length
      ? (...v: number[]) =>
          c.evaluate({
            ...scope,
            ...Object.fromEntries(args.map((n, i) => [n, v[i]])),
          })
      : c.evaluate(scope);
    active.delete(d.name);
    done.add(d.name);
  };
  defs.forEach((d) => {
    try {
      build(d);
    } catch {}
  });
  scope.a = a;
  return scope;
}
export function numeric(code: any, scope: any) {
  try {
    const y = code.evaluate(scope);
    return typeof y === "number" && Number.isFinite(y)
      ? y
      : typeof y === "boolean"
        ? Number(y)
        : NaN;
  } catch {
    return NaN;
  }
}
export function graphFunctions(g: GraphSpec, scope: any) {
  if (g.type === "data")
    return { f: () => NaN, second: () => NaN, warning: "" };
  if (g.radians) scope = { ...scope, ...trig(false) };
  let ex = g.expression;
  if (g.type === "implicit" && ex.includes("=") && !/[<>]/.test(ex)) {
    const p = ex.split("=");
    if (p.length !== 2) throw Error("Use one equality");
    ex = `(${p[0]})-(${p[1]})`;
  }
  let root = math.parse(ex.replaceAll("**", "^").replaceAll("π", "pi"));
  while (root.type === "ParenthesisNode")
    root = (root as ParenthesisNode).content;
  if (
    ["ArrayNode", "RangeNode"].includes(root.type) ||
    (root.type === "FunctionNode" &&
      ["ones", "zeros", "identity", "range", "matrix", "sparse"].includes(
        (root as FunctionNode).fn.name,
      ) &&
      !Object.hasOwn(scope, (root as FunctionNode).fn.name))
  )
    throw Error(
      "Graph expressions must return scalar values. Use a matrix reducer such as sum or det.",
    );
  const c = compileMath(ex),
    d = g.type === "parametric" ? compileMath(g.second) : null;
  let warning = "";
  try {
    const sampleScope = { ...scope, x: 0, y: 0, t: 0, theta: 0, n: 0 };
    c.evaluate(sampleScope);
    d?.evaluate(sampleScope);
  } catch (error) {
    if (error instanceof GraphResourceError) throw error;
    if (
      error instanceof Error &&
      /^Undefined (symbol|function) /.test(error.message)
    )
      warning = String(error);
  }
  return {
    warning,
    f: (x: number, y = 0) =>
      numeric(c, { ...scope, x, y, t: x, theta: x, n: x }),
    second: (x: number) => (d ? numeric(d, { ...scope, x, t: x }) : 0),
  };
}
export function finiteSegment(a: number, m: number, b: number, span: number) {
  return (
    [a, m, b].every(Number.isFinite) &&
    Math.abs(b - a) < span * 1.5 &&
    Math.abs(m - (a + b) / 2) < span * 0.18
  );
}

function sampleInterval(lo: number, hi: number, fraction: number) {
  if (fraction === 0) return lo;
  if (fraction === 1) return hi;
  const span = hi - lo;
  return Number.isFinite(span)
    ? lo + span * fraction
    : lo * (1 - fraction) + hi * fraction;
}

export function graphParameterSamples(
  graph: GraphSpec,
  { f, second }: Pick<ReturnType<typeof graphFunctions>, "f" | "second">,
  scope: Record<string, unknown>,
  settings: Settings,
  intervals: 10 | 1000,
) {
  if (graph.type !== "parametric" && graph.type !== "polar") return [];
  let lo = NaN,
    hi = NaN;
  try {
    lo = numeric(compileMath(graph.min), scope);
    hi = numeric(compileMath(graph.max), scope);
  } catch {}
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return [];
  const angleUnit =
    settings.angle === "deg" && !graph.radians ? Math.PI / 180 : 1;
  return Array.from({ length: intervals + 1 }, (_, i) => {
    const parameter = sampleInterval(lo, hi, i / intervals),
      value = f(parameter),
      angle = parameter * angleUnit;
    return {
      parameter,
      value,
      x: graph.type === "polar" ? value * Math.cos(angle) : value,
      y: graph.type === "polar" ? value * Math.sin(angle) : second(parameter),
    };
  });
}

export const MAX_GRAPHS = 100;
export function drawableGraphRange(range: number[]): boolean {
  return (
    range.length === 4 &&
    range.every(Number.isFinite) &&
    [range[1] - range[0], range[3] - range[2]].every(
      (span) => Number.isFinite(span) && span > 0,
    )
  );
}
function graphRange(
  left: number,
  right: number,
  bottom: number,
  top: number,
): number[] | null {
  if (!Number.isFinite(left)) return null;
  const xp = Math.max(
    0.1,
    (right - left) * 0.1,
    Math.max(Math.abs(left), Math.abs(right)) * Number.EPSILON * 8,
  );
  const yp = Math.max(
    0.1,
    (top - bottom) * 0.1,
    Math.max(Math.abs(bottom), Math.abs(top)) * Number.EPSILON * 8,
  );
  const range = [left - xp, right + xp, bottom - yp, top + yp];
  if (!drawableGraphRange(range))
    throw Error("Graph coordinates exceed the drawable range.");
  return range;
}
export function graphFitRange(
  prepared: ({ g: GraphSpec } & Pick<
    ReturnType<typeof graphFunctions>,
    "f" | "second"
  >)[],
  scope: Record<string, unknown>,
  settings: Settings,
): { range: number[] | null; warning: string } {
  let left = Infinity,
    right = -Infinity,
    bottom = Infinity,
    top = -Infinity,
    unsupported = false,
    empty = false;
  for (const { g, f, second } of prepared) {
    if (!g.visible) continue;
    let count = 0;
    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      count++;
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
    };
    switch (g.type) {
      case "cartesian":
        for (let i = 0; i <= 120; i++) {
          const x = -6 + i / 10;
          include(x, f(x));
        }
        break;
      case "sequence":
        for (let n = -6; n <= 6; n++) include(n, f(n));
        break;
      case "data":
        for (const [x, y] of g.points || []) include(x, y);
        break;
      case "parametric":
      case "polar":
        for (const { x, y } of graphParameterSamples(
          g,
          { f, second },
          scope,
          settings,
          1000,
        ))
          include(x, y);
        break;
      case "implicit":
      case "inequality":
      case "surface":
      case "field":
        unsupported = true;
        continue;
      default: {
        const exhaustive: never = g.type;
        return exhaustive;
      }
    }
    if (!count) empty = true;
  }
  const range = graphRange(left, right, bottom, top),
    warnings = [];
  if (unsupported)
    warnings.push(
      "Fit supports Cartesian, parametric, polar, sequence and data curves. Use pan and zoom for other graph types.",
    );
  if (empty)
    warnings.push(
      "Some visible curves have no finite points to fit. Check their expressions and parameter bounds.",
    );
  if (!range && !warnings.length)
    warnings.push("Show a graph with finite points before using Fit.");
  return { range, warning: warnings.join(" ") };
}
export function graphTable(
  graph: GraphSpec,
  functions: ReturnType<typeof graphFunctions>,
  scope: Record<string, unknown>,
  settings: Settings,
  lower: number,
  upper: number,
): { headers: string[]; rows: { cells: number[]; reuse: number[] }[] } {
  const { f, second } = functions;
  const result: ReturnType<typeof graphTable> = { headers: [], rows: [] };
  if (graph.type === "data") {
    result.headers = ["x", "y"];
    const points = graph.points || [];
    result.rows = Array.from(
      { length: Math.min(11, points.length) },
      (_, i) => {
        const p =
          points[
            Math.floor(
              (i * Math.max(0, points.length - 1)) /
                Math.max(1, Math.min(11, points.length) - 1),
            )
          ];
        return { cells: [...p], reuse: [...p] };
      },
    );
    return result;
  }
  if (graph.type === "parametric" || graph.type === "polar") {
    result.headers =
      graph.type === "polar" ? ["θ", "r", "x", "y"] : ["t", "x", "y"];
    result.rows = graphParameterSamples(
      graph,
      { f, second },
      scope,
      settings,
      10,
    ).map(({ parameter, value, x, y }) => ({
      cells:
        graph.type === "polar" ? [parameter, value, x, y] : [parameter, x, y],
      reuse: [x, y],
    }));
    return result;
  }
  const lo = lower,
    hi = upper;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return result;
  const sample = (i: number) => sampleInterval(lo, hi, i / 10);
  if (["implicit", "inequality", "surface", "field"].includes(graph.type)) {
    result.headers = [
      "x",
      "y",
      graph.type === "surface"
        ? "z"
        : graph.type === "field"
          ? "dy/dx"
          : graph.type === "inequality"
            ? "condition (1=true)"
            : "relation residual",
    ];
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++) {
        const x = sample(i),
          y = sample(j),
          value = f(x, y);
        result.rows.push({ cells: [x, y, value], reuse: [x, y, value] });
      }
  } else if (graph.type === "sequence") {
    result.headers = ["n", "value"];
    const count = Math.min(
      101,
      Math.max(0, Math.floor(hi) - Math.ceil(lo) + 1),
    );
    result.rows = Array.from({ length: count }, (_, i) => {
      const n = Math.ceil(lo) + i,
        value = f(n);
      return { cells: [n, value], reuse: [n, value] };
    });
  } else {
    result.headers = ["x", "y"];
    result.rows = Array.from({ length: 11 }, (_, i) => {
      const t = sample(i),
        value = f(t);
      return { cells: [t, value], reuse: [t, value] };
    });
  }
  return result;
}
