"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type MouseEvent,
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
import { prepareMathLiveMenu } from "../../lib/calculator/mathlive-menu";
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
  const showExpressionMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (window.mathVirtualKeyboard?.visible) window.mathVirtualKeyboard.hide();
    // Menu dismissal must return focus to the field, including its first use.
    const el = focusSelection();
    if (!el) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    // MathLive 0.110 showMenu assumes its lazy menu has been initialized.
    void el.menuItems;
    el.showMenu({
      location: { x: bounds.left, y: bounds.bottom },
      modifiers: {
        alt: event.altKey,
        control: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      },
    });
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
        // Vendor menus overlap the field; their presses must not capture its caret.
        el.addEventListener(
          "pointerdown",
          (event: PointerEvent) => {
            if (
              event
                .composedPath()
                .some(
                  (node) =>
                    node instanceof Element &&
                    node.getAttribute("role") === "menu",
                )
            )
              event.stopPropagation();
          },
          { capture: true },
        );

        el.addEventListener("input", () =>
          callbacks.current.onChange(el.value),
        );
        el.addEventListener("keydown", (e: KeyboardEvent) => {
          if (
            e.key === "Enter" &&
            !e.defaultPrevented &&
            el.mode !== "latex" &&
            callbacks.current.onSubmit
          ) {
            e.preventDefault();
            callbacks.current.onSubmit?.();
          }
        });
        host.current.replaceChildren(el);
        const cleanupMenu = prepareMathLiveMenu(el);
        cleanup = cleanupMenu;
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
            label: ["123", "∑∞", "abc", "{}"][index],
            labelClass: "",
            tooltip: ["Numbers", "Symbols", "Letters", "Structures"][index],
          }));
          let frame = 0;
          const editor = host.current.parentElement;
          const composer = editor?.closest(".composer");
          const toolbarMedia = globalThis.matchMedia?.(
            "(max-width: 700px), (max-height: 500px) and (pointer: coarse)",
          );
          const geometry = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const height = `${k.visible ? k.boundingRect?.height || 0 : 0}px`;
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
              const owned =
                k.visible &&
                (composer
                  ? composer.matches(":focus-within")
                  : editor?.matches(":focus-within"));
              editor?.removeAttribute("data-keyboard-tools");
              editor?.removeAttribute("data-keyboard-tools-fit");
              if (!editor || !owned || !toolbarMedia?.matches) return;
              el.executeCommand("scrollIntoView");
              editor.setAttribute(
                "data-keyboard-tools",
                composer ? "composer" : "standalone",
              );
              const buttons = Array.from(
                editor.querySelectorAll<HTMLButtonElement>(
                  ".math-entry-tools > button",
                ),
              );
              const targets = buttons.map((button) =>
                button.getBoundingClientRect(),
              );
              const required =
                targets.reduce((width, target) => width + target.width, 0) + 8;
              let left: number, width: number, bottom: number;
              if (composer) {
                const keyboard = composer
                  .querySelector(".composer-bottom > button:first-child")
                  ?.getBoundingClientRect();
                const calculate = composer
                  .querySelector(".composer-bottom > .primary")
                  ?.getBoundingClientRect();
                if (!keyboard || !calculate) {
                  editor.removeAttribute("data-keyboard-tools");
                  return;
                }
                left = keyboard.right + 8;
                width = calculate.left - 8 - left;
                bottom = window.innerHeight - keyboard.bottom;
              } else {
                const bounds = editor.getBoundingClientRect();
                left = Math.max(8, bounds.left);
                width = Math.min(bounds.width, window.innerWidth - 8 - left);
                bottom = (k.boundingRect?.height || 0) + 8;
              }
              if (
                buttons.length !== 2 ||
                ![
                  left,
                  width,
                  bottom,
                  required,
                  ...targets.flatMap((target) => [target.width, target.height]),
                ].every(Number.isFinite) ||
                targets.some(
                  (target) => target.width < 44 || target.height < 44,
                ) ||
                width < required ||
                left < 0 ||
                left + width > window.innerWidth ||
                bottom < 0 ||
                bottom + Math.max(...targets.map((target) => target.height)) >
                  window.innerHeight
              ) {
                editor.removeAttribute("data-keyboard-tools");
                editor.setAttribute("data-keyboard-tools-fit", "insufficient");
                return;
              }
              editor.style.setProperty("--math-tools-left", `${left}px`);
              editor.style.setProperty("--math-tools-width", `${width}px`);
              editor.style.setProperty("--math-tools-bottom", `${bottom}px`);
              const caret = el.getElementInfo(el.position)?.bounds;
              const availableBottom =
                window.innerHeight -
                bottom -
                Math.max(...targets.map((target) => target.height)) -
                8;
              if (
                caret &&
                [caret.top, caret.bottom, availableBottom].every(
                  Number.isFinite,
                )
              ) {
                const delta =
                  caret.bottom > availableBottom
                    ? caret.bottom - availableBottom
                    : caret.top < 8
                      ? caret.top - 8
                      : 0;
                const scroller =
                  editor.closest<HTMLElement>('[data-slot="dialog-content"]') ??
                  document.scrollingElement;
                if (delta) scroller?.scrollBy(0, delta);
              }
            });
          };
          k.addEventListener("geometrychange", geometry);
          el.addEventListener("selection-change", geometry);
          (composer ?? editor)?.addEventListener("focusin", geometry);
          (composer ?? editor)?.addEventListener("focusout", geometry);
          window.addEventListener("resize", geometry);
          toolbarMedia?.addEventListener("change", geometry);
          document.addEventListener("focusin", geometry);
          geometry();
          cleanup = () => {
            cleanupMenu();
            cancelAnimationFrame(frame);
            k.removeEventListener("geometrychange", geometry);
            el.removeEventListener("selection-change", geometry);
            (composer ?? editor)?.removeEventListener("focusin", geometry);
            (composer ?? editor)?.removeEventListener("focusout", geometry);
            window.removeEventListener("resize", geometry);
            toolbarMedia?.removeEventListener("change", geometry);
            document.removeEventListener("focusin", geometry);
            editor?.removeAttribute("data-keyboard-tools");
            editor?.removeAttribute("data-keyboard-tools-fit");
            for (const property of [
              "--math-tools-left",
              "--math-tools-width",
              "--math-tools-bottom",
            ])
              editor?.style.removeProperty(property);
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
      <div className="math-editor-field" ref={host} />
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
            aria-haspopup="menu"
            aria-label="Expression menu"
            onPointerDown={(event) => event.preventDefault()}
            onClick={showExpressionMenu}
          >
            <span className="math-entry-full-label">Expression menu</span>
            <span className="math-entry-compact-label" aria-hidden="true">
              Menu
            </span>
          </button>
          <button
            type="button"
            aria-expanded={showTools}
            aria-label="Structures & editing"
            onClick={() => {
              if (!showTools) {
                if (window.mathVirtualKeyboard?.visible)
                  window.mathVirtualKeyboard.hide();
                focusSelection();
              }
              setShowTools((shown) => !shown);
            }}
          >
            <span className="math-entry-full-label">Structures & editing</span>
            <span className="math-entry-compact-label" aria-hidden="true">
              Edit
            </span>
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
