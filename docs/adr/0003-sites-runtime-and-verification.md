# Sites runtime and verification

A Worker is required for ChatGPT sign-in and account-scoped D1 workspace saves. Static export alone cannot preserve that behaviour. Logical resource names travel in hosting.json; Sites supplies deployment bindings. The local mock sign-in is limited to loopback development.

Browser computation remains bundled and local. Offline preparation verifies asset hashes and saves the authenticated shell; generation checks prevent a concurrent sign-out from restoring it. API outages permit recovery only for a server-verified matching account, or a disconnected device with a previously saved identity. Authentication failures clear remembered identity.

The seeded `checks` job is extended rather than renamed, preserving required contexts. CI performs a locked installation, formatting, lint, typechecking, engine/persistence/sync tests, one production build and asset closure checks within ten minutes. Third-party generated runtimes and vendored UI are excluded from formatter/linter changes; their distribution is verified by hashes and package closure.

The imported CAS and UI use dynamic boundaries and imperative event handlers. Existing explicit-any and React compiler migration diagnostics remain warnings; compiler compatibility is not claimed. Runtime hooks checks, remaining lint errors and TypeScript checking still fail CI. Mathematical engine and browser interaction checks remain separate evidence.

Unsynced snapshots are durable per browser writer and account before submission. Recovery keeps valid notebook limits and names; copies that cannot fit remain separately exportable from Settings. Both save winner orderings and closing a tab before its response are covered.
