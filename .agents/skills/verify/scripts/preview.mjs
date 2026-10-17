#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  digest,
  sourceIdentity,
} from "../../../../scripts/verification-contract.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    port: { type: "string", default: "4175" },
    "upstream-port": { type: "string", default: "8789" },
    instance: { type: "string" },
  },
});
const port = Number(values.port),
  upstreamPort = Number(values["upstream-port"]);
if (
  ![port, upstreamPort].every(
    (value) => Number.isInteger(value) && value > 0 && value < 65536,
  ) ||
  port === upstreamPort
)
  throw Error("Choose two distinct ports in 1-65535.");
if (!values.instance || !/^[a-zA-Z0-9._-]+$/.test(values.instance))
  throw Error("Supply the unique run's --instance identifier.");
const authority = `127.0.0.1:${port}`,
  origin = `http://${authority}`;
const cookieName = "calculator_verify_owner";
const owners = { a: "Verification A", b: "Verification B", guest: null };
const manifest = root + "dist/client/offline-manifest.json";

if (process.argv[2] === "doctor") {
  const instance = await fetch(origin + "/_verify", {
    signal: AbortSignal.timeout(5000),
  });
  if (
    !instance.ok ||
    instance.headers.get("x-calculator-verify-instance") !== values.instance ||
    instance.headers.get("x-calculator-verify-upstream") !==
      String(upstreamPort)
  )
    throw Error(
      "Proxy does not belong to this run or uses a different upstream.",
    );
  const config = JSON.parse(
    fs.readFileSync(root + "dist/server/wrangler.json"),
  );
  if (!config.d1_databases?.some((database) => database.binding === "DB"))
    throw Error("Built Worker has no DB binding.");
  for (const owner of Object.keys(owners)) {
    const response = await fetch(origin + "/api/workspace", {
      headers: { Cookie: `${cookieName}=${owner}` },
      signal: AbortSignal.timeout(5000),
    });
    if (owner === "guest") {
      if (response.status !== 401)
        throw Error("Guest workspace was not refused.");
    } else {
      const body = await response.json();
      if (
        response.status !== 200 ||
        body.user?.id !== `calculator-verify-${owner}`
      )
        throw Error(
          `Owner ${owner} workspace unavailable. Check migration and proxy identity.`,
        );
    }
  }
  const response = await fetch(origin + "/offline-manifest.json", {
    signal: AbortSignal.timeout(5000),
  });
  const buildFingerprint = digest(fs.readFileSync(manifest));
  if (
    !response.ok ||
    digest(Buffer.from(await response.arrayBuffer())) !== buildFingerprint
  )
    throw Error("Served offline manifest differs from this build.");
  console.log(
    JSON.stringify({
      status: "pass",
      origin,
      ...sourceIdentity(root),
      buildFingerprint,
      instance: values.instance,
      upstreamPort,
    }),
  );
} else if (process.argv[2] === "serve") {
  const server = http.createServer((request, response) => {
    response.setHeader("X-Calculator-Verify-Instance", values.instance);
    response.setHeader("X-Calculator-Verify-Upstream", String(upstreamPort));
    if (request.headers.host !== authority) {
      response.writeHead(403).end();
      return;
    }
    if (request.url === "/_verify" && request.method === "GET") {
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
    if (request.url?.startsWith("/_verify/")) {
      const owner = request.url.slice("/_verify/".length);
      if (
        request.method !== "POST" ||
        request.headers.origin !== origin ||
        !Object.hasOwn(owners, owner)
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
    const cookies = (request.headers.cookie || "")
      .split(";")
      .map((value) => value.trim());
    const owner =
      cookies
        .find((value) => value.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1) || "guest";
    const headers = { ...request.headers, host: authority };
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
      headers["oai-authenticated-user-email"] = `${owner}@verification.invalid`;
      headers["oai-authenticated-user-full-name"] = encodeURIComponent(
        owners[owner],
      );
      headers["oai-authenticated-user-full-name-encoding"] =
        "percent-encoded-utf-8";
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: request.url,
        method: request.method,
        headers,
      },
      (incoming) => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end("Owned Worker unavailable");
    });
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Ready at ${origin}/_verify`),
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} else
  throw Error(
    "Use serve or doctor, with --instance, --port and --upstream-port.",
  );
