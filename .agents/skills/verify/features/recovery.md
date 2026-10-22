# Accounts, settings and recovery

## Sub-features

Owner-scoped sync, save acknowledgements, account transitions, conflicts/timeouts, volatile-work sign-out protection, calculation/display settings, backup import/export and previous-save recovery. Owners are `feature.identity-sync` and `feature.settings-recovery`.

## How to get to it (user POV)

The account strip exposes **Sign out**. **Settings and backups** opens **Settings & saved work**. The local fixture's `/_verify` page chooses synthetic A/B/guest identities on the same browser origin.

## Driving it with the browser

1. As A, calculate a unique expression and wait for the actual save acknowledgement. Edit saved work and observe **Saving your latest changes…**. Immediately reload, retaining timing evidence, and confirm A's latest work. Wait for the actual account acknowledgement separately.
2. Navigate to `/_verify`, choose **Verification B**, and confirm A's work is absent. Save distinct B work. Switch A/B/A on this same origin and reload each. Confirm both saved workspaces remain separate.
3. Open settings. Change **Angle mode**, **Solution domain**, **Display decimal places** and **Calculation precision** through their real controls. Display decimals affect presentation independently of calculation precision. Calculate an affected value, switch theme, reload, and confirm settings and the independently expected answer. Check **Symbol assumptions** with a supported symbolic input.
4. Use **Export backup**. Read the downloaded JSON and verify the latest synthetic work. Import that file through **Import backup** and observe new notebook IDs and imported names. Imports preserve current workspace settings. Reject an invalid backup while preserving prior work. Imports above 20 MB or the combined 100-notebook limit must refuse without replacing current work.
5. **Restore previous valid save** replaces current workspace state and supports history **Undo**. **Import earlier device notebooks** requires a valid unassigned device save. **Export unreadable recovery data** appears when automatic saving is paused because initialization found no usable device save or hydrated workspace. Malformed current data alone does not expose it if another valid save loads. Record unavailable prerequisites rather than fabricating them.
6. Concurrent saves, initialization deadlines, **Unsynced copies** and volatile sign-out require controlled failure conditions. The identity helper supplies none. Use an existing explicit machine-map fault recipe where present; otherwise record the missing fault setup and route attempted. Exercise **Keep working**, backup export and explicit departure only in the disposable fixture.

## Gotchas

Migrated local D1 and synthetic headers exercise the real application API. Production sign-in and completed sign-out require Sites hosting; the local proxy only forwards `/signout-with-chatgpt`. A read-only doctor cannot prove PUT, persistence or account isolation. Ordinary pending or offline work can still be durable and bypass the volatile-work guard correctly. Fault journeys require controlled storage or save failures absent from the identity helper. Record missing preconditions and the attempted route. Native beforeunload handling and in-app sign-out dialogs establish different facts. Preserve downloaded backup evidence after cleanup.

The ordinary reload check requires a delivered `pagehide` event. It does not cover browser force-kill. An older account acknowledgement must not hide a newer pending edit. A failed device save shows **Device save failed · export a backup**. Keep the warning and inspect the exported current work under a controlled storage failure. Paused corrupt data and obsolete account sessions must not write on exit.
