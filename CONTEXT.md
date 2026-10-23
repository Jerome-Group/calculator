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

- **Investigation plan** — editable parameter cases, independent calculation questions and run settings for one notebook.
- **Investigation run** — captured plan, objects and settings with a saved observation. Later plan edits never rewrite its inputs.
- **Investigation cell** — notebook-local run, case and step address on an ordinary history entry. History owns every calculated result.

- **Case sequence** — transient exact-literal generator that replaces next-plan cases after preview. A run stores the resulting cases, not a generator recipe.
- **Numeric evidence** — a transient selected-run projection of saved scalar literals, approximations or direct numeric details. It preserves all cases and omissions without creating a graph or dataset.
- **Original-run backup** — standard v1 workspace backup containing one run, its frozen inputs and original History entries. It resumes from historical inputs after normal import.
