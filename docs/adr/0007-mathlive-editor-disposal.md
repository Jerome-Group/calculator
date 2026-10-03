# ADR-0007: Release MathLive editor ownership on disposal

## Decision

Patch the pinned MathLive 0.110.0 development and production bundles through pnpm's tracked dependency patch mechanism. Disposal releases its existing menu and clears the globally focused Mathfield only when that field owns it, before destroying the model. Keep the version, registry integrity and licences unchanged.

## Why

Repeated nested editor closure and graph editor opening exposed a disposed Mathfield retained as MathLive's global focus owner. The next field's focus callback blurred the destroyed model and threw while reading its options. An open menu could also outlive the model and retain its scrim/listeners.

Public blur is insufficient during MathLive's 60ms focus transition. Disabling before removal is also insufficient: the disposed field's disabled getter falls back to false after its host is cleared. Delaying or transferring focus in application code would introduce hidden fields, timers and keyboard side effects. Releasing ownership inside disposal handles both ordinary and immediate teardown without changing mathematical behaviour or exposing vendor internals to the application.

The external Expression menu restores the retained selection without focusing the field first. MathLive schedules its keyboard sink focus after 60ms, while the menu scrim immediately saves the current DOM focus. Starting both operations together can restore focus outside the field while MathLive still considers it focused. Menu commands already belong to the field; opening its menu needs no editor focus transition. Insertion, editing commands and keyboard activation retain their explicit focus behavior.

The pinned contextual-menu command dismisses to an inert internal container, so first-use Escape and template insertion can leave typed input outside the editor. Its dismissal now restores the keyboard sink, establishes the field's logical focus and reconnects its virtual keyboard. The delegate suppresses its own focus handler, so sink focus alone cannot establish ownership. Pending focus callbacks yield while a menu scrim is open, while another field owns focus, or after blur/disable. Disposal marks the field before closing its menu so dismissal cannot refocus a model being destroyed. These ownership corrections apply to all four distributed browser bundles; readonly selection and copy remain focusable.

An editor losing ownership during its pending focus transition initially suppresses blur. Its callback must complete that normal blur after releasing the transition flag; otherwise it still considers itself focused and cannot reclaim ownership later. Normal blur preserves content-change notification, virtual-keyboard disconnection and focus events while leaving the newer owner intact.

## Verification boundary

`tests/mathlive-lifecycle.mjs` executes actual methods extracted from all four shipped browser bundles with controlled DOM dependencies and timers. It checks first-use dismissal to the keyboard sink, pending menu focus, another editor's scrim, stale focus callbacks, disabled/disposing ownership, focused/inactive teardown and the next editor. The unpatched artifact fails the sink-restoration and focused-owner assertions. These checks do not certify rendered browser focus or popover behaviour; `editor.repeated-transition` requires fresh production browser observations across nested Use/Close/Escape, Text/Math and graph editor transitions.
