"use client";
import { useState } from "react";
import Choice from "./Choice";
import {
  INVESTIGATION_LIMITS,
  setInvestigationParameters,
} from "@/lib/calculator/investigations";
import { generateInvestigationCases } from "@/lib/calculator/investigation-analysis";
import type {
  InvestigationPlan,
  PlanEditResult,
} from "@/lib/calculator/investigations";
import type { CaseSweepDraft } from "@/lib/calculator/investigation-analysis";

export default function InvestigationAuthoring({
  plan,
  onPlan,
}: {
  plan: InvestigationPlan;
  onPlan: (plan: InvestigationPlan) => void;
}) {
  const [roster, setRoster] = useState(plan.parameters.join(", "));
  const [rosterError, setRosterError] = useState("");
  const [draft, setDraft] = useState<CaseSweepDraft>({
    kind: "linear",
    parameter: plan.parameters[0] || "",
    baseCaseId: plan.cases[0].id,
    start: "0",
    end: "4",
    count: "5",
  });
  const [preview, setPreview] = useState<{
    fingerprint: string;
    result: PlanEditResult;
  } | null>(null);
  const fingerprint = JSON.stringify({ plan, draft });
  const displayed =
    preview?.fingerprint === fingerprint ? preview.result : null;
  const changeDraft = (
    value: Partial<
      Pick<CaseSweepDraft, "parameter" | "baseCaseId" | "start" | "count">
    >,
  ) => setDraft({ ...draft, ...value });
  return (
    <section className="investigation-authoring">
      <h3>Parameters</h3>
      <label>
        Parameter names
        <input
          maxLength={180}
          value={roster}
          placeholder="p, q"
          onChange={(e) => {
            setRoster(e.target.value);
            setRosterError("");
          }}
          aria-describedby="parameter-roster-help"
        />
      </label>
      <p className="small muted" id="parameter-roster-help">
        Separate names with commas. Up to six. New parameters start at 0.
        Removing or renaming a parameter does not rewrite questions or Objects.
      </p>
      <button
        className="subtle"
        onClick={() => {
          const result = setInvestigationParameters({
            plan,
            parameters: roster.trim()
              ? roster.split(",").map((name) => name.trim())
              : [],
          });
          if (result.kind === "invalid") setRosterError(result.message);
          else {
            onPlan(result.plan);
            setRosterError("");
          }
        }}
      >
        Apply parameter names
      </button>
      {rosterError && (
        <p className="warning" role="alert">
          {rosterError}
        </p>
      )}
      <details className="investigation-generator">
        <summary>Generate exact cases</summary>
        <p className="small muted">
          Replace all next-run cases. Numeric literals only, including fractions
          and scientific decimals. Other parameter values come from one base
          case. Manual cases can use expressions.
        </p>
        <div className="investigation-generator-fields">
          <label>
            Sequence
            <Choice
              label="Case sequence"
              value={draft.kind}
              options={[
                { value: "linear", label: "Linear, including both endpoints" },
                { value: "geometric", label: "Geometric, multiply each time" },
              ]}
              onChange={(kind) => {
                const common = {
                  parameter: draft.parameter,
                  baseCaseId: draft.baseCaseId,
                  start: draft.start,
                  count: draft.count,
                };
                if (kind === "linear") setDraft({ ...common, kind, end: "4" });
                if (kind === "geometric")
                  setDraft({ ...common, kind, multiplier: "1/10" });
              }}
            />
          </label>
          <label>
            Vary parameter
            <Choice
              label="Sweep parameter"
              value={draft.parameter}
              options={plan.parameters}
              onChange={(parameter) => changeDraft({ parameter })}
            />
          </label>
          <label>
            Base case for other values
            <Choice
              label="Sweep base case"
              value={draft.baseCaseId}
              options={plan.cases.map((c) => ({
                value: c.id,
                label: c.label || c.id,
              }))}
              onChange={(baseCaseId) => changeDraft({ baseCaseId })}
            />
          </label>
          <label>
            Start
            <input
              maxLength={256}
              value={draft.start}
              spellCheck={false}
              onChange={(e) => changeDraft({ start: e.target.value })}
            />
          </label>
          {draft.kind === "linear" ? (
            <label>
              End
              <input
                maxLength={256}
                value={draft.end}
                spellCheck={false}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </label>
          ) : (
            <label>
              Multiplier
              <input
                maxLength={256}
                value={draft.multiplier}
                spellCheck={false}
                onChange={(e) =>
                  setDraft({ ...draft, multiplier: e.target.value })
                }
              />
            </label>
          )}
          <label>
            Number of cases
            <input
              type="number"
              min={2}
              max={INVESTIGATION_LIMITS.cases}
              step={1}
              value={draft.count}
              onChange={(e) => changeDraft({ count: e.target.value })}
            />
          </label>
        </div>
        <button
          className="subtle"
          disabled={!plan.parameters.length}
          onClick={() =>
            setPreview({
              fingerprint,
              result: generateInvestigationCases({ plan, draft }),
            })
          }
        >
          Preview replacement cases
        </button>
        {!plan.parameters.length && (
          <p className="small muted">Add a parameter to generate cases.</p>
        )}
        {preview && !displayed && (
          <p role="status">
            The plan or sequence changed. Preview again before applying.
          </p>
        )}
        {displayed?.kind === "invalid" && (
          <p className="warning" role="alert">
            {displayed.field}: {displayed.message}
          </p>
        )}
        {displayed?.kind === "ready" && (
          <div className="investigation-case-preview">
            <p role="status">
              {displayed.plan.cases.length} replacement cases ·{" "}
              {displayed.plan.cases.length * displayed.plan.steps.length}{" "}
              calculations. Original runs stay available.
            </p>
            <ol>
              {displayed.plan.cases.map((c) => (
                <li key={c.id}>
                  {Object.entries(c.values).map(([name, value]) => (
                    <code key={name}>
                      {name} = {value}{" "}
                    </code>
                  ))}
                </li>
              ))}
            </ol>
            <button
              className="primary"
              onClick={() => {
                if (preview?.fingerprint === fingerprint) {
                  onPlan(displayed.plan);
                  setDraft({
                    ...draft,
                    baseCaseId: displayed.plan.cases[0].id,
                  });
                  setPreview(null);
                }
              }}
            >
              Apply displayed cases
            </button>
          </div>
        )}
      </details>
    </section>
  );
}
