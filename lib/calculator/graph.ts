import { all, create } from "mathjs";
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
  return node.compile();
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
  if (g.type === "data") return { f: () => NaN, second: () => NaN };
  if (g.radians) scope = { ...scope, ...trig(false) };
  let ex = g.expression;
  if (g.type === "implicit" && ex.includes("=") && !/[<>]/.test(ex)) {
    const p = ex.split("=");
    if (p.length !== 2) throw Error("Use one equality");
    ex = `(${p[0]})-(${p[1]})`;
  }
  const c = compileMath(ex),
    d = g.type === "parametric" ? compileMath(g.second) : null;
  return {
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
