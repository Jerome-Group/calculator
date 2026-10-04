import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { digest, failure, readJson } from "./verification-contract.mjs";
export function pnpmInvocation() {
  const selected = process.env.CALCULATOR_PNPM || "pnpm";
  return /\.(?:c|m)?js$/.test(selected)
    ? { executable: process.execPath, prefix: [selected] }
    : { executable: selected, prefix: [] };
}
export function checkPrerequisites(root, suite) {
  const checks = [
    {
      id: "node24",
      status:
        Number(process.versions.node.split(".")[0]) === 24 ? "pass" : "blocked",
      actual: process.versions.node,
    },
  ];
  for (const prerequisite of suite?.prerequisites || []) {
    if (prerequisite === "preparedEngine")
      for (const file of [
        "public/engine/pyodide.mjs",
        "public/engine/pyodide.asm.wasm",
        "public/engine/sympy-1.13.3-py3-none-any.whl",
      ])
        checks.push({
          id: file,
          status: fs.existsSync(path.join(root, file)) ? "pass" : "blocked",
        });
    if (prerequisite === "lockedInstall")
      checks.push({
        id: prerequisite,
        status:
          fs.existsSync(path.join(root, "node_modules/.pnpm/lock.yaml")) &&
          digest(
            fs.readFileSync(path.join(root, "node_modules/.pnpm/lock.yaml")),
          ) === digest(fs.readFileSync(path.join(root, "pnpm-lock.yaml")))
            ? "pass"
            : "blocked",
      });
    if (prerequisite === "productionBuild")
      checks.push({
        id: prerequisite,
        status: fs.existsSync(
          path.join(root, "dist/client/offline-manifest.json"),
        )
          ? "pass"
          : "blocked",
      });
    if (prerequisite === "pnpm") {
      const invocation = pnpmInvocation();
      const result = spawnSync(
        invocation.executable,
        [...invocation.prefix, "--version"],
        { cwd: root, encoding: "utf8" },
      );
      checks.push({
        id: prerequisite,
        status:
          result.status === 0 && result.stdout.trim() === "11.25.0"
            ? "pass"
            : "blocked",
        actual: result.stdout?.trim() || result.error?.message,
      });
    }
  }
  return {
    status: checks.every((check) => check.status === "pass")
      ? "pass"
      : "blocked",
    checks,
  };
}
export function runSuite(root, map, flags, id, evidenceDirectory) {
  const suite = map.suites.find((row) => row.id === id);
  if (!suite) failure(`Unknown suite ${id}`);
  const prerequisites = checkPrerequisites(root, suite);
  if (prerequisites.status !== "pass")
    return {
      id,
      status: "blocked",
      exitCode: 3,
      prerequisites: prerequisites.checks,
    };
  const argv = [...suite.argv];
  const command = argv.shift();
  if (!["node", "pnpm"].includes(command))
    failure(`Unsupported executable ${command}`);
  if (["math", "math-invalid"].includes(id) && flags.has("--fixture"))
    argv.push("--fixture", flags.get("--fixture"));
  if (id === "detectors" && flags.has("--case"))
    argv.push("--case", flags.get("--case"));
  const invocation =
    command === "node"
      ? { executable: process.execPath, prefix: [] }
      : pnpmInvocation();
  const executable = invocation.executable;
  argv.unshift(...invocation.prefix);
  const startedAt = new Date().toISOString(),
    resultFile = path.join(evidenceDirectory, id + ".result.json");
  const child = spawnSync(executable, argv, {
    cwd: root,
    encoding: "utf8",
    timeout: 570000,
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      CALCULATOR_ROOT: root,
      CALCULATOR_RESULT_FILE: resultFile,
    },
  });
  const artifacts = [];
  for (const [kind, contents] of [
    ["stdout", child.stdout || ""],
    ["stderr", child.stderr || ""],
  ]) {
    const file = path.join(evidenceDirectory, id + "." + kind + ".log");
    fs.writeFileSync(file, contents);
    artifacts.push({
      path: file,
      sha256: digest(contents),
      mediaType: "text/plain",
    });
  }
  const structured = fs.existsSync(resultFile) ? readJson(resultFile) : null;
  const requiresStructured = [
    "math",
    "math-invalid",
    "observed-matcher",
    "detectors",
  ].includes(id);
  const status = child.error
    ? "error"
    : child.status !== 0 ||
        (structured &&
          (structured.status !== "pass" ||
            !Array.isArray(structured.checks) ||
            structured.checks.some((check) => check.status !== "pass") ||
            new Set(structured.checks.map((check) => check.id)).size !==
              structured.checks.length)) ||
        (requiresStructured &&
          (!structured?.checks?.length || structured.schemaVersion !== 1))
      ? "fail"
      : "pass";
  if (structured)
    artifacts.push({
      path: resultFile,
      sha256: digest(fs.readFileSync(resultFile)),
      mediaType: "application/json",
    });
  return {
    id,
    status,
    exitCode: status === "error" ? 4 : status === "fail" ? 1 : 0,
    argv: [executable, ...argv],
    startedAt,
    completedAt: new Date().toISOString(),
    prerequisites: prerequisites.checks,
    checks: structured?.checks || [{ id: "process." + id, status }],
    artifacts,
    error: child.error?.message,
  };
}
