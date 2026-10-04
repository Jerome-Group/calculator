import path from "node:path";
process.env.CALCULATOR_FIXTURES_FILE = path.join(
  process.env.CALCULATOR_ROOT || process.cwd(),
  "tests/fixtures/maths-invalid.json",
);
await import("./maths-oracle.mjs");
