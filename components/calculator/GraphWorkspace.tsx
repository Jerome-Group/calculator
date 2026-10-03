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
import MathEditor, { MathEditorHandle } from "./MathEditor";
import { sourceToMath, mathToSource } from "@/lib/calculator/notation";
import { formatDisplayApprox } from "@/lib/calculator/display-format";
import { graphTableInterval } from "@/lib/calculator/graph-table-interval";
import { calculate } from "@/lib/calculator/engine";
import { uid } from "@/lib/calculator/types";
import type { GraphSpec, Definition, Settings } from "@/lib/calculator/types";
import {
  compileMath,
  graphScope,
  graphFunctions,
  numeric,
  finiteSegment,
  graphDataRange,
  drawableGraphRange,
  graphTable,
  MAX_GRAPHS,
} from "@/lib/calculator/graph";
const colors = ["#254cdb", "#cb510f", "#8b48cb", "#047d70", "#c62c72"];
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
  onChange,
  definitions,
  settings,
  onAnalyze,
  onReuse,
}: {
  graphs: GraphSpec[];
  onChange: (g: GraphSpec[]) => void;
  definitions: Definition[];
  settings: Settings;
  onAnalyze: (op: string, p: Record<string, string>) => void;
  onReuse: (s: string) => void;
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
    [trace, setTrace] = useState<[number, number] | null>(null),
    [table, setTable] = useState(false),
    [action, setAction] = useState("value"),
    [point, setPoint] = useState("0"),
    [lower, setLower] = useState("-2"),
    [upper, setUpper] = useState("2"),
    [other, setOther] = useState("zero"),
    [shade, setShade] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
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
    generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const generationAtMount = generation.current;
    return () => {
      mounted.current = false;
      generation.current = generationAtMount + 1;
      deriving.current = false;
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
      const dataRange = graphDataRange(latest.current.graphs);
      if (dataRange) {
        setRange(dataRange);
        setError("");
        return;
      }
    } catch (e) {
      setError(String(e));
      return;
    }
    const ys = prepared
      .filter((p) => p.g.visible && p.g.type === "cartesian")
      .flatMap((p) => Array.from({ length: 121 }, (_, i) => p.f(-6 + i / 10)))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!ys.length) return;
    const l = ys[Math.floor(ys.length * 0.05)],
      h = ys[Math.floor(ys.length * 0.95)],
      pad = Math.max(1, (h - l) * 0.15);
    const next = [-6, 6, l - pad, h + pad];
    if (!drawableGraphRange(next)) {
      setError("Data coordinates exceed the drawable range.");
      return;
    }
    setRange(next);
    setError("");
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
        if (shade && g.id === current?.id && g.type === "cartesian") {
          const lo = Number(lower),
            hi = Number(upper),
            q = prepared.find((p) => p.g.id === other);
          ctx.globalAlpha = 0.14;
          for (let i = 0; i < w; i++) {
            const x = xl + ((xr - xl) * i) / w,
              y = f(x),
              z = q ? q.f(x) : 0;
            if (x >= lo && x <= hi && Number.isFinite(y + z))
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
        let lo = NaN,
          hi = NaN;
        try {
          lo = numeric(compileMath(g.min), scope);
          hi = numeric(compileMath(g.max), scope);
        } catch {}
        if (!Number.isFinite(lo + hi) || lo >= hi) continue;
        let prev: any = null;
        for (let i = 0; i <= 1000; i++) {
          const t = lo + ((hi - lo) * i) / 1000,
            r = f(t),
            angle =
              t * (settings.angle === "deg" && !g.radians ? Math.PI / 180 : 1),
            x = g.type === "polar" ? r * Math.cos(angle) : r,
            y = g.type === "polar" ? r * Math.sin(angle) : second(t);
          if (Number.isFinite(x + y)) {
            if (
              prev &&
              Math.hypot(sx(x) - prev[0], sy(y) - prev[1]) < Math.max(w, h) / 3
            )
              ctx.lineTo(sx(x), sy(y));
            else ctx.moveTo(sx(x), sy(y));
            prev = [sx(x), sy(y)];
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
    shade,
    lower,
    upper,
    other,
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
    const y = p.f(x);
    setTrace(Number.isFinite(y) ? [x, y] : null);
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
      deriving.current ||
      latest.current.graphs.length >= MAX_GRAPHS
    ) {
      if (latest.current.graphs.length >= MAX_GRAPHS)
        setError(
          "Use at most 100 graphs per notebook. Delete a graph before adding another.",
        );
      return;
    }
    const requestGeneration = generation.current;
    deriving.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await calculate({
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
      if (r.status === "error" || r.status === "unresolved" || !r.reusable)
        throw Error(r.text);
      if (!mounted.current || generation.current !== requestGeneration) return;
      const source = latest.current.graphs.find((g) => g.id === current.id);
      if (
        !source ||
        source.expression !== current.expression ||
        source.type !== current.type
      )
        return;
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
      if (mounted.current && generation.current === requestGeneration)
        setError(String(e));
    } finally {
      if (generation.current === requestGeneration) deriving.current = false;
      if (mounted.current && generation.current === requestGeneration)
        setBusy(false);
    }
  };
  const analyze = () => {
    if (!current || current.type !== "cartesian") return;
    onAnalyze("graph_analysis", {
      expression: current.expression,
      other: graphs.find((g) => g.id === other)?.expression || "0",
      action,
      point,
      lower,
      upper,
      parameter: String(a),
      canonical: String(!!current.radians),
      otherCanonical: String(!!graphs.find((g) => g.id === other)?.radians),
    });
    if (["integral", "area"].includes(action)) setShade(true);
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
                value={other}
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
                checked={shade}
                onCheckedChange={(x) => setShade(!!x)}
              />{" "}
              Shade interval
            </label>
            <button
              className="primary"
              disabled={current.type !== "cartesian"}
              onClick={analyze}
            >
              Calculate
            </button>
          </div>
          {table && (
            <div className="table-scroll">
              {tableIntervalError && (
                <p className="warning" role="alert">
                  Use finite numbers for the table interval.
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
            Analysis is saved in Calculate.
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
