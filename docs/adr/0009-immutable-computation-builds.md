# ADR-0009: Address the complete computation build

Status: Accepted

## Context

A prepared legacy service worker caches canonical worker and Python URLs. Its cache-first lookup ignores query strings. After a deployment, a new notebook could therefore report Ready while running the previous Python modules. The normal distribution Mean and variance operation exposed this after its blank-input contract changed.

## Decision

Generate the complete runtime under `/engine-build/<source-closure-sha256>/`. The identity covers the worker template, owned Python, reviewed lock, pins, licences and generation rules. Hash final emitted worker bytes separately. Vite injects the expected identity and protocol into both app bundles. Initialization, all Pyodide dependencies and Python reads share the immutable root. Pyodide retains package integrity checks.

The current worker must report matching Ready after importing `compute_json`. Calculations reject before that handshake. Preparation statuses cannot report Ready. Worker creation is independent of service-worker support or takeover. Each attempt has a 120-second deadline. Retry and cancellation start the expected build again without a reload loop.

Keep addressed runtime assets in the existing full-build caches. A matching shell and completion marker commit offline readiness. Retain two complete preparations and at most one incomplete target. Remove abandoned partial targets before creating another. Prune complete predecessors only after successful preparation. Persisted markers determine selection after restart. Legacy navigation and canonical runtime reads use one deterministic legacy cache, retained until newer successful preparations retire it.

Sign-out retires the active preparation and drains private publication before clearing every retained cache. Persist Not prepared before fallible private deletion. Restarted workers reject that revoked marker. If all persistent mutations fail, durable revocation cannot be guaranteed. Report that storage failure and retain the failed in-memory clearing barrier.

## Consequences

A legacy controller cannot map an immutable new pathname to its canonical old entry. This assumes hosting serves the published bytes at their immutable paths. It does not detect arbitrary substitution or corruption after verification.

An unchanged engine can occupy two retained full-build caches. This bounded duplication avoids a second cache ownership system. Retired builds have no indefinite restart guarantee. Native hosted authentication remains a separate browser verification boundary.
