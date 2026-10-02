import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareEngine } from "../scripts/prepare-engine.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const artifact = Buffer.from("reviewed engine fixture\n");
const pin = (file, source) => ({ file, sha256: sha256(artifact), ...source });
const noFetch = async () => {
  assert.fail("Preparation fetched a cached or npm artifact");
};

async function fixture(run) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "calculator-engine-"),
  );
  const destination = path.join(directory, "engine");
  const npmRoot = path.join(directory, "npm");
  await fs.mkdir(npmRoot);
  try {
    await run({ directory, destination, npmRoot });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function assertNoArtifacts(destination) {
  assert.deepEqual(await fs.readdir(destination), []);
}

await test("verified cache reuse performs no download or npm read", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "cached.wasm"), artifact);
    await prepareEngine({
      destination,
      npmRoot,
      assets: [pin("cached.wasm", { npm: "cached.wasm" })],
      fetchArtifact: noFetch,
    });
    assert.deepEqual(
      await fs.readFile(path.join(destination, "cached.wasm")),
      artifact,
    );
    assert.deepEqual(await fs.readdir(destination), ["cached.wasm"]);
  });
});

await test("corrupt cache fails without fetching or overwriting its evidence", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    const corrupt = Buffer.from("tampered cache");
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, "cached.wasm"), corrupt);
    await assert.rejects(
      prepareEngine({
        destination,
        npmRoot,
        assets: [
          pin("cached.wasm", { url: "https://fixtures.invalid/cached.wasm" }),
        ],
        fetchArtifact: noFetch,
      }),
      /Corrupt cached engine asset/,
    );
    assert.deepEqual(
      await fs.readFile(path.join(destination, "cached.wasm")),
      corrupt,
    );
    assert.deepEqual(await fs.readdir(destination), ["cached.wasm"]);
  });
});

await test("verified npm copy produces the exact pinned artifact without fetching", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    await fs.writeFile(path.join(npmRoot, "runtime.wasm"), artifact);
    await prepareEngine({
      destination,
      npmRoot,
      assets: [pin("runtime.wasm", { npm: "runtime.wasm" })],
      fetchArtifact: noFetch,
    });
    assert.deepEqual(
      await fs.readFile(path.join(destination, "runtime.wasm")),
      artifact,
    );
    assert.deepEqual(await fs.readdir(destination), ["runtime.wasm"]);
  });
});

await test("download becomes visible only after verified completion", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    const url = "https://fixtures.invalid/library.whl";
    let finishDownload;
    let announceDownload;
    const started = new Promise((resolve) => {
      announceDownload = resolve;
    });
    const downloaded = new Promise((resolve) => {
      finishDownload = resolve;
    });
    const preparing = prepareEngine({
      destination,
      npmRoot,
      assets: [pin("library.whl", { url })],
      fetchArtifact: async (requested) => {
        assert.equal(requested, url);
        announceDownload();
        return downloaded;
      },
    });
    await started;
    await assertNoArtifacts(destination);
    finishDownload(artifact);
    await preparing;
    assert.deepEqual(
      await fs.readFile(path.join(destination, "library.whl")),
      artifact,
    );
    assert.deepEqual(await fs.readdir(destination), ["library.whl"]);
  });
});

for (const source of ["npm", "download"]) {
  await test(`bad ${source} hash leaves neither final nor temporary artifact`, async () => {
    await fixture(async ({ destination, npmRoot }) => {
      const corrupt = Buffer.from("wrong artifact bytes");
      if (source === "npm")
        await fs.writeFile(path.join(npmRoot, "library.whl"), corrupt);
      await assert.rejects(
        prepareEngine({
          destination,
          npmRoot,
          assets: [
            pin(
              "library.whl",
              source === "npm"
                ? { npm: "library.whl" }
                : { url: "https://fixtures.invalid/library.whl" },
            ),
          ],
          fetchArtifact: source === "npm" ? noFetch : async () => corrupt,
        }),
        /Engine artifact verification failed/,
      );
      await assertNoArtifacts(destination);
    });
  });
}

await test("interrupted fetch preserves no incomplete artifact", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    const interrupted = new Error("Fixture download interrupted");
    interrupted.name = "AbortError";
    await assert.rejects(
      prepareEngine({
        destination,
        npmRoot,
        assets: [
          pin("library.whl", { url: "https://fixtures.invalid/library.whl" }),
        ],
        fetchArtifact: async () => {
          throw interrupted;
        },
      }),
      (error) => error === interrupted,
    );
    await assertNoArtifacts(destination);
  });
});

await test("oversized bytes fail even when their digest matches the pin", async () => {
  await fixture(async ({ destination, npmRoot }) => {
    const oversized = Buffer.alloc(25 * 1024 * 1024);
    await assert.rejects(
      prepareEngine({
        destination,
        npmRoot,
        assets: [
          {
            file: "large.whl",
            sha256: sha256(oversized),
            url: "https://fixtures.invalid/large.whl",
          },
        ],
        fetchArtifact: async () => oversized,
      }),
      /Engine artifact verification failed/,
    );
    await assertNoArtifacts(destination);
  });
});

await test("invalid paths, hashes and ambiguous sources cannot escape preparation", async () => {
  const valid = pin("library.whl", {
    url: "https://fixtures.invalid/library.whl",
  });
  const invalid = [
    { ...valid, file: "../outside.whl" },
    { ...valid, file: "/outside.whl" },
    { ...valid, file: "nested/library.whl" },
    { ...valid, file: "nested\\library.whl" },
    { ...valid, file: "." },
    { ...valid, file: ".." },
    { ...valid, file: "" },
    { ...valid, sha256: "a".repeat(63) },
    { ...valid, sha256: "z".repeat(64) },
    { ...valid, sha256: valid.sha256.toUpperCase() },
    { ...valid, npm: "library.whl" },
    { ...valid, url: undefined },
    { ...valid, url: undefined, npm: "../outside.whl" },
    { ...valid, url: undefined, npm: "different.whl" },
  ];
  for (const asset of invalid) {
    await fixture(async ({ directory, destination, npmRoot }) => {
      await assert.rejects(
        prepareEngine({
          destination,
          npmRoot,
          assets: [asset],
          fetchArtifact: noFetch,
        }),
        /Invalid engine artifact pin/,
      );
      await assertNoArtifacts(destination);
      assert.deepEqual((await fs.readdir(directory)).sort(), ["engine", "npm"]);
    });
  }
});
