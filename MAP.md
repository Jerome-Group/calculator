# Calculator map

Calculator is a browser mathematical notebook hosted by ChatGPT Sites.

Start with README.md, then app/page.tsx and components/calculator/CalculatorGate.tsx.

| Area                   | What lives there                                          | Entry point                            |
| ---------------------- | --------------------------------------------------------- | -------------------------------------- |
| `app/`                 | Routes, sign-in helpers and scoped workspace API          | `app/api/workspace/route.ts`           |
| `components/`          | Notebook, graphing, editor and vendored UI                | `components/calculator/Calculator.tsx` |
| `lib/`                 | Catalogue, computation bridge, account sync and storage   | `lib/calculator/sync.ts`               |
| `public/`              | Offline engine, service worker, coverage and notices      | `public/compute-worker.js`             |
| `build/`, `scripts/`   | Sites integration, portable tooling and asset preparation | `vite.config.ts`                       |
| `db/`, `drizzle/`      | Workspace schema and migrations                           | `db/schema.ts`                         |
| `tests/`, `examples/`  | Release, sync, persistence and asset checks               | `tests/sync.mjs`                       |
| `docs/`                | Decisions, product scope and validation                   | `docs/VALIDATION.md`                   |
| `.openai/`, `.github/` | Site binding and organisation CI                          | `.github/workflows/ci.yml`             |
| `hooks/`, `vendor/`    | Shared UI support and retained third-party notices        | `hooks/`, `vendor/`                    |
