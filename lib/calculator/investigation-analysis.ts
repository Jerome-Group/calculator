import type {
  ComparisonCell,
  InvestigationCase,
  InvestigationPlan,
  InvestigationRun,
  InvestigationStep,
  PlanEditResult,
} from "./investigations";
import { INVESTIGATION_LIMITS } from "./investigations";
import type { Entry, Notebook, SavedState } from "./types";
import { validateState } from "./storage";

export type CaseSweepDraft = {
  parameter: string;
  baseCaseId: string;
  count: string;
} & (
  | { kind: "linear"; start: string; end: string }
  | { kind: "geometric"; start: string; multiplier: string }
);
export type InvestigationEvidence = {
  notebookName: string;
  run: InvestigationRun;
  rows: readonly {
    step: InvestigationStep;
    cells: readonly ComparisonCell[];
  }[];
  entries: readonly Entry[];
  saved: number;
  total: number;
};
export type TrendMeasure = { kind: "result" } | { kind: "detail"; key: string };
export type ScalarEvidence = {
  value: number;
  source: string;
  origin: "text" | "approx" | "detail";
  approximate: boolean;
};
type TrendCase = { case: InvestigationCase; parameterSource: string };
export type TrendCell = TrendCase &
  (
    | { kind: "missing"; reason: "No saved result" }
    | { kind: "excluded"; entry: Entry; reason: string }
    | { kind: "point"; entry: Entry; x: number; y: ScalarEvidence }
  );
export type InvestigationTrend = {
  runId: string;
  createdAt: number;
  notebookName: string;
  question: string;
  parameter: string;
  step: InvestigationStep;
  measure: TrendMeasure;
  measures: readonly TrendMeasure[];
  rows: readonly TrendCell[];
  precisionCollisions: readonly {
    axis: "x" | "y";
    caseIds: readonly string[];
  }[];
};

type Rational = { numerator: bigint; denominator: bigint };
function rational(numerator: bigint, denominator: bigint): Rational {
  if (denominator < BigInt(0)) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let a = numerator < BigInt(0) ? -numerator : numerator;
  let b = denominator;
  while (b) [a, b] = [b, a % b];
  return { numerator: numerator / a, denominator: denominator / a };
}
function literal(source: string): Rational | null {
  const text = source.trim();
  if (!text || text.length > 12000) return null;
  const fraction = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(text);
  if (fraction) {
    const denominator = BigInt(fraction[2]);
    return denominator === BigInt(0)
      ? null
      : rational(BigInt(fraction[1]), denominator);
  }
  const decimal =
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!decimal) return null;
  const exponent = Number(decimal[5] || "0");
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return null;
  const digits = (decimal[2] || "0") + (decimal[3] || decimal[4] || "");
  const scale = (decimal[3] || decimal[4] || "").length - exponent;
  const numerator = BigInt((decimal[1] === "-" ? "-" : "") + digits);
  return scale > 0
    ? rational(numerator, BigInt(10) ** BigInt(scale))
    : rational(numerator * BigInt(10) ** BigInt(-scale), BigInt(1));
}
function sourceOf(value: Rational) {
  return value.denominator === BigInt(1)
    ? String(value.numerator)
    : value.numerator + "/" + value.denominator;
}
function add(a: Rational, b: Rational) {
  return rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}
function multiply(a: Rational, b: Rational) {
  return rational(a.numerator * b.numerator, a.denominator * b.denominator);
}
function projection(value: Rational): number | null {
  if (value.numerator === BigInt(0)) return 0;
  const negative = value.numerator < BigInt(0);
  const numerator = String(negative ? -value.numerator : value.numerator);
  const denominator = String(value.denominator);
  const scale = 40 + denominator.length - numerator.length;
  const magnitude = negative ? -value.numerator : value.numerator;
  const digits =
    scale >= 0
      ? (magnitude * BigInt(10) ** BigInt(scale)) / value.denominator
      : magnitude / (value.denominator * BigInt(10) ** BigInt(-scale));
  const projected = Number((negative ? "-" : "") + digits + "e" + -scale);
  return Number.isFinite(projected) && projected !== 0 ? projected : null;
}
export function generateInvestigationCases({
  plan,
  draft,
}: {
  plan: InvestigationPlan;
  draft: CaseSweepDraft;
}): PlanEditResult {
  const invalid = (field: string, message: string): PlanEditResult => ({
    kind: "invalid",
    field,
    message,
  });
  if (!plan.parameters.includes(draft.parameter))
    return invalid("parameter", "Choose a parameter in this plan.");
  const base = plan.cases.find((c) => c.id === draft.baseCaseId);
  if (!base) return invalid("baseCaseId", "Choose a current base case.");
  if (
    !/^\d$/.test(draft.count) ||
    Number(draft.count) < 2 ||
    Number(draft.count) > INVESTIGATION_LIMITS.cases
  )
    return invalid("count", "Choose two through eight cases.");
  const count = Number(draft.count);
  const start = draft.start.length <= 256 ? literal(draft.start) : null;
  if (!start)
    return invalid(
      "start",
      "Use an integer, decimal, scientific decimal or integer fraction. Keep it under 257 characters and the exponent within 1000.",
    );
  const otherSource = draft.kind === "linear" ? draft.end : draft.multiplier;
  const other = otherSource.length <= 256 ? literal(otherSource) : null;
  const field = draft.kind === "linear" ? "end" : "multiplier";
  if (!other)
    return invalid(
      field,
      "Use a bounded numeric literal with a nonzero denominator.",
    );
  if (
    draft.kind === "linear" &&
    start.numerator === other.numerator &&
    start.denominator === other.denominator
  )
    return invalid("end", "Linear endpoints must differ.");
  if (draft.kind === "geometric") {
    if (start.numerator === BigInt(0))
      return invalid("start", "A geometric start must be nonzero.");
    if (other.numerator <= BigInt(0) || other.numerator === other.denominator)
      return invalid("multiplier", "Use a positive multiplier other than 1.");
  }
  const cases: InvestigationCase[] = [];
  let value = start;
  const delta = multiply(
    add(other, { numerator: -start.numerator, denominator: start.denominator }),
    rational(BigInt(1), BigInt(count - 1)),
  );
  for (let i = 0; i < count && i < INVESTIGATION_LIMITS.cases; i++) {
    if (draft.kind === "linear")
      value = add(start, multiply(delta, rational(BigInt(i), BigInt(1))));
    const source = sourceOf(value);
    if (source.length > 12000)
      return invalid(
        field,
        "Generated values exceed the 12,000 character case limit.",
      );
    cases.push({
      id: "sweep-" + (i + 1),
      label:
        draft.parameter +
        " = " +
        (source.length > 70 ? source.slice(0, 67) + "..." : source),
      values: { ...base.values, [draft.parameter]: source },
    });
    if (draft.kind === "geometric") value = multiply(value, other);
  }
  return { kind: "ready", plan: { ...plan, cases } };
}
export function investigationEvidence({
  notebook,
  runId,
}: {
  notebook: Notebook;
  runId: string;
}): InvestigationEvidence {
  const run = notebook.investigation?.runs.find((r) => r.id === runId);
  if (!run) throw Error("This investigation run is no longer available.");
  const entries = notebook.history.filter(
    (entry) => entry.investigation?.runId === runId,
  );
  const byAddress = new Map(
    entries.map((entry) => [
      JSON.stringify([
        entry.investigation?.caseId,
        entry.investigation?.stepId,
      ]),
      entry,
    ]),
  );
  let saved = 0;
  const rows = run.snapshot.plan.steps.map((step) => ({
    step,
    cells: run.snapshot.plan.cases.map<ComparisonCell>((c) => {
      const entry = byAddress.get(JSON.stringify([c.id, step.id]));
      if (!entry) return { kind: "missing" };
      saved++;
      return { kind: "saved", entry };
    }),
  }));
  return {
    notebookName: notebook.name,
    run,
    rows,
    entries,
    saved,
    total: run.snapshot.plan.cases.length * rows.length,
  };
}
function detailValue(entry: Entry, key: string): unknown {
  const details: unknown = entry.result.details;
  return details !== null &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    Object.hasOwn(details, key)
    ? Reflect.get(details, key)
    : undefined;
}
function scalar(
  source: unknown,
  origin: ScalarEvidence["origin"],
  approximate: boolean,
): ScalarEvidence | null {
  if (typeof source === "number")
    return Number.isFinite(source)
      ? { value: source, source: String(source), origin, approximate: true }
      : null;
  if (typeof source !== "string") return null;
  const value = literal(source);
  const projected = value && projection(value);
  return projected === null
    ? null
    : { value: projected, source, origin, approximate };
}
function precisionCollisions(rows: readonly TrendCell[]) {
  const collisions: InvestigationTrend["precisionCollisions"][number][] = [];
  const axes: ("x" | "y")[] = ["x", "y"];
  for (const axis of axes) {
    const coordinates = new Map<
      number,
      { sources: Set<string>; caseIds: string[] }
    >();
    for (const row of rows) {
      if (row.kind !== "point") continue;
      const source = literal(axis === "x" ? row.parameterSource : row.y.source);
      if (!source) continue;
      const value = axis === "x" ? row.x : row.y.value;
      const coordinate = coordinates.get(value) || {
        sources: new Set<string>(),
        caseIds: [],
      };
      coordinate.sources.add(sourceOf(source));
      coordinate.caseIds.push(row.case.id);
      coordinates.set(value, coordinate);
    }
    for (const coordinate of coordinates.values())
      if (coordinate.sources.size > 1)
        collisions.push({ axis, caseIds: coordinate.caseIds });
  }
  return collisions;
}
export function investigationTrend({
  evidence,
  parameter,
  stepId,
  measure,
}: {
  evidence: InvestigationEvidence;
  parameter: string;
  stepId: string;
  measure: TrendMeasure;
}): InvestigationTrend {
  const plan = evidence.run.snapshot.plan;
  const row = evidence.rows.find(({ step }) => step.id === stepId);
  if (!row || !plan.parameters.includes(parameter))
    throw Error("Choose an original run parameter and question.");
  const keys = new Set<string>();
  for (const cell of row.cells) {
    if (
      cell.kind !== "saved" ||
      !["exact", "numeric"].includes(cell.entry.result.status)
    )
      continue;
    const details: unknown = cell.entry.result.details;
    if (details && typeof details === "object" && !Array.isArray(details))
      for (const key of Object.keys(details))
        if (scalar(detailValue(cell.entry, key), "detail", true)) keys.add(key);
  }
  const rows = plan.cases.map<TrendCell>((c, index) => {
    const common = { case: c, parameterSource: c.values[parameter] };
    const cell = row.cells[index];
    if (cell.kind === "missing")
      return { ...common, kind: "missing", reason: "No saved result" };
    const entry = cell.entry;
    const excluded = (reason: string): TrendCell => ({
      ...common,
      kind: "excluded",
      entry,
      reason,
    });
    if (entry.result.status !== "exact" && entry.result.status !== "numeric")
      return excluded("Saved result status is " + entry.result.status);
    const xLiteral = literal(common.parameterSource);
    if (!xLiteral) return excluded("Parameter source is not a scalar literal");
    const x = projection(xLiteral);
    if (x === null)
      return excluded("Parameter is outside the finite plot range");
    const y =
      measure.kind === "detail"
        ? scalar(detailValue(entry, measure.key), "detail", true)
        : scalar(
            entry.result.text,
            "text",
            entry.result.status === "numeric",
          ) || scalar(entry.result.approx, "approx", true);
    if (!y) {
      if (
        measure.kind === "detail" &&
        detailValue(entry, measure.key) === undefined
      )
        return excluded("Selected detail is absent from this saved result");
      return excluded("Selected measure is not a finite scalar literal");
    }
    return { ...common, kind: "point", entry, x, y };
  });
  return {
    runId: evidence.run.id,
    createdAt: evidence.run.createdAt,
    notebookName: evidence.notebookName,
    question: plan.question,
    parameter,
    step: row.step,
    measure,
    measures: [
      { kind: "result" },
      ...Array.from(keys)
        .sort()
        .map((key): TrendMeasure => ({ kind: "detail", key })),
    ],
    rows,
    precisionCollisions: precisionCollisions(rows),
  };
}
export function exportInvestigationRun({
  notebook,
  runId,
}: {
  notebook: Notebook;
  runId: string;
}): string {
  const evidence = investigationEvidence({ notebook, runId });
  const { run } = evidence;
  const exported: Notebook = {
    id: notebook.id,
    name: notebook.name,
    definitions: structuredClone(run.snapshot.context.definitions),
    revision: run.snapshot.context.revision,
    graphs: [],
    history: structuredClone([...evidence.entries]),
    investigation: {
      version: 1,
      plan: structuredClone(run.snapshot.plan),
      runs: [structuredClone(run)],
    },
  };
  const state: SavedState = {
    version: 1,
    active: exported.id,
    notebooks: [exported],
    settings: { ...run.snapshot.context.settings },
  };
  return JSON.stringify(validateState(state), null, 2);
}
function csvText(value: string) {
  const safe =
    /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
      ? "'" + value
      : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function exportInvestigationTrend(trend: InvestigationTrend): string {
  const parameters = Object.keys(trend.rows[0]?.case.values || {});
  const header = [
    "run_id",
    "run_epoch_ms",
    "run_timestamp_iso",
    "notebook",
    "experiment_question",
    "step_id",
    "step_question",
    "measure",
    "case_id",
    "case_label",
    ...parameters.map((p) => "parameter:" + p),
    "entry_id",
    "saved_status",
    "result_text",
    "saved_approximation",
    "numeric_source",
    "numeric_origin",
    "approximate",
    "x",
    "y",
    "exclusion_reason",
    "precision_notice",
  ];
  const date = new Date(trend.createdAt);
  const timestamp = Number.isFinite(date.getTime()) ? date.toISOString() : "";
  const records = trend.rows.map((row) => {
    const entry = row.kind === "missing" ? null : row.entry;
    const collisionAxes = trend.precisionCollisions
      .filter((collision) => collision.caseIds.includes(row.case.id))
      .map((collision) => collision.axis);
    const text = [
      trend.runId,
      String(trend.createdAt),
      timestamp,
      trend.notebookName,
      trend.question,
      trend.step.id,
      trend.step.question,
      trend.measure.kind === "detail" ? trend.measure.key : "result",
      row.case.id,
      row.case.label,
      ...parameters.map((p) => row.case.values[p]),
      entry?.id || "",
      entry?.result.status || "missing",
      entry?.result.text || "",
      entry?.result.approx || "",
      row.kind === "point" ? row.y.source : "",
      row.kind === "point" ? row.y.origin : "",
      row.kind === "point" ? String(row.y.approximate) : "",
    ];
    return [
      ...text.map(csvText),
      row.kind === "point" ? String(row.x) : "",
      row.kind === "point" ? String(row.y.value) : "",
      csvText(row.kind === "point" ? "" : row.reason),
      csvText(
        collisionAxes.length
          ? "Browser number precision collapses distinct " +
              collisionAxes.join(" and ") +
              " source values."
          : "",
      ),
    ].join(",");
  });
  return [header.map(csvText).join(","), ...records].join("\r\n") + "\r\n";
}
