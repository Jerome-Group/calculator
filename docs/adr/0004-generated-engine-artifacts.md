# ADR-0004: Generate verified engine artifacts during builds

Status: Accepted

## Context

The Calculator import preserved its complete offline engine. Seven committed WASM/wheel files failed the organisation's Binary-Artifacts baseline, although they were upstream dependencies. The existing Python vendoring helper also trusted cached bytes and could not resolve Lark from the Pyodide lock.

## Decision

Keep owned Python source, the reviewed Pyodide lock, artifact pins and licences in Git. Materialize ignored third-party runtime files before development, tests and builds. Verify cached and downloaded bytes against SHA-256, bound downloads, and stage verified writes outside public assets before atomic rename. The locked Pyodide npm package supplies core runtime files; its versioned distribution supplies the required wheel closure. NetworkX is unpacked directly and does not require its optional lock dependency graph. Lark uses its pinned PyPI wheel.

## Consequences

Cold preparation requires upstream access. A prepared checkout and published Site retain the complete engine locally. Deployment URLs, offline computation and account sync remain unchanged; the org baseline needs no exception. Artifact updates require reviewed pin changes and existing engine/asset verification.
