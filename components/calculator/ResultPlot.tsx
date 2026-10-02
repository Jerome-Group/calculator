"use client";
export default function ResultPlot({
  operation,
  data,
}: {
  operation: string;
  data: any;
}) {
  if (operation === "histogram") {
    const counts = (data.counts || []).map(Number),
      edges = (data["bin lower bounds"] || []).map(Number),
      n = counts.length,
      max = Math.max(...counts, 1);
    return (
      <figure className="result-plot">
        <svg
          viewBox="0 0 480 220"
          role="img"
          aria-label="Histogram with observation counts"
        >
          <line x1="40" x2="465" y1="180" y2="180" stroke="currentColor" />
          {counts.map((v: number, i: number) => (
            <g key={i}>
              <rect
                x={40 + (i * 420) / n}
                y={180 - (v / max) * 145}
                height={(v / max) * 145}
                width={420 / n - 3}
                fill="var(--accent-foreground)"
              />
              <text
                x={40 + ((i + 0.5) * 420) / n}
                y={175 - (v / max) * 145}
                textAnchor="middle"
              >
                {v}
              </text>
              <text x={40 + (i * 420) / n} y={205} textAnchor="middle">
                {Number(edges[i].toPrecision(3))}
              </text>
            </g>
          ))}
        </svg>
        <figcaption>Bin starts along x · frequency above each bar</figcaption>
      </figure>
    );
  }
  if (operation === "boxplot") {
    const lo = Number(data.minimum),
      hi = Number(data.maximum),
      x = (v: number) => 35 + ((v - lo) / (hi - lo || 1)) * 410;
    return (
      <figure className="result-plot">
        <svg
          viewBox="0 0 480 160"
          role="img"
          aria-label="Box plot with quartiles, Tukey whiskers and outliers"
        >
          <line
            x1={x(data["lower whisker"])}
            x2={x(data["upper whisker"])}
            y1="70"
            y2="70"
            stroke="currentColor"
          />
          <rect
            x={x(data.Q1)}
            y="40"
            width={Math.max(1, x(data.Q3) - x(data.Q1))}
            height="60"
            fill="var(--accent)"
            stroke="var(--accent-foreground)"
          />
          <line
            x1={x(data.median)}
            x2={x(data.median)}
            y1="40"
            y2="100"
            stroke="var(--accent-foreground)"
            strokeWidth="3"
          />
          {(data.outliers || []).map((v: number, i: number) => (
            <circle
              key={i}
              cx={x(v)}
              cy="70"
              r="4"
              fill="var(--accent-foreground)"
            />
          ))}
          {[
            ["Min", lo],
            ["Q1", Number(data.Q1)],
            ["Median", Number(data.median)],
            ["Q3", Number(data.Q3)],
            ["Max", hi],
          ].map(([label, value]) => (
            <g key={label as string}>
              <text x={x(value as number)} y="125" textAnchor="middle">
                {value}
              </text>
            </g>
          ))}
        </svg>
        <figcaption>
          Quartiles · median line · outliers beyond 1.5 IQR whiskers
        </figcaption>
      </figure>
    );
  }
  if (operation === "poisson") {
    const grid = data["interior solution"];
    if (!Array.isArray(grid)) return null;
    const values = grid.flat().map(Number),
      min = Math.min(...values),
      max = Math.max(...values),
      n = grid.length;
    return (
      <figure className="result-plot">
        <svg
          viewBox="0 0 400 400"
          role="img"
          aria-label="Computed Poisson solution on the unit square"
        >
          {grid.flatMap((row: any[], i: number) =>
            row.map((value, j) => (
              <rect
                key={i + "," + j}
                x={(j * 400) / n}
                y={400 - ((i + 1) * 400) / n}
                width={400 / n + 1}
                height={400 / n + 1}
                fill={`hsl(${240 - (200 * (Number(value) - min)) / (max - min || 1)} 75% 52%)`}
              />
            )),
          )}
        </svg>
        <figcaption>
          Unit square · solution range {min.toPrecision(4)} to{" "}
          {max.toPrecision(4)} · zero boundary
        </figcaption>
      </figure>
    );
  }
  return null;
}
