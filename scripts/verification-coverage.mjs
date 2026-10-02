import path from "node:path";
import { pathToFileURL } from "node:url";
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
  return {
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
    limitations: [
      "Source/fixture inventory; browser runtime and control evidence remain separate.",
    ],
  };
}
