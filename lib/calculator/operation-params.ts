import type { Definition, Operation } from "./types";

export function initialOperationParams(
  operation: Operation,
  source?: string,
  definitions: Definition[] = [],
  selectedObjectId?: string,
): Record<string, string> {
  const params = Object.fromEntries(
    operation.fields.map((field) => [field.key, field.value]),
  );
  if (source && Object.hasOwn(params, "expression")) params.expression = source;
  else if (source && operation.id === "describe") {
    const dataset = definitions.find(
      (definition) =>
        definition.name === source && definition.kind === "dataset",
    );
    params.data = dataset?.expression ?? source;
  } else if (!source && operation.id.startsWith("matrix_")) {
    const matrix = definitions.find(
      (definition) =>
        definition.id === selectedObjectId && definition.kind === "matrix",
    );
    if (matrix && Object.hasOwn(params, "expression"))
      params.expression = matrix.name;
  }
  return params;
}
