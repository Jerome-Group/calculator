# Offline, discovery and reference

## Sub-features

Task search/filter/finder, empty states, help/coverage/licences, offline preparation and disconnected reopening. Owners are `feature.navigation` and `feature.offline`. Responsive geometry and keyboard-visible controls apply to every feature.

## How to get to it (user POV)

Open **Explore**, **Find an operation** or Cmd/Ctrl K. **Help and coverage** opens **Calculator reference**. **Settings and backups** includes **Prepare for offline use**.

## Driving it with the browser

1. In **Explore**, use **Search tasks or examples** and **Subject**. Open a matching operation and verify its actual fields. Search a nonsense term and observe the empty state. Repeat through **Find an operation**.
2. Open **Help and coverage**, follow **Coverage, validation and sources**, then **Dependency licences**. Observe readable `/licenses.txt` and return to the notebook.
3. Choose **Prepare for offline use** and wait for **Ready**. Retain the served manifest and preparation result.
4. Stop the owned proxy session while retaining Wrangler, the browser and service worker. Reload the same origin and calculate a bundled-engine input never previously evaluated, such as `7*13+2`, independently equal to `93`. Confirm the origin refuses connections while the cached application and fresh calculation work.
5. Restart the owned proxy with the same ports before further online journeys. Run Doctor again. At required phone/desktop widths and both themes, observe dialogs and keyboard-visible targets after final styles load. Capture actual bounds, focus and visible result.

## Gotchas

Stopping only Wrangler leaves a proxy HTTP 502, which does not exercise the service worker's network-failure fallback. Stop the proxy, reload and make a fresh calculation. A healthy cached shell does not prove all engine capabilities were prepared. Service workers require a secure or loopback origin and available browser storage. Offline cleanup must restore the network and stop remaining owned sessions. Browser emulation does not certify physical touch. Retain all six required modal records for full release evidence.
