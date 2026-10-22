"use client";
import { useState } from "react";
import { Play, Square, Plus, Trash2, ArrowUpRight } from "lucide-react";
import Choice from "./Choice";
import MathView from "./MathView";
import RichResult from "./RichResult";
import { Preview, ProblemPreview } from "./StructuredFields";
import { operations } from "@/lib/calculator/catalog";
import { initialOperationParams } from "@/lib/calculator/operation-params";
import { investigationLabs } from "@/lib/calculator/investigation-labs";
import {
  investigationComparison,
  investigationIsCurrent,
} from "@/lib/calculator/investigations";
import type {
  InvestigationPlan,
  InvestigationStep,
  RunAction,
  RunActivity,
} from "@/lib/calculator/investigations";
import type { Entry, Notebook } from "@/lib/calculator/types";
import "./investigations.css";

function CellResult({ entry }: { entry: Entry }) {
  const result = entry.result,
    decimals = entry.settings.displayDecimals ?? 9;
  return (
    <>
      <span className={"result-badge status-" + result.status}>
        {result.status === "numeric" ? "Approximate" : result.status}
      </span>
      <div className="investigation-answer">
        {result.status === "error" ? (
          <p>{result.text}</p>
        ) : result.display ? (
          <RichResult
            node={result.display}
            displayDecimals={decimals}
            numeric={result.status === "numeric"}
          />
        ) : result.latex ? (
          <MathView
            latex={result.latex}
            block
            displayDecimals={decimals}
            numeric={result.status === "numeric"}
          />
        ) : (
          <pre>{result.text}</pre>
        )}
      </div>
      <details className="investigation-result-details">
        <summary>Full result and inputs</summary>
        {result.approx && (
          <>
            <span className="small">DECIMAL APPROXIMATION</span>
            <Preview source={result.approx} block />
          </>
        )}
        {result.detailDisplay && (
          <RichResult
            node={result.detailDisplay}
            displayDecimals={decimals}
            numeric={result.status === "numeric"}
          />
        )}
        {result.details && <pre>{JSON.stringify(result.details, null, 2)}</pre>}
        {result.notes.map((note, i) => (
          <p key={i}>{note}</p>
        ))}
        <span className="small">ORIGINAL REQUEST</span>
        <pre>
          {JSON.stringify(
            {
              operation: entry.operation,
              input: entry.input,
              mode: entry.mode,
              params: entry.params,
            },
            null,
            2,
          )}
        </pre>
        <span className="small">ORIGINAL OBJECTS</span>
        {entry.definitions.map((d) => (
          <p key={d.id}>
            <strong>
              {d.name}
              {d.args ? "(" + d.args + ")" : ""}
            </strong>{" "}
            = <code>{d.expression}</code>
          </p>
        ))}
        <pre>{JSON.stringify(entry.settings, null, 2)}</pre>
      </details>
    </>
  );
}
export default function Investigations({
  notebook,
  activity,
  busy,
  ready,
  onStart,
  onPlan,
  onRun,
  onStop,
  onEditStep,
  onObservation,
  onDeleteRun,
  onRemove,
  onObjects,
}: {
  notebook: Notebook;
  activity: RunActivity;
  busy: boolean;
  ready: boolean;
  onStart: (id: string) => void;
  onPlan: (plan: InvestigationPlan) => void;
  onRun: (action: RunAction) => void;
  onStop: () => void;
  onEditStep: (step: InvestigationStep) => void;
  onObservation: (runId: string, value: string) => void;
  onDeleteRun: (runId: string) => void;
  onRemove: (keepResults: boolean) => void;
  onObjects: () => void;
}) {
  const [selection, setSelection] = useState("");
  const [caseSelection, setCaseSelection] = useState("");
  const investigation = notebook.investigation;
  const running =
    activity.kind === "running" && activity.notebookId === notebook.id
      ? activity
      : null;
  const selected =
    investigation?.runs.find((r) => r.id === (running?.runId || selection)) ||
    investigation?.runs.at(-1);
  const comparison = selected
    ? investigationComparison({ notebook, runId: selected.id })
    : null;
  const displayedPlan = selected?.snapshot.plan || investigation?.plan;
  const selectedCase =
    displayedPlan?.cases.find((c) => c.id === caseSelection)?.id ||
    displayedPlan?.cases[0]?.id;
  const updateStep = (
    id: string,
    fn: (step: InvestigationStep) => InvestigationStep,
  ) => {
    if (investigation)
      onPlan({
        ...investigation.plan,
        steps: investigation.plan.steps.map((s) => (s.id === id ? fn(s) : s)),
      });
  };
  return (
    <div className="investigations">
      <div className="section-heading">
        <div>
          <span className="section-label">
            REPEATABLE MATHEMATICAL EXPERIMENTS
          </span>
          <h1>
            Investigate<span className="brand-dot">.</span>
          </h1>
        </div>
      </div>
      {!investigation ? (
        <p className="investigation-intro">
          Change a few cases. Ask the same questions. Keep the original evidence
          when your ideas change.
        </p>
      ) : (
        <>
          <section className="investigation-workspace">
            <span className="section-label">{notebook.name}</span>
            <h2>{displayedPlan?.question}</h2>
            <p className="investigation-guide">{displayedPlan?.guide}</p>
            <div className="row wrap investigation-actions">
              <button
                className="primary"
                disabled={busy || !ready}
                onClick={() => {
                  setSelection("");
                  onRun({ kind: "new" });
                }}
              >
                <Play size={16} /> Run{" "}
                {investigation.plan.cases.length *
                  investigation.plan.steps.length}{" "}
                calculations
              </button>
              {running && (
                <button className="subtle" onClick={onStop}>
                  <Square size={15} /> Stop
                </button>
              )}
              <button className="subtle" onClick={onObjects}>
                Edit shared objects <ArrowUpRight size={15} />
              </button>
            </div>
            <p className="small muted">
              Next run ·{" "}
              {investigation.plan.settings.angle === "rad"
                ? "Radians"
                : "Degrees"}{" "}
              · {investigation.plan.settings.domain} ·{" "}
              {investigation.plan.settings.precision} digit precision.
              Calculator settings stay separate.
            </p>
            {running && (
              <p role="status">
                Running sequentially · {running.saved} of {running.total}{" "}
                results retained in this workspace.
              </p>
            )}
            {selected && !investigationIsCurrent(notebook, selected) && (
              <p className="warning">
                The next plan or shared objects differ. This comparison shows
                the selected run’s original inputs.
              </p>
            )}
            <details
              className="investigation-editor"
              open={!investigation.runs.length || undefined}
            >
              <summary>Edit next run</summary>
              <label>
                Investigation question
                <textarea
                  maxLength={4000}
                  value={investigation.plan.question}
                  onChange={(e) =>
                    onPlan({ ...investigation.plan, question: e.target.value })
                  }
                />
              </label>
              <label>
                Guide
                <textarea
                  maxLength={8000}
                  rows={4}
                  value={investigation.plan.guide}
                  onChange={(e) =>
                    onPlan({ ...investigation.plan, guide: e.target.value })
                  }
                />
              </label>
              <div className="field-grid">
                <label>
                  Angle
                  <Choice
                    label="Investigation angle"
                    value={investigation.plan.settings.angle}
                    options={["rad", "deg"]}
                    onChange={(value) => {
                      if (value === "rad" || value === "deg")
                        onPlan({
                          ...investigation.plan,
                          settings: {
                            ...investigation.plan.settings,
                            angle: value,
                          },
                        });
                    }}
                  />
                </label>
                <label>
                  Domain
                  <Choice
                    label="Investigation domain"
                    value={investigation.plan.settings.domain}
                    options={["real", "complex"]}
                    onChange={(value) => {
                      if (value === "real" || value === "complex")
                        onPlan({
                          ...investigation.plan,
                          settings: {
                            ...investigation.plan.settings,
                            domain: value,
                          },
                        });
                    }}
                  />
                </label>
                <label>
                  Precision
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={investigation.plan.settings.precision}
                    onChange={(e) => {
                      const precision = Number(e.target.value);
                      if (
                        Number.isInteger(precision) &&
                        precision >= 5 &&
                        precision <= 200
                      )
                        onPlan({
                          ...investigation.plan,
                          settings: {
                            ...investigation.plan.settings,
                            precision,
                          },
                        });
                    }}
                  />
                </label>
              </div>
              <label>
                Assumptions
                <input
                  maxLength={1000}
                  value={investigation.plan.settings.assumptions}
                  onChange={(e) =>
                    onPlan({
                      ...investigation.plan,
                      settings: {
                        ...investigation.plan.settings,
                        assumptions: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <h3>Parameter cases</h3>
              <p className="small muted">
                Each case overrides these named parameters. Other objects come
                from Objects.
              </p>
              <div className="investigation-cases">
                {investigation.plan.cases.map((c, index) => (
                  <fieldset key={c.id}>
                    <legend>Case {index + 1}</legend>
                    <label>
                      Case label
                      <input
                        maxLength={100}
                        value={c.label}
                        onChange={(e) =>
                          onPlan({
                            ...investigation.plan,
                            cases: investigation.plan.cases.map((item) =>
                              item.id === c.id
                                ? { ...item, label: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    {investigation.plan.parameters.map((parameter) => (
                      <label key={parameter}>
                        {parameter}
                        <input
                          maxLength={12000}
                          spellCheck={false}
                          value={c.values[parameter]}
                          onChange={(e) =>
                            onPlan({
                              ...investigation.plan,
                              cases: investigation.plan.cases.map((item) =>
                                item.id === c.id
                                  ? {
                                      ...item,
                                      values: {
                                        ...item.values,
                                        [parameter]: e.target.value,
                                      },
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    <button
                      className="text-action"
                      disabled={investigation.plan.cases.length <= 1}
                      onClick={() =>
                        onPlan({
                          ...investigation.plan,
                          cases: investigation.plan.cases.filter(
                            (item) => item.id !== c.id,
                          ),
                        })
                      }
                    >
                      Remove case {index + 1}
                    </button>
                  </fieldset>
                ))}
              </div>
              <button
                className="subtle"
                disabled={investigation.plan.cases.length >= 8}
                onClick={() => {
                  const first = investigation.plan.cases[0];
                  if (first)
                    onPlan({
                      ...investigation.plan,
                      cases: [
                        ...investigation.plan.cases,
                        {
                          ...first,
                          id: crypto.randomUUID(),
                          label: "New case",
                          values: { ...first.values },
                        },
                      ],
                    });
                }}
              >
                <Plus size={15} /> Add case
              </button>
              <h3>Questions to calculate</h3>
              {investigation.plan.steps.map((step, index) => {
                const operation = operations.find(
                  (o) => o.id === step.request.operation,
                );
                return (
                  <section className="investigation-step" key={step.id}>
                    <label>
                      Step {index + 1} question
                      <input
                        maxLength={300}
                        value={step.question}
                        onChange={(e) =>
                          updateStep(step.id, (s) => ({
                            ...s,
                            question: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <Choice
                      label={"Step " + (index + 1) + " operation"}
                      value={step.request.operation}
                      options={operations.map((o) => ({
                        value: o.id,
                        label: o.name,
                      }))}
                      onChange={(value) => {
                        const next = operations.find((o) => o.id === value);
                        if (next)
                          updateStep(step.id, (s) => ({
                            ...s,
                            request: {
                              operation: next.id,
                              input: "",
                              mode: "text",
                              params: initialOperationParams(next),
                            },
                          }));
                      }}
                    />
                    {operation ? (
                      <>
                        <ProblemPreview
                          op={operation}
                          params={step.request.params}
                          compact
                        />
                        <button
                          className="subtle"
                          onClick={() => onEditStep(step)}
                        >
                          Edit step {index + 1} inputs
                        </button>
                      </>
                    ) : (
                      <p>
                        Historical operation {step.request.operation} is
                        unavailable for execution.
                      </p>
                    )}
                  </section>
                );
              })}
            </details>
          </section>
          {comparison && selected && (
            <section className="investigation-comparison">
              <div className="row wrap spread">
                <label>
                  Saved run
                  <Choice
                    label="Saved investigation run"
                    value={selected.id}
                    options={investigation.runs.map((r, i) => ({
                      value: r.id,
                      label:
                        "Run " +
                        (i + 1) +
                        " · " +
                        new Date(r.createdAt).toLocaleString(),
                    }))}
                    onChange={setSelection}
                  />
                </label>
                <span>
                  {comparison.saved === comparison.total
                    ? "Complete"
                    : "Partial"}{" "}
                  · {comparison.saved} of {comparison.total} results
                </span>
              </div>
              <p className="small muted">
                Original run · {selected.snapshot.plan.settings.angle} ·{" "}
                {selected.snapshot.plan.settings.domain} ·{" "}
                {selected.snapshot.plan.settings.precision} digit precision.
                Completed cells include mathematical errors. A missing result
                establishes nothing.
              </p>
              {comparison.saved < comparison.total && (
                <button
                  className="subtle"
                  disabled={busy || !ready}
                  onClick={() => onRun({ kind: "resume", runId: selected.id })}
                >
                  Resume {comparison.total - comparison.saved} missing
                  calculations
                </button>
              )}
              <label className="investigation-phone-case">
                Comparison case
                <Choice
                  label="Comparison case"
                  value={selectedCase || ""}
                  options={selected.snapshot.plan.cases.map((c) => ({
                    value: c.id,
                    label: c.label,
                  }))}
                  onChange={setCaseSelection}
                />
              </label>
              <div className="table-scroll investigation-table">
                <table>
                  <caption>{selected.snapshot.plan.question}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Question</th>
                      {selected.snapshot.plan.cases.map((c) => (
                        <th
                          scope="col"
                          key={c.id}
                          className={
                            c.id === selectedCase ? "is-selected-case" : ""
                          }
                        >
                          {c.label}
                          {Object.entries(c.values).map(
                            ([parameter, value]) => (
                              <div className="small" key={parameter}>
                                {parameter} = {value}
                              </div>
                            ),
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.rows.map(({ step, cells }) => (
                      <tr key={step.id}>
                        <th scope="row">{step.question}</th>
                        {cells.map((cell, index) => (
                          <td
                            key={selected.snapshot.plan.cases[index].id}
                            className={
                              selected.snapshot.plan.cases[index].id ===
                              selectedCase
                                ? "is-selected-case"
                                : ""
                            }
                          >
                            {cell.kind === "saved" ? (
                              <CellResult entry={cell.entry} />
                            ) : (
                              <p className="muted">No saved result</p>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="investigation-snapshot">
                <summary>Original run snapshot</summary>
                <p>{selected.snapshot.plan.guide}</p>
                <h3>Shared objects before case overrides</h3>
                {selected.snapshot.context.definitions.map((d) => (
                  <p key={d.id}>
                    <strong>
                      {d.name}
                      {d.args ? "(" + d.args + ")" : ""}
                    </strong>{" "}
                    = <code>{d.expression}</code>
                  </p>
                ))}
                <pre>{JSON.stringify(selected.snapshot.plan, null, 2)}</pre>
              </details>
              <label>
                My observation
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={selected.observation}
                  onChange={(e) => onObservation(selected.id, e.target.value)}
                  placeholder="What changed? What does this evidence establish?"
                />
              </label>
              <details>
                <summary>Remove this run</summary>
                <p>
                  Removes this run and its calculated history entries. Other
                  runs stay available.
                </p>
                <button
                  className="text-action"
                  onClick={() => onDeleteRun(selected.id)}
                >
                  <Trash2 size={14} /> Delete selected run and its results
                </button>
              </details>
            </section>
          )}
          <details className="investigation-remove">
            <summary>Remove investigation</summary>
            <p>
              Choose whether its calculated entries remain in ordinary history.
            </p>
            <div className="row wrap">
              <button className="subtle" onClick={() => onRemove(true)}>
                Remove plan, keep calculations
              </button>
              <button className="text-action" onClick={() => onRemove(false)}>
                Remove plan and its calculations
              </button>
            </div>
          </details>
        </>
      )}
      <section className="investigation-library">
        <div className="section-heading">
          <div>
            <span className="section-label">START ANOTHER QUESTION</span>
            <h2>Four ways to investigate.</h2>
          </div>
        </div>
        <div className="investigation-labs">
          {investigationLabs.map((lab) => (
            <article key={lab.id}>
              <span className="section-label">
                {lab.plan.cases.length} CASES · {lab.plan.steps.length}{" "}
                QUESTIONS
              </span>
              <h3>{lab.title}</h3>
              <p>{lab.summary}</p>
              <button className="subtle" onClick={() => onStart(lab.id)}>
                Start in a new notebook <ArrowUpRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
