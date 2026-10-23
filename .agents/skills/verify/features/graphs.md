# Graphs and analysis

## Sub-features

Cartesian, implicit, inequality, parametric, polar, surface, direction-field, sequence and trajectory graphs. Tables, trace/pan, zoom/Fit/reset, parameter sliders, nine analysis operations, derived graphs and resource-error recovery belong to `feature.graphs`.

## How to get to it (user POV)

Open **Graphs**, then **Plot a function** or **Add**. **Objects** can graph a saved function, and some calculation results expose **Graph**, **Plot trajectory** or **Phase portrait**.

## Driving it with the browser

1. Add a Cartesian graph. Fill **Graph 1 expression** with `x^2`, observe a drawn parabola, and open **Table**.
2. Set **Interval start** to `0` and **Interval end** to `5`. Check all 11 samples against `y=x^2`, including `(0,0)`, `(1,1)` and `(5,25)`. Capture the table and canvas.
3. Choose **tangent** in **Graph analysis operation**, set **Analysis point** to `2`, and click **Calculate**. Observe `4x-4`, slope `4` and point `(2,4)` inline while **Graphs** stays selected and focus stays on **Calculate**. **Open saved calculation in Calculate** explicitly opens its canonical History entry. Return to Graphs deliberately before continuing. Other choices include **value** and **roots**. Table rows expose **Use**; the trace bar exposes **Use point**.
4. Trace `x^2` at the canvas centre, observe `(0,0)`, then edit the expression to `x^2+1`. Observe `(0,1)` and activate **Use point**; Calculate must receive `[0,1]`. Exercise selected-curve changes, hide/show, deletion and unsupported trace types without reusing an old point. Activate Fit, zoom, Pan and Reset on owned fixture graphs.
5. Table the constant `0` between `-1e308` and `1e308`. Check eleven finite, monotone coordinates including both endpoints and the zero midpoint. Restore `x^2` on `[0,5]` and check all eleven ordinary samples. Also enter invalid bounds, observe the finite-number warning and recover. Follow the machine map for other graph types and resource guards.

## Inline analysis

Calculate the integral of `x^2` from `0` to `1`. Verify `1/3` inline, its approximation/details, the shaded interval and the matching saved History result. Editing relevant graph inputs or deleting the saved entry must clear stale analysis and its automatic shade. Manual shading has separate controls.

Add a second Cartesian curve `x`. Refocus **Graph 1 expression** to select `x^2`, choose **area** in **Graph analysis operation**, choose `x` in **Comparison graph**, and set the Analysis **Interval start** to `0` and **Interval end** to `1`. Click **Calculate** and require exact `1/6` inline, valid shade and the same saved History result/request. Capture the selected primary and comparison curves; an x-axis calculation cannot establish area between curves.

Replay all eight `graph.analysis` fixtures from `tests/fixtures/graph-analysis.json` through actual controls. Swapping curves gives `1/6`; extending their interval to `[0,2]` gives `1`; `x^2-1` against the x-axis on `[-2,2]` gives `4`; two distinct graph records both containing `x^2` give `0`; `a*x^2` against `a*x` with **Parameter value** `-2` gives `1/3`; `x^2` against the x-axis on `[-1,1]` gives `2/3`. Comparing with `1/x` on `[0,1]` retains the comparison-continuity error. Reversed bounds retain the increasing-interval error. Unknown symbolic coefficients and `sqrt(x)-x` may remain unresolved; do not force an exact status or weaken original-curve continuity checks.

Start a sufficiently long analysis, use the visible **Stop calculation**, then retry. Pending feedback must clear without old completion replacing the new attempt. Retain actual error, unresolved and divergent statuses. Area against another graph uses an eligible distinct comparison; with one eligible curve it uses the x-axis. Symbolic bounds and angle-dependent parameters need their captured context, including DEG mode.

## Gotchas

Canvas screenshots establish drawing, not correct samples. Capture the table or analysis result too. Parametric/polar/data graphs do not use every Cartesian interval field. Symbolic analysis bounds remain supported. Never run known hanging oversized baseline expressions. A resource diagnostic must leave ordinary graph controls usable.
