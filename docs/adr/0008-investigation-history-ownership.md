# ADR-0008: Keep investigation results in notebook history

Investigate adds a fifth workspace destination, extending ADR-0006's four-destination navigation. Each notebook has at most one editable investigation plan. A run captures its plan, definitions and computation settings. Ordinary history entries own the results and identify their run, case and step within that notebook.

A second result collection would duplicate export, recovery and mathematical status handling. Persisting progress separately would require repair after cancellation or reload. Deriving saved and missing cells from history preserves completed calculations and lets Resume fill only missing cells from the original inputs.

Shared validation requires each tagged entry's request, settings and case-bound objects to match the captured run. Otherwise a malformed backup could display a result under a case it never calculated. Object IDs, timestamps and ordering do not change that mathematical comparison.

Calculator retains one execution lock and one append helper. Both ordinary calculations and investigation cells check the captured account session and local computation generation before and inside the update. Worker rejection leaves a missing cell. A returned mathematical error remains evidence.

The bounded serial workflow repeats context snapshots. Preflight checks input storage costs. An unexpectedly large real result remains available locally and stops further cells. Result-dependent steps require a separate decision.

Custom authoring and exact linear or geometric case generation edit only the next plan. A selected-run scatter plot and table derive from one History join. Only complete scalar literals, saved approximations and direct numeric details can provide finite coordinates. Missing and excluded cases remain explicit. Derived precision notices compare reduced exact source values when browser numbers coincide, so equivalent literals do not warn. No symbolic reevaluation, persistent point collection or separate Graphs record can drift from the original run.

Original-run export uses the snapshot plan, definitions and settings with only that run's History entries. It validates through the normal v1 backup boundary. Numeric CSV consumes the displayed trend, includes precision notices and escapes formula-leading text for spreadsheet display; the JSON preserves original source bytes. CSV retains the exact epoch milliseconds and includes an ISO timestamp only when the Date range permits it, preserving the accepted v1 timestamp domain.
