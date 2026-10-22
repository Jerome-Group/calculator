---
name: verify
description: Launch and drive Calculator's built browser notebook, graphs, recovery and offline journeys, retaining source-bound evidence. Use after Calculator changes or when auditing its feature map.
---

# Verify Calculator

Read [the feature index](features/README.md), then only the feature being driven. The existing [machine map](../../../docs/verification-map.json) and [evidence contract](../../../docs/verification.md) own fixture, scenario, control and modal IDs. `browser match` and `browser validate` inspect observations. They never operate the browser.

## Launch

Use Node 24 and pnpm 11.25.0 from the repository root. Install missing dependencies with `pnpm install --frozen-lockfile`. Asset preparation may fetch reviewed pins. Build before driving. A development server's synthetic Seedy sign-in is not production-build evidence.

```sh
mkdir -p outputs
export CALCULATOR_QA_EVIDENCE="$(mktemp -d "$PWD/outputs/verify.XXXXXX")"
pnpm --silent verify run --group core --evidence-dir "$CALCULATOR_QA_EVIDENCE/core" --json
export CALCULATOR_QA_STATE="$(mktemp -d /tmp/calculator-verify.XXXXXX)"
export CALCULATOR_QA_INSTANCE="${CALCULATOR_QA_STATE##*/}"
export SITES_RUNTIME_ROOT="$CALCULATOR_QA_STATE/runtime"
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to "$CALCULATOR_QA_STATE/d1" --file drizzle/0000_careless_thena.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to "$CALCULATOR_QA_STATE/d1" --ip 127.0.0.1 --port 8789 --inspector-port 0
```

Keep Wrangler in an owned retained terminal session. Copy the recorded instance identifier into a second owned session and run:

```sh
node .agents/skills/verify/scripts/preview.mjs serve --port 4175 --upstream-port 8789 --instance "$CALCULATOR_QA_INSTANCE"
```

Wait for Wrangler's `Ready on` log and the proxy's `Ready at` log. Run Doctor. Open its `http://127.0.0.1:4175/_verify` URL in a fresh browser context and choose **Verification A**. Wait for **✓ All calculation tools loaded** before calculating, including after reload. A visible Calculate button can remain disabled while the engine loads. The migration and Worker must share the same fresh persistence directory. If either port is occupied, choose another pair in both commands and Doctor. Never attach to or terminate an unknown listener.

Use one long-lived instance and one browser origin for serial journeys. Other runs need their own ports, D1 directory and browser storage. A new tab on a reused origin does not clear local storage or service workers.

## Doctor

```sh
node .agents/skills/verify/scripts/preview.mjs doctor --port 4175 --upstream-port 8789 --instance "$CALCULATOR_QA_INSTANCE"
```

This read-only command checks the proxy's run identifier and upstream port, real workspace GETs under A/B/guest, the DB binding, and the served manifest against the local build. Save its JSON in the private evidence directory. Run it before driving and after any surprising failure. A healthy process does not clear a wedged UI. Return through `/_verify`, select the expected identity, and reload, or restart owned sessions before retrying.

## Drive

Use supported browser automation against visible controls. In Codex use `cua_repl` and read its returned browser documentation before choosing locators. Prefer an available in-app browser. If unavailable, inspect the browser inventory and use an available supported browser with an owned QA tab. Record the browser used. A new tab on a reused origin still shares storage.

Prefer roles and the real labels in each feature file. Use a DOM snapshot for accessible names; visual uppercase styling can differ from those names. The application's comboboxes are button-based menus. Click the combobox, observe its options, then click the required option. Native `selectOption` does not operate these menus. Observe the resulting accessibility/DOM state after actions. Do not set React state, invoke internal calculation helpers, seed passing results, or substitute API calls for UI journeys.

The local proxy supplies synthetic identities only at the existing Sites-header boundary. Choose A/B/guest through `/_verify`. Save work through the actual UI and real D1 API. Local identity checks do not certify live Sites sign-in. Preserve the original browser Origin through the proxy.

Run `pnpm --silent verify show <feature-or-fixture-ID> --json` to expand a relevant journey. For release evidence, exercise every required ID in the machine map. A representative journey per feature supports maintenance coverage only. It cannot pass the full browser release gate.

## Evidence

Keep the unique `CALCULATOR_QA_EVIDENCE` directory under ignored `outputs/`. Create `outputs/` first if absent. Retain Doctor JSON, ordered actions, before/after DOM, screenshots, observed results, save acknowledgements and downloaded backup contents. Capture actual revision, dirty-source fingerprint and served manifest fingerprint when observing. Keep failures and unavailable prerequisites. Never restamp old evidence after edits.

For full manifests, follow the existing evidence schema and run:

```sh
pnpm --silent verify browser match --evidence "$CALCULATOR_QA_EVIDENCE/captures.json" --json
pnpm --silent verify browser validate --evidence "$CALCULATOR_QA_EVIDENCE/browser.json" --json
```

Use observed semantic answers, including required details, with independent fixture expectations. Verify persistence by reload and account switching, file effects by reading downloads, and offline behavior by actually disconnecting the origin. A download-event timeout can occur after the browser writes the file. Inspect the actual download destination for the named file and verify its timestamp and contents before retrying. Copy only the QA download into the evidence directory. A button click or timeout alone proves neither success nor failure. Local fixtures do not prove production identity, physical touch or uncontrollable native clipboard branches. Record those prerequisites and the attempted route. A core pass explicitly leaves browser execution unverified.

## Cleanup

Restore networking and the user's clipboard if changed. Close owned QA tabs. Send Ctrl-C to the proxy and Wrangler sessions, including after failed attempts. Confirm both sessions exited and their ports stopped listening. Never kill by process name or discover a PID to kill through a reused port.

Remove only the recorded `CALCULATOR_QA_STATE` directory after the owned processes exit. Keep the entire `outputs/` evidence directory and confirm the captured files still exist. If startup fails midway, stop whichever owned session started before removing state. Do not remove the user's `.wrangler/state` or production work.

## Helpers

`scripts/preview.mjs` is executable. Its `serve` and read-only `doctor` invocations appear above. It forwards the built application through a loopback proxy, strips supplied identity headers and exposes synthetic A/B/guest selection. It never launches, kills or migrates the Worker.

Maintain this skill and its feature files with pstack's `maintain-verification-skill` when behavior changes. Keep the machine map authoritative.
