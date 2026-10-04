import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { digest, sourceIdentity } from "./verification-contract.mjs";

const contractPaths = new Set([
  "docs/verification.md",
  "docs/verification-map.json",
  "scripts/verification-browser.mjs",
  "scripts/verification-source-provenance.mjs",
  "tests/verification/cli.mjs",
  "tests/verification/detectors.mjs",
  "tests/verification/source-provenance.mjs",
]);
const revisionPattern = /^[a-f0-9]{40}$/;

function git(root, args, input) {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error("Git provenance unavailable");
  return result.stdout;
}

function sourceTree(root, revision) {
  const entries = git(root, ["ls-tree", "-rz", "--full-tree", revision])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("\t"),
        [mode, type, object] = entry.slice(0, separator).split(" ");
      if (type !== "blob") throw Error("Non-blob source tree unsupported");
      return { path: entry.slice(separator + 1), mode, object };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const output = git(
    root,
    ["cat-file", "--batch"],
    entries.map((entry) => entry.object).join("\n") + "\n",
  );
  let offset = 0;
  const hash = crypto.createHash("sha256");
  for (const entry of entries) {
    const newline = output.indexOf(10, offset),
      header = output.subarray(offset, newline).toString().split(" ");
    if (header[1] !== "blob" || !/^\d+$/.test(header[2]))
      throw Error("Invalid Git blob response");
    const length = Number(header[2]),
      bytes = output.subarray(newline + 1, newline + 1 + length);
    offset = newline + 1 + length + 1;
    hash.update(entry.path + "\0");
    hash.update(bytes);
    entry.sha256 = digest(bytes);
  }
  return { entries, sourceFingerprint: hash.digest("hex") };
}

export function runtimeArtifactFingerprint(directory) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(directory, relative),
      stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink())
      throw Error("Runtime artifact symlink unsupported");
    if (stat.isDirectory())
      for (const name of fs.readdirSync(absolute))
        visit(path.join(relative, name));
    else if (stat.isFile()) files.push(relative);
    else throw Error("Non-file runtime artifact unsupported");
  }
  visit("");
  if (!files.length) throw Error("Runtime artifact tree empty");
  const hash = crypto.createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file + "\0");
    hash.update(fs.readFileSync(path.join(directory, file)));
  }
  return hash.digest("hex");
}

function sameRequiredIds(base, current) {
  const ids = (rows) => (Array.isArray(rows) ? rows.slice().sort() : null);
  return (
    [
      "requiredBrowserFixtureIds",
      "requiredBrowserScenarioIds",
      "requiredPhoneModalIds",
    ].every((key) => {
      const before = ids(base.evidenceSchema?.[key]),
        after = ids(current.evidenceSchema?.[key]);
      return (
        before?.length > 0 && JSON.stringify(before) === JSON.stringify(after)
      );
    }) &&
    JSON.stringify(ids(base.controls?.map((row) => row.id))) ===
      JSON.stringify(ids(current.controls?.map((row) => row.id)))
  );
}

function manifestAssetsMatch(directory) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(directory, "client/offline-manifest.json"),
      "utf8",
    ),
  );
  return (
    Array.isArray(manifest.assets) &&
    manifest.assets.length > 0 &&
    new Set(manifest.assets.map((asset) => asset.url)).size ===
      manifest.assets.length &&
    manifest.assets.every((asset) => {
      if (
        typeof asset.url !== "string" ||
        !asset.url.startsWith("/") ||
        asset.url.includes("\\") ||
        asset.url.split("/").includes("..")
      )
        return false;
      const file = path.join(directory, "client", asset.url.slice(1));
      return (
        fs.existsSync(file) &&
        fs.lstatSync(file).isFile() &&
        !fs.lstatSync(file).isSymbolicLink() &&
        digest(fs.readFileSync(file)) === asset.sha256 &&
        fs.statSync(file).size === asset.bytes
      );
    })
  );
}

const observedRuntimeBaselines = Object.freeze([
  Object.freeze({
    observationRevision: "1e7c18695df4397f1254e2c375bff50ced791df6",
    observationSourceFingerprint:
      "02898e033db4cf1787e936c08426192121b99921822ef5f152f235cd863a87ed",
    observationBuildFingerprint:
      "58eb5c786875377bc038072d3e44aca77bb602bfd1ac0201e2eb8249842aa694",
    runtimeArtifactFingerprint:
      "aa452d6c20136fb0f2a7a9cfa5b114be232e2b7e5dc23085ee4f7a9f9d9b5642",
    archiveSHA256:
      "95bb93c1146bb1c8a2c7a7ea7d8401d847362dbcc34eb54469ed7dc58fb6e62f",
  }),
]);

export function checkRuntimeProvenance(root, evidence, current) {
  const baseline = observedRuntimeBaselines.find(
    (row) =>
      row.observationRevision ===
      evidence.runtimeProvenance?.observationRevision,
  );
  return inspectRuntimeProvenance(root, evidence, current, baseline);
}

// The browser gate always selects its fixed reviewed baseline above.
export function inspectRuntimeProvenance(root, evidence, current, baseline) {
  const checks = [],
    provenance = evidence.runtimeProvenance;
  const add = (id, passed, details = {}) =>
    checks.push({
      id: "runtimeProvenance." + id,
      status: passed ? "pass" : "fail",
      ...details,
    });
  try {
    add("schema", provenance?.schemaVersion === 1);
    add(
      "trustedBaseline",
      !!baseline &&
        [
          "observationRevision",
          "observationSourceFingerprint",
          "observationBuildFingerprint",
          "runtimeArtifactFingerprint",
        ].every((key) => provenance?.[key] === baseline[key]),
      { archiveSHA256: baseline?.archiveSHA256 },
    );
    if (!baseline)
      throw Error("Observation cohort has no reviewed runtime baseline");
    if (
      !revisionPattern.test(provenance?.observationRevision || "") ||
      !revisionPattern.test(provenance?.currentRevision || "")
    )
      throw Error("Full source revisions required");
    add(
      "currentIdentity",
      provenance.currentRevision === current.revision &&
        provenance.currentSourceFingerprint === current.sourceFingerprint &&
        evidence.revision === current.revision &&
        evidence.sourceFingerprint === current.sourceFingerprint,
    );
    add(
      "clean",
      git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
        .length === 0,
    );
    git(root, [
      "merge-base",
      "--is-ancestor",
      provenance.observationRevision,
      current.revision,
    ]);
    add("ancestor", true);
    const base = sourceTree(root, provenance.observationRevision),
      target = sourceTree(root, current.revision);
    add(
      "observationIdentity",
      base.sourceFingerprint === provenance.observationSourceFingerprint,
    );
    add(
      "committedCurrentIdentity",
      target.sourceFingerprint === current.sourceFingerprint,
    );
    const baseFiles = new Map(base.entries.map((entry) => [entry.path, entry])),
      currentFiles = new Map(
        target.entries.map((entry) => [entry.path, entry]),
      );
    const changed = [...new Set([...baseFiles.keys(), ...currentFiles.keys()])]
      .sort()
      .filter(
        (file) =>
          baseFiles.get(file)?.object !== currentFiles.get(file)?.object ||
          baseFiles.get(file)?.mode !== currentFiles.get(file)?.mode,
      );
    const declared = provenance.changedPaths;
    add(
      "restrictedPaths",
      changed.length > 0 &&
        changed.every(
          (file) =>
            contractPaths.has(file) &&
            currentFiles.get(file)?.mode === "100644" &&
            (!baseFiles.has(file) || baseFiles.get(file)?.mode === "100644"),
        ),
      {
        observationRevision: provenance.observationRevision,
        currentRevision: current.revision,
        changedPaths: changed,
      },
    );
    add(
      "pathHashes",
      Array.isArray(declared) &&
        declared.length === changed.length &&
        new Set(declared.map((row) => row.path)).size === changed.length &&
        changed.every((file) => {
          const row = declared.find((item) => item.path === file);
          return (
            row?.baseSHA256 === (baseFiles.get(file)?.sha256 ?? null) &&
            row?.currentSHA256 === currentFiles.get(file)?.sha256
          );
        }),
    );
    const baseMap = JSON.parse(
        git(root, [
          "show",
          provenance.observationRevision + ":docs/verification-map.json",
        ]).toString(),
      ),
      currentMap = JSON.parse(
        fs.readFileSync(path.join(root, "docs/verification-map.json"), "utf8"),
      );
    add("requiredIdsRetained", sameRequiredIds(baseMap, currentMap));
    const original = provenance.observationRuntimeDirectory,
      runtime = path.join(root, "dist"),
      manifest = "client/offline-manifest.json";
    if (
      typeof original !== "string" ||
      !path.isAbsolute(original) ||
      fs.realpathSync(original) === fs.realpathSync(runtime)
    )
      throw Error("Separate original runtime directory required");
    const originalBuild = digest(
        fs.readFileSync(path.join(original, manifest)),
      ),
      currentBuild = digest(fs.readFileSync(path.join(runtime, manifest)));
    add(
      "buildIdentity",
      originalBuild === provenance.observationBuildFingerprint &&
        originalBuild === evidence.buildFingerprint &&
        originalBuild === currentBuild,
    );
    add(
      "manifestAssets",
      manifestAssetsMatch(original) && manifestAssetsMatch(runtime),
    );
    const originalArtifacts = runtimeArtifactFingerprint(original),
      currentArtifacts = runtimeArtifactFingerprint(runtime);
    add(
      "runtimeArtifacts",
      originalArtifacts === provenance.runtimeArtifactFingerprint &&
        originalArtifacts === currentArtifacts,
    );
    const finished = sourceIdentity(root);
    add(
      "stableCurrentIdentity",
      finished.revision === current.revision &&
        finished.sourceFingerprint === current.sourceFingerprint &&
        git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
          .length === 0,
    );
  } catch (error) {
    add("available", false, { reason: error.message });
  }
  const valid =
    checks.length > 0 && checks.every((check) => check.status === "pass");
  return {
    valid,
    checks,
    observationIdentity: valid
      ? {
          revision: provenance.observationRevision,
          sourceFingerprint: provenance.observationSourceFingerprint,
          buildFingerprint: provenance.observationBuildFingerprint,
        }
      : null,
  };
}
