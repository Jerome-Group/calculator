import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
export function failure(message, exitCode = 2) {
  throw Object.assign(new Error(message), { exitCode });
}
export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failure(`Cannot read JSON ${file}: ${error.message}`);
  }
}
export function sourceIdentity(root) {
  const git = (argv) => {
    const result = spawnSync("git", argv, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) failure("Git source identity unavailable", 3);
    return result.stdout;
  };
  const revision = git(["rev-parse", "HEAD"]).trim();
  const files = [
    ...new Set(
      git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const absolute = path.join(root, file);
    hash.update(file + "\0");
    try {
      hash.update(
        fs.lstatSync(absolute).isSymbolicLink()
          ? fs.readlinkSync(absolute)
          : fs.readFileSync(absolute),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("<deleted>");
    }
  }
  return { revision, sourceFingerprint: hash.digest("hex") };
}
export function validateMap(map, fixtures) {
  if (
    map.schemaVersion !== 1 ||
    !Array.isArray(map.suites) ||
    !Array.isArray(map.surfaces)
  )
    failure("Unsupported verification map");
  for (const [kind, rows] of [
    ["suite", map.suites],
    ["surface", map.surfaces],
    ["fixture", fixtures],
  ]) {
    const ids = rows.map((row) => row.id);
    if (
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      failure(`Invalid or duplicate ${kind} IDs`);
  }
  const ids = new Set(fixtures.map((fixture) => fixture.id));
  for (const suite of map.suites) {
    if (
      !suite.argv?.length ||
      suite.argv.some((arg) => typeof arg !== "string") ||
      !suite.prerequisites ||
      !suite.reads ||
      !suite.writes ||
      !suite.network ||
      !suite.exitCodes
    )
      failure(`Incomplete suite ${suite.id}`);
  }
  for (const surface of map.surfaces)
    for (const id of surface.fixtures)
      if (!ids.has(id)) failure(`Missing fixture ${id}`);
  for (const fixture of fixtures)
    if (
      !fixture.request?.operation ||
      !fixture.assertions?.length ||
      !fixture.expectedStatus
    )
      failure(`Incomplete fixture ${fixture.id}`);
}

export function mathContractFingerprint(root) {
  const files = [
    "tests/fixtures/maths-defaults.json",
    "tests/fixtures/maths-choices.json",
    "tests/fixtures/maths-invalid.json",
    "tests/maths-oracle.py",
    "tests/verification/observed-matcher.mjs",
    "tests/verification/latex-observed.py",
    "tests/verification/observed-display.py",
    "scripts/verification-observed.mjs",
  ];
  return digest(
    files
      .map(
        (file) => file + "\0" + fs.readFileSync(path.join(root, file), "utf8"),
      )
      .join("\0"),
  );
}
