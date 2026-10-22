# Calculator feature journeys

These files group the existing machine-map owners. Read one feature at a time. Use `pnpm --silent verify show <owner> --json` for current source paths, fixtures and required scenarios. The machine map remains authoritative.

| Feature                                                  | Existing owners                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| [Calculation and editor](calculation.md)                 | `feature.editor`, `feature.expression-worker`, catalogue fixtures |
| [Guided investigations](investigations.md)               | `feature.investigations`                                          |
| [Graphs and analysis](graphs.md)                         | `feature.graphs`                                                  |
| [Notebooks and objects](workspaces.md)                   | `feature.notebooks`, `feature.objects`                            |
| [Accounts, settings and recovery](recovery.md)           | `feature.identity-sync`, `feature.settings-recovery`              |
| [Offline, discovery and reference](offline-reference.md) | `feature.offline`, `feature.navigation`                           |

Phone widths, short landscape, narrow desktop, both themes, keyboard handling and required modal bounds apply across these journeys. A maintenance pass covers every feature file from source and live use. Full release proof additionally requires every machine-map fixture, scenario, control and modal record.
