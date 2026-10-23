import fs from "node:fs/promises";
import { lstatSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { sourceIdentity } from "./verification-contract.mjs";

const [command, ...args] = process.argv.slice(2);
const { values } = parseArgs({
  args,
  options: {
    project: { type: "string", default: process.cwd() },
    origin: { type: "string" },
    output: { type: "string" },
    legacy: { type: "string" },
    candidate: { type: "string" },
    "legacy-revision": { type: "string" },
    state: { type: "string" },
    trace: { type: "string" },
    port: { type: "string", default: "4187" },
    "workspace-origin": { type: "string" },
  },
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
function localOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Use a loopback HTTP origin without a path.");
  return url.origin;
}
function privateOutput(value) {
  if (!value) throw Error("Choose an ignored outputs directory.");
  const project = fileURLToPath(new URL("../", import.meta.url));
  const outputRoot = path.join(project, "outputs");
  const absolute = path.resolve(value);
  const invalid = () => {
    throw Error(
      "Fixture state and evidence must remain in ignored root outputs.",
    );
  };
  if (!absolute.startsWith(outputRoot + path.sep)) invalid();
  let ancestor = project;
  for (const segment of path.relative(project, absolute).split(path.sep)) {
    ancestor = path.join(ancestor, segment);
    try {
      if (lstatSync(ancestor).isSymbolicLink()) invalid();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      break;
    }
  }
  return absolute;
}
async function verifySyntheticAccount(origin) {
  const response = await fetch(origin + "/api/workspace", {
    headers: { Cookie: "calculator_verify_owner=a" },
    signal: AbortSignal.timeout(5000),
  });
  if (
    !response.ok ||
    (await response.json()).user?.id !== "calculator-verify-a"
  )
    throw Error("Synthetic owner A workspace API is unavailable.");
}
if (command === "capture") {
  const project = path.resolve(values.project),
    output = privateOutput(values.output);
  const origin = localOrigin(values.origin),
    client = path.join(project, "dist/client");
  const manifestBytes = await fs.readFile(
    path.join(client, "offline-manifest.json"),
  );
  const manifest = JSON.parse(manifestBytes);
  for (const asset of manifest.assets) {
    const bytes = await fs.readFile(path.join(client, asset.url));
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256)
      throw Error("Changed snapshot asset " + asset.url);
  }
  const sw = await fs.readFile(path.join(client, "sw.js"));
  const workerConfig = await readJson(
    path.join(project, "dist/server/wrangler.json"),
  );
  if (!workerConfig.d1_databases?.some((binding) => binding.binding === "DB"))
    throw Error("Captured build has no Sites DB binding.");
  await verifySyntheticAccount(origin);
  if (values["legacy-revision"]) {
    if (
      manifest.engine ||
      !manifest.assets.some((asset) => asset.url === "/compute-worker.js")
    )
      throw Error("Legacy capture must retain canonical runtime assets.");
    const original = execFileSync(
      "git",
      ["show", values["legacy-revision"] + ":public/sw.js"],
      { cwd: project, encoding: "utf8" },
    );
    if (
      sw.toString() !== original.replace("__BUILD_VERSION__", manifest.version)
    )
      throw Error("Legacy worker differs from the actual historical source.");
    const originalWorker = execFileSync(
      "git",
      ["show", values["legacy-revision"] + ":public/compute-worker.js"],
      { cwd: project },
    );
    if (
      !originalWorker.equals(
        await fs.readFile(path.join(client, "compute-worker.js")),
      )
    )
      throw Error("Legacy compute worker differs from historical source.");
    const historicalEngine = execFileSync(
      "git",
      [
        "ls-tree",
        "-r",
        "--name-only",
        values["legacy-revision"],
        "public/engine",
      ],
      { cwd: project, encoding: "utf8" },
    )
      .trim()
      .split("\n");
    for (const name of historicalEngine) {
      const expected = execFileSync(
        "git",
        ["show", values["legacy-revision"] + ":" + name],
        { cwd: project },
      );
      if (
        !expected.equals(
          await fs.readFile(path.join(client, name.slice("public/".length))),
        )
      )
        throw Error(
          "Legacy canonical engine source differs from historical bytes: " +
            name,
        );
    }
    const historicalPins = JSON.parse(
      execFileSync(
        "git",
        ["show", values["legacy-revision"] + ":scripts/engine-assets.json"],
        { cwd: project, encoding: "utf8" },
      ),
    );
    for (const pin of historicalPins.assets)
      if (
        digest(await fs.readFile(path.join(client, "engine", pin.file))) !==
        pin.sha256
      )
        throw Error(
          "Legacy canonical dependency differs from historical pin: " +
            pin.file,
        );
  } else if (!/^[a-f0-9]{64}$/.test(manifest.engine?.id))
    throw Error("Candidate capture requires an identified immutable engine.");
  const page = await fetch(origin + "/", {
    headers: { Cookie: "calculator_verify_owner=a" },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!page.ok) throw Error("Synthetic signed-in shell is unavailable.");
  const shell = Buffer.from(await page.arrayBuffer());
  if (
    manifest.engine &&
    !shell
      .toString()
      .includes('data-calculator-engine="' + manifest.engine.id + '"')
  )
    throw Error("Shell and candidate engine differ.");
  const servedManifest = await fetch(origin + "/offline-manifest.json", {
    signal: AbortSignal.timeout(5000),
  });
  if (
    !servedManifest.ok ||
    digest(Buffer.from(await servedManifest.arrayBuffer())) !==
      digest(manifestBytes)
  )
    throw Error("Origin differs from captured build.");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output);
  await fs.cp(client, path.join(output, "client"), { recursive: true });
  await fs.writeFile(path.join(output, "shell.html"), shell);
  const receipt = {
    schemaVersion: 1,
    ...sourceIdentity(project),
    legacyRevision: values["legacy-revision"] ?? null,
    manifestSha256: digest(manifestBytes),
    workerSha256: digest(sw),
    shellSha256: digest(shell),
    offlineVersion: manifest.version,
    engine: manifest.engine ?? null,
    assets: manifest.assets.length,
    capturedAt: new Date().toISOString(),
    identity: "synthetic-local-owner-a",
    d1Binding: "DB",
  };
  await fs.writeFile(
    path.join(output, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify({ output, ...receipt }));
} else if (command === "serve") {
  const snapshots = {
    legacy: privateOutput(values.legacy),
    candidate: privateOutput(values.candidate),
  };
  const stateFile = privateOutput(values.state),
    traceFile = privateOutput(values.trace);
  const workspaceOrigin = localOrigin(values["workspace-origin"]);
  const port = Number(values.port);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    Number(new URL(workspaceOrigin).port) === port
  )
    throw Error("Choose a distinct valid loopback port.");
  const receipts = Object.fromEntries(
    await Promise.all(
      Object.entries(snapshots).map(async ([name, directory]) => [
        name,
        await readJson(path.join(directory, "receipt.json")),
      ]),
    ),
  );
  if (!receipts.legacy.legacyRevision || !receipts.candidate.engine)
    throw Error("Expected actual legacy and identified candidate captures.");
  await fs.mkdir(path.dirname(traceFile), { recursive: true });
  await fs.access(stateFile);
  const contentType = (name) =>
    name.endsWith(".js") || name.endsWith(".mjs")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".json")
          ? "application/json"
          : name.endsWith(".html")
            ? "text/html"
            : name.endsWith(".wasm")
              ? "application/wasm"
              : "application/octet-stream";
  const log = (record) =>
    fs.appendFile(
      traceFile,
      JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n",
    );
  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers.host !== `127.0.0.1:${port}`) {
        response.writeHead(403).end();
        return;
      }
      const pathname = new URL(request.url, `http://127.0.0.1:${port}`)
        .pathname;
      const state = await readJson(stateFile);
      if (
        !Object.hasOwn(snapshots, state.build) ||
        typeof state.online !== "boolean"
      )
        throw Error("Invalid fixture state.");
      if (
        !state.online ||
        state.blockedPaths?.includes(pathname) ||
        (pathname === "/sw.js" && state.blockUpdate)
      ) {
        await log({
          build: state.build,
          path: pathname,
          status: "disconnected",
        });
        request.socket.destroy();
        return;
      }
      const owners = { a: "Verification A", b: "Verification B", guest: null };
      const cookieName = "calculator_verify_owner";
      if (pathname === "/_verify" && request.method === "GET") {
        response.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        response.end(
          `<title>Calculator verification identities</title><h1>Synthetic local identities</h1>${Object.keys(
            owners,
          )
            .map(
              (owner) =>
                `<form method="post" action="/_verify/${owner}"><button>${owners[owner] || "Guest"}</button></form>`,
            )
            .join("")}`,
        );
        return;
      }
      if (pathname.startsWith("/_verify/")) {
        const owner = pathname.slice("/_verify/".length);
        if (
          request.method !== "POST" ||
          !Object.hasOwn(owners, owner) ||
          request.headers.origin !== `http://127.0.0.1:${port}`
        ) {
          response.writeHead(403).end();
          return;
        }
        response
          .writeHead(303, {
            Location: "/",
            "Set-Cookie": `${cookieName}=${owner}; Path=/; HttpOnly; SameSite=Strict`,
            "Cache-Control": "no-store",
          })
          .end();
        return;
      }
      if (pathname.startsWith("/api/")) {
        const cookies = (request.headers.cookie || "")
          .split(";")
          .map((value) => value.trim());
        const owner =
          cookies
            .find((value) => value.startsWith(cookieName + "="))
            ?.slice(cookieName.length + 1) || "guest";
        const headers = { ...request.headers };
        for (const key of Object.keys(headers))
          if (
            key.startsWith("oai-authenticated-") ||
            key.startsWith("x-forwarded-") ||
            ["forwarded", "authorization"].includes(key)
          )
            delete headers[key];
        headers.cookie = cookies
          .filter((value) => !value.startsWith(cookieName + "="))
          .join("; ");
        if (Object.hasOwn(owners, owner) && owners[owner]) {
          headers["oai-authenticated-user-id"] = `calculator-verify-${owner}`;
          headers["oai-authenticated-user-email"] =
            `${owner}@verification.invalid`;
          headers["oai-authenticated-user-full-name"] = encodeURIComponent(
            owners[owner],
          );
          headers["oai-authenticated-user-full-name-encoding"] =
            "percent-encoded-utf-8";
        }
        const upstream = http.request(
          workspaceOrigin + request.url,
          { method: request.method, headers },
          (incoming) => {
            response.writeHead(incoming.statusCode, incoming.headers);
            incoming.pipe(response);
          },
        );
        upstream.on("error", () => {
          if (!response.headersSent) response.writeHead(502);
          response.end();
        });
        request.pipe(upstream);
        return;
      }
      if (request.method !== "GET") {
        response.writeHead(405).end();
        return;
      }
      const directory = snapshots[state.build];
      const base = path.join(directory, "client");
      const file =
        pathname === "/"
          ? path.join(directory, "shell.html")
          : path.resolve(base, "." + decodeURIComponent(pathname));
      if (pathname !== "/" && !file.startsWith(base + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      let bytes;
      try {
        bytes = await fs.readFile(file);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
        await log({ build: state.build, path: pathname, status: 404 });
        response.writeHead(404).end();
        return;
      }
      await log({
        build: state.build,
        path: pathname,
        status: 200,
        bytes: bytes.length,
        sha256: digest(bytes),
        manifestSha256: receipts[state.build].manifestSha256,
      });
      response.writeHead(200, {
        "Content-Type": pathname === "/" ? "text/html" : contentType(file),
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      });
      response.end(bytes);
    } catch (error) {
      if (!response.headersSent) response.writeHead(500);
      response.end("Fixture setup failed");
      console.error(error.message);
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      JSON.stringify({
        origin: `http://127.0.0.1:${port}`,
        stateFile,
        traceFile,
        snapshots,
        identity: "synthetic-local-only",
      }),
    ),
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else if (command === "doctor") {
  const origin = localOrigin(values.origin);
  const state = await readJson(privateOutput(values.state));
  const directory = privateOutput(
    state.build === "legacy" ? values.legacy : values.candidate,
  );
  const receipt = await readJson(path.join(directory, "receipt.json"));
  if (receipt.d1Binding !== "DB")
    throw Error("Snapshot lacks a verified Sites DB binding.");
  await verifySyntheticAccount(origin);
  const manifest = await fetch(origin + "/offline-manifest.json", {
    signal: AbortSignal.timeout(5000),
  });
  if (
    !manifest.ok ||
    digest(Buffer.from(await manifest.arrayBuffer())) !== receipt.manifestSha256
  )
    throw Error("Fixture origin differs from selected snapshot.");
  console.log(
    JSON.stringify({
      status: "pass",
      origin,
      build: state.build,
      manifestSha256: receipt.manifestSha256,
      engine: receipt.engine,
      d1Binding: "DB",
      identity: "synthetic-local-owner-a",
    }),
  );
} else
  throw Error(
    "Use capture or serve. This fixture sets up serving and records bytes. Drive every browser action through the actual UI.",
  );
