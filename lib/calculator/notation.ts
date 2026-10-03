import { parse } from "mathjs";
import { loadMathLive } from "./mathlive-loader";
import { latexStructure } from "./latex-structure";
import type {
  ConstantNode,
  FunctionNode,
  MathNode,
  OperatorNode,
  SymbolNode,
} from "mathjs";

const functions = new Set([
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "sqrt",
  "abs",
]);
const operators = new Set([
  "+",
  "-",
  "*",
  "/",
  "^",
  "!",
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "!=",
]);

function exactDecimal(spelling: string): string {
  const [mantissa, exponent = "0"] = spelling.toLowerCase().split("e");
  const [integer, fraction = ""] = mantissa.split(".");
  let digits = (integer + fraction).replace(/^0+/, "") || "0";
  let power = BigInt(exponent) - BigInt(fraction.length);
  while (digits.length > 1 && digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    power += BigInt(1);
  }
  return digits === "0" ? "0" : `${digits}e${power}`;
}

function preserveNumbers(source: string) {
  if (/\b0[xob][0-9a-f]/i.test(source))
    throw Error("Keep the exact numeric source");
  const literals = source.matchAll(
    /(?:^|[^A-Za-z0-9_])((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/g,
  );
  for (const match of literals) {
    const spelling = match[1];
    const value = Number(spelling);
    // Scientific literals stay in source form rather than changing into a product during editing.
    if (
      /[eE]/.test(spelling) ||
      !Number.isFinite(value) ||
      exactDecimal(spelling) !== exactDecimal(String(value))
    )
      throw Error("Keep the exact numeric source");
  }
}

function expression(source: string): MathNode {
  if (!source.trim() || source.length > 4000)
    throw Error("Unsupported notation");
  preserveNumbers(source);
  const node = parse(source.replaceAll("**", "^").replaceAll("π", "pi"));
  node.traverse((child) => {
    if (child.type === "FunctionNode") {
      const call = child as FunctionNode;
      if (
        call.fn.type !== "SymbolNode" ||
        !functions.has(call.fn.name) ||
        call.args.length !== 1
      )
        throw Error("Keep this function in its original notation");
    } else if (child.type === "OperatorNode") {
      if (!operators.has((child as OperatorNode).op))
        throw Error("Unsupported operator");
    } else if (child.type === "ConstantNode") {
      if (typeof (child as ConstantNode).value !== "number")
        throw Error("Keep the original value");
    } else if (child.type === "SymbolNode") {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test((child as SymbolNode).name))
        throw Error("Keep the original symbol");
    } else if (!["ParenthesisNode", "ArrayNode"].includes(child.type)) {
      throw Error("Keep this expression in its original notation");
    }
  });
  return node;
}

export function sourceToLatex(source: string): string | null {
  if (source.startsWith("latex:")) return source.slice(6);
  try {
    const equality = source.match(/^([^=<>!]+)=([^=]+)$/);
    if (equality)
      return `${expression(equality[1]).toTex({ parenthesis: "all", implicit: "show" })}=${expression(equality[2]).toTex({ parenthesis: "all", implicit: "show" })}`;
    return expression(source).toTex({ parenthesis: "all", implicit: "show" });
  } catch {
    return null;
  }
}

export function matrixRowsToLatex(rows: string[][]): string | null {
  const cells = rows.map((row) => row.map(sourceToLatex));
  if (!cells.every((row) => row.every((cell) => cell !== null))) return null;
  return (
    "\\begin{pmatrix}" +
    cells.map((row) => row.join("&")).join("\\\\") +
    "\\end{pmatrix}"
  );
}

function canonical(node: MathNode): unknown {
  if (node.type === "ParenthesisNode")
    return canonical((node as MathNode & { content: MathNode }).content);
  if (node.type === "FunctionNode") {
    const call = node as FunctionNode;
    return [
      "function",
      call.fn.name === "ln" ? "log" : call.fn.name,
      call.args.map(canonical),
    ];
  }
  if (node.type === "OperatorNode") {
    const operation = node as OperatorNode;
    return ["operator", operation.op, operation.args.map(canonical)];
  }
  if (node.type === "SymbolNode") return ["symbol", (node as SymbolNode).name];
  if (node.type === "ConstantNode")
    return ["constant", (node as ConstantNode).value];
  throw Error("Keep the original structured expression");
}

function sourceStructure(source: string): unknown {
  const equality = source.match(/^([^=<>!]+)=([^=]+)$/);
  return equality
    ? [
        "equality",
        ...equality.slice(1).map((part) => canonical(expression(part))),
      ]
    : canonical(expression(source));
}

export async function mathToSource(latex: string): Promise<string> {
  if (!latex.trim()) return latex;
  let original: ReturnType<typeof latexStructure>;
  try {
    original = latexStructure(latex);
  } catch {
    return "latex:" + latex;
  }
  const { convertLatexToAsciiMath, convertAsciiMathToLatex } =
    await loadMathLive();
  try {
    const source = convertLatexToAsciiMath(latex).replace(/\bln\s*\(/g, "log(");
    const equality = source.match(/^([^=<>!]+)=([^=]+)$/);
    for (const part of equality ? equality.slice(1) : [source]) {
      const node = expression(part);
      canonical(node);
      node.traverse((child, _path, parent) => {
        if (
          child.type === "SymbolNode" &&
          !(
            parent?.type === "FunctionNode" &&
            (parent as FunctionNode).fn === child
          ) &&
          !/^(?:[A-Za-z]|pi)$/.test((child as SymbolNode).name)
        )
          throw Error("Keep the original symbol binding");
        if (child.type === "OperatorNode" && (child as OperatorNode).implicit)
          throw Error("Keep implicit multiplication in its original notation");
      });
    }
    if (
      JSON.stringify(original) ===
      JSON.stringify(latexStructure(convertAsciiMathToLatex(source)))
    )
      return source;
  } catch {}
  return "latex:" + latex;
}

export async function sourceToMath(
  source: string,
): Promise<{ latex?: string; reason?: string }> {
  if (!source.trim()) return { latex: "" };
  if (source.startsWith("latex:")) return { latex: source.slice(6) };
  const latex = sourceToLatex(source);
  if (latex !== null) {
    try {
      const restored = await mathToSource(latex);
      if (
        JSON.stringify(sourceStructure(source)) ===
        JSON.stringify(sourceStructure(restored))
      )
        return { latex };
    } catch {}
  }
  return {
    reason:
      "This expression needs its original text notation. Your input is preserved.",
  };
}
