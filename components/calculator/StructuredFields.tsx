"use client";
import { sourceToLatex } from "@/lib/calculator/notation";
import Choice from "./Choice";
import MathView from "./MathView";
import type { Definition, Operation } from "@/lib/calculator/types";
export function splitMath(source: string): string[] {
  let depth = 0,
    quote = "",
    start = 0;
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== "\\") quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) out.push(source.slice(start).trim());
  return out;
}
export function listItems(value: string) {
  const s = value.trim();
  return /^[\[(]/.test(s) && /[\])]$/.test(s)
    ? splitMath(s.slice(1, -1))
    : null;
}
export function matrixRows(value: string) {
  const v = value.trim().replace(/^(?:Immutable)?Matrix\(([\s\S]*)\)$/, "$1"),
    rows = listItems(v);
  if (!rows || !rows.length) return null;
  const cells = rows.map(listItems);
  return cells.every((r) => r && r.length === cells[0]?.length)
    ? (cells as string[][])
    : null;
}
export function Preview({
  source,
  block = false,
}: {
  source: string;
  block?: boolean;
}) {
  const rows = matrixRows(source);
  let latex = sourceToLatex(source);
  if (rows) {
    const cells = rows.map((row) => row.map(sourceToLatex));
    if (cells.every((row) => row.every((cell) => cell !== null)))
      latex =
        "\\begin{pmatrix}" +
        cells.map((row) => row.join("&")).join("\\\\") +
        "\\end{pmatrix}";
    else latex = null;
  }
  return latex ? (
    <MathView latex={latex} block={block} />
  ) : (
    <code className="source-expression">{source}</code>
  );
}
export function MatrixInput({
  value,
  onChange,
  label = "Matrix",
  definitions = [],
}: {
  value: string;
  onChange: (s: string) => void;
  label?: string;
  definitions?: Definition[];
}) {
  const selected = definitions.find(
      (d) => d.name === value && d.kind === "matrix",
    ),
    rows = matrixRows(selected?.expression || value);
  return (
    <fieldset className="structured-field">
      <legend>{label}</legend>
      {definitions.some((d) => d.kind === "matrix") && (
        <Choice
          label={"Choose " + label}
          value={selected?.name || "custom"}
          options={[
            { value: "custom", label: "Enter entries" },
            ...definitions
              .filter((d) => d.kind === "matrix")
              .map((d) => ({ value: d.name, label: d.name })),
          ]}
          onChange={(s) =>
            onChange(
              s === "custom" ? selected?.expression || "[[1,0],[0,1]]" : s,
            )
          }
        />
      )}
      {selected ? (
        <>
          <Preview source={selected.expression} block />
          <p className="field-hint">
            Live reference to {selected.name}. Calculation records keep a
            snapshot.
          </p>
          <button
            className="subtle"
            onClick={() => onChange(selected.expression)}
          >
            Edit a copy
          </button>
        </>
      ) : rows ? (
        <>
          <div className="row">
            <label>
              Rows
              <input
                type="number"
                aria-label={label + " rows"}
                min={1}
                max={12}
                value={rows.length}
                onChange={(e) =>
                  onChange(
                    "[" +
                      Array.from(
                        {
                          length: Math.max(
                            1,
                            Math.min(12, +e.target.value || 1),
                          ),
                        },
                        (_, i) =>
                          "[" +
                          (rows[i] || rows[0].map(() => "0")).join(",") +
                          "]",
                      ).join(",") +
                      "]",
                  )
                }
              />
            </label>
            <label>
              Columns
              <input
                type="number"
                aria-label={label + " columns"}
                min={1}
                max={12}
                value={rows[0].length}
                onChange={(e) =>
                  onChange(
                    "[" +
                      rows
                        .map(
                          (r) =>
                            "[" +
                            Array.from(
                              {
                                length: Math.max(
                                  1,
                                  Math.min(12, +e.target.value || 1),
                                ),
                              },
                              (_, j) => r[j] || "0",
                            ).join(",") +
                            "]",
                        )
                        .join(",") +
                      "]",
                  )
                }
              />
            </label>
          </div>
          <div
            className="matrix-grid"
            style={{
              gridTemplateColumns: `repeat(${rows[0].length},minmax(68px,1fr))`,
            }}
          >
            {rows.flatMap((r, i) =>
              r.map((x, j) => (
                <input
                  key={i + "," + j}
                  aria-label={`${label} row ${i + 1} column ${j + 1}`}
                  value={x}
                  onChange={(e) =>
                    onChange(
                      "[" +
                        rows
                          .map(
                            (r, a) =>
                              "[" +
                              r
                                .map((x, b) =>
                                  a === i && b === j ? e.target.value : x,
                                )
                                .join(",") +
                              "]",
                          )
                          .join(",") +
                        "]",
                    )
                  }
                />
              )),
            )}
          </div>
        </>
      ) : (
        <label>
          Matrix expression or saved name
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </fieldset>
  );
}
const distributions: Record<
  string,
  { definition: string; fields: [string, string, string][]; discrete?: boolean }
> = {
  normal: {
    definition:
      "X ∼ N(μ, σ²). The second parameter is standard deviation, not variance.",
    fields: [
      ["Mean μ", "0", "Any real number"],
      ["Standard deviation σ", "1", "σ > 0; variance = σ²"],
    ],
  },
  "student-t": {
    definition:
      "Student t distribution, centered at 0. Scale 1; it is not a standard deviation.",
    fields: [
      [
        "Degrees of freedom ν",
        "5",
        "ν > 0. Mean exists for ν > 1; variance for ν > 2.",
      ],
    ],
  },
  "chi-square": {
    definition: "Sum of squares of ν independent standard normal variables.",
    fields: [["Degrees of freedom ν", "3", "ν > 0; mean ν and variance 2ν."]],
  },
  F: {
    definition: "Ratio (U/d₁)/(V/d₂) of independent chi-square variables.",
    fields: [
      ["Numerator degrees of freedom d₁", "5", "d₁ > 0"],
      ["Denominator degrees of freedom d₂", "10", "d₂ > 0"],
    ],
  },
  binomial: {
    definition:
      "X counts successes in n independent trials, each with success probability p.",
    discrete: true,
    fields: [
      ["Number of trials n", "10", "Integer n ≥ 0"],
      ["Success probability p", "0.5", "0 ≤ p ≤ 1"],
    ],
  },
  poisson: {
    definition:
      "P(X=k) = e⁻λ λᵏ/k!, for k = 0,1,… . Mean and variance both equal λ.",
    discrete: true,
    fields: [["Expected count λ", "3", "λ ≥ 0"]],
  },
  geometric: {
    definition:
      "X counts trials up to and including the first success: X = 1,2,… .",
    discrete: true,
    fields: [["Success probability p", "0.5", "0 < p ≤ 1; mean 1/p"]],
  },
  hypergeometric: {
    definition: "X counts successes in a sample drawn without replacement.",
    discrete: true,
    fields: [
      ["Population size N", "20", "Integer N > 0"],
      ["Successes in population K", "7", "Integer 0 ≤ K ≤ N"],
      ["Draws n", "5", "Integer 0 ≤ n ≤ N"],
    ],
  },
  uniform: {
    definition: "Constant density 1/(b−a) on [a,b]; zero elsewhere.",
    fields: [
      ["Lower endpoint a", "0", "a < b"],
      ["Upper endpoint b", "1", "b > a"],
    ],
  },
  exponential: {
    definition:
      "Density λ e⁻λx for x ≥ 0. Mean and standard deviation are 1/λ.",
    fields: [["Rate λ", "1", "λ > 0"]],
  },
  gamma: {
    definition:
      "Density x^(k−1)e^(−x/θ)/(Γ(k)θᵏ), x ≥ 0. Mean kθ; variance kθ².",
    fields: [
      ["Shape k", "2", "k > 0"],
      ["Scale θ", "1", "θ > 0; standard deviation √k θ"],
    ],
  },
  beta: {
    definition: "Density x^(α−1)(1−x)^(β−1)/B(α,β), 0 < x < 1.",
    fields: [
      ["Shape α", "2", "α > 0"],
      ["Shape β", "3", "β > 0"],
    ],
  },
  "negative-binomial": {
    definition: "X counts failures before the r-th success, starting at 0.",
    discrete: true,
    fields: [
      ["Target successes r", "3", "Positive integer"],
      ["Success probability p", "0.5", "0 < p ≤ 1"],
    ],
  },
};
export function DistributionFields({
  params,
  set,
}: {
  params: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const name = params.distribution || "normal",
    spec = distributions[name] || distributions.normal,
    values = listItems(params.parameters) || [],
    action = params.action || "cdf";
  return (
    <>
      <label>
        Distribution
        <Choice
          label="Distribution"
          value={name}
          options={Object.keys(distributions)}
          onChange={(s) => {
            set("distribution", s);
            set(
              "parameters",
              "[" + distributions[s].fields.map((f) => f[1]).join(",") + "]",
            );
          }}
        />
      </label>
      <p className="definition-note">{spec.definition}</p>
      <div className="field-grid">
        {spec.fields.map(([label, defaultValue, hint], i) => (
          <label key={label}>
            {label}
            <input
              aria-label={label}
              value={values[i] ?? defaultValue}
              onChange={(e) =>
                set(
                  "parameters",
                  "[" +
                    spec.fields
                      .map((f, j) =>
                        i === j ? e.target.value : (values[j] ?? f[1]),
                      )
                      .join(",") +
                    "]",
                )
              }
            />
            <span className="field-hint">{hint}</span>
          </label>
        ))}
      </div>
      <label>
        Find
        <Choice
          label="Probability operation"
          value={action}
          options={[
            {
              value: "pdf/pmf",
              label: spec.discrete ? "Probability P(X = k)" : "Density f(x)",
            },
            { value: "cdf", label: "Cumulative probability P(X ≤ x)" },
            { value: "sf", label: "Upper tail P(X > x)" },
            { value: "ppf", label: "Quantile: x with P(X ≤ x) ≥ p" },
            { value: "isf", label: "Inverse upper tail" },
            { value: "moments", label: "Mean and variance" },
          ]}
          onChange={(s) => set("action", s)}
        />
      </label>
      {action !== "moments" && (
        <label>
          {["ppf", "isf"].includes(action) ? "Probability p" : "Value x"}
          <input
            aria-label={
              ["ppf", "isf"].includes(action) ? "Probability p" : "Value x"
            }
            value={params.value || "0"}
            onChange={(e) => set("value", e.target.value)}
          />
          <span className="field-hint">
            {["ppf", "isf"].includes(action)
              ? "0 < p < 1"
              : spec.discrete
                ? "For P(X ≥ k), choose upper tail and enter k−1."
                : action === "pdf/pmf"
                  ? "A density is not a point probability. For a continuous variable, P(X=x)=0."
                  : "X is the random variable; x is your threshold."}
          </span>
        </label>
      )}
    </>
  );
}
export function ListInput({
  value,
  onChange,
  label,
  tuple = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  tuple?: boolean;
}) {
  const rows = listItems(value) || [];
  const write = (r: string[]) => onChange("[" + r.join(",") + "]");
  return (
    <fieldset className="structured-field">
      <legend>{label}</legend>
      {rows.map((v, i) => (
        <div className="list-row" key={i}>
          <span>{i + 1}</span>
          <input
            aria-label={`${label} ${i + 1}`}
            value={v}
            onChange={(e) =>
              write(rows.map((x, j) => (j === i ? e.target.value : x)))
            }
          />
          <button
            aria-label={`Remove ${label} ${i + 1}`}
            className="icon-btn"
            onClick={() => write(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="subtle"
        onClick={() => write([...rows, tuple ? "(0,0)" : "0"])}
      >
        Add {label.toLowerCase().includes("equation") ? "equation" : "value"}
      </button>
    </fieldset>
  );
}
function LogicFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const match = value.match(/^(Implies|And|Or|Xor|Equivalent)\((.*)\)$/),
    args = match ? splitMath(match[2]) : [],
    kind = match?.[1] || "custom";
  const names = [
    { value: "Implies", label: "Implication · p ⇒ q" },
    { value: "And", label: "Both true · p ∧ q" },
    { value: "Or", label: "At least one true · p ∨ q" },
    { value: "Xor", label: "Exactly one true · p ⊕ q" },
    { value: "Equivalent", label: "Same truth value · p ⇔ q" },
    { value: "custom", label: "Advanced proposition" },
  ];
  return (
    <>
      <label>
        Logical relationship
        <Choice
          label="Logical relationship"
          value={kind}
          options={names}
          onChange={(v) => onChange(v === "custom" ? "p" : v + "(p,q)")}
        />
      </label>
      {kind !== "custom" ? (
        <div className="field-grid">
          {["First proposition", "Second proposition"].map((label, i) => (
            <label key={label}>
              {label}
              <input
                aria-label={label}
                value={args[i] || ""}
                onChange={(e) =>
                  onChange(
                    kind +
                      "(" +
                      [
                        i === 0 ? e.target.value : args[0],
                        i === 1 ? e.target.value : args[1],
                      ].join(",") +
                      ")",
                  )
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <label>
          Proposition
          <input
            aria-label="Proposition"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="field-hint">
            Use p, q, r and And(p,q), Or(p,q), Not(p), Implies(p,q).
          </span>
        </label>
      )}
      <p className="definition-note">
        A proposition is a statement that is true (T) or false (F). The table
        covers every assignment.
      </p>
    </>
  );
}
export default function StructuredFields({
  op,
  params,
  onChange,
  definitions,
  onMath,
}: {
  op: Operation;
  params: Record<string, string>;
  onChange: (k: string, v: string) => void;
  definitions: Definition[];
  onMath: (key: string, label: string) => void;
}) {
  if (op.id === "logic")
    return (
      <LogicFields
        value={params.expression || "Implies(p,q)"}
        onChange={(v) => onChange("expression", v)}
      />
    );
  if (op.id === "distribution")
    return <DistributionFields params={params} set={onChange} />;
  return (
    <>
      {op.fields.map((f) => {
        const value = params[f.key] ?? f.value,
          rows = listItems(value),
          matrix = matrixRows(value),
          isMatrix =
            (op.id.startsWith("matrix_") &&
              ["expression", "rhs"].includes(f.key)) ||
            ["A", "Aeq", "metric"].includes(f.key) ||
            (op.id === "markov" && f.key === "expression");
        if (isMatrix)
          return (
            <MatrixInput
              key={f.key}
              label={
                f.key === "rhs"
                  ? "Right-hand side b"
                  : f.key === "expression"
                    ? "Matrix A"
                    : f.label
              }
              value={value}
              onChange={(s) => onChange(f.key, s)}
              definitions={definitions}
            />
          );
        if (
          f.key === "bounds" &&
          rows &&
          [
            "multiple_integral",
            "contour",
            "line_integral",
            "surface_integral",
            "surface_area",
          ].includes(op.id)
        )
          return (
            <fieldset className="structured-field" key={f.key}>
              <legend>Integration order · innermost first</legend>
              {rows.map((r, i) => {
                const cells = listItems(r) || ["x", "0", "1"];
                return (
                  <div className="bound-row" key={i}>
                    {["Variable", "Lower bound", "Upper bound"].map((l, j) => (
                      <label key={l}>
                        {l}
                        <input
                          aria-label={`${l} ${i + 1}`}
                          value={cells[j] || ""}
                          onChange={(e) =>
                            onChange(
                              f.key,
                              "[" +
                                rows
                                  .map((v, k) =>
                                    k === i
                                      ? "(" +
                                        cells
                                          .map((x, n) =>
                                            j === n ? e.target.value : x,
                                          )
                                          .join(",") +
                                        ")"
                                      : v,
                                  )
                                  .join(",") +
                                "]",
                            )
                          }
                        />
                      </label>
                    ))}
                    {rows.length > 1 && (
                      <button
                        aria-label={"Remove integration " + (i + 1)}
                        onClick={() =>
                          onChange(
                            f.key,
                            "[" +
                              rows.filter((_, j) => j !== i).join(",") +
                              "]",
                          )
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {op.id === "multiple_integral" && rows.length < 3 && (
                <button
                  className="subtle"
                  onClick={() =>
                    onChange(
                      f.key,
                      "[" +
                        [
                          ...rows,
                          "(" + (rows.length === 1 ? "y" : "z") + ",0,1)",
                        ].join(",") +
                        "]",
                    )
                  }
                >
                  Add outer integral
                </button>
              )}
              <p className="field-hint">
                The first row is evaluated first. Its bounds may depend on
                variables in later rows.
              </p>
            </fieldset>
          );
        if (f.key === "cases" && rows)
          return (
            <fieldset key={f.key} className="structured-field">
              <legend>
                Piecewise branches · first matching condition wins
              </legend>
              {rows.map((row, i) => {
                const cells = listItems(row) || ["0", "True"];
                return (
                  <div className="field-grid" key={i}>
                    {["Formula", "Condition"].map((label, j) => (
                      <label key={label}>
                        {label}
                        <input
                          aria-label={`${label} ${i + 1}`}
                          value={cells[j]}
                          onChange={(e) =>
                            onChange(
                              f.key,
                              "[" +
                                rows
                                  .map((x, k) =>
                                    k === i
                                      ? "(" +
                                        cells
                                          .map((v, n) =>
                                            n === j ? e.target.value : v,
                                          )
                                          .join(",") +
                                        ")"
                                      : x,
                                  )
                                  .join(",") +
                                "]",
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                );
              })}
              <button
                className="subtle"
                onClick={() =>
                  onChange(f.key, "[" + [...rows, "(0,True)"].join(",") + "]")
                }
              >
                Add branch
              </button>
              <p className="field-hint">
                Use a condition such as x &lt; 0. True means otherwise.
              </p>
            </fieldset>
          );
        if (f.key === "variables" && rows)
          return (
            <label key={f.key}>
              {f.label}
              <input
                aria-label={f.label}
                value={rows.join(", ")}
                onChange={(e) => onChange(f.key, "[" + e.target.value + "]")}
              />
              <span className="field-hint">
                Comma-separated unknowns, in result order.
              </span>
            </label>
          );
        if (rows && !f.choices) {
          if (matrix)
            return (
              <MatrixInput
                key={f.key}
                label={f.label}
                value={value}
                onChange={(s) => onChange(f.key, s)}
              />
            );
          return (
            <div key={f.key}>
              <ListInput
                label={f.label}
                value={value}
                onChange={(s) => onChange(f.key, s)}
                tuple={rows[0]?.startsWith("(")}
              />
              {f.hint && <p className="field-hint">{f.hint}</p>}
            </div>
          );
        }
        if (value.trim().startsWith("{") && value.trim().endsWith("}")) {
          const pairs = splitMath(value.trim().slice(1, -1));
          return (
            <fieldset className="structured-field" key={f.key}>
              <legend>{f.label}</legend>
              {pairs.map((p, i) => {
                const colon = p.indexOf(":"),
                  parts = [p.slice(0, colon), p.slice(colon + 1)];
                return (
                  <div className="row" key={i}>
                    {parts.map((x, j) => (
                      <input
                        key={j}
                        aria-label={`${f.label} ${j ? "value" : "symbol"} ${i + 1}`}
                        value={x}
                        onChange={(e) =>
                          onChange(
                            f.key,
                            "{" +
                              pairs
                                .map((v, k) =>
                                  k === i
                                    ? parts
                                        .map((q, n) =>
                                          n === j ? e.target.value : q,
                                        )
                                        .join(":")
                                    : v,
                                )
                                .join(",") +
                              "}",
                          )
                        }
                      />
                    ))}
                    <button
                      aria-label={"Remove condition " + (i + 1)}
                      onClick={() =>
                        onChange(
                          f.key,
                          "{" + pairs.filter((_, j) => j !== i).join(",") + "}",
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                className="subtle"
                onClick={() =>
                  onChange(f.key, "{" + [...pairs, "x:0"].join(",") + "}")
                }
              >
                Add condition
              </button>
              {f.hint && <p className="field-hint">{f.hint}</p>}
            </fieldset>
          );
        }
        return (
          <label key={f.key}>
            {f.label}
            {f.choices ? (
              <Choice
                label={f.label}
                value={value}
                options={f.choices}
                onChange={(s) => onChange(f.key, s)}
              />
            ) : (
              <div className="math-field-row">
                <input
                  aria-label={f.label}
                  value={value}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
                <button
                  className="subtle"
                  aria-label={"Math editor for " + f.label}
                  onClick={() => onMath(f.key, f.label)}
                >
                  Math
                </button>
              </div>
            )}
            {f.hint && <span className="field-hint">{f.hint}</span>}
          </label>
        );
      })}
    </>
  );
}
export function ProblemPreview({
  op,
  params,
  compact = false,
}: {
  op: Operation;
  params: Record<string, string>;
  compact?: boolean;
}) {
  let latex = "";
  try {
    const tex = (source: string) => {
      if (!source) return "";
      const value = sourceToLatex(source);
      if (value === null) throw Error("Use the exact source preview");
      return value;
    };
    let l = "";
    const e = ["logic", "distribution"].includes(op.id)
      ? ""
      : tex(params.expression || params.equation || "");
    if (op.id === "distribution") {
      const pv = listItems(params.parameters) || [];
      const symbol =
        params.distribution === "normal"
          ? `X\\sim N(${tex(pv[0])},\\left(${tex(pv[1])}\\right)^{2})`
          : `X\\sim \\operatorname{${params.distribution}}\\left(${pv.map(tex).join(",")}\\right)`;
      const action = params.action;
      const question =
        action === "cdf"
          ? `P(X\\le ${tex(params.value)})`
          : action === "sf"
            ? `P(X>${tex(params.value)})`
            : action === "moments"
              ? "E[X],\\; \\operatorname{Var}(X)"
              : action === "pdf/pmf"
                ? [
                    "binomial",
                    "poisson",
                    "geometric",
                    "hypergeometric",
                    "negative-binomial",
                  ].includes(params.distribution)
                  ? `P(X=${tex(params.value)})`
                  : `f(${tex(params.value)})`
                : action === "isf"
                  ? `\\operatorname{inverse\\ upper\\ tail}(${tex(params.value)})`
                  : `\\operatorname{quantile}(${tex(params.value)})`;
      l = symbol + "\\qquad " + question;
    } else if (op.id === "graph_analysis") {
      l = `y=${e}\\qquad x\\in[${tex(params.lower)},${tex(params.upper)}]`;
    } else if (op.id.startsWith("matrix_")) {
      const ex = tex(params.expression);
      l =
        op.id === "matrix_inverse"
          ? "\\left(" + ex + "\\right)^{-1}"
          : op.id === "matrix_det"
            ? "\\det(" + ex + ")"
            : ex;
    } else if (op.id === "integrate")
      l = `\\int${params.lower ? "_{" + tex(params.lower) + "}^{" + tex(params.upper) + "}" : ""} ${e}\\,d${tex(params.variable)}`;
    else if (op.id === "multiple_integral") {
      const b = (listItems(params.bounds) || []).map((x) => listItems(x) || []);
      l =
        [...b]
          .reverse()
          .map((x) => `\\int_{${tex(x[1])}}^{${tex(x[2])}}`)
          .join("") +
        e +
        b.map((x) => "\\,d" + tex(x[0])).join("");
    } else if (op.id === "differentiate")
      l = `\\frac{d^{${tex(params.order || "1")}}}{d${tex(params.variable)}^{${tex(params.order || "1")}}}\\left(${e}\\right)`;
    else if (["system", "numeric_system"].includes(op.id))
      l =
        "\\begin{cases}" +
        (listItems(params.equations) || [])
          .map((x) => tex(x) + (x.includes("=") ? "" : "=0"))
          .join("\\\\") +
        "\\end{cases}";
    else if (op.id === "logic") {
      const match = (params.expression || "").match(
          /^(Implies|And|Or|Xor|Equivalent)\((.*)\)$/,
        ),
        a = match ? splitMath(match[2]) : [];
      l = match
        ? tex(a[0]) +
          " " +
          (
            {
              Implies: "\\implies",
              And: "\\land",
              Or: "\\lor",
              Xor: "\\oplus",
              Equivalent: "\\iff",
            } as Record<string, string>
          )[match[1]] +
          " " +
          tex(a[1])
        : e;
    } else if (op.id === "apart")
      l = `\\operatorname{apart}_{${tex(params.variable || "x")}}\\left(${e}\\right)`;
    else l = e;
    latex = l;
  } catch {
    latex = "";
  }
  return (
    <div className="problem-preview">
      {!compact && <span className="section-label">PROBLEM</span>}
      {latex ? (
        <MathView latex={latex} block />
      ) : (
        <div className="problem-summary">
          {op.fields.map((f) => (
            <div key={f.key}>
              <span>{f.label}</span>
              {f.choices ? (
                <span>{params[f.key] ?? f.value}</span>
              ) : (
                <Preview source={params[f.key] ?? f.value} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
