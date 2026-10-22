# Notebooks and objects

## Sub-features

Notebook creation/switching/renaming, result history and reuse, saved expressions/functions/matrices/datasets/objects, references, removal/undo and stale-result recalculation. Owners are `feature.notebooks` and `feature.objects`.

## How to get to it (user POV)

The toolbar button named after the current notebook opens **Your notebooks**. Empty **Objects** exposes **New function**, **New matrix** and **New dataset**. Once an object exists, use **New** and **Object kind**. Result cards expose **Edit problem** and **Remove calculation**. **Use** and **Save as** require a reusable answer. **Graph** also requires a supported scalar shape.

## Driving it with the browser

1. Open the notebook dialog. Fill **New notebook**, click **Create notebook**, and calculate a unique expression. Edit **Rename current notebook**, then leave the dialog and confirm the new name. Create a second notebook and confirm its history and objects are independent.
2. In **Objects**, create a matrix with **Object name** `A`, set two rows/two columns, and enter `[[1,2],[3,4]]` through the actual cell inputs. Click **Save object**.
3. Use the saved matrix in **Determinant**. Observe `-2`. Edit its definition and verify that old results retain original inputs while explicit recalculation uses the new definition.
4. Save `f(x,y)=x+2*y` and calculate `f(1,2)=5`. Change Arguments to `y,x`, retaining the expression. The old result stays `5` with a changed-definitions warning. **Recalculate** yields `4`; **Repeat original settings** yields `5`. Reload and retain the snapshots and warning. Separately save unary `g(t)=t^2`, graph it and check samples. Exercise dataset plot choice and **Statistics**. Follow machine-map scenarios for all object kinds.
5. Remove an owned calculation or object, switch to **Calculate**, and use the history **Undo**. Observe **Saving your latest changes…** after an edit, then immediately reload. Confirm the restored notebook contents. Retain source, result, timing and the eventual save acknowledgement.

## Gotchas

Owner switching and notebook switching are different isolation checks. Settings are shared across notebooks. History **Undo** restores a whole-workspace snapshot and exists only for the current session. Use it immediately after the disposable removal to avoid losing intervening work. Save dialogs must preserve entered expressions when object kind changes. History buttons repeat. Scope each to its card. Only delete disposable QA data. A final screenshot without reload does not prove persistence.

Ordinary page exit flushes committed edits before the delayed save. Browser force-kill and exits that deliver no `pagehide` event remain outside this check. Storage failure must show **Device save failed · export a backup** and preserve exportable work.
