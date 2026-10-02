# Domain language

## Language

- **Notebook** — named collection of definitions, history snapshots and graph records.
- **Workspace** — all notebooks and settings owned by one signed-in user.
- **Definition** — reusable named expression, function, matrix, dataset or algebraic object.
- **Revision** — D1's optimistic concurrency counter; a stale write returns a conflict.
- **Dirty snapshot** — local workspace awaiting an acknowledged cloud save.
- **Offline copy** — notebook preserved when local and remote revisions diverge.
- **Account generation** — invalidates asynchronous work after identity changes or sign-out.
- **Offline readiness** — verified asset closure plus cached signed-in shell; cleared on sign-out.
