# Calculator repair and redesign

Historical validation below predates this account migration; current Site ownership and deployment are recorded in .openai/hosting.json.

## Design decisions and sources

The interface combines a dark persistent navigation rail with a warm work surface, citron calculation controls, periwinkle selection, compact mathematical results and a phone bottom navigation. Input, selected objects, operations and results form one workbench. Normal text placeholders never pass through a math typesetter. Narrow forms stack; long mathematics and tables scroll inside their containers.

Research informed these choices, rather than supplying a copied screen:

- [Jerome Group](https://jeromegroup.org/dashboard): the user's requested reference; dark olive navigation, compact metadata, clear active sections.
- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh): quieter navigation and stronger structural hierarchy.
- [Instrument: Oura](https://www.instrument.com/work/oura-app): clear primary values with detail available progressively.
- [Pentagram: IBM data visualization](https://www.pentagram.com/work/ibm-data-visualization-guidelines): consistent labels, restrained color and semantic data presentation.
- [Work & Co: Vistaprint](https://www.work.co/clients/vistaprint/): task-oriented discovery and contextual continuation.
- [GeoGebra Calculator Suite](https://help.geogebra.org/hc/en-us/articles/8379325433629-Calculator-Suite) and [Desmos](https://help.desmos.com/hc/en-us/articles/4406040715149-Getting-Started-Desmos-Graphing-Calculator): connected objects, expressions and plots.
- [MathLive keyboard guide](https://mathlive.io/mathfield/guides/virtual-keyboard/) and [Apple design tips](https://developer.apple.com/design/tips/): practical symbol entry, readable labels and touch controls.

## Repair evidence

The audit documented 132 workflows in an older publication; the checked-out source had 109 catalogue entries. The current catalogue has 128 forms, with grouped choices retaining all 132 audited workflows. `tests/audit-catalogue-mapping.json` records the mapping; its missing list is empty.

The contour discrepancy was independently reproduced with pinned SymPy 1.13.3: the parameterized pullback of exp(z)/z² on the unit circle can produce a principal-antiderivative endpoint result of zero. For a proven circular meromorphic path, the repaired contour operation uses residues and winding direction and gives exact 2πi. General paths use checked numerical integration. Finite parameter-free complex definite integration now checks symbolic results against independently subdivided numerical quadrature; a contradiction is reported as approximate, never silently exact.

Typed result presentation repairs CRT congruences, Bézout identities, eigenvalue multiplicities, decomposition labels, empty null spaces, spline values, conditional sums, truth tables, named system solutions and classified critical points. In-browser Canvas/SVG graphs and locally bundled dependencies work in the tested build. The exact historical graph loader failure could not be reproduced from the later source; no unsupported claim is made about that old deployment's root cause.

## Validation

Machine-readable evidence is in `tests/results/`:

| Check | Result |
|---|---|
| Current catalogue defaults | 128/128 produce nonblank typed results; actual browser WebAssembly execution also checked during implementation |
| Defaults + representative engine edges | 143 cases: 107 exact, 29 numeric, 3 conditional, 4 expected invalid-input errors; zero issues/timeouts |
| Integration and parser regressions | 8/8 passed; contour/direct/structured integration, audit-style substitution, real definite and indefinite integrals, invalid substitution |
| Built authenticated workspace API | 9/9 checks passed with two local synthetic identities: isolation, own save/read, authentication, account mismatch, stale revision, cross-origin write rejection |
| Save queue races | 4/4 passed: failed save and conflict preserve newer queued edits; old in-flight success/failure after sign-out cannot modify another account |
| TypeScript + production build | Passed |

Real browser journeys completed: create two matrices, visually select one, inverse/RREF, edit entries, recompute, reuse a rendered result as an editable matrix and calculate again; normal CDF with μ=10, σ=2, threshold 12 (0.841344746…); dependent nested integral (1/2); u+v=7 and u−v=1 (u=4, v=3); implication truth table; simultaneous sin/cos plots, derivative and cos roots ±π/2; new surface sin(x)cos(y); histogram and box plot; numerical oscillator and plotted trajectories; account save and reload.

Offline verification used the production build served locally through a test-only authentication fixture (never included in site code). An intentional failed SciPy package download produced a recoverable interruption at 107/136 verified files. Retry reached Ready, 136/136. With the origin server stopped, the browser reloaded the app, restored its personal workspace, loaded previously unopened histogram and ODE tools, computed and rendered them, and plotted a previously unopened surface. Reconnection synced pending work; reopening preserved five calculations and six graphs. The final manifest contains roughly 46.5 MB plus its cached authenticated document. Offline readiness requires all assets to pass SHA-256 integrity verification.

Final responsive checks covered 320×568, 390×844, 650×900 and 1440×1000, both themes, keyboard templates, stacked distribution fields and compact result lists. KaTeX error elements: none in the final loaded results. Offline help navigation and returning to the app passed after handling the host’s canonical HTML redirect.

Screenshots are in ignored local `outputs/`: phone themes, desktop workbench, offline readiness and graph evidence. No user notebooks or credentials are included in evidence. Local test fixtures use synthetic accounts.

## Explicit boundaries

- Tests establish these inputs and journeys, not universal mathematical correctness. Exact, approximate, conditional, unresolved, divergent and invalid states remain distinct.
- Graphs are finite samples, not proofs; implicit grids can miss features and discontinuities can create gaps. Numerical solvers report tolerances and local/convergence limits.
- General symbolic integration, nonlinear systems, convergence and geometric regularity can remain unresolved. Metric curvature is limited to at most three dimensions; other documented operation limits remain in Help.
- Browser storage can be evicted. Offline reopening needs prior sign-in and preparation in the same browser/profile. Sign-out clears the reusable authenticated offline document. No promise is made for every browser or future hosting policy.
- Cloud state has a 1.8 MB request limit and up to 100 notebooks. Oversized/failed cloud saves remain on the device with an explicit message; export backups remain available.
- Two-account isolation was tested against the production build with local authenticated fixtures, not by signing in as a second real production user.
- Substitution diagnostics can retain restrictions of the original expression even after a valid substitution removes the symbol; the returned computed value is checked.
