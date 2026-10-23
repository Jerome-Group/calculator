# Offline, discovery and reference

## Sub-features

Task search/filter/finder, empty states, help/coverage/licences, offline preparation and disconnected reopening. Owners are `feature.navigation` and `feature.offline`. Responsive geometry and keyboard-visible controls apply to every feature.

## How to get to it (user POV)

Open **Explore**, **Find an operation** or Cmd/Ctrl K. **Help and coverage** opens **Calculator reference**. **Settings and backups** includes **Prepare for offline use**.

## Driving it with the browser

1. In **Explore**, use **Search tasks or examples** and **Subject**. Open a matching operation and verify its actual fields. Search a nonsense term and observe the empty state. Repeat search, selection and empty-state checks through **Find an operation**. Its finder has no Subject filter.
2. Open **Help and coverage**, follow **Coverage, validation and sources**, then **Dependency licences**. Observe readable `/licenses.txt` and return to the notebook.
3. Choose **Prepare for offline use** and wait for **Ready**. The completed control becomes **Verify / repair offline files**. Run it and confirm readiness again. Retain the served manifest, identified engine build and preparation result. Computation can load before offline preparation; **Ready** additionally requires a complete verified offline closure.
4. Stop the owned proxy session while retaining Wrangler, the browser and service worker. Reload the same origin and calculate a bundled-engine input never previously evaluated, such as `7*13+2`, independently equal to `93`. Confirm the origin refuses connections while the cached application and fresh calculation work.
5. Restart the owned proxy with the same ports before further online journeys. Run Doctor again and reload to confirm online saves resume. At required phone/desktop widths and both themes, observe dialogs and keyboard-visible targets after final styles load. Capture actual bounds, focus and visible result.

## Updates and failed preparation

Use the machine map recipes for `offline.engine-upgrade` and `offline.preparation-retention`. A newly served shell must load its matching immutable engine files. Retain the prior fully prepared build while the new preparation is partial or interrupted. A failed engine start must expose **Retry**; after correcting the owned fault, retry and calculate a fresh input. Never infer these update states from a normal reload or a unit-test trace.

## Gotchas

Hosted [HTML detection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/) can inject scripts into HTML page views but excludes AJAX. For deployed offline delivery, retain the actual asset prefetch's `X-Requested-With: XMLHttpRequest` header, final same-origin URL, response byte count, and SHA-256 against the deployed manifest. Preserve transformed-response failures.

Synthetic preview identities and successful HTTP asset checks do not prove hosted Sites sign-in, **Ready**, or disconnected reopening. Record any SSO prerequisite and the attempted browser route. Claim those results only after observing the signed-in browser journey.

Account transitions require fresh account-specific offline evidence. Repeat preparation and disconnected reopening under the selected account before claiming that account can reopen offline. Do not infer its readiness from a previous account's prepared files.

Stopping only Wrangler leaves a proxy HTTP 502, which does not exercise the service worker's network-failure fallback. Stop the proxy, reload and make a fresh calculation. A healthy cached shell does not prove all engine capabilities were prepared. Service workers require a secure or loopback origin and available browser storage. Offline cleanup must restore the network and stop remaining owned sessions. Browser emulation does not certify physical touch. Retain all six required modal records for full release evidence.
