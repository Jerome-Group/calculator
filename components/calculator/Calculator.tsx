"use client";
import { engineBuild } from "@/lib/calculator/engine-build";
import { readOfflineStatus } from "@/lib/calculator/offline-status";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Sigma,
  Compass,
  FlaskConical,
  ChartNoAxesCombined,
  Shapes,
  Search,
  Keyboard,
  BookOpen,
  Settings2,
  HelpCircle,
  Plus,
  Trash2,
  Download,
  Upload,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import StructuredFields, {
  Preview,
  ProblemPreview,
  matrixRows,
  listItems,
  ListInput,
} from "./StructuredFields";
import RichResult from "./RichResult";
import CalculationAnswer, {
  CalculationDetails,
  CalculationStatus,
} from "./CalculationAnswer";
import TaskBrowser from "./TaskBrowser";
import Investigations from "./Investigations";
import {
  createInvestigationNotebook,
  prepareInvestigationRun,
  removeInvestigation,
} from "@/lib/calculator/investigations";
import type {
  CalculationRequest,
  CalculationContext,
  InvestigationCell,
  InvestigationStep,
  RunAction,
  RunActivity,
} from "@/lib/calculator/investigations";
import { WORKSPACE_SIZE_ERROR } from "@/lib/calculator/workspace-request";
import RecoveryBackups from "./RecoveryBackups";
import ResultPlot from "./ResultPlot";
import { accountStorage } from "@/lib/calculator/storage";
import {
  sessionWorkspace,
  captureAccountSession,
  workspaceFitsCloud,
} from "@/lib/calculator/sync";
import Choice from "./Choice";
import MathEditor, { MathEditorHandle } from "./MathEditor";
import MathView from "./MathView";
import {
  matrixRowsToLatex,
  sourceToMath,
  mathToSource,
} from "@/lib/calculator/notation";
import { initialOperationParams } from "@/lib/calculator/operation-params";
import { definitionDependenciesChanged } from "@/lib/calculator/definition-dependencies";
import { isDefinition } from "@/lib/calculator/workspace-values";
import { formatDisplayApprox } from "@/lib/calculator/display-format";
import GraphWorkspace, { makeGraph } from "./GraphWorkspace";
import { operations, categories } from "@/lib/calculator/catalog";
import {
  startEngine,
  calculate,
  cancelCalculation,
} from "@/lib/calculator/engine";
import { uid, newNotebook, DEFAULT_SETTINGS } from "@/lib/calculator/types";
import type {
  SavedState,
  Notebook,
  Definition,
  Entry,
  Operation,
  Settings,
  GraphSpec,
} from "@/lib/calculator/types";
import {
  persist,
  loadState,
  readDeviceSave,
  validateState,
  download,
  STORAGE_KEY,
  BACKUP_KEY,
} from "@/lib/calculator/storage";
const graphOperation: Operation = {
  id: "graph_analysis",
  name: "Analyze curve",
  category: "Graphs",
  description:
    "Analyze the selected function on an explicit interval. Results use the function, not sampled pixels.",
  keywords: "graph roots tangent area",
  fields: [
    { key: "expression", label: "Curve y = f(x)", value: "sin(x)" },
    {
      key: "action",
      label: "Find",
      value: "roots",
      choices: [
        "value",
        "roots",
        "intersection",
        "critical points",
        "tangent",
        "integral",
        "area",
        "domain",
        "singularities",
      ],
    },
    { key: "other", label: "Comparison curve g(x)", value: "0" },
    { key: "point", label: "Evaluation point x₀", value: "0" },
    { key: "lower", label: "Interval start", value: "-2" },
    { key: "upper", label: "Interval end", value: "2" },
    { key: "parameter", label: "Parameter a", value: "1" },
  ],
};
const historyOperation = (id: string) =>
  operations.find((o) => o.id === id) ||
  (id === "graph_analysis" ? graphOperation : undefined);
const initial = (): SavedState => {
  const b = newNotebook();
  return {
    version: 1,
    notebooks: [b],
    active: b.id,
    settings: DEFAULT_SETTINGS,
  };
};
const hide = () => {
  (window as any).mathVirtualKeyboard?.hide();
};
export default function Calculator() {
  const [saveLease] = useState(captureAccountSession);
  const [saveAttempt, setSaveAttempt] = useState<{
    state: SavedState;
    result: "saved" | "failed";
  } | null>(null);
  const [historyCount, setHistoryCount] = useState(30);
  const [runActivity, setRunActivity] = useState<RunActivity>({ kind: "idle" });
  const [stepEditor, setStepEditor] = useState<{
    notebookId: string;
    stepId: string;
  } | null>(null);
  const [selectedObject, setSelectedObject] = useState<string>(""),
    [syncStatus, setSyncStatus] = useState("Saved on this device"),
    [theme, setTheme] = useState("light");
  const [state, setState] = useState<SavedState | null>(null),
    [view, setView] = useState("calculate"),
    [status, setStatus] = useState("Loading local mathematics…"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [warning, setWarning] = useState(""),
    [paused, setPaused] = useState(false),
    [input, setInput] = useState(""),
    [latex, setLatex] = useState(""),
    [mode, setMode] = useState("math"),
    [keyboardRequested, setKeyboardRequested] = useState(false),
    [modal, setModal] = useState(""),
    [op, setOp] = useState<Operation | null>(null),
    [params, setParams] = useState<Record<string, string>>({}),
    [mathField, setMathField] = useState<{
      key: string;
      label: string;
      latex: string;
    } | null>(null),
    [obj, setObj] = useState<Partial<Definition> | null>(null),
    [name, setName] = useState(""),
    [kind, setKind] = useState<Definition["kind"]>("expression"),
    [body, setBody] = useState(""),
    [args, setArgs] = useState("x"),
    [grid, setGrid] = useState([
      ["1", "0"],
      ["0", "1"],
    ]),
    [matrixLoading, setMatrixLoading] = useState(false),
    [bookName, setBookName] = useState(""),
    [offline, setOffline] = useState({
      state: "Not prepared",
      done: 0,
      total: 0,
    });
  const math = useRef<MathEditorHandle>(null),
    field = useRef<MathEditorHandle>(null),
    file = useRef<HTMLInputElement>(null),
    undo = useRef<SavedState[]>([]),
    current = useRef(state),
    pendingSave = useRef<SavedState | null>(null),
    busyRef = useRef(false),
    computationGeneration = useRef(0),
    mounted = useRef(true),
    objectGeneration = useRef(0),
    objectModal = useRef(modal),
    fieldConversionGeneration = useRef(0),
    conversionGeneration = useRef(0),
    historyTarget = useRef<{ notebookId: string; entryId: Entry["id"] } | null>(
      null,
    ),
    historyArticles = useRef(new Map<Entry["id"], HTMLElement>()),
    editingSource = useRef({
      mode,
      input,
      latex,
      active: state?.active,
      op: op?.id,
      params,
    });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      computationGeneration.current++;
      busyRef.current = false;
      cancelCalculation();
    };
  }, []);
  useLayoutEffect(() => {
    current.current = state;
    pendingSave.current = paused ? null : state;
    if (state && mounted.current) saveLease.stageCommittedWorkspace(state);
    if (objectModal.current !== modal) fieldConversionGeneration.current++;
    objectModal.current = modal;
    editingSource.current = {
      mode,
      input,
      latex,
      active: state?.active,
      op: op?.id,
      params,
    };
  }, [state, paused, modal, mode, input, latex, op, params, saveLease]);
  const book = state?.notebooks.find((b) => b.id === state.active),
    settings = state?.settings || DEFAULT_SETTINGS,
    saveStatus = paused
      ? "Automatic saving is paused · export a backup"
      : saveAttempt?.state !== state
        ? "Saving your latest changes…"
        : saveAttempt?.result === "failed"
          ? "Device save failed · export a backup"
          : syncStatus;
  const focusHistoryTarget = useCallback(() => {
    const target = historyTarget.current;
    if (!target) return;
    if (
      view !== "calculate" ||
      book?.id !== target.notebookId ||
      !book.history.some((entry) => entry.id === target.entryId)
    ) {
      historyTarget.current = null;
      return;
    }
    const article = historyArticles.current.get(target.entryId);
    if (!article) return;
    historyTarget.current = null;
    article.focus();
    article.scrollIntoView({ block: "nearest" });
  }, [view, book]);
  useLayoutEffect(focusHistoryTarget, [focusHistoryTarget, historyCount]);
  const openHistoryEntry = (notebookId: string, entryId: Entry["id"]) => {
    const latest = current.current;
    if (latest?.active !== notebookId) return;
    const index = latest.notebooks
      .find((b) => b.id === notebookId)
      ?.history.findIndex((entry) => entry.id === entryId);
    if (index === undefined || index < 0) return;
    historyTarget.current = { notebookId, entryId };
    setHistoryCount((count) => Math.max(count, index + 1));
    setView("calculate");
    hide();
  };
  useEffect(() => {
    const listener = (event: Event) =>
      setSyncStatus((event as CustomEvent).detail);
    window.addEventListener("calculator-sync", listener);
    const t = readDeviceSave("calculator.theme") || "light";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    return () => window.removeEventListener("calculator-sync", listener);
  }, []);
  useEffect(() => {
    const s = loadState();
    const hydrated = sessionWorkspace();
    setState(hydrated || s.state || initial());
    setWarning(
      hydrated && s.warning && !s.state
        ? "The unreadable device save is preserved. Your signed-in workspace is available; export a backup before closing."
        : s.warning,
    );
    if (s.warning && !s.state && !hydrated) setPaused(true);
    startEngine(setStatus);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const flushSave = useCallback(() => {
    const snapshot = pendingSave.current;
    if (!snapshot || !mounted.current || !saveLease.isCurrent()) return;
    try {
      persist(snapshot);
      setSaveAttempt({ state: snapshot, result: "saved" });
      setWarning((current) =>
        current ===
        "The latest changes could not be saved. Export a backup before closing."
          ? ""
          : current,
      );
    } catch {
      setSaveAttempt({ state: snapshot, result: "failed" });
      setWarning(
        "The latest changes could not be saved. Export a backup before closing.",
      );
    }
  }, [saveLease]);
  useEffect(() => {
    window.addEventListener("pagehide", flushSave);
    return () => window.removeEventListener("pagehide", flushSave);
  }, [flushSave]);
  useEffect(() => {
    if (!state || paused) return;
    const t = setTimeout(flushSave, 200);
    return () => clearTimeout(t);
  }, [state, paused, flushSave]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setOffline({
        state: "Offline reopening is unavailable in this browser context.",
        done: 0,
        total: 0,
      });
      return;
    }
    const handler = (e: MessageEvent) => {
      const status = readOfflineStatus(e.data);
      if (status) setOffline(status);
    };
    navigator.serviceWorker.addEventListener("message", handler);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) =>
        (reg.active || reg.waiting || reg.installing)?.postMessage({
          type: "STATUS",
          protocol: engineBuild.protocol,
          engineId: engineBuild.id,
        }),
      )
      .catch(() =>
        setOffline({
          state: "Offline reopening is unavailable in this browser context.",
          done: 0,
          total: 0,
        }),
      );
    return () =>
      navigator.serviceWorker.removeEventListener("message", handler);
  }, []);
  const change = (fn: (s: SavedState) => SavedState, saveUndo = false) =>
    setState((s) => {
      if (!s) return s;
      if (saveUndo) {
        undo.current.push(structuredClone(s));
        if (undo.current.length > 20) undo.current.shift();
      }
      const next = fn(s);
      current.current = next;
      return next;
    });
  const patch = (
    fn: (b: Notebook) => Notebook,
    saveUndo = false,
    target?: string,
  ) =>
    change(
      (s) => ({
        ...s,
        notebooks: s.notebooks.map((b) =>
          b.id === (target || s.active) ? fn(b) : b,
        ),
      }),
      saveUndo,
    );
  const openObject = (d: Partial<Definition> = {}) => {
    if (busyRef.current && d.kind === "matrix") {
      setNotice(
        "Wait for the calculation or stop it before opening a matrix editor.",
      );
      return;
    }
    const generation = ++objectGeneration.current;
    objectModal.current = "object";
    setObj(d);
    setName(d.name || "");
    setKind(d.kind || "expression");
    setBody(d.expression || "");
    setArgs(d.args || "x");
    setGrid([
      ["1", "0"],
      ["0", "1"],
    ]);
    setMatrixLoading(false);
    setModal("object");
    hide();
    if (d.kind === "matrix" && d.expression)
      readObjectMatrix(d.expression, generation);
  };
  const readObjectMatrix = (expression: string, generation: number) => {
    if (busyRef.current) {
      setNotice(
        "Wait for the calculation or stop it before converting a matrix.",
      );
      return;
    }
    const stillEditing = () =>
      generation === objectGeneration.current &&
      objectModal.current === "object";
    setMatrixLoading(true);
    computeAuxiliary({
      operation: "matrix_cells",
      params: { expression },
      definitions: book?.definitions || [],
      settings,
    })
      .then((r) => {
        if (!stillEditing()) return;
        if (r.status === "error" || !r.details?.cells) {
          setKind("expression");
          setNotice("The original matrix expression is preserved for editing.");
        } else setGrid(r.details.cells);
      })
      .catch((e) => {
        if (!stillEditing()) return;
        setKind("expression");
        setNotice("The original matrix is preserved. " + String(e));
      })
      .finally(() => {
        if (generation === objectGeneration.current) setMatrixLoading(false);
      });
  };
  const changeObjectKind = (next: Definition["kind"]) => {
    if (next === kind || (next === "matrix" && busyRef.current)) return;
    const generation = ++objectGeneration.current,
      source =
        kind === "matrix" && !matrixLoading
          ? "Matrix([" +
            grid.map((r) => "[" + r.join(",") + "]").join(",") +
            "])"
          : body;
    setMatrixLoading(false);
    setBody(next === "dataset" && !source.trim() ? "[]" : source);
    setKind(next);
    if (next === "matrix" && source.trim())
      readObjectMatrix(source, generation);
  };
  useEffect(() => {
    if (keyboardRequested && mode === "math" && math.current) {
      math.current.keyboard();
      setKeyboardRequested(false);
    }
  }, [keyboardRequested, mode]);
  const closeModal = () => {
    fieldConversionGeneration.current++;
    if (objectModal.current === "object") {
      objectGeneration.current++;
      setMatrixLoading(false);
    }
    objectModal.current = "";
    setModal("");
    setStepEditor(null);
    hide();
  };
  const stopCalculation = () => {
    computationGeneration.current++;
    busyRef.current = false;
    setBusy(false);
    setRunActivity({ kind: "idle" });
    cancelCalculation();
    setNotice(
      "Stopped. Completed results remain; missing investigation cells can be resumed.",
    );
  };
  const computeAuxiliary = async (request: Parameters<typeof calculate>[0]) => {
    if (busyRef.current)
      throw Error("Another calculation is running. Wait or stop it first.");
    const generation = ++computationGeneration.current,
      lease = captureAccountSession();
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await calculate(request);
      if (
        !mounted.current ||
        generation !== computationGeneration.current ||
        !lease.isCurrent()
      )
        throw Error("This calculation session changed. Try again.");
      return result;
    } finally {
      if (mounted.current && generation === computationGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const executeEntry = async ({
    request,
    context,
    notebookId,
    cell,
    generation,
    lease,
  }: {
    request: CalculationRequest;
    context: CalculationContext;
    notebookId: string;
    cell?: InvestigationCell;
    generation: number;
    lease: ReturnType<typeof captureAccountSession>;
  }): Promise<
    | { kind: "saved"; entry: Readonly<Entry>; oversized: boolean }
    | { kind: "obsolete" }
  > => {
    const owns = () =>
      mounted.current &&
      generation === computationGeneration.current &&
      lease.isCurrent();
    if (!owns()) return { kind: "obsolete" };
    const result = await calculate({ ...request, ...context });
    if (!owns()) return { kind: "obsolete" };
    const entry: Entry = {
      ...structuredClone(request),
      ...structuredClone(context),
      id: uid(),
      result,
      time: Date.now(),
      ...(cell ? { investigation: cell } : {}),
    };
    return new Promise((resolve) => {
      change((s) => {
        if (!owns()) {
          resolve({ kind: "obsolete" });
          return s;
        }
        const target = s.notebooks.find((b) => b.id === notebookId);
        if (
          !target ||
          (cell && !target.investigation?.runs.some((r) => r.id === cell.runId))
        ) {
          resolve({ kind: "obsolete" });
          return s;
        }
        if (
          cell &&
          target.history.some(
            (e) =>
              e.investigation?.runId === cell.runId &&
              e.investigation.caseId === cell.caseId &&
              e.investigation.stepId === cell.stepId,
          )
        ) {
          resolve({ kind: "obsolete" });
          return s;
        }
        const next = {
          ...s,
          notebooks: s.notebooks.map((b) =>
            b.id === notebookId ? { ...b, history: [entry, ...b.history] } : b,
          ),
        };
        resolve({
          kind: "saved",
          entry,
          oversized: !workspaceFitsCloud(next),
        });
        return next;
      });
    });
  };
  const run = async (
    operation = "evaluate",
    p: Record<string, string> = {},
    override?: Partial<
      Pick<Entry, "input" | "mode" | "settings" | "definitions">
    >,
  ): Promise<Readonly<Entry> | undefined> => {
    const s = current.current;
    if (!s || busyRef.current) return;
    const b = s.notebooks.find((b) => b.id === s.active)!;
    if (b.history.length >= 10000) {
      setNotice(
        "This notebook has 10,000 calculations. Export a backup, then use another notebook or remove a calculation.",
      );
      return;
    }
    const source = override?.input ?? (mode === "text" ? input : latex),
      format = override?.mode || mode;
    if (operation === "evaluate" && !source.trim()) {
      setNotice("Enter an expression or choose an operation.");
      return;
    }
    if (operation === "evaluate" && format === "text") {
      const m = source.match(
        /^\s*([A-Za-z][A-Za-z0-9_]*)(?:\(([^()]*)\))?\s*:=\s*([\s\S]+)$/,
      );
      if (m) {
        openObject({
          name: m[1],
          expression: m[3],
          args: m[2],
          kind: m[2] ? "function" : "expression",
        });
        return;
      }
    }
    const generation = ++computationGeneration.current,
      lease = captureAccountSession();
    busyRef.current = true;
    setBusy(true);
    hide();
    setModal("");
    if (operation !== "graph_analysis") setView("calculate");
    try {
      const completed = await executeEntry({
        request: { operation, params: p, input: source, mode: format },
        context: structuredClone({
          settings: override?.settings || s.settings,
          definitions: override?.definitions || b.definitions,
          revision: b.revision,
        }),
        notebookId: b.id,
        generation,
        lease,
      });
      if (completed.kind === "saved") {
        if (completed.oversized) setNotice(WORKSPACE_SIZE_ERROR);
        return completed.entry;
      }
    } catch (error) {
      if (
        mounted.current &&
        generation === computationGeneration.current &&
        lease.isCurrent()
      )
        setNotice(
          "Calculation interrupted. No result was added. " + String(error),
        );
    } finally {
      if (mounted.current && generation === computationGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const startInvestigation = (
    seed: Parameters<typeof createInvestigationNotebook>[0]["seed"],
  ) => {
    const s = current.current;
    if (!s || s.notebooks.length >= 100) {
      setNotice(
        "Use at most 100 notebooks. Export and remove a notebook first.",
      );
      return;
    }
    const created = createInvestigationNotebook({
      seed,
      workspaceSettings: s.settings,
    });
    change(
      (s) => ({
        ...s,
        notebooks: [...s.notebooks, created],
        active: created.id,
      }),
      true,
    );
    setView("investigate");
  };
  const runInvestigation = async (notebookId: string, action: RunAction) => {
    const s = current.current;
    if (!s || busyRef.current || paused) return;
    const target = s.notebooks.find((b) => b.id === notebookId);
    if (!target?.investigation) return;
    try {
      const prepared = prepareInvestigationRun({ notebook: target, action });
      if (!prepared.missing.length) return;
      const candidate = {
        ...s,
        notebooks: s.notebooks.map((b) =>
          b.id === notebookId && b.investigation && action.kind === "new"
            ? {
                ...b,
                investigation: {
                  ...b.investigation,
                  runs: [...b.investigation.runs, prepared.run],
                },
              }
            : b,
        ),
      };
      const inputBytes = new TextEncoder().encode(
        JSON.stringify(
          prepared.missing.map(({ cell, request, context }) => ({
            ...request,
            ...context,
            investigation: cell,
            id: uid(),
            time: Date.now(),
          })),
        ),
      ).byteLength;
      if (!workspaceFitsCloud(candidate, inputBytes)) {
        setNotice(WORKSPACE_SIZE_ERROR);
        return;
      }
      const generation = ++computationGeneration.current,
        lease = captureAccountSession();
      const owns = () =>
        mounted.current &&
        generation === computationGeneration.current &&
        lease.isCurrent();
      busyRef.current = true;
      setBusy(true);
      hide();
      const total =
        prepared.run.snapshot.plan.cases.length *
        prepared.run.snapshot.plan.steps.length;
      let saved = total - prepared.missing.length;
      setRunActivity({
        kind: "running",
        notebookId,
        runId: prepared.run.id,
        saved,
        total,
      });
      try {
        const retained = await new Promise<boolean>((resolve) =>
          change((latest) => {
            const book = latest.notebooks.find((b) => b.id === notebookId);
            if (
              !owns() ||
              !book?.investigation ||
              (action.kind === "resume" &&
                !book.investigation.runs.some((r) => r.id === prepared.run.id))
            ) {
              resolve(false);
              return latest;
            }
            const next =
              action.kind === "new"
                ? {
                    ...latest,
                    notebooks: latest.notebooks.map((b) =>
                      b.id === notebookId && b.investigation
                        ? {
                            ...b,
                            investigation: {
                              ...b.investigation,
                              runs: [...b.investigation.runs, prepared.run],
                            },
                          }
                        : b,
                    ),
                  }
                : latest;
            resolve(true);
            return next;
          }),
        );
        if (!retained) return;
        for (const cell of prepared.missing) {
          if (
            !owns() ||
            !current.current?.notebooks
              .find((b) => b.id === notebookId)
              ?.investigation?.runs.some((r) => r.id === prepared.run.id)
          )
            break;
          const completed = await executeEntry({
            ...cell,
            notebookId,
            generation,
            lease,
          });
          if (completed.kind === "obsolete") break;
          saved++;
          if (owns())
            setRunActivity({
              kind: "running",
              notebookId,
              runId: prepared.run.id,
              saved,
              total,
            });
          if (completed.oversized) {
            setNotice(WORKSPACE_SIZE_ERROR);
            break;
          }
        }
      } catch (error) {
        if (owns())
          setNotice(
            "Investigation interrupted. Completed results remain; resume missing cells. " +
              String(error),
          );
      } finally {
        if (mounted.current && generation === computationGeneration.current) {
          busyRef.current = false;
          setBusy(false);
          setRunActivity({ kind: "idle" });
        }
      }
    } catch (error) {
      setNotice(String(error));
    }
  };
  const editInvestigationStep = (step: InvestigationStep) => {
    const operation = operations.find((o) => o.id === step.request.operation);
    if (!operation || !book) return;
    setStepEditor({ notebookId: book.id, stepId: step.id });
    setOp(operation);
    setParams(structuredClone(step.request.params));
    setModal("operation");
    hide();
  };
  const runRef = useRef(run);
  useLayoutEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: "calculate_expression",
          description:
            "Calculate using current notebook definitions and settings; append a visible result.",
          inputSchema: {
            type: "object",
            properties: {
              expression: { type: "string", minLength: 1, maxLength: 12000 },
            },
            required: ["expression"],
            additionalProperties: false,
          },
          execute: async (p: any) => {
            if (
              typeof p?.expression !== "string" ||
              !p.expression.trim() ||
              p.expression.length > 12000
            )
              throw Error("A nonempty expression is required.");
            if (busyRef.current) throw Error("Another calculation is running.");
            return (
              await runRef.current(
                "evaluate",
                {},
                { input: p.expression, mode: "text" },
              )
            )?.result;
          },
        },
        { signal: lifecycle.signal },
      );
      context.registerTool(
        {
          name: "read_calculator_workspace",
          description:
            "Read notebook settings, definitions and most recent answer.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => {
            const s = current.current,
              b = s?.notebooks.find((b) => b.id === s.active);
            return {
              notebook: b?.name,
              settings: s?.settings,
              definitions: b?.definitions,
              lastResult: b?.history[0]?.result,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, []);
  const choose = (o: Operation, expression?: string, shortcut = false) => {
    setStepEditor(null);
    fieldConversionGeneration.current++;
    setOp(o);
    setParams(
      initialOperationParams(
        o,
        expression,
        book?.definitions,
        selectedObject,
        shortcut,
      ),
    );
    setModal("operation");
    hide();
  };
  const openMathField = async (key: string, label: string) => {
    const snapshot = editingSource.current,
      source = params[key] || "",
      generation = ++fieldConversionGeneration.current;
    const stillEditing = () => {
      const latest = editingSource.current;
      return (
        generation === fieldConversionGeneration.current &&
        objectModal.current === "operation" &&
        snapshot.active === latest.active &&
        snapshot.op === latest.op &&
        (latest.params[key] || "") === source
      );
    };
    try {
      const converted = source ? await sourceToMath(source) : { latex: "" };
      if (!stillEditing()) return;
      if (converted.latex === undefined) {
        setNotice(converted.reason || "Keep the original text.");
        return;
      }
      setMathField({ key, label, latex: converted.latex });
    } catch {
      if (stillEditing())
        setNotice(
          "Math editor could not load. Your field is preserved. Try again.",
        );
    }
  };
  const reuse = (s: string) => {
    setInput(s);
    const rows = matrixRows(s),
      matrixLatex = rows ? matrixRowsToLatex(rows) : null;
    if (matrixLatex !== null) {
      setLatex(matrixLatex);
      setMode("math");
    } else setMode("text");
    setView("calculate");
    hide();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const graphResult = (
    s: string,
    {
      radians = false,
      type = "cartesian",
    }: { radians?: boolean; type?: GraphSpec["type"] } = {},
  ) => {
    if (!book || book.graphs.length >= 100) {
      setNotice(
        "This notebook has 100 graphs. Export a backup, then use another notebook or remove a graph.",
      );
      return;
    }
    patch(
      (b) => ({
        ...b,
        graphs: [
          ...b.graphs,
          { ...makeGraph(s, type, b.graphs.length), radians },
        ],
      }),
      true,
    );
    setView("graphs");
    hide();
  };
  const graphFunction = (definition: Definition) => {
    const args = (definition.args || "")
      .split(",")
      .map((arg) => arg.trim())
      .filter(Boolean);
    if (args.length !== 1 && args.length !== 2) {
      setNotice(
        `To graph ${definition.name}(${args.join(", ")}), open Graphs and enter a call with x (or x and y for a surface), fixing every other argument to a value.`,
      );
      return;
    }
    graphResult(`${definition.name}(${args.length === 2 ? "x,y" : "x"})`, {
      type: args.length === 2 ? "surface" : "cartesian",
    });
  };
  const trajectory = (entry: Entry, phase = false) => {
    const d = entry.result.details,
      ts = d.t.map(Number),
      ys = d.values.map((r: any[]) => r.map(Number));
    const graphs = phase
      ? [
          {
            ...makeGraph("State 1 vs state 2", "data", book!.graphs.length),
            points: ts.map(
              (_: number, i: number) =>
                [ys[0][i], ys[1][i]] as [number, number],
            ),
          },
        ]
      : ys.map((row: number[], j: number) => ({
          ...makeGraph(`State ${j + 1} vs t`, "data", book!.graphs.length + j),
          points: ts.map(
            (t: number, i: number) => [t, row[i]] as [number, number],
          ),
        }));
    if (book!.graphs.length + graphs.length > 100) {
      setNotice(
        "These trajectories would exceed 100 graphs. Export a backup, then use another notebook or remove a graph.",
      );
      return;
    }
    patch((b) => ({ ...b, graphs: [...b.graphs, ...graphs] }), true);
    setView("graphs");
    setNotice("Trajectory added. Use Fit to see its full range.");
  };
  const saveObject = async () => {
    if (!book || busyRef.current || matrixLoading) return;
    const target = book.id,
      generation = objectGeneration.current;
    if (
      book.definitions.length >= 500 &&
      !book.definitions.some((d) => d.id === obj?.id)
    ) {
      setNotice(
        "This notebook has 500 objects. Export a backup, then use another notebook or remove an object.",
      );
      return;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(name)) {
      setNotice("Use a name beginning with a letter, up to 24 characters.");
      return;
    }
    if (book.definitions.some((d) => d.name === name && d.id !== obj?.id)) {
      setNotice("This name already exists. Edit it or choose another name.");
      return;
    }
    const expression =
      kind === "matrix"
        ? "Matrix([" + grid.map((r) => "[" + r.join(",") + "]").join(",") + "])"
        : body;
    const d: Definition = {
        id: obj?.id || uid(),
        name,
        expression,
        kind,
        args: kind === "function" ? args : "",
        updated: Date.now(),
      },
      defs = [...book.definitions.filter((x) => x.id !== d.id), d];
    if (!isDefinition(d)) {
      setNotice(
        "Keep the expression within 12,000 characters and function arguments within 100 characters.",
      );
      return;
    }
    const validationGeneration = ++computationGeneration.current,
      lease = captureAccountSession();
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await calculate({
        operation: "evaluate",
        input: d.args ? `${name}(${d.args})` : name,
        mode: "text",
        definitions: defs,
        settings,
      });
      if (r.status === "error") {
        setNotice(r.text);
        return;
      }
      if (
        generation !== objectGeneration.current ||
        validationGeneration !== computationGeneration.current ||
        !lease.isCurrent() ||
        !mounted.current
      )
        return;
      const latest = current.current?.notebooks.find((b) => b.id === target);
      if (!latest || latest.revision !== book.revision) {
        setNotice(
          "This notebook changed during validation. Check the object and save again.",
        );
        return;
      }
      patch(
        (b) =>
          validationGeneration === computationGeneration.current &&
          lease.isCurrent() &&
          mounted.current
            ? {
                ...b,
                definitions: [...b.definitions.filter((x) => x.id !== d.id), d],
                revision: b.revision + 1,
              }
            : b,
        true,
        target,
      );
      if (current.current?.active === target) {
        setSelectedObject(d.id);
        setView("objects");
        setModal("");
      }
      setNotice(
        name + " saved. Previous results retain their original definitions.",
      );
    } catch (e) {
      setNotice(String(e));
    } finally {
      if (
        mounted.current &&
        validationGeneration === computationGeneration.current
      ) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const switchMode = async (s: string): Promise<boolean> => {
    if (s === mode) return true;
    const snapshot = editingSource.current,
      generation = ++conversionGeneration.current;
    try {
      const converted =
        mode === "text" && s !== "text" ? await sourceToMath(input) : null;
      const text =
        mode !== "text" && s === "text" ? await mathToSource(latex) : null;
      const latest = editingSource.current;
      if (
        generation !== conversionGeneration.current ||
        snapshot.mode !== latest.mode ||
        snapshot.input !== latest.input ||
        snapshot.latex !== latest.latex ||
        snapshot.active !== latest.active
      )
        return false;
      if (converted && converted.latex === undefined) {
        setNotice(
          converted.reason || "Keep this expression in its original notation.",
        );
        return false;
      }
      if (converted) setLatex(converted.latex!);
      if (text !== null) {
        setInput(text);
        if (text.startsWith("latex:"))
          setNotice("Original LaTeX retained to preserve this expression.");
      }
      setMode(s);
      if (s !== "math") hide();
      return true;
    } catch {
      setNotice(
        "Notation conversion could not load. Your input is preserved. Try again.",
      );
      return false;
    }
  };
  const edit = (h: Entry) => {
    setInput(h.input);
    setLatex(h.input);
    setMode(h.mode);
    setView("calculate");
    const o = historyOperation(h.operation);
    if (o) {
      setOp(o);
      setParams(h.params);
      setModal("operation");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const prepare = async () => {
    try {
      if (!("serviceWorker" in navigator))
        throw Error(
          "Offline reopening is unavailable in this browser context.",
        );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(
                  "Offline preparation could not start. Reload and try again while connected.",
                ),
              ),
            10000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      if (!reg.active)
        throw Error(
          "Offline preparation is unavailable until the app worker is active. Reload and try again.",
        );
      reg.active.postMessage({
        type: "PREPARE",
        protocol: engineBuild.protocol,
        engineId: engineBuild.id,
      });
      setOffline({ state: "Preparing", done: 0, total: 0 });
      navigator.storage?.persist?.().catch(() => {});
    } catch (e) {
      setNotice(String(e));
    }
  };
  const feedback = notice ? (
    <div role="status" className="dialog-feedback">
      <span>{notice}</span>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => setNotice("")}
      >
        ×
      </button>
    </div>
  ) : null;
  if (!state || !book)
    return (
      <main className="loading-screen">
        <Sigma />
        <p>Opening Calculator…</p>
      </main>
    );
  return (
    <main className="workspace">
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("calculate");
          }}
        >
          <span className="brand-mark">
            <Sigma size={23} />
          </span>
          <strong>Calculator</strong>
        </a>
        <div className="row">
          <span className="device-label small muted">{saveStatus}</span>
          <button
            className="mode-indicator"
            title={`Calculation precision: ${settings.precision} digits`}
            onClick={() => setModal("settings")}
          >
            {settings.angle.toUpperCase()} ·{" "}
            {settings.domain === "real" ? "ℝ" : "ℂ"} ·{" "}
            {settings.displayDecimals ?? 9} dp
          </button>
          <button
            className="icon-btn"
            aria-label="Help and coverage"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={19} />
          </button>
          <button
            className="icon-btn"
            aria-label="Settings and backups"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <div className="toolbar">
        <button onClick={() => setModal("notebooks")}>
          <BookOpen size={17} />
          {book.name}
        </button>
        <button className="find-operation" onClick={() => setModal("search")}>
          <Search size={16} /> Find an operation <kbd>⌘ K</kbd>
        </button>
      </div>
      {warning && <p className="warning">{warning}</p>}
      <Tabs
        className="workbench"
        value={view}
        onValueChange={(v) => {
          historyTarget.current = null;
          setView(v);
          hide();
        }}
      >
        <div className="navigation">
          <span className="rail-label">WORKSPACE</span>
          <TabsList className="workspace-tabs" variant="line">
            <TabsTrigger value="calculate">
              <Sigma size={18} />
              Calculate
            </TabsTrigger>
            <TabsTrigger value="explore">
              <Compass size={18} />
              Explore
            </TabsTrigger>
            <TabsTrigger value="investigate">
              <FlaskConical size={18} /> Investigate
            </TabsTrigger>
            <TabsTrigger value="graphs">
              <ChartNoAxesCombined size={18} />
              Graphs
            </TabsTrigger>
            <TabsTrigger value="objects">
              <Shapes size={18} />
              Objects <span className="small">{book.definitions.length}</span>
            </TabsTrigger>
          </TabsList>
          <div className="rail-foot">
            <span className="rail-caption">Your personal math lab</span>
            <svg viewBox="0 0 170 65" aria-hidden="true">
              <path
                d="M0 34H170M85 0V65"
                fill="none"
                stroke="currentColor"
                opacity=".15"
              />
              <path
                d="M0 33C20 33 22 2 42 2S65 63 85 63S105 2 128 2S150 33 170 33"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        <TabsContent value="calculate" className="calculate-panel">
          <div className="section-heading">
            <div>
              <span className="section-label">{book.name.toUpperCase()}</span>
              <h1>
                Calculate<span className="brand-dot">.</span>
              </h1>
            </div>
            <span className="page-number">
              {String(book.history.length + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="input-workbench">
            {book.definitions.find((d) => d.id === selectedObject) && (
              <div className="selected-object">
                <span>
                  Selected ·{" "}
                  {book.definitions.find((d) => d.id === selectedObject)!.name}
                </span>
                <Preview
                  source={
                    book.definitions.find((d) => d.id === selectedObject)!
                      .expression
                  }
                />
                <button
                  className="subtle"
                  onClick={() =>
                    openObject(
                      book.definitions.find((d) => d.id === selectedObject)!,
                    )
                  }
                >
                  Edit object
                </button>
              </div>
            )}
            <section
              className={`composer${mode === "math" ? " composer--math" : ""}`}
            >
              <div className="composer-top">
                <div className="segmented">
                  {["math", "text", "latex"].map((s) => (
                    <button
                      key={s}
                      className={s === mode ? "active" : ""}
                      onClick={() => switchMode(s)}
                    >
                      {s === "latex"
                        ? "LaTeX"
                        : s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="small">EXPRESSION</span>
              </div>
              {mode === "math" ? (
                <MathEditor
                  ref={math}
                  value={latex}
                  onChange={setLatex}
                  onSubmit={() => run()}
                />
              ) : (
                <textarea
                  aria-label={
                    mode === "text" ? "Text expression" : "LaTeX expression"
                  }
                  rows={3}
                  value={mode === "text" ? input : latex}
                  onChange={(e) =>
                    mode === "text"
                      ? setInput(e.target.value)
                      : setLatex(e.target.value)
                  }
                  spellCheck={false}
                  placeholder={
                    mode === "text"
                      ? "1/3 + 1/6, or f(x) := x^2 + 1"
                      : "\\frac{1}{3} + \\frac{1}{6}"
                  }
                />
              )}
              <div className="composer-bottom">
                <button
                  aria-label="Math keyboard"
                  onClick={async () => {
                    if (mode === "math") math.current?.keyboard();
                    else if (await switchMode("math"))
                      setKeyboardRequested(true);
                  }}
                >
                  <Keyboard size={16} />{" "}
                  <span className="math-keyboard-label">Math keyboard</span>
                </button>
                {busy ? (
                  <button className="primary" onClick={stopCalculation}>
                    Cancel
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={status !== "Ready"}
                    onClick={() => run()}
                  >
                    Calculate <ArrowUpRight size={17} />
                  </button>
                )}
              </div>
            </section>
            <div className="quick-actions">
              {["differentiate", "integrate", "solve"].map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    const o = operations.find((o) => o.id === id);
                    if (o)
                      choose(
                        o,
                        mode === "text"
                          ? input
                          : latex
                            ? "latex:" + latex
                            : undefined,
                        true,
                      );
                  }}
                >
                  {id === "differentiate"
                    ? "Differentiate"
                    : id === "integrate"
                      ? "Integrate"
                      : "Solve"}
                </button>
              ))}
              <button onClick={() => openObject({ kind: "matrix" })}>
                Matrix
              </button>
              <button onClick={() => setModal("search")}>More</button>
            </div>
            <p className="entry-hints">
              {mode === "math" ? "Enter calculates · " : ""}⌘ / Ctrl K finds an
              operation · Structures & editing has templates and undo
            </p>
            <div className="engine-line">
              {busy
                ? "Calculating locally…"
                : status === "Ready"
                  ? "✓ All calculation tools loaded"
                  : status}
              {status !== "Ready" && (
                <button onClick={stopCalculation}>Retry</button>
              )}
            </div>
          </div>
          <div className="output-workbench">
            {(book.history.length > 0 || undo.current.length > 0) && (
              <section className="history">
                <div className="section-heading">
                  <span className="section-label">
                    CALCULATIONS · {book.history.length}
                  </span>
                  <button
                    className="subtle"
                    onClick={() => {
                      const s = undo.current.pop();
                      if (s) setState(s);
                      else setNotice("Nothing to undo yet.");
                    }}
                  >
                    Undo
                  </button>
                </div>
                {book.history.slice(0, historyCount).map((h, i) => (
                  <article
                    className="calculation"
                    key={h.id}
                    tabIndex={-1}
                    aria-label={`Saved calculation ${book.history.length - i}`}
                    ref={(element) => {
                      if (element) {
                        historyArticles.current.set(h.id, element);
                        focusHistoryTarget();
                      } else historyArticles.current.delete(h.id);
                    }}
                  >
                    <div className="calculation-meta">
                      <span>
                        {String(book.history.length - i).padStart(2, "0")}
                      </span>
                      <span>
                        {operations.find((o) => o.id === h.operation)?.name ||
                          (h.operation === "graph_analysis"
                            ? "Graph · " + h.params.action
                            : "Calculation")}
                      </span>
                      <CalculationStatus status={h.result.status} />
                      <button
                        className="icon-btn"
                        aria-label="Remove calculation"
                        onClick={() =>
                          patch(
                            (b) => ({
                              ...b,
                              history: b.history.filter((e) => e.id !== h.id),
                            }),
                            true,
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {h.investigation && (
                      <p className="small muted">
                        Investigation case · original definitions and settings
                        retained. Compare or resume this run in Investigate.
                      </p>
                    )}
                    <button
                      className="history-input"
                      title="Edit this input"
                      onClick={() => edit(h)}
                    >
                      {h.operation === "evaluate" && h.mode !== "text" ? (
                        <MathView latex={h.input} />
                      ) : (
                        <div>
                          {historyOperation(h.operation) ? (
                            <ProblemPreview
                              compact
                              op={historyOperation(h.operation)!}
                              params={h.params}
                            />
                          ) : (
                            <Preview source={h.input} />
                          )}
                        </div>
                      )}
                      <span>Edit</span>
                    </button>
                    <CalculationAnswer
                      result={h.result}
                      displayDecimals={settings.displayDecimals ?? 9}
                      onSave={(source) =>
                        openObject({ expression: source, kind: "object" })
                      }
                    />
                    {h.result.approx && (
                      <details className="approximation">
                        <summary>Decimal approximation</summary>
                        <Preview
                          source={formatDisplayApprox(
                            h.result.approx,
                            settings.displayDecimals ?? 9,
                          )}
                          block
                        />
                      </details>
                    )}
                    {h.result.details && (
                      <ResultPlot
                        operation={h.operation}
                        data={h.result.details}
                        displayDecimals={settings.displayDecimals ?? 9}
                      />
                    )}
                    {h.result.latex && h.result.details && (
                      <details>
                        <summary>Calculation details</summary>
                        {h.result.detailDisplay ? (
                          <RichResult
                            node={h.result.detailDisplay}
                            displayDecimals={settings.displayDecimals ?? 9}
                            numeric={h.result.status === "numeric"}
                          />
                        ) : (
                          <CalculationDetails
                            data={h.result.details}
                            sources={h.result.detailSources}
                            displayDecimals={settings.displayDecimals ?? 9}
                            onSave={(s) =>
                              openObject({ expression: s, kind: "object" })
                            }
                          />
                        )}
                      </details>
                    )}
                    {h.result.notes.length > 0 && (
                      <details
                        open={["error", "unresolved"].includes(h.result.status)}
                      >
                        <summary>Conditions and diagnostics</summary>
                        {h.result.notes.map((n, i) => (
                          <p className="small muted" key={i}>
                            {n}
                          </p>
                        ))}
                      </details>
                    )}
                    {!h.investigation &&
                      definitionDependenciesChanged(h, book.definitions) && (
                        <p className="stale-note">
                          Definitions have changed since this result.{" "}
                          <button
                            onClick={() =>
                              run(h.operation, h.params, {
                                input: h.input,
                                mode: h.mode,
                              })
                            }
                          >
                            Recalculate
                          </button>
                        </p>
                      )}
                    <div className="result-actions">
                      <button onClick={() => edit(h)}>Edit problem</button>
                      {h.result.reusable && (
                        <>
                          <button onClick={() => reuse(h.result.reusable!)}>
                            Use
                          </button>
                          <button
                            onClick={() =>
                              openObject({ expression: h.result.reusable })
                            }
                          >
                            Save as
                          </button>
                          {!/^(Matrix|\[|\{|\()/.test(h.result.reusable) && (
                            <button
                              onClick={() =>
                                graphResult(h.result.reusable!, {
                                  radians: true,
                                })
                              }
                            >
                              Graph
                            </button>
                          )}
                        </>
                      )}
                      {["ivp", "bvp"].includes(h.operation) &&
                        h.result.details?.t && (
                          <>
                            <button onClick={() => trajectory(h)}>
                              Plot trajectory
                            </button>
                            {h.result.details.values?.length >= 2 && (
                              <button onClick={() => trajectory(h, true)}>
                                Phase portrait
                              </button>
                            )}
                          </>
                        )}
                      <button
                        onClick={async () => {
                          const text = h.result.latex || h.result.text;
                          try {
                            await navigator.clipboard.writeText(text);
                            setNotice("Copied.");
                          } catch {
                            download("expression.tex", text, "text/plain");
                          }
                        }}
                      >
                        Copy LaTeX
                      </button>
                      <details>
                        <summary>Settings</summary>
                        <p>
                          {h.settings.angle.toUpperCase()} ·{" "}
                          {h.settings.precision} digits · {h.settings.domain}
                          <br />
                          {h.settings.assumptions ||
                            "No additional assumptions"}
                          <br />
                          {h.definitions.length} definitions at calculation
                          time.
                        </p>
                        <button onClick={() => run(h.operation, h.params, h)}>
                          Repeat original settings
                        </button>
                      </details>
                    </div>
                  </article>
                ))}
                {book.history.length > historyCount && (
                  <button
                    className="subtle"
                    onClick={() => setHistoryCount((n) => n + 30)}
                  >
                    Show earlier calculations
                  </button>
                )}
              </section>
            )}
            {!book.history.length && <TaskBrowser choose={choose} compact />}
          </div>
        </TabsContent>
        <TabsContent value="explore">
          <TaskBrowser choose={choose} />
        </TabsContent>
        <TabsContent value="investigate">
          <Investigations
            key={book.id}
            notebook={book}
            activity={runActivity}
            busy={busy}
            ready={status === "Ready" && !paused}
            onStart={startInvestigation}
            onPlan={(plan) =>
              patch(
                (b) =>
                  b.investigation
                    ? { ...b, investigation: { ...b.investigation, plan } }
                    : b,
                false,
                book.id,
              )
            }
            onRun={(action) => runInvestigation(book.id, action)}
            onStop={stopCalculation}
            onEditStep={editInvestigationStep}
            onObservation={(runId, observation) =>
              patch(
                (b) =>
                  b.investigation
                    ? {
                        ...b,
                        investigation: {
                          ...b.investigation,
                          runs: b.investigation.runs.map((r) =>
                            r.id === runId ? { ...r, observation } : r,
                          ),
                        },
                      }
                    : b,
                false,
                book.id,
              )
            }
            onDeleteRun={(runId) =>
              patch(
                (b) =>
                  b.investigation
                    ? {
                        ...b,
                        investigation: {
                          ...b.investigation,
                          runs: b.investigation.runs.filter(
                            (r) => r.id !== runId,
                          ),
                        },
                        history: b.history.filter(
                          (e) => e.investigation?.runId !== runId,
                        ),
                      }
                    : b,
                true,
                book.id,
              )
            }
            onRemove={(keep) =>
              patch((b) => removeInvestigation(b, keep), true, book.id)
            }
            onObjects={() => setView("objects")}
          />
        </TabsContent>
        <TabsContent value="graphs">
          <GraphWorkspace
            key={book.id}
            graphs={book.graphs}
            history={book.history}
            onChange={(graphs) => {
              if (graphs.length > 100) {
                setNotice(
                  "This notebook has 100 graphs. Export a backup, then use another notebook or remove a graph.",
                );
                return;
              }
              patch((b) => ({ ...b, graphs }), true, book.id);
            }}
            definitions={book.definitions}
            settings={settings}
            onCompute={computeAuxiliary}
            workerBusy={busy}
            onAnalyze={(params) => run("graph_analysis", params)}
            onStop={stopCalculation}
            onOpenHistory={(entryId) => openHistoryEntry(book.id, entryId)}
            onReuse={reuse}
          />
        </TabsContent>
        <TabsContent value="objects">
          <div className="section-heading">
            <div>
              <span className="section-label">NAMED OBJECTS</span>
              <h1>Your mathematical objects.</h1>
            </div>
            <button className="primary" onClick={() => openObject()}>
              <Plus size={16} /> New
            </button>
          </div>
          <p className="muted">
            Names belong to this notebook. Use them in calculations and graphs.
          </p>
          {!book.definitions.length ? (
            <div className="objects-empty">
              <h2>Start with a name.</h2>
              <div className="row wrap">
                {(["function", "matrix", "dataset"] as const).map((k) => (
                  <button
                    className="subtle"
                    key={k}
                    onClick={() =>
                      openObject({
                        kind: k,
                        expression: k === "dataset" ? "[1,2,3,4,5]" : "",
                      })
                    }
                  >
                    New {k}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="object-list">
              {book.definitions.map((d) => (
                <article className="object-card" key={d.id}>
                  <div className="row spread">
                    <h2>
                      {d.name}
                      {d.args ? "(" + d.args + ")" : ""}
                    </h2>
                    <span className="small">{d.kind}</span>
                  </div>
                  <Preview source={d.expression} block />
                  {d.kind === "matrix" && (
                    <div className="object-operations">
                      {["inverse", "rref", "det", "eigenvalues"].map(
                        (action) => (
                          <button
                            className="subtle"
                            key={action}
                            onClick={() => {
                              setSelectedObject(d.id);
                              choose(
                                operations.find(
                                  (o) => o.id === "matrix_" + action,
                                )!,
                                d.name,
                              );
                            }}
                          >
                            {action === "det"
                              ? "Determinant"
                              : action === "rref"
                                ? "RREF"
                                : action === "inverse"
                                  ? "Inverse"
                                  : "Eigenvalues"}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                  <div className="result-actions">
                    <button onClick={() => openObject(d)}>Edit</button>
                    <button
                      onClick={() => (
                        setSelectedObject(d.id),
                        reuse(d.args ? d.name + "(" + d.args + ")" : d.name)
                      )}
                    >
                      Use
                    </button>
                    {d.kind === "function" && (
                      <button onClick={() => graphFunction(d)}>Graph</button>
                    )}
                    {d.kind === "dataset" && (
                      <>
                        <button
                          onClick={() =>
                            choose(
                              operations.find((o) => o.id === "describe")!,
                              d.name,
                            )
                          }
                        >
                          Statistics
                        </button>
                        <button onClick={() => openObject(d)}>
                          Plot / edit
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        patch(
                          (b) => ({
                            ...b,
                            definitions: b.definitions.filter(
                              (x) => x.id !== d.id,
                            ),
                            revision: b.revision + 1,
                          }),
                          true,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <footer>
        <button onClick={() => setModal("settings")}>
          {offline.state === "Ready"
            ? "Prepared for offline reopening"
            : "Offline preparation"}
        </button>
        <span>{saveStatus}</span>
      </footer>
      {notice && !modal && !mathField && (
        <div role="status" className="toast">
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <Dialog
        open={modal === "search"}
        onOpenChange={(o) => !o && closeModal()}
      >
        <DialogContent className="operation-search">
          {feedback}
          <DialogHeader>
            <DialogTitle>Find an operation</DialogTitle>
            <DialogDescription>
              Search by name, topic or what you want to do.
            </DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Try eigenvalues, area or confidence…" />
            <CommandList>
              <CommandEmpty>
                No match. Try another mathematical name.
              </CommandEmpty>
              {categories.map((c) => (
                <CommandGroup key={c} heading={c}>
                  {operations
                    .filter((o) => o.category === c)
                    .map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.name + " " + o.category + " " + o.keywords}
                        onSelect={() => choose(o)}
                      >
                        <div>
                          <strong>{o.name}</strong>
                          <span>{o.description}</span>
                        </div>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "operation"}
        onOpenChange={(o) => !o && closeModal()}
      >
        <DialogContent className="operation-dialog">
          {feedback}
          <DialogHeader>
            <DialogTitle>{op?.name}</DialogTitle>
            <DialogDescription>{op?.description}</DialogDescription>
          </DialogHeader>
          {op && (
            <>
              <ProblemPreview op={op} params={params} />
              <div className="operation-fields">
                <StructuredFields
                  op={op}
                  params={params}
                  definitions={book.definitions}
                  onChange={(k, v) => setParams((p) => ({ ...p, [k]: v }))}
                  onMath={openMathField}
                />
              </div>
            </>
          )}
          <div className="row spread operation-footer">
            <button
              className="subtle"
              onClick={() => {
                setStepEditor(null);
                setModal("search");
              }}
            >
              Operations
            </button>
            <button
              className="primary"
              disabled={!stepEditor && (busy || status !== "Ready")}
              onClick={() => {
                if (!op) return;
                if (!stepEditor) {
                  run(op.id, params);
                  return;
                }
                const editor = stepEditor;
                patch(
                  (b) =>
                    b.investigation
                      ? {
                          ...b,
                          investigation: {
                            ...b.investigation,
                            plan: {
                              ...b.investigation.plan,
                              steps: b.investigation.plan.steps.map((step) =>
                                step.id === editor.stepId
                                  ? {
                                      ...step,
                                      request: {
                                        operation: op.id,
                                        input: params.expression || "",
                                        mode: "text",
                                        params: structuredClone(params),
                                      },
                                    }
                                  : step,
                              ),
                            },
                          },
                        }
                      : b,
                  false,
                  editor.notebookId,
                );
                closeModal();
              }}
            >
              {stepEditor ? "Save next run step" : "Calculate"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!mathField}
        onOpenChange={(o) => {
          if (!o) {
            setMathField(null);
            hide();
          }
        }}
      >
        <DialogContent>
          {feedback}
          <DialogHeader>
            <DialogTitle>{mathField?.label}</DialogTitle>
            <DialogDescription>
              Edit nested structures using the math keyboard.
            </DialogDescription>
          </DialogHeader>
          <MathEditor
            ref={field}
            value={mathField?.latex || ""}
            onChange={(latex) => setMathField((s) => (s ? { ...s, latex } : s))}
          />
          <div className="row spread">
            <button
              className="subtle"
              onClick={() => field.current?.keyboard()}
            >
              Math keyboard
            </button>
            <button
              className="primary"
              onClick={() => {
                if (mathField)
                  setParams((p) => ({
                    ...p,
                    [mathField.key]: "latex:" + mathField.latex,
                  }));
                setMathField(null);
                hide();
              }}
            >
              Use expression
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "object"}
        onOpenChange={(o) => !o && closeModal()}
      >
        <DialogContent>
          {feedback}
          <DialogHeader>
            <DialogTitle>
              {obj?.id ? "Edit object" : "Save a named object"}
            </DialogTitle>
            <DialogDescription>
              Reuse its name anywhere in {book.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="field-grid">
            <label>
              Name
              <input
                aria-label="Object name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Kind
              <Choice
                label="Object kind"
                value={kind}
                options={[
                  "expression",
                  "function",
                  "matrix",
                  "dataset",
                  "object",
                ]}
                onChange={(s) => changeObjectKind(s as Definition["kind"])}
              />
            </label>
          </div>
          {kind === "function" && (
            <label>
              Arguments
              <input
                aria-label="Function arguments"
                maxLength={100}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </label>
          )}
          {kind === "matrix" ? (
            <>
              <div className="row">
                <label>
                  Rows
                  <input
                    aria-label="Matrix rows"
                    disabled={matrixLoading}
                    type="number"
                    min={1}
                    max={12}
                    value={grid.length}
                    onChange={(e) =>
                      setGrid((g) =>
                        Array.from(
                          {
                            length: Math.max(
                              1,
                              Math.min(12, Number(e.target.value) || 1),
                            ),
                          },
                          (_, i) => g[i] || Array(g[0].length).fill("0"),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Columns
                  <input
                    aria-label="Matrix columns"
                    disabled={matrixLoading}
                    type="number"
                    min={1}
                    max={12}
                    value={grid[0].length}
                    onChange={(e) =>
                      setGrid((g) =>
                        g.map((r) =>
                          Array.from(
                            {
                              length: Math.max(
                                1,
                                Math.min(12, Number(e.target.value) || 1),
                              ),
                            },
                            (_, i) => r[i] || "0",
                          ),
                        ),
                      )
                    }
                  />
                </label>
              </div>
              {matrixLoading && <p>Reading matrix cells…</p>}
              <div
                className="matrix-grid"
                style={{
                  gridTemplateColumns: `repeat(${grid[0].length},minmax(64px,1fr))`,
                }}
              >
                {grid.flatMap((row, i) =>
                  row.map((v, j) => (
                    <input
                      key={i + "-" + j}
                      disabled={matrixLoading}
                      aria-label={`Matrix row ${i + 1} column ${j + 1}`}
                      value={v}
                      onChange={(e) =>
                        setGrid((g) =>
                          g.map((r, ri) =>
                            r.map((c, cj) =>
                              ri === i && cj === j ? e.target.value : c,
                            ),
                          ),
                        )
                      }
                    />
                  )),
                )}
              </div>
              <p className="small muted">
                Exact fractions and symbols work in each cell.
              </p>
            </>
          ) : kind === "dataset" && (!body.trim() || listItems(body)) ? (
            <ListInput
              value={body.trim() ? body : "[]"}
              onChange={setBody}
              label="Data values"
            />
          ) : (
            <label>
              Expression
              <textarea
                aria-label="Object expression"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          )}
          {kind === "dataset" && <DataPlot source={body} />}
          <div className="row spread">
            <button className="subtle" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || matrixLoading || status !== "Ready"}
              onClick={saveObject}
            >
              Save object
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "notebooks"}
        onOpenChange={(o) => !o && closeModal()}
      >
        <DialogContent>
          {feedback}
          <DialogHeader>
            <DialogTitle>Your notebooks</DialogTitle>
            <DialogDescription>
              Separate contexts keep names from colliding.
            </DialogDescription>
          </DialogHeader>
          <div className="notebook-list">
            {state.notebooks.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  change((s) => ({ ...s, active: b.id }));
                  setModal("");
                }}
              >
                <BookOpen size={18} />
                <span>
                  {b.name}
                  <small>
                    {b.history.length} calculations · {b.definitions.length}{" "}
                    objects
                  </small>
                </span>
                {b.id === book.id && <Check size={16} />}
              </button>
            ))}
          </div>
          <label>
            New notebook
            <input
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
              maxLength={80}
            />
          </label>
          <button
            className="primary"
            disabled={!bookName.trim() || state.notebooks.length >= 100}
            onClick={() => {
              const b = newNotebook(bookName.trim());
              change(
                (s) => ({ ...s, notebooks: [...s.notebooks, b], active: b.id }),
                true,
              );
              setBookName("");
              setModal("");
            }}
          >
            Create notebook
          </button>
          {state.notebooks.length >= 100 && (
            <p className="field-hint">
              This workspace has 100 notebooks. Export a backup before
              reorganising it.
            </p>
          )}
          <label>
            Rename current notebook
            <input
              value={book.name}
              onChange={(e) => patch((b) => ({ ...b, name: e.target.value }))}
              maxLength={80}
            />
          </label>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onOpenChange={(o) => !o && closeModal()}
      >
        <DialogContent>
          {feedback}
          <DialogHeader>
            <DialogTitle>Settings & saved work</DialogTitle>
            <DialogDescription>
              Every result records its settings.
            </DialogDescription>
          </DialogHeader>
          <div className="field-grid">
            <label>
              Angle mode
              <Choice
                label="Angle mode"
                value={settings.angle}
                options={[
                  { value: "rad", label: "Radians" },
                  { value: "deg", label: "Degrees" },
                ]}
                onChange={(angle) =>
                  change((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      angle: angle as Settings["angle"],
                    },
                  }))
                }
              />
            </label>
            <label>
              Solution domain
              <Choice
                label="Solution domain"
                value={settings.domain}
                options={["real", "complex"]}
                onChange={(domain) =>
                  change((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      domain: domain as Settings["domain"],
                    },
                  }))
                }
              />
            </label>
            <label>
              Display decimal places
              <input
                type="number"
                min={0}
                max={30}
                value={settings.displayDecimals ?? 9}
                onChange={(e) =>
                  change((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      displayDecimals: Math.max(
                        0,
                        Math.min(30, Math.round(Number(e.target.value))),
                      ),
                    },
                  }))
                }
              />
              <span className="field-hint">
                Up to 30. Exact answers and calculation precision are preserved.
              </span>
            </label>
            <label>
              Calculation precision
              <input
                type="number"
                min={5}
                max={200}
                value={settings.precision}
                onChange={(e) =>
                  change((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      precision: Math.max(
                        5,
                        Math.min(200, Math.round(Number(e.target.value) || 30)),
                      ),
                    },
                  }))
                }
              />
            </label>
          </div>
          <label>
            Symbol assumptions
            <input
              value={settings.assumptions}
              onChange={(e) =>
                change((s) => ({
                  ...s,
                  settings: { ...s.settings, assumptions: e.target.value },
                }))
              }
              placeholder="x:positive, n:integer, u:real"
            />
            <span className="field-hint">
              positive, negative, nonnegative, nonzero, real, integer
            </span>
          </label>
          <section className="settings-section">
            <h2>Appearance</h2>
            <Choice
              label="Color theme"
              value={theme}
              options={["light", "dark"]}
              onChange={(v) => {
                setTheme(v);
                try {
                  localStorage.setItem("calculator.theme", v);
                } catch {
                  setNotice(
                    "Theme applied for this session. Browser storage is unavailable.",
                  );
                }
                document.documentElement.classList.toggle("dark", v === "dark");
              }}
            />
          </section>
          {typeof window !== "undefined" && readDeviceSave(STORAGE_KEY) && (
            <section className="settings-section">
              <h2>Existing device notebooks</h2>
              <p>
                Import the earlier, unassigned notebooks on this browser into
                your signed-in account. The original copy stays intact.
              </p>
              <button
                className="subtle"
                onClick={() => {
                  try {
                    const old = validateState(
                      JSON.parse(readDeviceSave(STORAGE_KEY)!),
                    );
                    change(
                      (s) => ({
                        ...s,
                        notebooks: [
                          ...s.notebooks,
                          ...old.notebooks.map((b) => ({
                            ...b,
                            id: uid(),
                            name:
                              b.name.slice(0, 100 - " (imported)".length) +
                              " (imported)",
                          })),
                        ],
                      }),
                      true,
                    );
                    setNotice(
                      "Earlier notebooks imported; original device copy preserved.",
                    );
                  } catch (e) {
                    setNotice(String(e));
                  }
                }}
              >
                Import earlier device notebooks
              </button>
            </section>
          )}
          <section className="settings-section">
            <h2>Offline preparation</h2>
            <p>
              {offline.state}
              {offline.total > 0 &&
                ` · ${offline.done}/${offline.total} files verified`}
            </p>
            {offline.state === "Preparing" && (
              <Progress
                value={offline.total ? (100 * offline.done) / offline.total : 0}
              />
            )}
            <p className="small muted">
              About 50 MB plus the app and fonts. Loaded tools compute locally.
              Reopening requires secure browser storage; private mode, cache
              eviction and hosting sign-in can affect it.
            </p>
            <button
              className="subtle"
              disabled={offline.state === "Preparing"}
              onClick={prepare}
            >
              {offline.state === "Ready"
                ? "Verify / repair offline files"
                : "Prepare for offline use"}
            </button>
          </section>
          <RecoveryBackups />
          <section className="settings-section">
            <h2>Back up your work</h2>
            <p className="small muted">
              Saved privately to your signed-in account, with an offline copy on
              this device. Export regularly; imports add separate notebook
              copies.
            </p>
            <div className="row wrap">
              <button
                className="subtle"
                onClick={() =>
                  download(
                    "Calculator-backup.json",
                    JSON.stringify(state, null, 2),
                  )
                }
              >
                <Download size={16} /> Export backup
              </button>
              <button className="subtle" onClick={() => file.current?.click()}>
                <Upload size={16} /> Import backup
              </button>
            </div>
            <input
              type="file"
              hidden
              ref={file}
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 20000000) throw Error("Backup exceeds 20 MB.");
                  const imported = validateState(JSON.parse(await f.text()));
                  if (state.notebooks.length + imported.notebooks.length > 100)
                    throw Error(
                      "The combined workspace exceeds 100 notebooks.",
                    );
                  const books = imported.notebooks.map((b) => ({
                    ...b,
                    id: uid(),
                    name:
                      b.name.slice(0, 100 - " (imported)".length) +
                      " (imported)",
                  }));
                  change(
                    (s) => ({
                      ...s,
                      notebooks: [...s.notebooks, ...books],
                      active: books[0].id,
                    }),
                    true,
                  );
                  setPaused(false);
                  setWarning("");
                  setNotice("Backup imported as separate notebook copies.");
                } catch (e) {
                  setNotice("Import rejected: " + String(e));
                }
                if (file.current) file.current.value = "";
              }}
            />
            <button
              className="text-action"
              onClick={() => {
                try {
                  const old = readDeviceSave(accountStorage(BACKUP_KEY));
                  if (!old) throw Error("No previous save is available.");
                  const restored = validateState(JSON.parse(old));
                  undo.current.push(state);
                  setState(restored);
                  setPaused(false);
                  setWarning("");
                  setNotice(
                    "Previous save restored. Undo can return to your current work.",
                  );
                } catch (e) {
                  setNotice(String(e));
                }
              }}
            >
              Restore previous valid save
            </button>
            {paused && (
              <button
                onClick={() =>
                  download(
                    "Calculator-recovery.txt",
                    readDeviceSave(accountStorage(STORAGE_KEY)) || "",
                    "text/plain",
                  )
                }
              >
                Export unreadable recovery data
              </button>
            )}
          </section>
        </DialogContent>
      </Dialog>
      <Dialog open={modal === "help"} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent>
          {feedback}
          <DialogHeader>
            <DialogTitle>Calculator reference</DialogTitle>
            <DialogDescription>Scope, input and safeguards.</DialogDescription>
          </DialogHeader>
          <div className="help-content">
            <h2>Input that carries its meaning</h2>
            <p>
              Math and LaTeX accept fractions, roots, calculus structures,
              matrices and piecewise expressions. The touch keyboard includes
              cursor movement, Next and Undo. Text accepts 2*x, x^2,
              Matrix([[1,2],[3,4]]) and Piecewise((x,x&gt;0),(0,True)). Define f
              before using f(x); i means the imaginary unit.
            </p>
            <p>
              Use f(x) := x^2 to save a function. Operation forms make
              variables, bounds and conditions explicit. Partial-derivative
              glyphs are rejected: use Differentiate with variable and order.
            </p>
            <h2>Exact, approximate, unresolved</h2>
            <p>
              Exact decimal input becomes rational. Numerical algorithms use
              machine precision unless arbitrary-precision symbolic evaluation
              is requested. Unresolved results and conditional branches are
              identified. Engine failure does not prove that no closed form
              exists. Cancel stops expensive work.
            </p>
            <h2>Choose a solving tool</h2>
            <p>
              In Explore, search for <strong>Solve for a variable</strong> to
              find a solution set in the selected domain. Enter{" "}
              <code>x^2-5*x+6</code> with variable <code>x</code> to solve the
              expression equal to zero. The solutions are 2 and 3.
            </p>
            <p>
              Search for <strong>Numerical root in a bracket</strong> to find
              one approximate root in an interval. For <code>x^2-2</code> with
              lower bound 0 and upper bound 2, the result is approximately
              1.414213562. This positive interval excludes the negative root.
              One numerical root is not a list of every solution.
            </p>
            <h2>{operations.length} discoverable operations</h2>
            <p>{categories.join(" · ")}</p>
            <p>
              PDE tools cover supported first-order linear families, finite
              heat/wave sine modes and unit-square Poisson grids. Groups
              enumerate up to 256 elements. Topology supports finite spaces and
              rational homology, without torsion. Symbolic rank can change at
              exceptional parameter values.
            </p>
            <p>
              Plots are finite numerical samples, with a narrower elementary
              function vocabulary than symbolic calculation. Wireframe surfaces
              and implicit grids cannot certify every feature. No universal
              theorem proving or global solver is promised.
            </p>
            <p>
              Saved results retain their original definitions and settings.
              Export backups from Settings; browser storage may be cleared.
            </p>
            <p>
              <a href="/coverage.html" target="_blank" rel="noreferrer">
                Coverage, validation and sources
              </a>{" "}
              ·{" "}
              <a href="/licenses.txt" target="_blank" rel="noreferrer">
                Dependency licences
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
function DataPlot({ source }: { source: string }) {
  const [mode, setMode] = useState("histogram");
  let values: number[] = [];
  try {
    const parsed = JSON.parse(source);
    if (
      Array.isArray(parsed) &&
      parsed.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      values = parsed;
  } catch {}
  if (!values.length)
    return (
      <p className="small muted">Add numeric values to preview your data.</p>
    );
  const lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1,
    n = Math.min(12, Math.ceil(Math.sqrt(values.length))),
    bins = Array(n).fill(0);
  values.forEach(
    (v) => bins[Math.min(n - 1, Math.floor(((v - lo) / span) * n))]++,
  );
  const max = Math.max(...bins),
    sorted = [...values].sort((a, b) => a - b),
    q = (p: number) => {
      const k = (sorted.length - 1) * p,
        i = Math.floor(k);
      return (
        sorted[i] +
        (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (k - i)
      );
    },
    sx = (x: number) => 30 + (300 * (x - lo)) / span;
  return (
    <div className="data-plot">
      <Choice
        label="Dataset plot"
        value={mode}
        onChange={setMode}
        options={["histogram", "boxplot", "sequence"]}
      />
      <svg
        viewBox="0 0 360 150"
        role="img"
        aria-label={mode + " of the entered data"}
      >
        {mode === "histogram" ? (
          bins.map((b, i) => (
            <rect
              key={i}
              x={30 + (i * 300) / n}
              y={120 - (100 * b) / max}
              width={300 / n - 3}
              height={(100 * b) / max}
              fill="#2f8175"
            />
          ))
        ) : mode === "sequence" ? (
          values.map((v, i) => (
            <circle
              key={i}
              cx={30 + (300 * i) / Math.max(1, values.length - 1)}
              cy={120 - (100 * (v - lo)) / span}
              r={3}
              fill="#2f8175"
            />
          ))
        ) : (
          <>
            <line x1={sx(lo)} y1={70} x2={sx(hi)} y2={70} stroke="#2f8175" />
            <rect
              x={sx(q(0.25))}
              y={45}
              width={Math.max(1, sx(q(0.75)) - sx(q(0.25)))}
              height={50}
              fill="#d7eae4"
              stroke="#2f8175"
            />
            <line
              x1={sx(q(0.5))}
              y1={45}
              x2={sx(q(0.5))}
              y2={95}
              stroke="#2f8175"
            />
          </>
        )}
        <text x={30} y={143}>
          {lo}
        </text>
        <text x={320} y={143}>
          {hi}
        </text>
      </svg>
      <p className="small muted">
        {values.length} observations · boxplot uses interpolated quartiles and
        min/max whiskers
      </p>
    </div>
  );
}
