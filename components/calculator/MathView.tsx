"use client";
import katex from "katex";
import {
  formatDisplayMath,
  formatNumericAssignmentMath,
} from "../../lib/calculator/display-format";
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
  try {
    html = katex.renderToString(displayLatex, {
      displayMode: block,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
  } catch {
    return <pre>{displayLatex}</pre>;
  }
  return (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
