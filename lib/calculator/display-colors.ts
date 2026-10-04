const palette: Record<string, readonly [string, string]> = {
  red: ["#d7170b", "#fbbbb6"],
  orange: ["#fe8a2b", "#ffe0c2"],
  yellow: ["#ffc02b", "#fff1c2"],
  lime: ["#63b215", "#d0e8b9"],
  green: ["#21ba3a", "#bceac4"],
  teal: ["#17cfcf", "#b9f1f1"],
  cyan: ["#13a7ec", "#b8e5c9"],
  blue: ["#0d80f2", "#b6d9fb"],
  indigo: ["#63c", "#d1c2f0"],
  purple: ["#a219e6", "#e3baf8"],
  magenta: ["#eb4799", "#f9c8e0"],
  black: ["#000", "#353535"],
  "dark-grey": ["#666", "#8C8C8C"],
  grey: ["#A6A6A6", "#D0D0D0"],
  "light-grey": ["#d4d5d2", "#F0F0F0"],
  white: ["#ffffff", "#ffffff"],
};

// MathLive retains palette names that KaTeX cannot parse or colors differently.
export function formatDisplayColors(latex: string): string {
  if (latex.length > 8000) return latex;
  const replacements: { start: number; end: number; color: string }[] = [];
  let depth = 0;
  for (let index = 0; index < latex.length; index++) {
    const token = latex[index];
    if (token === "%") {
      const newline = latex.indexOf("\n", index);
      index = newline < 0 ? latex.length : newline;
    } else if (token === "{") {
      if (++depth > 64) return latex;
    } else if (token === "}") {
      if (--depth < 0) return latex;
    } else if (token === "\\") {
      const command = /^\\([a-zA-Z]+|[^a-zA-Z])/.exec(latex.slice(index));
      if (!command) return latex;
      index += command[0].length - 1;
      if (command[1] === "verb") {
        let delimiter = index + 1;
        if (latex[delimiter] === "*") delimiter++;
        if (delimiter >= latex.length) return latex;
        const end = latex.indexOf(latex[delimiter], delimiter + 1);
        if (end < 0) return latex;
        index = end;
        continue;
      }
      const colorKinds =
        command[1] === "textcolor" || command[1] === "color"
          ? [0]
          : command[1] === "colorbox"
            ? [1]
            : command[1] === "fcolorbox"
              ? [0, 1]
              : [];
      for (const kind of colorKinds) {
        const argument = /^\s*\{([^{}\\%]*)\}/.exec(latex.slice(index + 1));
        if (!argument) break;
        const name = argument[1].trim();
        if (Object.hasOwn(palette, name)) {
          const start = index + 1 + argument[0].indexOf("{") + 1;
          replacements.push({
            start,
            end: start + argument[1].length,
            color: palette[name][kind],
          });
        }
        index += argument[0].length;
      }
    }
  }
  if (depth !== 0) return latex;
  let result = latex;
  for (const { start, end, color } of replacements.reverse())
    result = result.slice(0, start) + color + result.slice(end);
  return result;
}
