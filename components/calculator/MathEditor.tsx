"use client";
import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
export type MathEditorHandle = {
  keyboard: () => void;
  insert: (s: string) => void;
};
export default forwardRef<
  MathEditorHandle,
  { value: string; onChange: (s: string) => void; onSubmit?: () => void }
>(function MathEditor({ value, onChange, onSubmit }, ref) {
  const host = useRef<HTMLDivElement>(null),
    mf = useRef<any>(null),
    callbacks = useRef({ onChange, onSubmit });
  callbacks.current = { onChange, onSubmit };
  const [loaded, setLoaded] = useState(false);
  useImperativeHandle(ref, () => ({
    keyboard: () => {
      mf.current?.focus();
      const k = (window as any).mathVirtualKeyboard;
      k?.visible ? k.hide() : k?.show();
    },
    insert: (s) => {
      mf.current?.insert(s, { focus: true, selectionMode: "placeholder" });
      callbacks.current.onChange(mf.current?.value || "");
    },
  }));
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    import("mathlive").then((m) => {
      if (disposed || !host.current) return;
      m.MathfieldElement.fontsDirectory = "/mathfonts";
      m.MathfieldElement.soundsDirectory = null;
      const el = new m.MathfieldElement();
      el.mathVirtualKeyboardPolicy =
        window.parent !== window ? "sandboxed" : "manual";
      el.setAttribute("aria-label", "Mathematical expression");
      el.value = value;

      el.addEventListener("input", () => callbacks.current.onChange(el.value));
      el.addEventListener("keydown", (e: any) => {
        if (e.key === "Enter") {
          e.preventDefault();
          callbacks.current.onSubmit?.();
        }
      });
      host.current.replaceChildren(el);
      mf.current = el;
      const k = (window as any).mathVirtualKeyboard;
      if (k) {
        if (window.parent !== window) k.container = document.body;
        const layouts = [
          "numeric",
          "symbols",
          "alphabetic",
          {
            label: "Calculus",
            rows: [
              [
                "\\frac{#@}{#?}",
                "#@^{#?}",
                "\\sqrt{#?}",
                {
                  label: "∫",
                  insert: "\\int_{#?}^{#?} #? \\,\\mathrm{d}x",
                  tooltip: "Definite integral",
                },
                { label: "Σ", insert: "\\sum_{n=#?}^{#?} #?", tooltip: "Sum" },
              ],
              ["\\pi", "\\infty", "\\theta", "\\ln(#?)", "\\exp(#?)"],
              [
                {
                  label: "Matrix",
                  insert: "\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}",
                  tooltip: "2 by 2 matrix",
                },
                {
                  label: "Cases",
                  insert:
                    "\\begin{cases}#?&#?\\\\#?&\\text{otherwise}\\end{cases}",
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
        k.layouts = layouts.map((layout: any) =>
          typeof layout === "string" || !layout.rows
            ? layout
            : {
                ...layout,
                rows: layout.rows.map((row: any[]) =>
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
        const geometry = () =>
          requestAnimationFrame(() => {
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
              mf.current?.scrollIntoView({ block: "nearest" });
            }
          });
        k.addEventListener("geometrychange", geometry);
        cleanup = () => k.removeEventListener("geometrychange", geometry);
      }
      setLoaded(true);
    });
    return () => {
      disposed = true;
      cleanup();
      mf.current?.remove();
      mf.current = null;
    };
  }, []);
  useEffect(() => {
    if (mf.current && mf.current.value !== value) mf.current.value = value;
  }, [value]);
  return (
    <div className="math-editor">
      <div ref={host} />
      {loaded && !value && (
        <span className="math-placeholder" aria-hidden="true">
          Enter an expression…
        </span>
      )}
      {!loaded && <p>Loading math editor…</p>}
    </div>
  );
});
