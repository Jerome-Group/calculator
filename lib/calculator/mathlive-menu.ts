import type { MathfieldElement } from "mathlive";
import { cutMathLiveSelection } from "./mathlive-cut";

type MenuItem = MathfieldElement["menuItems"][number];
type Command = Exclude<
  MenuItem,
  { submenu: readonly MenuItem[] } | { type: "divider" | "heading" }
>;
type Modifiers = Parameters<
  NonNullable<Command["onMenuSelect"]>
>[0]["modifiers"];

function flag(value: Command["visible"], modifiers: Modifiers) {
  return (typeof value === "function" ? value(modifiers) : value) ?? true;
}

function phoneMenu(items: readonly MenuItem[]): MenuItem[] {
  function flatten(
    entries: readonly MenuItem[],
    parents: Pick<Command, "visible" | "enabled">[] = [],
  ): MenuItem[] {
    return entries.flatMap((item): MenuItem[] => {
      if ("submenu" in item)
        return [
          { type: "heading", label: item.label, ariaLabel: item.ariaLabel },
          ...flatten(item.submenu, [...parents, item]),
        ];
      if (item.type === "divider" || item.type === "heading") return [item];
      // Copy the public contract only: the vendor's private onCreate assumes
      // that every sibling is a matrix-grid cell, not a command in a list.
      const command: Command = {
        type: item.type,
        label: item.label,
        ariaLabel: item.ariaLabel,
        tooltip: item.tooltip,
        class: item.class,
        keyboardShortcut: item.keyboardShortcut,
        checked: item.checked,
        id: item.id,
        data: item.data,
        onMenuSelect: item.onMenuSelect,
        visible: (modifiers) =>
          parents.every((parent) => flag(parent.visible, modifiers)) &&
          flag(item.visible, modifiers),
        enabled: (modifiers) =>
          parents.every((parent) => flag(parent.enabled, modifiers)) &&
          flag(item.enabled, modifiers),
      };
      if (
        /^(?:insert-matrix-|color-|background-color-|environment-)/.test(
          item.id ?? "",
        )
      )
        command.label = item.ariaLabel ?? item.tooltip ?? item.label;
      return [command];
    });
  }
  const ordered = [...items],
    insert = ordered.findIndex((item) => "id" in item && item.id === "insert"),
    matrix = ordered.findIndex(
      (item) => "id" in item && item.id === "insert-matrix",
    );
  if (insert > matrix && matrix >= 0)
    ordered.splice(matrix, 0, ...ordered.splice(insert, 1));
  return flatten(ordered);
}

const accessibleLabels: Record<string, string> = {
  "environment-no-border": "No border",
  "environment-parentheses": "Parentheses",
  "environment-brackets": "Square brackets",
  "environment-bar": "Determinant bars",
  "environment-braces": "Braces",
  "decoration-boxed": "Boxed expression",
  "decoration-red-box": "Red solid border",
  "decoration-dashed-black-box": "Black dashed border",
  "accent-vec": "Vector arrow",
  "accent-overrightarrow": "Right arrow above",
  "accent-overleftarrow": "Left arrow above",
  "accent-dot": "Dot above",
  "accent-ddot": "Double dot above",
  "accent-bar": "Bar above",
  "accent-overline": "Line above",
  "accent-overgroup": "Group above",
  "accent-overbrace": "Brace above",
  "accent-underline": "Line below",
  "accent-undergroup": "Group below",
  "accent-underbrace": "Brace below",
};

export function prepareMathLiveMenu(field: MathfieldElement) {
  function adapt(items: readonly MenuItem[]): MenuItem[] {
    return items.map((item) => {
      if ("submenu" in item) return { ...item, submenu: adapt(item.submenu) };
      if (!("id" in item) || typeof item.id !== "string") return item;
      if (item.id === "cut")
        return { ...item, onMenuSelect: () => cutMathLiveSelection(field) };
      const label = accessibleLabels[item.id];
      if (label) return { ...item, ariaLabel: label };
      if (/^variant-(?:style-)?/.test(item.id) && item.tooltip)
        return { ...item, ariaLabel: item.tooltip };
      const matrix = /^insert-matrix-([1-5])x([1-5])$/.exec(item.id);
      if (!matrix) return item;
      const select = item.onMenuSelect;
      if (!select) return item;
      return {
        ...item,
        ariaLabel:
          item.tooltip ??
          "Insert " + matrix[1] + " by " + matrix[2] + " matrix",
        onMenuSelect: (props) => {
          select(props);
          // Vendor selectionMode:item selects the entire newly inserted matrix.
          field.position = Math.min(...field.selection.ranges[0]);
          field.executeCommand("moveToNextPlaceholder");
        },
      };
    });
  }
  const desktop = adapt(field.menuItems);
  const media = globalThis.matchMedia?.(
    "(max-width: 480px), (max-height: 500px) and (pointer: coarse)",
  );
  const update = () => {
    field.menuItems = media?.matches ? phoneMenu(desktop) : desktop;
  };
  update();
  media?.addEventListener("change", update);
  return () => media?.removeEventListener("change", update);
}
