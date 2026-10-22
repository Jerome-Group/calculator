# Graphs and analysis

## Sub-features

Cartesian, implicit, inequality, parametric, polar, surface, direction-field, sequence and trajectory graphs. Tables, trace/pan, zoom/Fit/reset, parameter sliders, nine analysis operations, derived graphs and resource-error recovery belong to `feature.graphs`.

## How to get to it (user POV)

Open **Graphs**, then **Plot a function** or **Add**. **Objects** can graph a saved function, and some calculation results expose **Graph**, **Plot trajectory** or **Phase portrait**.

## Driving it with the browser

1. Add a Cartesian graph. Fill **Graph 1 expression** with `x^2`, observe a drawn parabola, and open **Table**.
2. Set **Interval start** to `0` and **Interval end** to `5`. Check all 11 samples against `y=x^2`, including `(0,0)`, `(1,1)` and `(5,25)`. Capture the table and canvas.
3. Choose **tangent** in **Graph analysis operation**, set **Analysis point** to `2`, and click **Calculate**. Observe `4x-4`, slope `4` and point `(2,4)` in the saved Calculate result. Other choices include **value** and **roots**. Table rows expose **Use**; the trace bar exposes **Use point**.
4. Trace `x^2` at the canvas centre, observe `(0,0)`, then edit the expression to `x^2+1`. Observe `(0,1)` and activate **Use point**; Calculate must receive `[0,1]`. Exercise selected-curve changes, hide/show, deletion and unsupported trace types without reusing an old point. Activate Fit, zoom, Pan and Reset on owned fixture graphs.
5. Table the constant `0` between `-1e308` and `1e308`. Check eleven finite, monotone coordinates including both endpoints and the zero midpoint. Restore `x^2` on `[0,5]` and check all eleven ordinary samples. Also enter invalid bounds, observe the finite-number warning and recover. Follow the machine map for other graph types and resource guards.

## Gotchas

Canvas screenshots establish drawing, not correct samples. Capture the table or analysis result too. Parametric/polar/data graphs do not use every Cartesian interval field. Symbolic analysis bounds remain supported. Never run known hanging oversized baseline expressions. A resource diagnostic must leave ordinary graph controls usable.
