import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const base = execFileSync(
  "git",
  ["rev-parse", "--verify", (process.argv[2] || "HEAD") + "^{commit}"],
  { encoding: "utf8" },
).trim();
const allowed = new Set(process.argv.slice(3));
const { controlSourceSites, checkControlCoverage } = await import(
  pathToFileURL(path.join(root, "scripts/verification-coverage.mjs"))
);
const mapPath = path.join(root, "docs/verification-map.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const baseMap = JSON.parse(
  execFileSync("git", ["show", base + ":docs/verification-map.json"], {
    encoding: "utf8",
  }),
);
const recorded = new Map(
  baseMap.controls.map((control) => [control.id, control]),
);
assert.deepEqual(
  map.controls.map((control) => control.id).sort(),
  [...recorded.keys()].sort(),
  "Stable control IDs",
);
const changed = [];
for (const file of new Set(
  map.controls.map((control) => control.source.file),
)) {
  const before = controlSourceSites(
    file,
    execFileSync("git", ["show", base + ":" + file], { encoding: "utf8" }),
  );
  const after = controlSourceSites(
    file,
    fs.readFileSync(path.join(root, file), "utf8"),
  );
  const controls = map.controls
    .filter((control) => control.source.file === file)
    .sort(
      (a, b) => recorded.get(a.id).source.line - recorded.get(b.id).source.line,
    );
  assert.equal(before.length, controls.length, file + " base inventory");
  assert.equal(after.length, controls.length, file + " current inventory");
  controls.forEach((control, index) => {
    assert.deepEqual(
      {
        kind: recorded.get(control.id).kind,
        ...recorded.get(control.id).source,
        file: undefined,
      },
      { kind: before[index].kind, ...before[index], file: undefined },
      control.id + " base mapping",
    );
    assert.equal(
      control.kind,
      recorded.get(control.id).kind,
      control.id + " recorded kind",
    );
    assert(
      (control.source.line === before[index].line &&
        control.source.signature === before[index].signature) ||
        (control.source.line === after[index].line &&
          control.source.signature === after[index].signature),
      control.id + " mapping changed independently",
    );
    assert.equal(
      after[index].kind,
      before[index].kind,
      control.id + " control order",
    );
    if (after[index].signature !== before[index].signature) {
      assert(
        !before.some(
          (site, other) =>
            other !== index && site.signature === after[index].signature,
        ),
        control.id + " reuses another base control signature",
      );
      assert(
        allowed.delete(control.id),
        control.id + " needs explicit semantic-change approval",
      );
    }
    if (
      control.source.line !== after[index].line ||
      control.source.signature !== after[index].signature
    )
      changed.push({
        id: control.id,
        before: control.source.line,
        after: after[index].line,
        signatureChanged: control.source.signature !== after[index].signature,
      });
    control.source.line = after[index].line;
    control.source.signature = after[index].signature;
  });
}
assert.equal(allowed.size, 0, "Unused semantic-change approval");
const failures = checkControlCoverage(root, map.controls).filter(
  (check) => check.status !== "pass",
);
assert.deepEqual(failures, []);
if (changed.length)
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
console.log(
  JSON.stringify({ base, updated: changed.length, changed }, null, 2),
);
