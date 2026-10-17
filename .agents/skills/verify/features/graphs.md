# Graphs and analysis

## Sub-features

Cartesian, implicit, inequality, parametric, polar, surface, direction-field, sequence and trajectory graphs. Tables, trace/pan, zoom/Fit/reset, parameter sliders, nine analysis operations, derived graphs and resource-error recovery belong to `feature.graphs`.

## How to get to it (user POV)

Open **Graphs**, then **Plot a function** or **Add**. **Objects** can graph a saved function, and some calculation results expose **Graph**, **Plot trajectory** or **Phase portrait**.

## Driving it with the browser

1. Add a Cartesian graph. Fill **Graph 1 expression** with `x^2`, observe a drawn parabola, and open **Table**.
2. Set **Interval start** to `0` and **Interval end** to `5`. Check all 11 samples against `y=x^2`, including `(0,0)`, `(1,1)` and `(5,25)`. Capture the table and canvas.
3. Choose **tangent** in **Graph analysis operation**, set **Analysis point** to `2`, and click **Calculate**. Observe `4x-4`, slope `4` and point `(2,4)` in the saved Calculate result. Other choices include **value** and **roots**. Table rows expose **Use**; the trace bar exposes **Use point**.
4. Activate **Fit graph**, zoom, **Pan graph**, **Trace graph**, **Reset graph**, hide/show and delete on owned fixture graphs. Add a second graph and check comparison behavior.
5. Enter invalid shared table bounds, observe the finite-number warning, restore valid bounds, and confirm fresh samples. Follow the machine map for other graph types and extreme-range/resource guards.

## Gotchas

Canvas screenshots establish drawing, not correct samples. Capture the table or analysis result too. Parametric/polar/data graphs do not use every Cartesian interval field. Symbolic analysis bounds remain supported. Never run known hanging oversized baseline expressions. A resource diagnostic must leave ordinary graph controls usable.
