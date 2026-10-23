# Calculation and editor

## Sub-features

Expression calculation, Math/Text/LaTeX modes, vendor menus, structured operation forms, probability/statistics, nested editors, result details, cancellation and worker recovery. Owners are `feature.editor` and `feature.expression-worker`; independent catalogue fixtures cover operation inputs and answers.

## How to get to it (user POV)

Open **Calculate**. Choose **Text**, **Math** or **LaTeX**. **Explore** and **Find an operation** open structured tasks. Result cards expose **Edit problem** and **Copy LaTeX**. **Calculation details** requires a nonempty result LaTeX field and details, regardless of input mode. **Conditions and diagnostics** requires notes.

## Driving it with the browser

1. Choose **Text**, fill **Text expression** with `1/3+1/6`, click **Calculate**, and observe exact `1/2` in the new `article.calculation`.
2. Edit the same problem. Switch between Math and Text, preserve binding and source, then calculate again. Exercise editor Undo/Redo inside **Structures & editing** and **Expression menu** with real inputs. History has a separate **Undo**.
3. Find **Probability distributions**. Use **Distribution**, **Probability operation** and their actual parameter labels. Standard normal CDF at zero equals `0.5`. Retain the problem preview and resulting answer.
4. Use the machine-map recipes for nested input, matrices/lists, logic, malformed saved distribution inputs and every vendor menu leaf. Open required result disclosures before capturing semantic answers. For selection disposal, activate a native matrix menu item and immediately switch Math to LaTeX; enter a new draft and verify no late insertion or console error. Separately await the visible matrix template, fill its four actual placeholders and calculate; cancelling an obsolete selection must not break ordinary selection.
5. Cancel a running calculation, retain its input, then compute a fresh expression successfully. Preserve action order and visible engine status.
6. Scope **Copy LaTeX** to the fraction result. Preserve the user's clipboard, activate the button, read the copied source and restore the clipboard. A successful write shows **Copied.**; an unavailable or rejected API downloads `expression.tex` containing the actual source. Inspect the real file if that branch is naturally available. Controlled callback regressions cover unavailable and pending writes; they do not certify native browser permission behavior.

## Gotchas

Repeated result buttons need scoping to their calculation article. Native MathLive menus can live in shadow DOM. Use supported browser input and preserve selection. Main Text `%` syntax has an expected unavailable error distinct from graph percentages. Unsupported notation must retain its explicit error, not gain invented semantics. Native clipboard denial/pending branches and physical touch have the bounded limitations in the existing evidence contract.

`Calculator.tsx` also conditionally registers `calculate_expression` and `read_calculator_workspace` through `document.modelContext`. Record whether that public browser capability exists. If unavailable, retain an explicit prerequisite failure. Ordinary browser interactions do not prove tool invocation. Do not install or fake the API for verification.
