"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type {
  MathfieldElement,
  Selection,
  Selector,
  VirtualKeyboardLayout,
  VirtualKeyboardName,
} from "mathlive";
import "./MathEditor.css";
import { loadMathLive } from "../../lib/calculator/mathlive-loader";
const structureTemplates = {
  Fraction: "\\frac{#@}{#?}",
  Power: "#@^{#?}",
  Root: "\\sqrt{#?}",
  Integral: "\\int_{#?}^{#?} #? \\,\\mathrm{d}x",
  Sum: "\\sum_{n=#?}^{#?} #?",
  Matrix: "\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}",
  Cases: "\\begin{cases}#?&#?\\\\#?&\\text{otherwise}\\end{cases}",
};
const structures = Object.entries(structureTemplates).map(([label, latex]) => ({
  label,
  latex,
}));
const editingCommands: { label: string; command: Selector }[] = [
  { label: "Undo", command: "undo" },
  { label: "Redo", command: "redo" },
  { label: "Left", command: "moveToPreviousChar" },
  { label: "Right", command: "moveToNextChar" },
  { label: "Delete", command: "deleteBackward" },
  { label: "Next slot", command: "moveToNextPlaceholder" },
];

export type MathEditorHandle = {
  keyboard: () => void;
  insert: (s: string) => void;
};
export default forwardRef<
  MathEditorHandle,
  {
    value: string;
    onChange: (s: string) => void;
    onSubmit?: () => void;
    label?: string;
  }
>(function MathEditor(
  { value, onChange, onSubmit, label = "Mathematical expression" },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    mf = useRef<MathfieldElement | null>(null),
    selection = useRef<Selection | null>(null),
    queuedKeyboard = useRef(false),
    callbacks = useRef({ value, onChange, onSubmit, label });
  useLayoutEffect(() => {
    callbacks.current = { value, onChange, onSubmit, label };
  }, [value, onChange, onSubmit, label]);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showTools, setShowTools] = useState(false);
  const focusSelection = () => {
    const el = mf.current;
    if (!el) return null;
    const saved = selection.current;
    el.focus();
    if (saved) el.selection = saved;
    return el;
  };
  const insert = (s: string) => {
    const el = focusSelection();
    if (!el) return;
    el.insert(s, { focus: true, selectionMode: "placeholder" });
    callbacks.current.onChange(el.value);
  };
  const command = (selector: Selector) => {
    const el = focusSelection();
    if (!el) return;
    el.executeCommand(selector);
  };
  useImperativeHandle(ref, () => ({
    keyboard: () => {
      if (!mf.current) {
        queuedKeyboard.current = true;
        return;
      }
      focusSelection();
      const k = window.mathVirtualKeyboard;
      if (k?.visible) k.hide();
      else k?.show();
    },
    insert,
  }));
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    loadMathLive()
      .then((m) => {
        if (disposed || !host.current) return;
        m.MathfieldElement.fontsDirectory = "/mathfonts";
        m.MathfieldElement.soundsDirectory = null;
        const el = new m.MathfieldElement();
        el.mathVirtualKeyboardPolicy =
          window.parent !== window ? "sandboxed" : "manual";
        el.setAttribute("aria-label", callbacks.current.label);
        el.value = callbacks.current.value;
        const rememberSelection = () => {
          selection.current = {
            ranges: el.selection.ranges.map((range) => [...range]),
            direction: el.selection.direction,
          };
        };
        el.addEventListener("selection-change", rememberSelection);
        el.addEventListener("blur", rememberSelection);

        el.addEventListener("input", () =>
          callbacks.current.onChange(el.value),
        );
        el.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter" && callbacks.current.onSubmit) {
            e.preventDefault();
            callbacks.current.onSubmit?.();
          }
        });
        host.current.replaceChildren(el);
        mf.current = el;
        const k = window.mathVirtualKeyboard;
        if (k) {
          if (window.parent !== window) k.container = document.body;
          const layouts: (VirtualKeyboardName | VirtualKeyboardLayout)[] = [
            "numeric",
            "symbols",
            "alphabetic",
            {
              label: "Structures",
              rows: [
                [
                  structureTemplates.Fraction,
                  structureTemplates.Power,
                  structureTemplates.Root,
                  {
                    label: "∫",
                    insert: structureTemplates.Integral,
                    tooltip: "Definite integral",
                  },
                  {
                    label: "Σ",
                    insert: structureTemplates.Sum,
                    tooltip: "Sum",
                  },
                ],
                ["\\pi", "\\infty", "\\theta", "\\ln(#?)", "\\exp(#?)"],
                [
                  {
                    label: "Matrix",
                    insert: structureTemplates.Matrix,
                    tooltip: "2 by 2 matrix",
                  },
                  {
                    label: "Cases",
                    insert: structureTemplates.Cases,
                    tooltip: "Piecewise function",
                  },
                  "\\le",
                  "\\ge",
                  "\\ne",
                ],
                [
                  { label: "Undo", command: "undo" },
                  "[left]",
                  "[right]",
                  "[backspace]",
                  { label: "Next", command: "moveToNextPlaceholder" },
                ],
              ],
            },
          ];
          k.layouts = layouts.map((layout) =>
            typeof layout === "string" || !("rows" in layout)
              ? layout
              : {
                  ...layout,
                  rows: layout.rows.map((row) =>
                    row.map((key) =>
                      typeof key === "string"
                        ? {
                            ...(key.startsWith("[")
                              ? k.getKeycap(key)
                              : { latex: key }),
                            width: 2,
                          }
                        : { ...key, width: 2, class: "small" },
                    ),
                  ),
                },
          );
          k.layouts = k.normalizedLayouts.map((layout, index) => ({
            ...layout,
            label: ["Numbers", "Symbols", "Letters", "Structures"][index],
          }));
          let frame = 0;
          const geometry = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const height = `${k.boundingRect?.height || 0}px`;
              if (
                document.documentElement.style.getPropertyValue(
                  "--math-keyboard-height",
                ) !== height
              ) {
                document.documentElement.style.setProperty(
                  "--math-keyboard-height",
                  height,
                );
                if (el.matches(":focus-within"))
                  el.scrollIntoView({ block: "nearest" });
              }
            });
          };
          k.addEventListener("geometrychange", geometry);
          cleanup = () => {
            cancelAnimationFrame(frame);
            k.removeEventListener("geometrychange", geometry);
          };
        }
        if (queuedKeyboard.current) {
          queuedKeyboard.current = false;
          el.focus();
          k?.show();
        }
        setFailure(false);
        setLoaded(true);
      })
      .catch(() => {
        if (!disposed) {
          cleanup();
          mf.current?.remove();
          mf.current = null;
          selection.current = null;
          setLoaded(false);
          setFailure(true);
        }
      });
    return () => {
      disposed = true;
      cleanup();
      mf.current?.remove();
      mf.current = null;
      selection.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (mf.current && mf.current.value !== value) mf.current.value = value;
    mf.current?.setAttribute("aria-label", label);
  }, [value, label]);
  return (
    <div className="math-editor">
      <div ref={host} />
      {loaded && !value && (
        <span className="math-placeholder" aria-hidden="true">
          Enter an expression…
        </span>
      )}
      {!loaded && !failure && <p role="status">Loading math editor…</p>}
      {failure && (
        <div className="math-editor-recovery" role="alert">
          <p>Math editor could not load. Your expression is preserved.</p>
          <button
            type="button"
            onClick={() => {
              setFailure(false);
              setAttempt((n) => n + 1);
            }}
          >
            Retry editor
          </button>
        </div>
      )}
      {loaded && (
        <div className="math-entry-tools">
          <button
            type="button"
            aria-expanded={showTools}
            onClick={() => setShowTools((shown) => !shown)}
          >
            Structures & editing
          </button>
          {showTools && (
            <div className="math-entry-palette">
              <div
                className="math-entry-structures"
                role="group"
                aria-label="Insert a mathematical structure"
              >
                {structures.map((structure) => (
                  <button
                    type="button"
                    key={structure.label}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => insert(structure.latex)}
                  >
                    {structure.label}
                  </button>
                ))}
              </div>
              <div
                className="math-entry-commands"
                role="group"
                aria-label="Edit mathematical expression"
              >
                {editingCommands.map((item) => (
                  <button
                    type="button"
                    key={item.command}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => command(item.command)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
