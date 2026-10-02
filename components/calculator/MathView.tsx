"use client";
import katex from "katex";
export default function MathView({
  latex,
  block = false,
}: {
  latex: string;
  block?: boolean;
}) {
  let html = "";
  try {
    html = katex.renderToString(latex, {
      displayMode: block,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
  } catch {
    return <pre>{latex}</pre>;
  }
  return (
    <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
