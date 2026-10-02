# Calculator

A mathematical notebook with 128 searchable operation forms, exact and numerical results, math/LaTeX/text editing, graphs, reusable definitions and validated backups.

Computation runs on the device in a cancellable browser worker using bundled Pyodide, SymPy, SciPy, NumPy and NetworkX. MathLive edits mathematics, KaTeX renders answers, and mathjs samples graphs. No calculation API, runtime LLM or API key is required.

ChatGPT Sites serves the application through a Worker. Sign in with ChatGPT identifies each workspace; D1 stores revision-checked, per-user cloud saves. Local browser saves continue when disconnected or when the server confirms the same account during a database outage. Conflicting local notebooks are retained as copies. Export backups for durable copies outside browser storage.

## Development

Use Node 24 and the pinned pnpm version in package.json:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The local preview provides a synthetic sign-in only on loopback. Production identity comes from Sites' authenticated request headers. `.openai/hosting.json` binds this checkout to its Site; keep the logical D1 binding `DB`. Fresh registration creates a new account-scoped database: moving source does not transfer records from the old Site.

## Verification

```sh
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
pnpm build
pnpm test:assets
```

The build emits the Worker in `dist/server` and verified offline assets in `dist/client`. Settings → Prepare for offline use saves the authenticated shell and bundled assets; HTTPS or a trusted local origin and retained browser storage are required. Sign-out removes cached shell/readiness and remembered identity. See [validation and limits](docs/VALIDATION.md).

## Public boundary and licence

This repository contains reviewed application source and synthetic examples. Credentials, user notebooks, authenticated browser state, private notes and local tool output stay outside source and history. The original development history is retained only in a local archival ref.

Owned source is [MIT licensed](LICENSE). Dependencies retain their own licences; [shipped notices](public/licenses.txt), engine licence files, the build-plugin notice and vendored shadcn notices are preserved. Pyodide 0.27.7 source is available [upstream](https://github.com/pyodide/pyodide/tree/0.27.7).

Unsynced snapshots are durable per browser writer and account before submission. Recovery keeps valid notebook limits and names; copies that cannot fit remain separately exportable from Settings. Both save winner orderings and closing a tab before its response are covered.
