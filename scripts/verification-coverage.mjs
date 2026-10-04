import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const interactiveKinds = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "Choice",
  "MathEditor",
  "ListInput",
  "MatrixInput",
  "GraphWorkspace",
  "CommandInput",
  "CommandItem",
  "StructuredFields",
  "canvas",
  "Slider",
  "div",
  "Checkbox",
  "LogicFields",
]);

export function controlSourceSites(file, source) {
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (ast.parseDiagnostics.length) {
    throw new Error("Invalid TSX source: " + file);
  }
  const printer = ts.createPrinter({ removeComments: true });
  const sites = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const kind = node.tagName.getText(ast);
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      if (
        interactiveKinds.has(kind) &&
        (kind === "CommandInput" ||
          attributes.some((attribute) =>
            /^on[A-Z]/.test(attribute.name.getText(ast)),
          ))
      ) {
        const canonical = printer.printNode(ts.EmitHint.Unspecified, node, ast);
        sites.push({
          line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
          kind,
          signature: createHash("sha256").update(canonical).digest("hex"),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return sites;
}

export function checkControlCoverage(root, controls) {
  const checks = [];
  const add = (id, passed, message) =>
    checks.push({ id, status: passed ? "pass" : "fail", message });
  const ids = controls.map((control) => control.id);
  add(
    "source.controls.ids",
    ids.every((id) => /^control\.\d{3}$/.test(id)) &&
      new Set(ids).size === ids.length,
    "Stable control IDs must be valid and unique",
  );
  const directory = path.join(root, "components/calculator");
  const sourceFiles = fs
    .readdirSync(directory, { recursive: true })
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => "components/calculator/" + file.split(path.sep).join("/"));
  for (const file of new Set([
    ...sourceFiles,
    ...controls.map((control) => control.source.file),
  ])) {
    const rows = controls.filter((control) => control.source.file === file);
    let sites = [];
    try {
      sites = controlSourceSites(
        file,
        fs.readFileSync(path.join(root, file), "utf8"),
      );
      add("source.controls.read." + file, true, "Readable, valid TSX source");
    } catch (error) {
      add("source.controls.read." + file, false, error.message);
    }
    add(
      "source.controls.inventory." + file,
      rows.length === sites.length &&
        new Set(rows.map((row) => row.source.line)).size === rows.length,
      "Each current AST control site has one mapping",
    );
    for (const row of rows) {
      const site = sites.find((site) => site.line === row.source.line);
      add(
        "source.control." + row.id,
        !!site &&
          site.kind === row.kind &&
          site.signature === row.source.signature,
        "Current JSX location, kind and semantic signature",
      );
    }
  }
  return checks;
}
export function checkScenarioCoverage(map) {
  const required = map?.evidenceSchema?.requiredBrowserScenarioIds;
  const features = map?.features;
  const validInventory =
    Array.isArray(required) &&
    required.length > 0 &&
    Array.isArray(features) &&
    features.length > 0 &&
    features.every(
      (feature) =>
        feature && typeof feature.id === "string" && feature.id.trim(),
    );
  const checks = [
    {
      id: "source.scenarios.inventory",
      status: validInventory ? "pass" : "fail",
      message: "Nonempty required scenario and feature arrays must be present",
    },
  ];
  if (!validInventory) return checks;
  checks.push({
    id: "source.scenarios.ids",
    status:
      required.every((id) => typeof id === "string" && id.trim()) &&
      new Set(required).size === required.length
        ? "pass"
        : "fail",
    message: "Required browser scenario IDs must be nonempty and unique",
  });
  for (const id of new Set(required)) {
    const owners = features.filter(
      (feature) =>
        typeof feature.id === "string" &&
        feature.id.trim() &&
        feature.browserScenarioIds?.includes(id),
    );
    checks.push({
      id: "source.scenario.owner." + id,
      status: owners.length ? "pass" : "fail",
      message: "Required browser scenario has an existing mapped feature owner",
    });
  }
  return checks;
}
export async function checkCoverage(root, map, fixtures) {
  const { operations } = await import(
    pathToFileURL(path.join(root, "lib/calculator/catalog.ts"))
  );
  const checks = [];
  const add = (id, passed, message) =>
    checks.push({ id, status: passed ? "pass" : "fail", message });
  add(
    "source.forms.count",
    map.surfaces.length === operations.length,
    `Actual forms: ${operations.length}`,
  );
  for (const op of operations) {
    const row = map.surfaces.find((surface) => surface.id === "form." + op.id);
    add("source.form." + op.id, !!row, "Mapped source form");
    if (!row) continue;
    const formFixtures = fixtures.filter(
      (fixture) => fixture.surfaceId === row.id,
    );
    const defaultFixture = formFixtures.find(
      (fixture) => fixture.id === `form.${op.id}.default`,
    );
    add(
      `fixture.default.${op.id}`,
      !!defaultFixture &&
        op.fields.every(
          (field) => defaultFixture.request.params[field.key] === field.value,
        ),
      "Current independent default fixture",
    );
    add(
      `source.fields.${op.id}`,
      Object.keys(row.fields).length === op.fields.length,
      "No stale fields",
    );
    for (const field of op.fields) {
      const mapped = row.fields[field.key];
      add(`source.field.${op.id}.${field.key}`, !!mapped, field.label);
      add(
        `source.choices.${op.id}.${field.key}`,
        JSON.stringify(mapped?.choices) === JSON.stringify(field.choices || []),
        "Current choice list",
      );
      for (const choice of field.choices || []) {
        add(
          `source.choice.${op.id}.${field.key}.${choice}`,
          mapped?.choices?.includes(choice) &&
            formFixtures.some(
              (fixture) => fixture.request.params[field.key] === choice,
            ),
          "Independent variant fixture",
        );
      }
    }
  }
  checks.push(...checkControlCoverage(root, map.controls));
  checks.push(...checkScenarioCoverage(map));
  return {
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
    limitations: [
      "Source/fixture inventory; browser runtime and control evidence remain separate.",
    ],
  };
}
