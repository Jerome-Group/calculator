import { operations } from "./catalog";
import type { Definition, Entry } from "./types";

const parameters = (definition: Definition) =>
  (definition.args || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

const sourceNames = (source: string) =>
  source.replace(/^latex:/, "").match(/\b[A-Za-z][A-Za-z0-9_]*\b/g) || [];

export function definitionDependenciesChanged(
  entry: Entry,
  currentDefinitions: readonly Definition[],
): boolean {
  const operation = operations.find(
    (operation) => operation.id === entry.operation,
  );
  const literalFields = new Set(
    operation?.fields
      .filter((field) => field.choices)
      .map((field) => field.key),
  );
  const sources = Object.entries(entry.params)
    .filter(([key]) => !literalFields.has(key))
    .map(([, value]) => value);
  if (
    !Object.hasOwn(entry.params, "expression") &&
    (!operation || operation.fields.some((field) => field.key === "expression"))
  )
    sources.push(entry.input);

  const saved = new Map(
    entry.definitions.map((definition) => [definition.name, definition]),
  );
  const current = new Map(
    currentDefinitions.map((definition) => [definition.name, definition]),
  );
  const pending = new Set(sources.flatMap(sourceNames));
  const visited = new Set<string>();
  for (const name of pending) {
    pending.delete(name);
    if (visited.has(name)) continue;
    visited.add(name);
    const before = saved.get(name);
    const now = current.get(name);
    if (!before || !now) {
      if (before !== now) return true;
      continue;
    }
    const args = parameters(before);
    if (
      before.expression !== now.expression ||
      before.kind !== now.kind ||
      args.join(",") !== parameters(now).join(",")
    )
      return true;
    for (const dependency of sourceNames(before.expression))
      if (!args.includes(dependency)) pending.add(dependency);
  }
  return false;
}
