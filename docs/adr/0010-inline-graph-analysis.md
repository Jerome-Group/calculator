# ADR-0010: Show graph analysis beside its interval

Graph analysis keeps its answer and shade beside the controls that produced them. Navigating to Calculate before completion unmounted those controls and discarded the requested interval. Retaining hidden Graphs would require separate policies for canvas size, editor focus, portals, and pending work.

History remains the sole result owner, as established in ADR-0008. The existing executor returns the exact saved entry after its guarded append. Graphs retains only an input snapshot, a local request identity, and the saved entry ID. The inline answer reads current History, so deleting its saved calculation removes the answer and automatic shade. No storage fields or result collection are added.

Each analysis request owns a token. Stop invalidates that token before cancelling the existing calculation. An older completion or finally block cannot select an answer, shade an interval, or clear a replacement request. Pending Calculate remains focusable with `aria-disabled` and synchronous repeat guards, because completion does not restore focus. Account leases, computation generations, notebook capture, the execution lock, and capacity checks retain their existing authority. Mathematical errors remain saved evidence.

Exact and numeric interval successes may shade. Other mathematical statuses retain their answer and diagnostics without automatic shade. Manual shading remains an independent preview. Input changes discard the inline selection and shade. Pan and zoom preserve them.

Full History navigation is explicit and targets the saved entry, including entries beyond the initial History window. Its focus request is consumed once and cleared by an intervening tab change. Calculation completion never changes tabs or focus. Deliberate departure, notebook changes, and account teardown use normal unmount to discard Graphs controls. Returning starts with the ordinary defaults.

The primary answer, status, and structured details renderer is shared with History. History retains plots, editing, reuse, and Save value actions. The WebMCP calculation tool unwraps the internal entry receipt and retains its public Result response.
