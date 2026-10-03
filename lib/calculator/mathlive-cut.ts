import type { MathfieldElement } from "mathlive";

const pendingCuts = new WeakSet<MathfieldElement>();

export async function cutMathLiveSelection(
  field: MathfieldElement,
): Promise<boolean> {
  if (pendingCuts.has(field) || field.readOnly || field.selectionIsCollapsed)
    return false;
  const selection = structuredClone(field.selection);
  const selectionKey = JSON.stringify(selection);
  const value = field.value;
  const latex = field.getValue(selection, "latex");
  if (!latex || !field.isConnected) return false;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  const selectionChanged = () => {
    if (JSON.stringify(field.selection) !== selectionKey) interrupt();
  };
  const unchanged = () =>
    !interrupted &&
    field.isConnected &&
    !field.readOnly &&
    !field.selectionIsCollapsed &&
    field.value === value &&
    JSON.stringify(field.selection) === selectionKey;
  pendingCuts.add(field);
  field.addEventListener("input", interrupt);
  field.addEventListener("beforeinput", interrupt);
  field.addEventListener("blur", interrupt);
  field.addEventListener("selection-change", selectionChanged);
  try {
    if (!globalThis.navigator?.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(latex);
    if (!unchanged()) return false;
    // Public deletion retains MathLive's beforeinput, input and undo behavior.
    field.executeCommand("deleteBackward");
    return field.value !== value;
  } catch {
    if (field.isConnected) field.executeCommand("plonk");
    return false;
  } finally {
    field.removeEventListener("input", interrupt);
    field.removeEventListener("beforeinput", interrupt);
    field.removeEventListener("blur", interrupt);
    field.removeEventListener("selection-change", selectionChanged);
    pendingCuts.delete(field);
  }
}
