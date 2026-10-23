# Calculator map

Calculator is a browser mathematical notebook hosted by ChatGPT Sites.

Start with README.md, then app/page.tsx and components/calculator/CalculatorGate.tsx.

| Area                   | What lives there                                                  | Entry point                            |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `app/`                 | Routes, sign-in helpers and scoped workspace API                  | `app/api/workspace/route.ts`           |
| `components/`          | Notebook, investigations, graphs, editor and vendored UI          | `components/calculator/Calculator.tsx` |
| `lib/`                 | Catalogue, investigation snapshots, computation, sync and storage | `lib/calculator/sync.ts`               |
| `public/`              | Offline engine, service worker, coverage and notices              | `public/compute-worker.js`             |
| `build/`, `scripts/`   | Sites integration, deterministic engine builds and verification   | `vite.config.ts`                       |
| `db/`, `drizzle/`      | Workspace schema and migrations                                   | `db/schema.ts`                         |
| `tests/`, `examples/`  | Release, sync, persistence and asset checks                       | `tests/sync.mjs`                       |
| `docs/`                | Decisions, product scope and validation                           | `docs/VALIDATION.md`                   |
| `.openai/`, `.github/` | Site binding and organisation CI                                  | `.github/workflows/ci.yml`             |
| `.agents/`             | Project verification skill and browser journeys                   | `.agents/skills/verify/SKILL.md`       |
| `vendor/`              | Retained third-party notices                                      | `vendor/`                              |

Verification starts at `pnpm --silent verify --help`, [the command contract](docs/verification.md) and [versioned map](docs/verification-map.json). Local and CI checks share `pnpm --silent verify run --group core --json`; browser evidence remains separate.

Pinned dependency patches live in `scripts/patches/`, configured by `pnpm-workspace.yaml`.

Local verification evidence lives in ignored `outputs/`, excluded from type checking by `tsconfig.json`.
