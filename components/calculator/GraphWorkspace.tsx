"use client";
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import {
  Plus,
  Minus,
  Maximize2,
  Trash2,
  Eye,
  EyeOff,
  Move,
  Crosshair,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import Choice from "./Choice";
import CalculationAnswer, { CalculationStatus } from "./CalculationAnswer";
import { Preview } from "./StructuredFields";
import MathEditor, { MathEditorHandle } from "./MathEditor";
import { sourceToMath, mathToSource } from "@/lib/calculator/notation";
import { formatDisplayApprox } from "@/lib/calculator/display-format";
import { graphTableInterval } from "@/lib/calculator/graph-table-interval";
import { calculate } from "@/lib/calculator/engine";
import { uid } from "@/lib/calculator/types";
import type {
  GraphSpec,
  Definition,
  Settings,
  Entry,
} from "@/lib/calculator/types";
import {
  compileMath,
  graphScope,
  graphFunctions,
  graphParameterSamples,
  finiteSegment,
  graphFitRange,
  drawableGraphRange,
  graphTable,
  MAX_GRAPHS,
} from "@/lib/calculator/graph";
const colors = ["#254cdb", "#cb510f", "#8b48cb", "#047d70", "#c62c72"];
type ShadingInput = {
  graph: GraphSpec | undefined;
  comparison: GraphSpec | undefined;
  action: string;
  point: string;
  lower: string;
  upper: string;
  definitions: Definition[];
  settings: Settings;
  parameter: number;
};
type ShadedInterval = {
  origin: "preview" | "analysis";
  input: ShadingInput;
  lower: number;
  upper: number;
  f: ReturnType<typeof graphFunctions>["f"];
  other: ReturnType<typeof graphFunctions>["f"];
};
type AnalysisState =
  | { kind: "idle" }
  | { kind: "running"; requestId: number; input: ShadingInput }
  | { kind: "saved"; input: ShadingInput; entryId: Entry["id"] };
function sameShadingInput(a: ShadingInput, b: ShadingInput) {
  return (
    a.graph === b.graph &&
    a.comparison === b.comparison &&
    a.action === b.action &&
    a.point === b.point &&
    a.lower === b.lower &&
    a.upper === b.upper &&
    a.definitions === b.definitions &&
    a.settings === b.settings &&
    a.parameter === b.parameter
  );
}
export function makeGraph(
  expression = "sin(x)",
  type: GraphSpec["type"] = "cartesian",
  n = 0,
): GraphSpec {
  return {
    id: uid(),
    expression,
    type,
    second: "sin(t)",
    visible: true,
    color: colors[n % colors.length],
    min: "0",
    max: "2*pi",
  };
}
export default function GraphWorkspace({
  graphs,
  history,
  onChange,
  definitions,
  settings,
  onAnalyze,
  onStop,
  onOpenHistory,
  onReuse,
  onCompute = calculate,
  workerBusy = false,
}: {
  graphs: GraphSpec[];
  history: readonly Entry[];
  onChange: (g: GraphSpec[]) => void;
  definitions: Definition[];
  settings: Settings;
  onAnalyze: (params: Entry["params"]) => Promise<Readonly<Entry> | undefined>;
  onStop: () => void;
  onOpenHistory: (entryId: Entry["id"]) => void;
  onReuse: (s: string) => void;
  onCompute?: typeof calculate;
  workerBusy?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    holder = useRef<HTMLDivElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    drag = useRef<any>(null),
    editor = useRef<MathEditorHandle>(null);
  const [size, setSize] = useState({ w: 640, h: 400 }),
    [range, setRange] = useState([-6, 6, -4, 4]),
    [selection, select] = useState(""),
    [a, setA] = useState(1),
    [mode, setMode] = useState("pan"),
    [rotation, setRotation] = useState(0.6),
    [traceX, setTraceX] = useState<number | null>(null),
    [table, setTable] = useState(false),
    [action, setAction] = useState("value"),
    [point, setPoint] = useState("0"),
    [lower, setLower] = useState("-2"),
    [upper, setUpper] = useState("2"),
    [other, setOther] = useState("zero"),
    [shade, setShade] = useState<ShadedInterval | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [analysis, setAnalysis] = useState<AnalysisState>({ kind: "idle" }),
    [editing, setEditing] = useState<{
      id: string;
      field: "expression" | "second";
      latex: string;
      original: string;
    } | null>(null);
  const editingLatest = useRef(editing);
  useLayoutEffect(() => {
    editingLatest.current = editing;
  }, [editing]);
  const latest = useRef({ graphs, onChange });
  useLayoutEffect(() => {
    latest.current = { graphs, onChange };
  }, [graphs, onChange]);
  const mounted = useRef(true),
    deriving = useRef(false),
    generation = useRef(0),
    analysisRequest = useRef(0),
    analysisPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const generationAtMount = generation.current;
    return () => {
      mounted.current = false;
      generation.current = generationAtMount + 1;
      deriving.current = false;
      analysisRequest.current++;
      analysisPending.current = false;
    };
  }, []);
  const commitGraphs = (next: GraphSpec[]) => {
    latest.current.graphs = next;
    latest.current.onChange(next);
  };
  const addGraph = () => {
    if (latest.current.graphs.length >= MAX_GRAPHS) {
      setError(
        "Use at most 100 graphs per notebook. Delete a graph before adding another.",
      );
      return;
    }
    commitGraphs([
      ...latest.current.graphs,
      makeGraph("sin(x)", "cartesian", latest.current.graphs.length),
    ]);
  };
  const current = graphs.find((g) => g.id === selection) || graphs[0],
    comparison = graphs.find(
      (g) => g.id === other && g.id !== current?.id && g.type === "cartesian",
    ),
    analysisComparison = ["intersection", "area"].includes(action)
      ? comparison
      : undefined,
    scope = useMemo(
      () => graphScope(definitions, settings, a),
      [definitions, settings, a],
    );
  const prepared = useMemo(
    () =>
      graphs.map((g) => {
        try {
          return { g, ...graphFunctions(g, scope), error: "" };
        } catch (e) {
          return {
            g,
            f: () => NaN,
            second: () => NaN,
            warning: "",
            error: String(e),
          };
        }
      }),
    [graphs, scope],
  );
  if (other !== "zero" && !comparison) setOther("zero");
  const shadingInput: ShadingInput = {
    graph: current,
    comparison: analysisComparison,
    action,
    point,
    lower,
    upper,
    definitions,
    settings,
    parameter: a,
  };
  const shadingLatest = useRef(shadingInput);
  useLayoutEffect(() => {
    shadingLatest.current = shadingInput;
  });
  if (shade && !sameShadingInput(shade.input, shadingInput)) setShade(null);
  if (
    analysis.kind !== "idle" &&
    !sameShadingInput(analysis.input, shadingInput)
  ) {
    if (analysis.kind === "running") {
      analysisRequest.current++;
      analysisPending.current = false;
    }
    setAnalysis({ kind: "idle" });
  }
  const analyzedEntry =
    analysis.kind === "saved" && sameShadingInput(analysis.input, shadingInput)
      ? history.find((entry) => entry.id === analysis.entryId)
      : undefined;
  const visibleShade =
    shade &&
    sameShadingInput(shade.input, shadingInput) &&
    (shade.origin === "preview" ||
      (analyzedEntry &&
        ["exact", "numeric"].includes(analyzedEntry.result.status)))
      ? shade
      : null;
  const intervalShading = (): ShadedInterval | null => {
    if (!current || current.type !== "cartesian") return null;
    try {
      if (!lower.trim() || !upper.trim()) return null;
      const lo = compileMath(lower).evaluate(scope),
        hi = compileMath(upper).evaluate(scope),
        curve = prepared.find((p) => p.g.id === current.id),
        baseline = prepared.find((p) => p.g.id === analysisComparison?.id);
      if (
        typeof lo !== "number" ||
        typeof hi !== "number" ||
        !Number.isFinite(lo) ||
        !Number.isFinite(hi) ||
        lo >= hi ||
        !curve ||
        curve.error ||
        baseline?.error
      )
        return null;
      return {
        origin: "preview",
        input: shadingInput,
        lower: lo,
        upper: hi,
        f: curve.f,
        other: baseline?.f || (() => 0),
      };
    } catch {
      return null;
    }
  };
  const trace = useMemo<[number, number] | null>(() => {
    const p = prepared.find((p) => p.g.id === (selection || current?.id));
    if (
      traceX === null ||
      !p?.g.visible ||
      !["cartesian", "sequence"].includes(p.g.type)
    )
      return null;
    const x = p.g.type === "sequence" ? Math.round(traceX) : traceX,
      y = p.f(x);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }, [traceX, prepared, selection, current]);
  const diagnostic =
    error ||
    prepared.find((p) => p.error)?.error ||
    prepared.find((p) => p.warning)?.warning;
  useEffect(() => {
    if (!holder.current) return;
    const ro = new ResizeObserver(([e]) =>
      requestAnimationFrame(() =>
        setSize({
          w: e.contentRect.width,
          h: Math.max(290, Math.min(440, e.contentRect.width * 0.65)),
        }),
      ),
    );
    ro.observe(holder.current);
    return () => ro.disconnect();
  }, []);
  const zoom = (f: number) =>
    setRange((r) => {
      const x = r[0] + (r[1] - r[0]) / 2,
        y = r[2] + (r[3] - r[2]) / 2;
      const next = [
        x - ((r[1] - r[0]) * f) / 2,
        x + ((r[1] - r[0]) * f) / 2,
        y - ((r[3] - r[2]) * f) / 2,
        y + ((r[3] - r[2]) * f) / 2,
      ];
      return drawableGraphRange(next) ? next : r;
    });
  const fit = () => {
    try {
      const fitted = graphFitRange(prepared, scope, settings);
      if (fitted.range) setRange(fitted.range);
      setError(fitted.warning);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const scale = devicePixelRatio || 1;
    c.width = size.w * scale;
    c.height = size.h * scale;
    const ctx = c.getContext("2d")!;
    ctx.scale(scale, scale);
    const { w, h } = size,
      [xl, xr, yb, yt] = range,
      sx = (x: number) => ((x - xl) / (xr - xl)) * w,
      sy = (y: number) => h - ((y - yb) / (yt - yb)) * h;
    ctx.fillStyle = "#fcfdfc";
    ctx.fillRect(0, 0, w, h);
    const step = (n: number) => {
      const p = 10 ** Math.floor(Math.log10(n / 7));
      return [1, 2, 5, 10].map((x) => x * p).find((x) => n / x <= 10) || p;
    };
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    const dx = step(xr - xl),
      dy = step(yt - yb);
    for (let x = Math.ceil(xl / dx) * dx; x <= xr; x += dx) {
      ctx.strokeStyle = Math.abs(x) < dx / 100 ? "#9aadaa" : "#e4ebea";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(x), 0);
      ctx.lineTo(sx(x), h);
      ctx.stroke();
      ctx.fillStyle = "#617774";
      if (Math.abs(x) > dx / 100)
        ctx.fillText(
          Number(x.toPrecision(3)).toString(),
          sx(x),
          Math.max(14, Math.min(h - 6, sy(0) + 15)),
        );
    }
    for (let y = Math.ceil(yb / dy) * dy; y <= yt; y += dy) {
      ctx.strokeStyle = Math.abs(y) < dy / 100 ? "#9aadaa" : "#e4ebea";
      ctx.beginPath();
      ctx.moveTo(0, sy(y));
      ctx.lineTo(w, sy(y));
      ctx.stroke();
      ctx.fillStyle = "#617774";
      if (Math.abs(y) > dy / 100)
        ctx.fillText(
          Number(y.toPrecision(3)).toString(),
          Math.max(18, Math.min(w - 18, sx(0) + 18)),
          sy(y) - 5,
        );
    }
    for (const { g, f, second, error } of prepared.filter((p) => p.g.visible)) {
      if (error) continue;
      ctx.strokeStyle = g.color;
      ctx.fillStyle = g.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (
        g.type === "cartesian" ||
        g.type === "sequence" ||
        g.type === "data"
      ) {
        let prev: any = null;
        const n = Math.ceil(w * 1.5),
          pts =
            g.type === "data"
              ? g.points || []
              : g.type === "sequence"
                ? Array.from(
                    { length: Math.min(500, Math.ceil(xr - xl) + 1) },
                    (_, i) => {
                      const x = Math.ceil(xl) + i;
                      return [x, f(x)];
                    },
                  )
                : Array.from({ length: n + 1 }, (_, i) => {
                    const x = xl + ((xr - xl) * i) / n;
                    return [x, f(x)];
                  });
        for (const [x, y] of pts) {
          if (Number.isFinite(x + y) && Math.abs(sy(y)) < h * 10) {
            if (g.type === "sequence") {
              ctx.moveTo(sx(x) + 2, sy(y));
              ctx.arc(sx(x), sy(y), 2, 0, 2 * Math.PI);
            } else {
              const ok =
                prev &&
                (g.type === "data" ||
                  finiteSegment(prev[1], f((x + prev[0]) / 2), y, yt - yb));
              ok ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y));
              prev = [x, y];
            }
          } else prev = null;
        }
        ctx.stroke();
        if (g.type === "data" && pts.length === 1) {
          const px = sx(pts[0][0]),
            py = sy(pts[0][1]);
          if (
            Number.isFinite(px) &&
            Number.isFinite(py) &&
            Math.abs(py) < h * 10
          ) {
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        if (visibleShade && g.id === visibleShade.input.graph?.id) {
          ctx.globalAlpha = 0.14;
          for (let i = 0; i < w; i++) {
            const x = xl + ((xr - xl) * i) / w,
              y = visibleShade.f(x),
              z = visibleShade.other(x);
            if (
              x >= visibleShade.lower &&
              x <= visibleShade.upper &&
              Number.isFinite(y + z) &&
              Number.isFinite(sy(y)) &&
              Number.isFinite(sy(z))
            )
              ctx.fillRect(
                i,
                Math.min(sy(y), sy(z)),
                1,
                Math.min(h, Math.abs(sy(y) - sy(z))),
              );
          }
          ctx.globalAlpha = 1;
        }
      } else if (g.type === "parametric" || g.type === "polar") {
        let prev: [number, number] | null = null;
        for (const { x, y } of graphParameterSamples(
          g,
          { f, second },
          scope,
          settings,
          1000,
        )) {
          const px = sx(x),
            py = sy(y);
          if (Number.isFinite(px) && Number.isFinite(py)) {
            if (
              prev &&
              Math.hypot(px - prev[0], py - prev[1]) < Math.max(w, h) / 3
            )
              ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
            prev = [px, py];
          } else prev = null;
        }
        ctx.stroke();
      } else if (g.type === "implicit" || g.type === "inequality") {
        const n = 70,
          m = 50;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < m; j++) {
            const x = xl + ((xr - xl) * i) / n,
              y = yb + ((yt - yb) * j) / m,
              xx = x + (xr - xl) / n,
              yy = y + (yt - yb) / m;
            if (g.type === "inequality") {
              const v = f((x + xx) / 2, (y + yy) / 2);
              if (Number.isFinite(v) && v) {
                ctx.globalAlpha = 0.16;
                ctx.fillRect(sx(x), sy(yy), w / n + 1, h / m + 1);
                ctx.globalAlpha = 1;
              }
              continue;
            }
            const ps = [
                [x, y],
                [xx, y],
                [xx, yy],
                [x, yy],
              ],
              vs = ps.map(([x, y]) => f(x, y));
            if (!vs.every(Number.isFinite)) continue;
            const cross: number[][] = [];
            for (let k = 0; k < 4; k++) {
              const l = (k + 1) % 4;
              if (vs[k] < 0 !== vs[l] < 0) {
                const r = vs[k] / (vs[k] - vs[l]),
                  px = ps[k][0] + r * (ps[l][0] - ps[k][0]),
                  py = ps[k][1] + r * (ps[l][1] - ps[k][1]);
                if (Math.abs(f(px, py)) < Math.max(...vs.map(Math.abs)) * 0.6)
                  cross.push([px, py]);
              }
            }
            for (let k = 0; k + 1 < cross.length; k += 2) {
              ctx.beginPath();
              ctx.moveTo(sx(cross[k][0]), sy(cross[k][1]));
              ctx.lineTo(sx(cross[k + 1][0]), sy(cross[k + 1][1]));
              ctx.stroke();
            }
          }
      } else if (g.type === "field") {
        ctx.lineWidth = 1.2;
        for (let i = 1; i < 21; i++)
          for (let j = 1; j < 16; j++) {
            const x = xl + ((xr - xl) * i) / 21,
              y = yb + ((yt - yb) * j) / 16,
              v = f(x, y);
            if (!Number.isFinite(v)) continue;
            const ang = Math.atan((((v * (xr - xl)) / (yt - yb)) * h) / w),
              len = Math.min(w / 48, h / 36);
            ctx.beginPath();
            ctx.moveTo(
              sx(x) - Math.cos(ang) * len,
              sy(y) + Math.sin(ang) * len,
            );
            ctx.lineTo(
              sx(x) + Math.cos(ang) * len,
              sy(y) - Math.sin(ang) * len,
            );
            ctx.stroke();
          }
      } else if (g.type === "surface") {
        const proj = (x: number, y: number, z: number) => [
          w / 2 +
            (((x * Math.cos(rotation) - y * Math.sin(rotation)) * w) /
              (xr - xl)) *
              0.68,
          h / 2 +
            (((x * Math.sin(rotation) + y * Math.cos(rotation)) * h) /
              (yt - yb)) *
              0.35 -
            ((z * h) / (yt - yb)) * 0.6,
        ];
        ctx.lineWidth = 1;
        for (let axis = 0; axis < 2; axis++)
          for (let i = 0; i <= 24; i++) {
            ctx.beginPath();
            let prev: any = null;
            for (let j = 0; j <= 60; j++) {
              const x = xl + (xr - xl) * (axis ? j / 60 : i / 24),
                y = yb + (yt - yb) * (axis ? i / 24 : j / 60),
                z = f(x, y),
                p = proj(x, y, z);
              if (Number.isFinite(z) && Math.abs(p[1]) < h * 5) {
                prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < h / 2
                  ? ctx.lineTo(p[0], p[1])
                  : ctx.moveTo(p[0], p[1]);
                prev = p;
              } else prev = null;
            }
            ctx.stroke();
          }
      }
    }
    if (trace) {
      ctx.strokeStyle = "#698a83";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(trace[0]), 0);
      ctx.lineTo(sx(trace[0]), h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx(trace[0]), sy(trace[1]), 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [
    prepared,
    size,
    range,
    rotation,
    trace,
    visibleShade,
    scope,
    settings,
    current?.id,
  ]);
  const update = (id: string, changes: Partial<GraphSpec>) =>
    commitGraphs(
      latest.current.graphs.map((g) =>
        g.id === id ? { ...g, ...changes } : g,
      ),
    );
  const screen = (e: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const traceAt = (px: number) => {
    const p = prepared.find((p) => p.g.id === current?.id);
    if (!p || !["cartesian", "sequence"].includes(p.g.type)) return;
    let x = range[0] + (px / size.w) * (range[1] - range[0]);
    if (p.g.type === "sequence") x = Math.round(x);
    select(p.g.id);
    setTraceX(x);
  };
  const down = (e: React.PointerEvent) => {
    canvas.current?.setPointerCapture(e.pointerId);
    const p = screen(e);
    pointers.current.set(e.pointerId, p);
    drag.current = { p, range, rotation };
    if (mode === "trace") traceAt(p.x);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = screen(e);
    if (pointers.current.size === 2) {
      const old = [...pointers.current.values()],
        before = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y);
      pointers.current.set(e.pointerId, p);
      const ps = [...pointers.current.values()],
        after = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (after > 5 && before > 5) zoom(before / after);
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (mode === "trace") {
      traceAt(p.x);
      return;
    }
    const d = drag.current;
    if (current?.type === "surface") {
      setRotation(d.rotation + (p.x - d.p.x) / 100);
      return;
    }
    const dx = ((p.x - d.p.x) / size.w) * (d.range[1] - d.range[0]),
      dy = ((p.y - d.p.y) / size.h) * (d.range[3] - d.range[2]);
    const next = [
      d.range[0] - dx,
      d.range[1] - dx,
      d.range[2] + dy,
      d.range[3] + dy,
    ];
    if (drawableGraphRange(next)) setRange(next);
  };
  const derived = async (operation: string) => {
    if (
      !current ||
      workerBusy ||
      deriving.current ||
      latest.current.graphs.length >= MAX_GRAPHS
    ) {
      if (latest.current.graphs.length >= MAX_GRAPHS)
        setError(
          "Use at most 100 graphs per notebook. Delete a graph before adding another.",
        );
      return;
    }
    const requestGeneration = generation.current,
      requestInput = shadingInput;
    const contextIsCurrent = () => {
      const input = shadingLatest.current,
        source = latest.current.graphs.find((graph) => graph.id === current.id);
      return (
        mounted.current &&
        generation.current === requestGeneration &&
        source?.expression === current.expression &&
        source.type === current.type &&
        source.radians === current.radians &&
        input.definitions === requestInput.definitions &&
        input.settings === requestInput.settings &&
        input.parameter === requestInput.parameter &&
        input.point === requestInput.point
      );
    };
    deriving.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await onCompute({
        operation,
        params: {
          expression: current.expression,
          point,
          variable: "x",
          parameter: String(a),
          canonical: String(!!current.radians),
        },
        definitions,
        settings: {
          ...settings,
          angle: current.radians ? "rad" : settings.angle,
        },
      });
      if (!contextIsCurrent()) return;
      if (r.status === "error" || r.status === "unresolved" || !r.reusable)
        throw Error(r.text);
      if (latest.current.graphs.length >= MAX_GRAPHS)
        throw Error(
          "Use at most 100 graphs per notebook. Delete a graph before adding another.",
        );
      const g = {
        ...makeGraph(r.reusable, "cartesian", latest.current.graphs.length),
        radians: true,
      };
      commitGraphs([...latest.current.graphs, g]);
      select(g.id);
    } catch (e) {
      if (contextIsCurrent()) setError(String(e));
    } finally {
      if (generation.current === requestGeneration) deriving.current = false;
      if (mounted.current && generation.current === requestGeneration)
        setBusy(false);
    }
  };
  const stopAnalysis = () => {
    analysisRequest.current++;
    analysisPending.current = false;
    setAnalysis({ kind: "idle" });
    setShade(null);
    onStop();
  };
  const analyze = async () => {
    if (
      !current ||
      workerBusy ||
      analysisPending.current ||
      current.type !== "cartesian"
    )
      return;
    const requestGeneration = generation.current,
      requestId = ++analysisRequest.current,
      input = shadingInput,
      interval = ["integral", "area"].includes(action)
        ? intervalShading()
        : null;
    const owns = () =>
      mounted.current &&
      generation.current === requestGeneration &&
      analysisRequest.current === requestId;
    analysisPending.current = true;
    setAnalysis({ kind: "running", requestId, input });
    setShade(null);
    setError("");
    try {
      const entry = await onAnalyze({
        expression: current.expression,
        other: analysisComparison?.expression || "0",
        action,
        point,
        lower,
        upper,
        parameter: String(a),
        canonical: String(!!current.radians),
        otherCanonical: String(!!analysisComparison?.radians),
      });
      if (!owns() || !sameShadingInput(input, shadingLatest.current) || !entry)
        return;
      setAnalysis({ kind: "saved", input, entryId: entry.id });
      if (interval && ["exact", "numeric"].includes(entry.result.status))
        setShade({ ...interval, origin: "analysis" });
    } catch (error) {
      if (owns() && sameShadingInput(input, shadingLatest.current))
        setError(String(error));
    } finally {
      if (owns()) {
        analysisPending.current = false;
        setAnalysis((state) =>
          state.kind === "running" && state.requestId === requestId
            ? { kind: "idle" }
            : state,
        );
      }
    }
  };
  const openMath = async (g: GraphSpec, field: "expression" | "second") => {
    try {
      const converted = await sourceToMath(g[field]);
      if (
        !mounted.current ||
        latest.current.graphs.find((item) => item.id === g.id)?.[field] !==
          g[field]
      )
        return;
      if (converted.latex === undefined) {
        setError(converted.reason || "Keep the original graph expression.");
        return;
      }
      setError("");
      setEditing({
        id: g.id,
        field,
        original: g[field],
        latex: converted.latex,
      });
    } catch {
      if (mounted.current)
        setError(
          "Math editor could not load. Your graph is preserved. Try again.",
        );
    }
  };
  const tableInterval = useMemo(
    () => graphTableInterval(lower, upper),
    [lower, upper],
  );
  const tableIntervalError =
    current &&
    !["data", "parametric", "polar"].includes(current.type) &&
    !tableInterval;
  const tableData = useMemo(() => {
    if (tableIntervalError) return { headers: [], rows: [] };
    if (!current) return { headers: [], rows: [] };
    const p = prepared.find((p) => p.g.id === current.id);
    if (!p) return { headers: [], rows: [] };
    try {
      return graphTable(
        current,
        p,
        scope,
        settings,
        tableInterval?.[0] ?? 0,
        tableInterval?.[1] ?? 0,
      );
    } catch {
      return { headers: [], rows: [] };
    }
  }, [current, prepared, scope, tableInterval, tableIntervalError, settings]);
  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="section-label">GRAPHS</span>
          <h1>Plot and explore.</h1>
        </div>
        <button className="subtle" onClick={addGraph}>
          <Plus size={17} /> Add
        </button>
      </div>
      <div className="graph-card">
        <div className="graph-toolbar">
          <div className="row">
            <button
              className={"graph-mode " + (mode === "pan" ? "active" : "")}
              aria-label="Pan graph"
              onClick={() => setMode("pan")}
            >
              <Move size={17} /> Pan
            </button>
            <button
              className={"graph-mode " + (mode === "trace" ? "active" : "")}
              aria-label="Trace graph"
              onClick={() => setMode("trace")}
            >
              <Crosshair size={17} /> Trace
            </button>
          </div>
          <span className="small">
            {settings.angle.toUpperCase()} · {mode}
          </span>
          <div className="row">
            <button
              className="icon-btn"
              aria-label="Zoom out"
              onClick={() => zoom(1.5)}
            >
              <Minus size={17} />
            </button>
            <button
              className="icon-btn"
              aria-label="Zoom in"
              onClick={() => zoom(0.67)}
            >
              <Plus size={17} />
            </button>
            <button className="icon-btn" aria-label="Fit graph" onClick={fit}>
              <Maximize2 size={17} />
            </button>
            <button
              className="icon-btn"
              aria-label="Reset graph"
              onClick={() => setRange([-6, 6, -4, 4])}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        <div ref={holder} className="canvas-wrap">
          <canvas
            ref={canvas}
            style={{ width: size.w, height: size.h, touchAction: "none" }}
            aria-label="Interactive graph; computed values are available in Table"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => {
              pointers.current.delete(e.pointerId);
              drag.current = null;
            }}
            onPointerCancel={() => {
              pointers.current.clear();
              drag.current = null;
            }}
          />
          {!graphs.length && (
            <div className="graph-empty">
              <button className="primary" onClick={addGraph}>
                Plot a function
              </button>
            </div>
          )}
        </div>
        {trace && (
          <div className="trace-bar">
            x ={" "}
            {formatDisplayApprox(
              String(trace[0]),
              settings.displayDecimals ?? 9,
            )}{" "}
            · y ={" "}
            {formatDisplayApprox(
              String(trace[1]),
              settings.displayDecimals ?? 9,
            )}{" "}
            <button onClick={() => onReuse(JSON.stringify(trace))}>
              Use point
            </button>
          </div>
        )}
        <div className="parameter-row">
          <label>Parameter a</label>
          <Slider
            value={[a]}
            min={-10}
            max={10}
            step={0.05}
            aria-label="Parameter a"
            onValueChange={(v) => setA(v[0])}
          />
          <input
            type="number"
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
            aria-label="Parameter value"
          />
        </div>
      </div>
      {diagnostic && (
        <p className="warning" role="status">
          {diagnostic}
        </p>
      )}
      <div className="graph-list">
        {graphs.map((g, i) => (
          <div
            className={
              "graph-expression " + (current?.id === g.id ? "selected" : "")
            }
            key={g.id}
            onClick={() => select(g.id)}
            onFocus={() => select(g.id)}
          >
            <button
              className="icon-btn"
              aria-label={`${g.visible ? "Hide" : "Show"} graph ${i + 1}`}
              style={{ color: g.color }}
              onClick={() => update(g.id, { visible: !g.visible })}
            >
              {g.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <div className="graph-fields">
              <Choice
                value={g.type}
                label={`Graph ${i + 1} type`}
                onChange={(s) => update(g.id, { type: s as GraphSpec["type"] })}
                options={[
                  { value: "cartesian", label: "y = f(x)" },
                  { value: "implicit", label: "Implicit relation" },
                  { value: "inequality", label: "Inequality" },
                  { value: "parametric", label: "Parametric (t)" },
                  { value: "polar", label: "Polar r(θ)" },
                  { value: "surface", label: "3D surface" },
                  { value: "field", label: "Direction field" },
                  { value: "sequence", label: "Sequence" },
                  ...(g.type === "data"
                    ? [{ value: "data", label: "Sampled trajectory" }]
                    : []),
                ]}
              />
              {g.type === "data" ? (
                <span>
                  {g.expression} · {g.points?.length} samples
                </span>
              ) : (
                <div className="math-field-row">
                  <input
                    aria-label={`Graph ${i + 1} expression`}
                    value={g.expression}
                    onChange={(e) =>
                      update(g.id, { expression: e.target.value })
                    }
                  />
                  <button
                    className="subtle"
                    aria-label={`Math editor for graph ${i + 1}`}
                    onClick={() => openMath(g, "expression")}
                  >
                    Math
                  </button>
                </div>
              )}
              {g.type === "parametric" && (
                <div className="math-field-row">
                  <input
                    aria-label={`Graph ${i + 1} y(t)`}
                    value={g.second}
                    onChange={(e) => update(g.id, { second: e.target.value })}
                  />
                  <button
                    aria-label={`Math editor for graph ${i + 1} y(t)`}
                    onClick={() => openMath(g, "second")}
                  >
                    Math
                  </button>
                </div>
              )}
              {["parametric", "polar"].includes(g.type) && (
                <div className="row">
                  <input
                    aria-label="Parameter minimum"
                    value={g.min}
                    onChange={(e) => update(g.id, { min: e.target.value })}
                  />
                  <span>≤ t ≤</span>
                  <input
                    aria-label="Parameter maximum"
                    value={g.max}
                    onChange={(e) => update(g.id, { max: e.target.value })}
                  />
                </div>
              )}
              {g.radians && (
                <span className="small muted">
                  Canonical radians; angle conversion included
                </span>
              )}
            </div>
            <button
              className="icon-btn"
              aria-label={`Delete graph ${i + 1}`}
              onClick={() =>
                commitGraphs(latest.current.graphs.filter((p) => p.id !== g.id))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {current && (
        <section className="graph-analysis">
          <div className="section-heading">
            <div>
              <span className="section-label">
                SELECTED CURVE ·{" "}
                {graphs.findIndex((g) => g.id === current.id) + 1}
              </span>
              <h2>Explore this graph</h2>
              <code className="graph-selected-expression">
                {current.expression}
              </code>
            </div>
            <button className="subtle" onClick={() => setTable(!table)}>
              Table
            </button>
          </div>
          <div className="row wrap">
            <button
              className="subtle"
              disabled={
                busy ||
                graphs.length >= MAX_GRAPHS ||
                current.type !== "cartesian"
              }
              onClick={() => derived("graph_derivative")}
            >
              Plot derivative
            </button>
            <button
              className="subtle"
              disabled={
                busy ||
                graphs.length >= MAX_GRAPHS ||
                current.type !== "cartesian"
              }
              onClick={() => derived("graph_accumulation")}
            >
              Plot integral from x₀
            </button>
          </div>
          <div className="field-grid">
            <label>
              Operation
              <Choice
                label="Graph analysis operation"
                value={action}
                onChange={setAction}
                options={[
                  "value",
                  "roots",
                  "intersection",
                  "critical points",
                  "tangent",
                  "integral",
                  "area",
                  "domain",
                  "singularities",
                ]}
              />
            </label>
            <label>
              At x / x₀
              <input
                aria-label="Analysis point"
                value={point}
                onChange={(e) => setPoint(e.target.value)}
              />
            </label>
            <label>
              Interval start
              <input value={lower} onChange={(e) => setLower(e.target.value)} />
            </label>
            <label>
              Interval end
              <input value={upper} onChange={(e) => setUpper(e.target.value)} />
            </label>
          </div>
          {["intersection", "area"].includes(action) && (
            <label>
              Compare with
              <Choice
                label="Comparison graph"
                value={comparison?.id || "zero"}
                onChange={setOther}
                options={[
                  { value: "zero", label: "x axis" },
                  ...graphs
                    .filter(
                      (g) => g.id !== current.id && g.type === "cartesian",
                    )
                    .map((g) => ({ value: g.id, label: g.expression })),
                ]}
              />
            </label>
          )}
          <div className="row spread">
            <label className="check-label">
              <Checkbox
                checked={!!visibleShade}
                onCheckedChange={(x) => setShade(x ? intervalShading() : null)}
              />{" "}
              Shade interval
            </label>
            <button
              className="primary"
              disabled={current.type !== "cartesian"}
              aria-disabled={workerBusy || analysis.kind === "running"}
              onClick={analyze}
            >
              Calculate
            </button>
          </div>
          <p role="status" aria-live="polite" className="small muted">
            {analysis.kind === "running"
              ? "Calculating graph analysis…"
              : workerBusy
                ? "Calculating locally…"
                : analyzedEntry
                  ? "Graph analysis saved."
                  : ""}
          </p>
          {(analysis.kind === "running" || workerBusy) && (
            <button onClick={stopAnalysis}>Stop calculation</button>
          )}
          {analyzedEntry && (
            <section
              className="graph-analysis-result"
              aria-label="Graph analysis result"
            >
              <div className="row spread">
                <CalculationStatus status={analyzedEntry.result.status} />
                <button onClick={() => onOpenHistory(analyzedEntry.id)}>
                  Open saved calculation in Calculate
                </button>
              </div>
              <CalculationAnswer
                result={analyzedEntry.result}
                displayDecimals={settings.displayDecimals ?? 9}
              />
              {analyzedEntry.result.approx && (
                <details className="approximation">
                  <summary>Decimal approximation</summary>
                  <Preview
                    source={formatDisplayApprox(
                      analyzedEntry.result.approx,
                      settings.displayDecimals ?? 9,
                    )}
                    block
                  />
                </details>
              )}
              {analyzedEntry.result.notes.length > 0 && (
                <details
                  open={["error", "unresolved"].includes(
                    analyzedEntry.result.status,
                  )}
                >
                  <summary>Conditions and diagnostics</summary>
                  {analyzedEntry.result.notes.map((note, index) => (
                    <p className="small muted" key={index}>
                      {note}
                    </p>
                  ))}
                </details>
              )}
            </section>
          )}
          {table && (
            <div className="table-scroll">
              {tableIntervalError && (
                <p className="warning" role="alert">
                  Use finite numbers for the table interval, with start no
                  greater than end.
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    {tableData.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                    <th>Reuse</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((value, j) => (
                        <td key={j}>
                          {Number.isFinite(value)
                            ? formatDisplayApprox(
                                String(value),
                                settings.displayDecimals ?? 9,
                              )
                            : "undefined"}
                        </td>
                      ))}
                      <td>
                        <button
                          disabled={!r.reuse.every(Number.isFinite)}
                          onClick={() => onReuse(JSON.stringify(r.reuse))}
                        >
                          Use
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">
            Plots are finite samples, not proofs. Undefined regions remain open;
            steep curves may have gaps. Implicit grids can miss small features.
            Drag to pan, pinch or use ± to zoom. Drag a surface to rotate.
            Analysis appears here and is saved in Calculate. Leaving Graphs
            resets these controls.
          </p>
        </section>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            (window as any).mathVirtualKeyboard?.hide();
          }
        }}
      >
        <DialogContent>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <DialogHeader>
            <DialogTitle>Graph expression</DialogTitle>
            <DialogDescription>
              Check the converted elementary notation before plotting.
            </DialogDescription>
          </DialogHeader>
          <MathEditor
            ref={editor}
            value={editing?.latex || ""}
            onChange={(latex) => setEditing((s) => (s ? { ...s, latex } : s))}
          />
          <div className="row spread">
            <button
              className="subtle"
              onClick={() => editor.current?.keyboard()}
            >
              Math keyboard
            </button>
            <button
              className="primary"
              onClick={async () => {
                if (!editing) return;
                try {
                  const ex = await mathToSource(editing.latex);
                  if (!mounted.current || editingLatest.current !== editing)
                    return;
                  if (
                    latest.current.graphs.find((g) => g.id === editing.id)?.[
                      editing.field
                    ] !== editing.original
                  ) {
                    setError(
                      "This graph changed. Close the editor and reopen the current expression.",
                    );
                    return;
                  }
                  compileMath(ex);
                  update(editing.id, { [editing.field]: ex });
                  setEditing(null);
                  (window as any).mathVirtualKeyboard?.hide();
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Use expression
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
