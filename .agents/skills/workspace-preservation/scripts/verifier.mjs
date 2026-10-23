import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
export const verifier = {
  version: "1.7.4",
  url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
  sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
};
export async function verifierPaths() {
  const candidates = [
    process.env.JAVA,
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin/java"),
    "java",
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java",
  ].filter(Boolean);
  const java = candidates.find((candidate) => {
    const result = spawnSync(candidate, ["-version"], { encoding: "utf8" });
    return (
      result.status === 0 &&
      /version "21[."]/.test(result.stderr + result.stdout)
    );
  });
  if (!java)
    throw Error(
      "Java 21 required. Set JAVA to its executable or JAVA_HOME to its installation.",
    );
  const directory = path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "calculator-formal",
    verifier.version,
  );
  await fs.mkdir(directory, { recursive: true });
  const jar = path.join(directory, "tla2tools.jar");
  let bytes;
  try {
    bytes = await fs.readFile(jar);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    !bytes ||
    createHash("sha256").update(bytes).digest("hex") !== verifier.sha256
  ) {
    const response = await fetch(verifier.url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw Error(`TLC download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== verifier.sha256)
      throw Error("TLC SHA256 mismatch");
    const temporary = jar + "." + process.pid;
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, jar);
  }
  return { java, jar, ...verifier };
}
