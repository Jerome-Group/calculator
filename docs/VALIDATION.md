# Calculator migration validation — 2026-10-02

The pinned WebAssembly engine is executed with fetching disabled before initialization: 41 focused Python checks and all 128 catalogue defaults pass, with zero fetch attempts. Graph assertions cover degree semantics, reciprocal trigonometry and gaps across undefined segments. Catalogue breadth does not prove arbitrary inputs are solvable.

Build preparation materializes twelve reviewed engine artifacts from locked Pyodide/npm and upstream wheel pins, then verifies every cached or downloaded byte against SHA-256. Generated artifacts are ignored by Git but remain bundled at the same deployment URLs. Focused preparation tests cover corrupt caches, invalid pins, verified copies/downloads and interrupted or invalid downloads. Preparation may use the network; deployed calculation does not.

Account-scoped persistence checks exercise valid round trips, duplicate rejection, previous-save recovery, corrupt-original preservation, quota failures and sign-out. Eighteen focused source regressions cover cross-tab acknowledgements, queued saves, stale accounts, delayed initialization, verified outages versus authentication failure, and sign-out racing both shell and readiness writes.

TypeScript checking, Prettier check mode, ESLint, production build and the content-hashed asset/package closure are reproducible in CI. The Worker manifest, Site identity, D1 binding and database migration travel with the build. Legacy React compiler/dynamic-type diagnostics remain visible warnings; no compiler compatibility claim is made.

Browser verification covered synthetic sign-in, authenticated D1 workspace access, cloud saving, the rendered exact integral of sin(x) from 0 to pi as 2, named-object reuse producing 6, a fresh parabola and saved-state reload. The locally run production Worker build prepared all 136 offline files. With its origin stopped and browser networking disabled, the cached app reopened, loaded the bundled engine and computed a fresh exact integral as 2. Historical QA in RESEARCH_VALIDATION.md is separate from this migration's checks.

No old-account cloud-record transfer is claimed. The new Site starts with its own account-scoped database. Disconnected reopening was verified in the desktop browser; physical mobile keyboards require separate evidence. Export/import validation is tested directly; a complete browser download/import round trip is not claimed.

Computational limits remain finite algebra/topology, rational homology without torsion, restricted symbolic PDEs, bounded numerical searches and sampled graphs. Engine failure is not proof that a closed form does not exist.

Unsynced snapshots are durable per browser writer and account before submission. Recovery keeps valid notebook limits and names; copies that cannot fit remain separately exportable from Settings. Both save winner orderings and closing a tab before its response are covered.

The patched lock reports zero findings from the npm advisory audit on 2026-10-02. Imported dependency advisories were patched without relaxing pnpm's seven-day release-age gate. Focused library and application graph regressions cover patched property boundaries, reusable definitions, degrees/radians and supported graph modes. ADR-0005 records the MathJS major-version compatibility decision and the tooling override scope.

Ten graph/security checks and three MathLive escaping/conversion checks pass. Baseline probes reproduce the vulnerable library behavior; patched probes stop before invoking escaped JavaScript. MathLive’s shipped fonts remain byte-identical to the local copies.

The scoped legacy esbuild replacement also loaded the Drizzle TypeScript config and generated the current SQLite schema into a disposable output directory. Both old-loader replacement versions were exercised through the actual transform wrapper for TypeScript, sourcemaps, dynamic imports and TSX.
