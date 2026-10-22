import { operations } from "./catalog";
import { investigationLabs } from "./investigation-labs";
import { newNotebook, uid } from "./types";
import { isSettings, isDefinition } from "./workspace-values";
import type { Definition, Entry, Notebook, Settings } from "./types";

export type CalculationRequest = Pick<
  Entry,
  "operation" | "input" | "mode" | "params"
>;
export type CalculationContext = Pick<
  Entry,
  "definitions" | "settings" | "revision"
>;
export type InvestigationCase = {
  id: string;
  label: string;
  values: Record<string, string>;
};
export type InvestigationStep = {
  id: string;
  question: string;
  request: CalculationRequest;
};
export type InvestigationPlan = {
  question: string;
  guide: string;
  parameters: string[];
  cases: InvestigationCase[];
  steps: InvestigationStep[];
  settings: Settings;
};
export type InvestigationRun = {
  id: string;
  createdAt: number;
  snapshot: { plan: InvestigationPlan; context: CalculationContext };
  observation: string;
};
export type Investigation = {
  version: 1;
  source?: { labId: string; version: number };
  plan: InvestigationPlan;
  runs: InvestigationRun[];
};
export type InvestigationCell = {
  runId: string;
  caseId: string;
  stepId: string;
};
export type RunAction = { kind: "new" } | { kind: "resume"; runId: string };
export type RunActivity =
  | { kind: "idle" }
  | {
      kind: "running";
      notebookId: string;
      runId: string;
      saved: number;
      total: number;
    };
export type ComparisonCell =
  { kind: "saved"; entry: Entry } | { kind: "missing" };
export type InvestigationLab = {
  id: string;
  version: number;
  title: string;
  summary: string;
  definitions: Pick<Definition, "name" | "expression" | "kind" | "args">[];
  plan: Omit<InvestigationPlan, "settings">;
  settings: Partial<Settings>;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const str = (value: unknown, length = 12000): value is string =>
  typeof value === "string" && value.length <= length;
const id = (value: unknown): value is string =>
  str(value, 100) && value.length > 0;
const natural = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function isDefinitions(value: unknown): value is Definition[] {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(isDefinition) &&
    new Set(value.map((d) => d.id)).size === value.length &&
    new Set(value.map((d) => d.name)).size === value.length
  );
}
function isRequest(value: unknown): value is CalculationRequest {
  return (
    record(value) &&
    str(value.operation, 100) &&
    str(value.input) &&
    (value.mode === "text" ||
      value.mode === "math" ||
      value.mode === "latex") &&
    record(value.params) &&
    Object.values(value.params).every((v) => str(v))
  );
}
function isCase(value: unknown): value is InvestigationCase {
  return (
    record(value) &&
    onlyKeys(value, ["id", "label", "values"]) &&
    id(value.id) &&
    str(value.label, 100) &&
    record(value.values) &&
    Object.values(value.values).every((v) => str(v))
  );
}
function isStep(value: unknown): value is InvestigationStep {
  return (
    record(value) &&
    onlyKeys(value, ["id", "question", "request"]) &&
    id(value.id) &&
    str(value.question, 300) &&
    isRequest(value.request)
  );
}
function isPlan(value: unknown): value is InvestigationPlan {
  if (
    !record(value) ||
    !onlyKeys(value, [
      "question",
      "guide",
      "parameters",
      "cases",
      "steps",
      "settings",
    ]) ||
    !str(value.question, 4000) ||
    !str(value.guide, 8000) ||
    !isSettings(value.settings) ||
    !Array.isArray(value.parameters) ||
    value.parameters.length > 6 ||
    !value.parameters.every(
      (p) => str(p, 24) && /^[A-Za-z][A-Za-z0-9_]*$/.test(p),
    ) ||
    new Set(value.parameters).size !== value.parameters.length ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    value.cases.length > 8 ||
    !value.cases.every(isCase) ||
    new Set(value.cases.map((c) => c.id)).size !== value.cases.length ||
    !Array.isArray(value.steps) ||
    !value.steps.length ||
    value.steps.length > 6 ||
    !value.steps.every(isStep) ||
    new Set(value.steps.map((s) => s.id)).size !== value.steps.length
  )
    return false;
  const parameters = value.parameters;
  return value.cases.every(
    (c) =>
      Object.keys(c.values).length === parameters.length &&
      parameters.every((p) => typeof c.values[p] === "string"),
  );
}
function sameSettings(a: Settings, b: Settings) {
  return (
    a.angle === b.angle &&
    a.domain === b.domain &&
    a.precision === b.precision &&
    a.displayDecimals === b.displayDecimals &&
    a.assumptions === b.assumptions
  );
}
function requestValues(request: CalculationRequest) {
  return {
    operation: request.operation,
    input: request.input,
    mode: request.mode,
    params: Object.entries(request.params).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  };
}
function definitionValues(definitions: Definition[]) {
  return definitions
    .map((d) => ({
      name: d.name,
      expression: d.expression,
      kind: d.kind,
      args: d.args || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function boundCaseDefinitions(run: InvestigationRun, c: InvestigationCase) {
  const definitions = run.snapshot.context.definitions.filter(
    (d) => !run.snapshot.plan.parameters.includes(d.name),
  );
  for (const parameter of run.snapshot.plan.parameters) {
    const original = run.snapshot.context.definitions.find(
      (d) => d.name === parameter,
    );
    let id = original?.id || "parameter:" + parameter;
    for (
      let suffix = 1;
      suffix <= definitions.length && definitions.some((d) => d.id === id);
      suffix++
    )
      id = "parameter:" + parameter + ":" + suffix;
    definitions.push({
      id,
      name: parameter,
      kind: "expression",
      expression: c.values[parameter],
      updated: original?.updated || run.createdAt,
    });
  }
  if (definitions.length > 500)
    throw Error(
      "Case bindings would exceed 500 objects. Remove an object before running.",
    );
  return definitions;
}
function isRun(value: unknown): value is InvestigationRun {
  return (
    record(value) &&
    onlyKeys(value, ["id", "createdAt", "snapshot", "observation"]) &&
    id(value.id) &&
    natural(value.createdAt) &&
    str(value.observation, 4000) &&
    record(value.snapshot) &&
    onlyKeys(value.snapshot, ["plan", "context"]) &&
    isPlan(value.snapshot.plan) &&
    record(value.snapshot.context) &&
    onlyKeys(value.snapshot.context, ["definitions", "settings", "revision"]) &&
    isSettings(value.snapshot.context.settings) &&
    natural(value.snapshot.context.revision) &&
    isDefinitions(value.snapshot.context.definitions) &&
    sameSettings(value.snapshot.plan.settings, value.snapshot.context.settings)
  );
}
function isCell(value: unknown): value is InvestigationCell {
  return (
    record(value) &&
    onlyKeys(value, ["runId", "caseId", "stepId"]) &&
    id(value.runId) &&
    id(value.caseId) &&
    id(value.stepId)
  );
}
function isSource(value: unknown): value is { labId: string; version: number } {
  return record(value) && id(value.labId) && natural(value.version);
}
export function validateInvestigation(
  value: unknown,
  history: readonly Entry[],
): Investigation {
  if (
    !record(value) ||
    !onlyKeys(value, ["version", "source", "plan", "runs"]) ||
    value.version !== 1 ||
    !isPlan(value.plan) ||
    !Array.isArray(value.runs) ||
    value.runs.length > 20 ||
    !value.runs.every(isRun) ||
    new Set(value.runs.map((r) => r.id)).size !== value.runs.length ||
    (value.source !== undefined && !isSource(value.source))
  )
    throw Error("Invalid investigation data.");
  const runs = value.runs;
  const cells = new Set<string>();
  for (const entry of history) {
    if (entry.investigation === undefined) continue;
    const cell = entry.investigation;
    if (!isCell(cell)) throw Error("Invalid investigation cell.");
    const run = runs.find((r) => r.id === cell.runId);
    const c = run?.snapshot.plan.cases.find((c) => c.id === cell.caseId);
    const step = run?.snapshot.plan.steps.find((s) => s.id === cell.stepId);
    const address = cellKey(cell);
    if (!run || !c || !step || cells.has(address))
      throw Error("Invalid or duplicate investigation cell reference.");
    if (
      JSON.stringify(requestValues(entry)) !==
        JSON.stringify(requestValues(step.request)) ||
      !sameSettings(entry.settings, run.snapshot.context.settings) ||
      entry.revision !== run.snapshot.context.revision ||
      JSON.stringify(definitionValues(entry.definitions)) !==
        JSON.stringify(definitionValues(boundCaseDefinitions(run, c)))
    )
      throw Error("Investigation cell inputs do not match its original run.");
    cells.add(address);
  }
  return {
    version: 1,
    plan: value.plan,
    runs,
    ...(value.source === undefined ? {} : { source: value.source }),
  };
}
export function createInvestigationNotebook({
  labId,
  workspaceSettings,
}: {
  labId: string;
  workspaceSettings: Settings;
}): Notebook {
  const lab = investigationLabs.find((l) => l.id === labId);
  if (!lab) throw Error("Choose an available investigation.");
  const notebook = newNotebook(lab.title);
  return {
    ...notebook,
    definitions: lab.definitions.map((d) => ({
      ...d,
      id: uid(),
      updated: Date.now(),
    })),
    investigation: {
      version: 1,
      source: { labId: lab.id, version: lab.version },
      plan: structuredClone({
        ...lab.plan,
        settings: { ...workspaceSettings, ...lab.settings },
      }),
      runs: [],
    },
  };
}
function cellKey(cell: InvestigationCell) {
  return JSON.stringify([cell.runId, cell.caseId, cell.stepId]);
}
export function investigationComparison({
  notebook,
  runId,
}: {
  notebook: Notebook;
  runId: string;
}) {
  const run = notebook.investigation?.runs.find((r) => r.id === runId);
  if (!run) throw Error("This investigation run is no longer available.");
  const entries = new Map(
    notebook.history.flatMap((e) =>
      e.investigation?.runId === runId
        ? [[cellKey(e.investigation), e] satisfies [string, Entry]]
        : [],
    ),
  );
  let saved = 0;
  const rows = run.snapshot.plan.steps.map((step) => ({
    step,
    cells: run.snapshot.plan.cases.map<ComparisonCell>((c) => {
      const entry = entries.get(
        cellKey({ runId, caseId: c.id, stepId: step.id }),
      );
      if (!entry) return { kind: "missing" };
      saved++;
      return { kind: "saved", entry };
    }),
  }));
  return {
    run,
    rows,
    saved,
    total: run.snapshot.plan.cases.length * rows.length,
  };
}
export function prepareInvestigationRun({
  notebook,
  action,
}: {
  notebook: Notebook;
  action: RunAction;
}) {
  const investigation = notebook.investigation;
  if (!investigation) throw Error("Start an investigation first.");
  if (action.kind === "new" && investigation.runs.length >= 20)
    throw Error(
      "This investigation has 20 runs. Delete a run or start a new notebook.",
    );
  const run =
    action.kind === "resume"
      ? investigation.runs.find((r) => r.id === action.runId)
      : {
          id: uid(),
          createdAt: Date.now(),
          observation: "",
          snapshot: structuredClone({
            plan: investigation.plan,
            context: {
              definitions: notebook.definitions,
              settings: investigation.plan.settings,
              revision: notebook.revision,
            },
          }),
        };
  if (!run) throw Error("This investigation run is no longer available.");
  const entries = new Set(
    notebook.history.flatMap((e) =>
      e.investigation ? [cellKey(e.investigation)] : [],
    ),
  );
  const missing = run.snapshot.plan.cases.flatMap((c) =>
    run.snapshot.plan.steps.flatMap((step) => {
      const cell = { runId: run.id, caseId: c.id, stepId: step.id };
      if (entries.has(cellKey(cell))) return [];
      if (!operations.some((o) => o.id === step.request.operation))
        throw Error(
          "Cannot run unsupported operation " +
            step.request.operation +
            ". Edit the next plan or retain this historical run.",
        );
      return [
        {
          cell,
          request: step.request,
          context: {
            ...run.snapshot.context,
            definitions: boundCaseDefinitions(run, c),
          },
        },
      ];
    }),
  );
  if (notebook.history.length + missing.length > 10000)
    throw Error(
      "This run would exceed 10,000 calculations. Export a backup, then use another notebook or remove calculations.",
    );
  return { run, missing };
}
export function investigationIsCurrent(
  notebook: Notebook,
  run: InvestigationRun,
) {
  const fingerprint = (plan: InvestigationPlan, definitions: Definition[]) =>
    JSON.stringify({
      parameters: [...plan.parameters].sort(),
      cases: plan.cases
        .map((c) => ({
          id: c.id,
          values: Object.entries(c.values).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      steps: plan.steps
        .map((s) => ({
          id: s.id,
          request: requestValues(s.request),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      settings: {
        angle: plan.settings.angle,
        domain: plan.settings.domain,
        precision: plan.settings.precision,
        assumptions: plan.settings.assumptions,
      },
      definitions: definitionValues(
        definitions.filter((d) => !plan.parameters.includes(d.name)),
      ),
    });
  return (
    notebook.investigation !== undefined &&
    fingerprint(notebook.investigation.plan, notebook.definitions) ===
      fingerprint(run.snapshot.plan, run.snapshot.context.definitions)
  );
}
export function removeInvestigation(
  notebook: Notebook,
  keepResults: boolean,
): Notebook {
  const rest = { ...notebook };
  delete rest.investigation;
  return {
    ...rest,
    history: notebook.history.flatMap((entry) => {
      if (!entry.investigation) return [entry];
      if (!keepResults) return [];
      const ordinary = { ...entry };
      delete ordinary.investigation;
      return [ordinary];
    }),
  };
}
