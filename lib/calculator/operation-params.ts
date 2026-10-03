import type { Definition, Operation } from "./types";

/** Split one complete integral without interpreting or evaluating its operands. */
export function integralShortcutParams(
  source: string,
): Record<string, string> | null {
  if (!source.startsWith("latex:") || source.length > 8006) return null;
  const text = source.slice(6).trim();
  if (!/^\\int(?![A-Za-z])/.test(text)) return null;
  let cursor = 4;
  const skip = () => {
    while (/\s/.test(text[cursor] || "") && cursor < text.length) cursor++;
  };
  const atom = (): string | null => {
    skip();
    const start = cursor;
    if (text[cursor] === "{") {
      let depth = 0;
      while (cursor < text.length) {
        const char = text[cursor++];
        if (char === "\\") {
          cursor += text.slice(cursor).match(/^[A-Za-z]+|^./)?.[0].length || 0;
          continue;
        }
        if (char === "{" && ++depth > 64) return null;
        if (char === "}" && --depth === 0)
          return text.slice(start + 1, cursor - 1).trim() || null;
      }
      return null;
    }
    const token = text.slice(cursor).match(/^(?:\\[A-Za-z]+|[A-Za-z0-9])/);
    if (!token) return null;
    cursor += token[0].length;
    return token[0];
  };
  const bounds: Record<string, string> = {};
  skip();
  while (["_", "^"].includes(text[cursor])) {
    const key = text[cursor++] === "_" ? "lower" : "upper";
    if (Object.hasOwn(bounds, key)) return null;
    const value = atom();
    if (value === null) return null;
    bounds[key] = "latex:" + value;
    skip();
  }
  if (Object.keys(bounds).length === 1) return null;
  const tail = text.slice(cursor);
  const differential = tail.match(
    /(?:\\mathrm\s*\{\s*d\s*([A-Za-z]|\\[A-Za-z]+)\s*\}|\\mathrm\s*\{\s*d\s*\}\s*([A-Za-z]|\\[A-Za-z]+)|d\s*([A-Za-z]|\\[A-Za-z]+))\s*$/,
  );
  if (!differential || differential.index === undefined) return null;
  const variable = differential[1] || differential[2] || differential[3];
  // Only this command has a verified engine Symbol/variable round-trip.
  // Other control sequences stay intact instead of becoming guessed names.
  if (variable.startsWith("\\") && variable !== "\\theta") return null;
  const body = tail
    .slice(0, differential.index)
    .replace(/(?:\s|\\[,;! ]|\\quad|\\qquad)+$/g, "")
    .trim();
  if (!body || /\\(?:i?i?int|oint|placeholder)(?![A-Za-z])/.test(body))
    return null;
  if (/[+\-*/=,_^]$/.test(body) || /\{\s*\}/.test(body)) return null;
  // A missing macro operand is not a complete integral. Keep unsupported
  // argument forms in the original editor rather than guessing their extent.
  const requiredArguments = /\\(frac|dfrac|tfrac|sqrt)(?![A-Za-z])/g;
  for (const match of body.matchAll(requiredArguments)) {
    let next = match.index + match[0].length;
    for (
      let argument = 0;
      argument < (match[1] === "sqrt" ? 1 : 2);
      argument++
    ) {
      while (/\s/.test(body[next] || "") && next < body.length) next++;
      if (body[next] === "{") {
        let depth = 1;
        for (next++; next < body.length && depth; next++) {
          if (body[next] === "\\")
            next +=
              body.slice(next + 1).match(/^[A-Za-z]+|^./)?.[0].length || 0;
          else if (body[next] === "{") depth++;
          else if (body[next] === "}") depth--;
        }
        if (depth) return null;
      } else {
        const token = body.slice(next).match(/^(?:\\[A-Za-z]+|[A-Za-z0-9])/);
        if (!token || /^\\(?:frac|dfrac|tfrac|sqrt)$/.test(token[0]))
          return null;
        next += token[0].length;
      }
    }
  }
  for (const operand of [
    body,
    ...Object.values(bounds).map((value) => value.slice(6)),
  ]) {
    const stack: string[] = [];
    for (let i = 0; i < operand.length; i++) {
      const char = operand[i];
      if (char === "\\") {
        i += operand.slice(i + 1).match(/^[A-Za-z]+|^./)?.[0].length || 0;
        continue;
      }
      if ("{([".includes(char)) {
        stack.push("})]"["{([".indexOf(char)]);
        if (stack.length > 64) return null;
      } else if ("})]".includes(char) && stack.pop() !== char) return null;
    }
    if (stack.length) return null;
  }
  return {
    expression: "latex:" + body,
    variable: variable.startsWith("\\") ? "latex:" + variable : variable,
    lower: bounds.lower || "",
    upper: bounds.upper || "",
  };
}

export function initialOperationParams(
  operation: Operation,
  source?: string,
  definitions: Definition[] = [],
  selectedObjectId?: string,
  shortcut = false,
): Record<string, string> {
  const params = Object.fromEntries(
    operation.fields.map((field) => [field.key, field.value]),
  );
  if (source && Object.hasOwn(params, "expression")) {
    params.expression = source;
    if (shortcut && operation.id === "integrate")
      Object.assign(params, integralShortcutParams(source));
  } else if (source && operation.id === "describe") {
    const dataset = definitions.find(
      (definition) =>
        definition.name === source && definition.kind === "dataset",
    );
    params.data = dataset?.expression ?? source;
  } else if (!source && operation.id.startsWith("matrix_")) {
    const matrix = definitions.find(
      (definition) =>
        definition.id === selectedObjectId && definition.kind === "matrix",
    );
    if (matrix && Object.hasOwn(params, "expression"))
      params.expression = matrix.name;
  }
  return params;
}
