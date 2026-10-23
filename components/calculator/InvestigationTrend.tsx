"use client";
import { useState } from "react";
import Choice from "./Choice";
import {
  investigationTrend,
  exportInvestigationTrend,
} from "@/lib/calculator/investigation-analysis";
import type {
  InvestigationEvidence,
  InvestigationTrend as Trend,
  TrendMeasure,
} from "@/lib/calculator/investigation-analysis";
import { download } from "@/lib/calculator/storage";

function Scatter({ trend }: { trend: Trend }) {
  const points = trend.rows.flatMap((row) =>
    row.kind === "point" ? [row] : [],
  );
  if (!points.length)
    return (
      <p className="muted" role="status">
        No finite numeric points for this selection. The table explains each
        omission.
      </p>
    );
  const xs = points.map((point) => point.x),
    ys = points.map((point) => point.y.value);
  const axis = (values: number[], start: number, end: number) => {
    const scale = Math.max(...values.map(Math.abs)) || 1;
    const low = Math.min(...values) / scale,
      high = Math.max(...values) / scale;
    return (value: number) =>
      high === low
        ? (start + end) / 2
        : start + ((value / scale - low) / (high - low)) * (end - start);
  };
  const x = axis(xs, 20, 300),
    y = axis(ys, 220, 20);
  const measure =
    trend.measure.kind === "result" ? "Saved result" : trend.measure.key;
  return (
    <figure className="investigation-scatter-figure">
      <dl className="investigation-scatter-ranges">
        <div>
          <dt>Horizontal x · {trend.parameter}</dt>
          <dd>
            {String(Math.min(...xs))} to {String(Math.max(...xs))}
          </dd>
        </div>
        <div>
          <dt>Vertical y · {measure}</dt>
          <dd>
            {String(Math.min(...ys))} to {String(Math.max(...ys))}
          </dd>
        </div>
      </dl>
      <svg
        className="investigation-scatter"
        viewBox="0 0 320 240"
        role="img"
        aria-label={
          measure +
          " against " +
          trend.parameter +
          ", " +
          points.length +
          " saved numeric samples"
        }
      >
        <title>
          {measure} against {trend.parameter}
        </title>
        <desc>
          Unconnected samples from the selected original run. Numbered markers
          match the full case key. Markers can overlap at identical or nearby
          coordinates. The table contains every case and saved source.
        </desc>
        <path d="M20 20V220H300" fill="none" stroke="currentColor" />
        {points.map((point, index) => (
          <g key={point.case.id}>
            <circle
              cx={x(point.x)}
              cy={y(point.y.value)}
              r="12"
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth="2"
            >
              <title>
                {"Marker " +
                  (index + 1) +
                  ": " +
                  (point.case.label || point.case.id) +
                  "; " +
                  trend.parameter +
                  " = " +
                  point.parameterSource +
                  ", y = " +
                  point.y.source}
              </title>
            </circle>
            <text
              x={x(point.x)}
              y={y(point.y.value)}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <ol className="investigation-scatter-key" aria-label="Plotted case key">
        {points.map((point) => (
          <li key={point.case.id}>{point.case.label || point.case.id}</li>
        ))}
      </ol>
      <figcaption>
        Numbered markers match the case key. Markers may overlap when
        coordinates coincide or are close together.
      </figcaption>
    </figure>
  );
}
export default function InvestigationTrend({
  evidence,
}: {
  evidence: InvestigationEvidence;
}) {
  const plan = evidence.run.snapshot.plan;
  const [parameter, setParameter] = useState(plan.parameters[0] || "");
  const [stepId, setStepId] = useState(plan.steps[0].id);
  const [measure, setMeasure] = useState<TrendMeasure>({ kind: "result" });
  if (!plan.parameters.length)
    return (
      <p className="small muted">
        This run has no parameter to use as a numeric axis.
      </p>
    );
  const trend = investigationTrend({ evidence, parameter, stepId, measure });
  const encode = (value: TrendMeasure) =>
    value.kind === "result" ? "result" : "detail:" + value.key;
  const measureLabel = (value: TrendMeasure) =>
    value.kind === "result"
      ? "Main saved result"
      : value.key + " (saved detail)";
  const plotted = trend.rows.filter((row) => row.kind === "point").length;
  return (
    <section
      className="investigation-trend"
      aria-label="Saved numeric evidence"
    >
      <h3>Numeric evidence from this run</h3>
      <p className="small muted">
        Finite numeric projections at browser number precision of whole saved
        literals, saved approximations or direct numeric details. Expressions
        are not recalculated. These samples make no claim about values between
        cases.
      </p>
      <div className="investigation-generator-fields">
        <label>
          Horizontal parameter
          <Choice
            label="Numeric evidence parameter"
            value={parameter}
            options={plan.parameters}
            onChange={setParameter}
          />
        </label>
        <label>
          Question
          <Choice
            label="Numeric evidence question"
            value={stepId}
            options={plan.steps.map((step) => ({
              value: step.id,
              label: step.question || step.id,
            }))}
            onChange={(id) => {
              setStepId(id);
              setMeasure({ kind: "result" });
            }}
          />
        </label>
        <label>
          Measure
          <Choice
            label="Numeric evidence measure"
            value={encode(measure)}
            options={trend.measures.map((m) => ({
              value: encode(m),
              label: measureLabel(m),
            }))}
            onChange={(value) => {
              const next = trend.measures.find((m) => encode(m) === value);
              if (next) setMeasure(next);
            }}
          />
        </label>
      </div>
      <p role="status">
        {plotted} of {trend.rows.length} cases plotted. Every case appears
        below.
      </p>
      {trend.precisionCollisions.length > 0 && (
        <div className="warning" role="status">
          <p>
            Browser number precision makes distinct saved source values
            coincide. Compare the original sources in the table.
          </p>
          <ul>
            {trend.precisionCollisions.map((collision) => (
              <li key={collision.axis + collision.caseIds.join(",")}>
                {collision.axis} coordinates for{" "}
                {collision.caseIds
                  .map((id) => plan.cases.find((c) => c.id === id)?.label || id)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Scatter trend={trend} />
      <div className="table-scroll investigation-numeric-table">
        <table>
          <caption>
            {trend.step.question} · {measureLabel(measure)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Case and original parameters</th>
              <th scope="col">Saved status and source</th>
              <th scope="col">Numeric projection or omission</th>
            </tr>
          </thead>
          <tbody>
            {trend.rows.map((row) => (
              <tr key={row.case.id}>
                <th scope="row">
                  {row.case.label}
                  {Object.entries(row.case.values).map(([key, value]) => (
                    <div className="small" key={key}>
                      <code>
                        {key} = {value}
                      </code>
                    </div>
                  ))}
                </th>
                <td>
                  {row.kind === "missing" ? (
                    "No saved result"
                  ) : (
                    <>
                      <span>{row.entry.result.status}</span>
                      <pre>{row.entry.result.text}</pre>
                      {row.entry.result.approx && (
                        <p className="small">
                          Saved approximation: {row.entry.result.approx}
                        </p>
                      )}
                      {row.kind === "point" && (
                        <p className="small">
                          Selected {row.y.origin}: {row.y.source}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {row.kind === "point" ? (
                    <>
                      <div>x = {String(row.x)}</div>
                      <div>y ≈ {String(row.y.value)}</div>
                      <p className="small muted">
                        {row.y.approximate
                          ? "Saved approximation or numeric detail"
                          : "Numeric projection of saved literal"}
                      </p>
                    </>
                  ) : (
                    row.reason
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="subtle"
        onClick={() =>
          download(
            "calculator-run-" + trend.runId + ".csv",
            exportInvestigationTrend(trend),
            "text/csv;charset=utf-8",
          )
        }
      >
        Export displayed numeric CSV
      </button>
      <p className="small muted">
        CSV includes every case and its original source. Formula-leading text is
        escaped for spreadsheet display. The original-run JSON preserves the
        source bytes.
      </p>
    </section>
  );
}
