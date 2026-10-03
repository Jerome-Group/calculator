type Structure = string | Structure[];

const commands = new Set([
  "frac",
  "dfrac",
  "tfrac",
  "sqrt",
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "ln",
  "pi",
  "cdot",
  "times",
  "div",
  "left",
  "right",
]);

/** Compare a small TeX grammar without evaluating it or discarding bindings. */
export function latexStructure(source: string): Structure[] {
  if (source.length > 4000) throw Error("Keep the original source");
  const tokens: string[] = [];
  const token = /\\[A-Za-z]+|(?:\d+(?:\.\d*)?|\.\d+)|[A-Za-z{}()+\-*/^=!]/y;
  for (let position = 0; position < source.length; ) {
    if (/\s/.test(source[position])) {
      position++;
      continue;
    }
    token.lastIndex = position;
    const match = token.exec(source);
    if (!match) throw Error("Unsupported TeX token");
    const value = match[0];
    if (value.startsWith("\\") && !commands.has(value.slice(1)))
      throw Error("Keep the original command");
    if (
      (value === "\\left" &&
        source.slice(token.lastIndex).trimStart()[0] !== "(") ||
      (value === "\\right" &&
        source.slice(token.lastIndex).trimStart()[0] !== ")")
    )
      throw Error("Keep the original delimiter");
    if (value !== "\\left" && value !== "\\right") tokens.push(value);
    position = token.lastIndex;
  }
  let cursor = 0;
  function argument(depth: number): Structure[] {
    if (depth > 64) throw Error("Keep the original nesting");
    if (tokens[cursor] === "{") {
      cursor++;
      const result = sequence("}", depth + 1);
      if (!result.length) throw Error("Missing argument");
      return result;
    }
    const value = tokens[cursor];
    if (!value || !/^[A-Za-z0-9.]|^\\/.test(value))
      throw Error("Missing argument");
    // An unbraced TeX number consumes one token, not the whole decimal literal.
    if (/^[0-9.]/.test(value) && value.length > 1) {
      tokens[cursor] = value.slice(1);
      return [value[0]];
    }
    return [atom(depth + 1)];
  }
  function atom(depth: number): Structure {
    if (depth > 64) throw Error("Keep the original nesting");
    const value = tokens[cursor++];
    if (value === "{" || value === "(") {
      const contents = sequence(value === "{" ? "}" : ")", depth + 1);
      if (!contents.length) throw Error("Empty group");
      const single = contents[0];
      const scalar =
        typeof single === "string"
          ? /^(?:[A-Za-z]|\d+(?:\.\d*)?|\.\d+|\\pi)$/.test(single)
          : ["parentheses", "fraction", "radical"].includes(
              single[0] as string,
            );
      return value === "{" && contents.length === 1 && scalar
        ? contents[0]
        : [value === "{" ? "braces" : "parentheses", contents];
    }
    if (["\\frac", "\\dfrac", "\\tfrac"].includes(value))
      return ["fraction", argument(depth + 1), argument(depth + 1)];
    if (value === "\\sqrt") return ["radical", argument(depth + 1)];
    if (value === "^") return ["power", argument(depth + 1)];
    if (value === "\\ln") return "\\log";
    if (value === "\\cdot" || value === "\\times") return "*";
    if (value === "\\div") return "/";
    return value;
  }
  function sequence(closing: string | undefined, depth: number): Structure[] {
    const result: Structure[] = [];
    while (cursor < tokens.length && tokens[cursor] !== closing) {
      if (tokens[cursor] === "}" || tokens[cursor] === ")")
        throw Error("Mismatched group");
      result.push(atom(depth + 1));
    }
    if (closing && tokens[cursor++] !== closing) throw Error("Unclosed group");
    return result;
  }
  return sequence(undefined, 0);
}
