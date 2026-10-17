# Notebooks and objects

## Sub-features

Notebook creation/switching/renaming, result history and reuse, saved expressions/functions/matrices/datasets/objects, references, removal/undo and stale-result recalculation. Owners are `feature.notebooks` and `feature.objects`.

## How to get to it (user POV)

The toolbar button named after the current notebook opens **Your notebooks**. Empty **Objects** exposes **New function**, **New matrix** and **New dataset**. Once an object exists, use **New** and **Object kind**. Result cards expose **Use**, **Save as**, **Edit problem**, **Graph** and **Remove calculation**.

## Driving it with the browser

1. Open the notebook dialog. Fill **New notebook**, click **Create notebook**, and calculate a unique expression. Create a second notebook and confirm its history and objects are independent.
2. In **Objects**, create a matrix with **Object name** `A`, set two rows/two columns, and enter `[[1,2],[3,4]]` through the actual cell inputs. Click **Save object**.
3. Use the saved matrix in **Determinant**. Observe `-2`. Edit its definition and verify that old results retain original inputs while explicit recalculation uses the new definition.
4. Save `f(x)=x^2+1`, graph it, and create a dataset. Exercise dataset plot choice and **Statistics**. Follow machine-map scenarios for all object kinds.
5. Remove an owned calculation or object, switch to **Calculate**, and use the history **Undo**. Reload and confirm the restored notebook contents. Retain source, result and save acknowledgement.

## Gotchas

Owner switching and notebook switching are different isolation checks. Save dialogs must preserve entered expressions when object kind changes. History buttons repeat. Scope each to its card. Only delete disposable QA data. A final screenshot without reload does not prove persistence.
