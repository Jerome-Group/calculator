# ADR-0006: Phone-first notebook and faithful notation

Status: Accepted

## Context

Calculator's 128 existing forms, graphs, objects and notebook controls must remain usable in a portrait phone and narrow desktop pane. A correct engine answer does not establish that input notation, hit targets or keyboard geometry are correct. The browser baseline exercised all 128 default forms and separately exercised MathLive menus, structured input and graph controls; integrated redesign verification remains separate.

At 390 × 844 with coarse-pointer/no-hover media, the unfocused MathLive menu needed two presses. The first focused the field without opening the menu; the second opened it. Computed styles and hit testing established the cause: MathLive 0.110.0 sets its exposed container to `pointer-events: none` before focus. Calculator's placeholder already had `pointer-events: none`; it did not intercept the press. Normal pointer mode opened the menu on the first press.

Generic ASCII-to-LaTeX conversion also changed function grouping in previews. A source such as `sin(x^2)` must remain distinct from `sin(x)^2`. Parsing long numeric literals into JavaScript numbers introduced a second loss: distinct exact decimal sources could become the same rounded value.

## Decision

Organize the existing notebook around a compact context header, four labeled destinations, a clear expression composer, searchable task rows and form sheets with visible primary actions. Show existing structure insertion and editing commands beside mathematical entry. Keep mathematical settings, notebooks, help, backups, offline preparation and scoped sync reachable. Preserve operation identifiers, parameters/defaults, object references, history snapshots, result-status distinctions and all calculation/menu capabilities.

Use 44px application control targets as a design goal. WCAG's AA minimum is 24px or its specified spacing exceptions; the larger goal improves phone activation. Keep focused input and immediate actions clear of persistent chrome and the measured math keyboard. MathLive's keyboard does not reserve layout space itself; use its public geometry events. Modal sheets retain focus containment, Escape and return focus. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum), [MathLive keyboard geometry](https://mathlive.io/mathfield/guides/virtual-keyboard/), [modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Keep search available near notebook context and within Explore. Use the existing catalog metadata to make search scope and operation purpose clear. This applies Apple's contextual search guidance without adding a new product capability. [Apple search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields).

Keep all four keyboard layouts and Undo/Redo/Paste visible at narrow phone widths. The original full-word layout labels made the toolbar 405px wide inside a 390px viewport, clipping Paste. Use familiar compact number/symbol/letter labels, a named Templates tab and full descriptive tooltips through the public layout API. A 14px phone toolbar font uses MathLive's documented appearance variable; keyboard commands and key sizes remain intact. Verify every toolbar target's final bounds at 320px and 390px. [MathLive virtual keyboard appearance and layout API](https://mathlive.io/mathfield/guides/virtual-keyboard/).

Place the existing expression menu in a labeled application button below the field, with a separate 44px target. The original in-field toggle still looked embedded in editable text; relocating its activation removes that ambiguity and bypasses the coarse-pointer focus gate. Hide only the exposed `menu-toggle` part with MathLive's documented CSS and open the unchanged vendor menu through its public `showMenu()` method, anchored beneath the external button. Retain its keyboard shortcut, right-click and long-press routes. Structure insertion, caret navigation, undo/redo and placeholders use public MathLive methods; do not manipulate private editor internals. [MathLive menu](https://mathlive.io/mathfield/guides/menu/), [editing commands](https://mathlive.io/mathfield/guides/commands/).

Treat previews as representations of unchanged source. A bounded arithmetic/function grammar renders from an expression tree with explicit grouping. Unsupported CAS syntax, named functions, definitions and dictionaries retain exact source text. Numeric literals are checked before parsing: if their decimal value would change, retain source; scientific literals also use conservative source fallback. Rich-editor conversion additionally checks the restored expression structure. Literal LaTeX remains explicit. A narrow `ln`/`log` alias supports the existing natural-log notation; graph engine configuration is unchanged. [MathJS expression trees and LaTeX rendering](https://mathjs.org/docs/expressions/expression_trees.html).

Preserve TeX token boundaries before symbolic parsing. A keyboard-entered integral from 1 to 0 of 2 emitted `\int_1^02\,\mathrm{d}x`; the parser greedily read upper bound `02` and returned 1 instead of −2. Extend the bounded compact-argument normalizer to scripts and fractions. Keep grouped arguments, function powers, explicit operators and differentials distinct. Independent regressions include reversed integral bounds, sums/products, compact versus grouped powers, adjacent fractions and malformed/deep inputs; repeat the actual rich-entry browser journey after rebuilding.

## Task steps and evidence

Counts describe control activations, excluding typed characters. They are not timing or usability-study measurements.

With the same `7/8` Math input at 390 × 844, the heading moved from y=229 to y=139 and the field from y=349.797 to y=259.195: approximately 91px less chrome before entry. Header help/settings targets increased from 42px to 44px. Synthetic notebook names and histories differed between captures; this comparison measures layout, not user performance.

| Task                                                          | Before                                                 | After                                     | Evidence                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Open menu from unfocused coarse-pointer editor                | 2 presses                                              | Expression menu: 1 press                  | Browser proved the focus gate; external-button replay is required before final acceptance        |
| Insert existing fraction/power/root/integral/sum/matrix/cases | Math keyboard → Calculus → key: 3                      | Structures & editing → named structure: 2 | Existing route from source/baseline; all seven new insertion controls exercised in editor retest |
| Reach next-placeholder command from composer                  | Math keyboard → Calculus → key: 3                      | Structures & editing → command: 2         | Next-placeholder edit exercised; existing vendor routes retained                                 |
| Find a named operation                                        | Find an operation → result: 2 plus query               | Same 2 plus query                         | Preserve direct route; benefit is visible context and compact rows, not claimed tap reduction    |
| Apply structured math and calculate                           | Math editor → keyboard → Use expression → Calculate: 4 | Same 4                                    | Preserve apply/cancel semantics; no added wizard or confirmation                                 |

Editor retest switched all four keyboard layouts and exercised seven structure controls and six editing controls. Fraction/power calculations and a next-placeholder edit produced independent expected results; captured structure markup establishes insertion, not arbitrary subsequent calculation correctness. Import-delay/retry, selection restoration, grouping, exact numeric fallback and all 128 default preview renders have regression checks. Those checks complement browser observation; they do not replace it.

Direct physical touch dispatch was unavailable in the in-app browser. The menu result establishes the coarse-media CSS/hit-target cause and trusted coordinate-press behavior, not physical-device certification. Native mobile keyboards, two-pointer gestures and complete integrated/offline flows require their own evidence. Private browser artifacts remain outside the public repository; the verification contract in `docs/verification.md` governs freshness and scope.

## Consequences

Phone layout and shared form presentation may change without changing computation, persistence, authentication or sync contracts. Unsupported notation remains readable and editable in its original text form instead of displaying plausible but different mathematics. Entry controls remain available through existing vendor routes as well as the exposed app controls. A feature inventory and browser regression evidence are required before declaring the full redesign complete.
