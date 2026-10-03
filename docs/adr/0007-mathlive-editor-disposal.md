# ADR-0007: Release MathLive editor ownership on disposal

## Decision

Patch the pinned MathLive 0.110.0 development and production bundles through pnpm's tracked dependency patch mechanism. Disposal releases its existing menu and clears the globally focused Mathfield only when that field owns it, before destroying the model. Keep the version, registry integrity and licences unchanged.

## Why

Repeated nested editor closure and graph editor opening exposed a disposed Mathfield retained as MathLive's global focus owner. The next field's focus callback blurred the destroyed model and threw while reading its options. An open menu could also outlive the model and retain its scrim/listeners.

Public blur is insufficient during MathLive's 60ms focus transition. Disabling before removal is also insufficient: the disposed field's disabled getter falls back to false after its host is cleared. Delaying or transferring focus in application code would introduce hidden fields, timers and keyboard side effects. Releasing ownership inside disposal handles both ordinary and immediate teardown without changing mathematical behaviour or exposing vendor internals to the application.

## Verification boundary

`tests/mathlive-lifecycle.mjs` executes actual methods extracted from both shipped bundles with controlled DOM dependencies and timers. It checks focused/inactive ownership, teardown within the focus transition, menu cleanup before model destruction and the next editor. The unpatched artifact fails the focused-owner assertion. These checks do not certify rendered browser focus or popover behaviour; `editor.repeated-transition` requires fresh production browser observations across nested Use/Close/Escape, Text/Math and graph editor transitions.
