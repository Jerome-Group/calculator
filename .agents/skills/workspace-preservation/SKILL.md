---
name: workspace-preservation
description: Check committed Calculator workspace preservation across delayed saves, ordinary sign-out, account generations, and stale cloud acknowledgements. Use when changing Calculator save effects, Gate leave handling, sync, storage, or drafts.
---

# Check workspace preservation

A committed edit must remain recoverable or block ordinary sign-out. Stale mounts and responses must stay inert. An acknowledgement may remove only its own draft snapshot.

Last confirmed correspondence: `b5d21cc6539722e19fc3dc675d11c0f21981c9ba`. [coverage.json](coverage.json) records source hashes. A hash change marks drift even if checks pass.

1. Use Node 24, Java 21, and the checkout's installed dependencies. Run from the repository root:

   ```sh
   node .agents/skills/workspace-preservation/scripts/run.mjs
   node .agents/skills/workspace-preservation/scripts/run.mjs --mutations
   ```

   The first command installs or checks a SHA256-pinned TLC 1.7.4 in the user cache, checks both model configurations, then runs actual TS and component callbacks. Set `JAVA` or `JAVA_HOME` if Java 21 is elsewhere. The second command checks clean source, mutates temporary source copies, and requires each property to catch its break. It never edits application files.

2. Read `outputs/workspace-preservation/check/latest.json` for the run directory containing `report.json`, the TLC logs, and `actual-code.json`. Mutation receipts use `outputs/workspace-preservation/mutations/latest.json`. Each run keeps its own directory so later green runs preserve earlier red evidence. Exit 1 means a property failed or correspondence drifted. Infrastructure errors also exit nonzero and print their cause. A mutation counts only when a property fails without a harness error.

3. Expect both model configurations, all eighteen actual callback schedules, and all five mutation controls to pass. `Calculator` stages the latest committed state through its account lease before the delayed save. Ordinary sign-out blocks while that state has no durable copy, and Gate exports that latest state. The pre-fix baseline at `f61bf0a` remains a confirmed bug. TLC reports `Init → Commit → SignOut`, and five of seventeen callback schedules lose the committed edit. Preserve those receipts. PR #80 fixes the product separately. This skill is issue #69.

4. Before changing covered code, read [the correspondence and bounds](references/correspondence.md). Coverage includes `Calculator` layout/save effects, `CalculatorGate` ordinary sign-out, `sync` session/generation/drain guards, `storage.persist`, and `drafts.acknowledgeDraft`. Search for moved functions and new writers to the same state.

5. After code changes, diff covered files from the sync commit. Update actions from code before rerunning. Replay any counterexample in the real callbacks. Classify **in sync**, **updated**, **bug**, or **blocked**. Preserve bug receipts. Change a property only with explicit evidence that the product promise changed. Rerun both commands after updating mutation anchors. Advance the sync commit and hashes only after confirming correspondence at that exact commit. Use `pstack:maintain-formal-verification-skill` for accumulated drift.

This is bounded safety checking plus generated TS schedules. It does not prove the TypeScript implementation, React scheduling, browser storage durability, production identity, or native sign-in. Generic notebook edits exercise committed workspace snapshots. They do not execute Studio authoring, evidence mathematics, Graph analysis, or History navigation. Read the bounds before reporting a pass.

CI runs both commands in the existing `checks` job with Java 21. It retains reports and counterexamples for fourteen days. A changed source hash fails until correspondence is reviewed and refreshed.
