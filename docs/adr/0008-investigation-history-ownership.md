# ADR-0008: Keep investigation results in notebook history

Investigate adds a fifth workspace destination, extending ADR-0006's four-destination navigation. Each notebook has at most one editable investigation plan. A run captures its plan, definitions and computation settings. Ordinary history entries own the results and identify their run, case and step within that notebook.

A second result collection would duplicate export, recovery and mathematical status handling. Persisting progress separately would require repair after cancellation or reload. Deriving saved and missing cells from history preserves completed calculations and lets Resume fill only missing cells from the original inputs.

Calculator retains one execution lock and one append helper. Both ordinary calculations and investigation cells check the captured account session and local computation generation before and inside the update. Worker rejection leaves a missing cell. A returned mathematical error remains evidence.

The bounded serial workflow repeats context snapshots. Preflight checks input storage costs. An unexpectedly large real result remains available locally and stops further cells. Snapshot-bound plots and result-dependent steps require a separate decision.
