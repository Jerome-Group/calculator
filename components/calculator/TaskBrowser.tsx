"use client";
import { useState } from "react";
import { operations, categories } from "@/lib/calculator/catalog";
import type { Operation } from "@/lib/calculator/types";
import Choice from "./Choice";
export default function TaskBrowser({
  choose,
  compact = false,
}: {
  choose: (o: Operation) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All subjects");
  const featured = [
    "solve",
    "system",
    "multiple_integral",
    "matrix_inverse",
    "distribution",
    "logic",
    "critical_points",
    "describe",
  ];
  const shown = compact
    ? featured.map((id) => operations.find((o) => o.id === id)!)
    : operations.filter(
        (o) =>
          (category === "All subjects" || o.category === category) &&
          (
            o.name +
            " " +
            o.keywords +
            " " +
            o.description +
            " " +
            o.fields.map((f) => f.value).join(" ")
          )
            .toLowerCase()
            .includes(search.toLowerCase()),
      );
  return (
    <section className={compact ? "task-shelf" : "task-browser"}>
      <div className="section-heading">
        <div>
          <span className="section-label">
            {compact ? "CHOOSE A PROBLEM" : "EXPLORE MATHEMATICS"}
          </span>
          <h2>
            {compact ? "What do you want to find?" : "Find the right tool"}
          </h2>
        </div>
      </div>
      {!compact && (
        <div className="task-filters">
          <label>
            Search tasks or examples
            <input
              placeholder="Try roots, area, normal probability…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Subject
            <Choice
              label="Subject"
              value={category}
              onChange={setCategory}
              options={["All subjects", ...categories]}
            />
          </label>
        </div>
      )}
      <div className="task-grid">
        {shown.map((o) => (
          <button key={o.id} onClick={() => choose(o)}>
            <span className="task-category">{o.category}</span>
            {compact && (
              <span className="task-glyph" aria-hidden="true">
                {
                  (
                    {
                      solve: "x = ?",
                      system: "x, y",
                      multiple_integral: "∫∫",
                      matrix_inverse: "A⁻¹",
                      distribution: "P(X)",
                      logic: "p ⇒ q",
                      critical_points: "f′(x)",
                      describe: "x̄",
                    } as Record<string, string>
                  )[o.id]
                }
              </span>
            )}
            <strong>{o.name}</strong>
            <span>{o.description}</span>
          </button>
        ))}
      </div>
      {!shown.length && (
        <p>No matching tasks. Try a mathematical name or another subject.</p>
      )}
    </section>
  );
}
