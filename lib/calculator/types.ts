export const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint32Array(4)), (x) =>
        x.toString(16).padStart(8, "0"),
      ).join("");
export type Settings = {
  angle: "rad" | "deg";
  precision: number;
  displayDecimals?: number;
  domain: "real" | "complex";
  assumptions: string;
};
export type Definition = {
  id: string;
  name: string;
  expression: string;
  kind: "expression" | "matrix" | "dataset" | "function" | "object";
  args?: string;
  updated: number;
};
export type Result = {
  text: string;
  latex: string;
  approx?: string;
  status:
    | "exact"
    | "numeric"
    | "unresolved"
    | "conditional"
    | "divergent"
    | "error";
  notes: string[];
  display?: any;
  detailDisplay?: any;
  details?: any;
  detailSources?: Record<string, string>;
  inputLatex?: string;
  reusable?: string;
};
export type Entry = {
  id: string;
  input: string;
  mode: string;
  operation: string;
  params: Record<string, string>;
  result: Result;
  settings: Settings;
  time: number;
  revision: number;
  definitions: Definition[];
};
export type GraphSpec = {
  id: string;
  type:
    | "cartesian"
    | "implicit"
    | "inequality"
    | "parametric"
    | "polar"
    | "surface"
    | "field"
    | "sequence"
    | "data";
  radians?: boolean;
  points?: [number, number][];
  expression: string;
  second: string;
  visible: boolean;
  color: string;
  min: string;
  max: string;
};
export type Notebook = {
  id: string;
  name: string;
  definitions: Definition[];
  history: Entry[];
  graphs: GraphSpec[];
  revision: number;
};
export type SavedState = {
  version: 1;
  notebooks: Notebook[];
  active: string;
  settings: Settings;
};
export type Field = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  choices?: string[];
};
export type Operation = {
  id: string;
  name: string;
  category: string;
  description: string;
  keywords: string;
  fields: Field[];
};
export const DEFAULT_SETTINGS: Settings = {
  angle: "rad",
  precision: 30,
  displayDecimals: 9,
  domain: "real",
  assumptions: "",
};
export const newNotebook = (name = "My notebook"): Notebook => ({
  id: uid(),
  name,
  definitions: [],
  history: [],
  graphs: [],
  revision: 0,
});
