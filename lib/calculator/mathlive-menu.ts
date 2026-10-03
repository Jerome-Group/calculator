import type { MathfieldElement } from "mathlive";
import { cutMathLiveSelection } from "./mathlive-cut";

type MenuItem = MathfieldElement["menuItems"][number];

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
  field.menuItems = adapt(field.menuItems);
}
