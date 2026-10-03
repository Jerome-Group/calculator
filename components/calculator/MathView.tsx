"use client";
import katex from "katex";
import {
  formatDisplayMath,
  formatNumericAssignmentMath,
} from "../../lib/calculator/display-format";

function displayBox(latex: string) {
  if (latex.length > 8000) return null;
  const source = latex.trim();
  const prefix = /^\\bbox\[5px,border:\s*2px (solid red|dashed black)\]\{/.exec(
    source,
  );
  if (!prefix) return null;
  let depth = 1;
  for (let index = prefix[0].length; index < source.length; index++) {
    const token = source[index];
    if (token === "\\") {
      index++;
      continue;
    }
    if (token === "{") {
      if (++depth > 64) return null;
    } else if (token === "}" && --depth === 0) {
      if (index !== source.length - 1) return null;
      return {
        body: source.slice(prefix[0].length, index),
        border: "2px " + prefix[1],
      };
    }
  }
  return null;
}

function annotationText(source: string) {
  return source.replace(/[&<>]/g, (token) =>
    token === "&" ? "&amp;" : token === "<" ? "&lt;" : "&gt;",
  );
}

export default function MathView({
  latex,
  block = false,
  displayDecimals,
  numeric = false,
}: {
  latex: string;
  block?: boolean;
  displayDecimals?: number;
  numeric?: boolean;
}) {
  const displayLatex =
    displayDecimals === undefined
      ? latex
      : numeric
        ? formatNumericAssignmentMath(latex, displayDecimals)
        : formatDisplayMath(latex, displayDecimals);
  let html = "";
  const box = displayBox(displayLatex);
  try {
    html = katex.renderToString(box?.body ?? displayLatex, {
      displayMode: block,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
    if (box)
      html = html.replace(
        /(<annotation encoding="application\/x-tex">)[\s\S]*?(<\/annotation>)/,
        (_, start, end) => start + annotationText(latex) + end,
      );
  } catch {
    return <pre>{displayLatex}</pre>;
  }
  return box ? (
    <div className="math-block">
      <span
        style={{ display: "inline-block", padding: "5px", border: box.border }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  ) : (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
