# Accounts, settings and recovery

## Sub-features

Owner-scoped sync, save acknowledgements, account transitions, conflicts/timeouts, volatile-work sign-out protection, calculation/display settings, backup import/export and previous-save recovery. Owners are `feature.identity-sync` and `feature.settings-recovery`.

## How to get to it (user POV)

The account strip exposes **Sign out**. **Settings and backups** opens **Settings & saved work**. The local fixture's `/_verify` page chooses synthetic A/B/guest identities on the same browser origin.

## Driving it with the browser

1. As A, calculate a unique expression and wait for the actual save acknowledgement. Reload and confirm A's history.
2. Navigate to `/_verify`, choose **Verification B**, and confirm A's work is absent. Save distinct B work. Switch A/B/A on this same origin and reload each. Confirm both saved workspaces remain separate.
3. Open settings. Change angle/domain and display precision through their real controls. Calculate a value affected by the setting, switch theme, reload, and confirm settings and the independently expected answer.
4. Use **Export backup**. Read the downloaded JSON and verify the latest synthetic work. Import that file through **Import backup** and observe the promised copied notebooks. Reject an invalid backup while preserving prior work.
5. Follow machine-map recipes for concurrent saves, initialization deadlines, **Unsynced copies**, previous-valid-save recovery and volatile sign-out. Exercise **Keep working**, backup export and explicit departure only in the disposable fixture.

## Gotchas

Migrated local D1 and synthetic headers exercise the real application API. Production sign-in and completed sign-out require Sites hosting; the local proxy only forwards `/signout-with-chatgpt`. A read-only doctor cannot prove PUT, persistence or account isolation. Ordinary pending or offline work can still be durable and bypass the volatile-work guard correctly. Fault journeys require controlled storage or save failures absent from the identity helper. Record missing preconditions and the attempted route. Native beforeunload handling and in-app sign-out dialogs establish different facts. Preserve downloaded backup evidence after cleanup.
