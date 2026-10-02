# ADR-0005: Patch expression and runtime dependencies

Status: Accepted

## Context

The imported lock contained known npm advisories. MathJS evaluates user expressions in graphs and reusable definitions. MathLive displays user-entered LaTeX. Their parser and markup vulnerabilities require patched versions, even though Calculator also restricts graph syntax. The built Worker uses React server rendering through Vinext; a development dependency classification alone does not exclude runtime use.

## Decision

Use MathJS 15.2.0, MathLive 0.110.0, aligned React/ReactDOM/RSC 19.2.8, Next and its ESLint config 16.3.6, and Vite 8.0.16. MathJS crosses a major boundary because both parser fixes have no patched 14.x release. Its 15.0 changes alter percent precedence and matrix operations. Calculator accepts percentage expressions in saved graphs and definitions, so a narrow, hash-pinned source patch restores the 14.8.1 percentage grammar in both shipped parsers. Object-property and matrix-index security fixes remain untouched. Regression cases compare legacy percentage/modulus behavior and verify the patched property boundaries alongside supported graph semantics.

Pin compatible transitive advisory fixes in the root pnpm workspace. Scope the legacy Drizzle loader's esbuild override to its consuming package and verify its transform API separately. Retain the seven-day release-age gate and strict build allowlist. Unrelated major dependency upgrades remain separate decisions.

## Consequences

Regression checks verify graph modes, definition reuse, degree/radian semantics and the patched library property boundaries. Build-time dependency preparation may fetch verified artifacts; the published calculator remains browser-local. An npm audit records the current advisory database's result, not proof that unknown vulnerabilities cannot exist.

References: [MathJS parser fixes](https://github.com/josdejong/mathjs/security/advisories/GHSA-29qv-4j9f-fjw5), [MathJS breaking changes](https://github.com/josdejong/mathjs/blob/v15.2.0/HISTORY.md), [MathLive markup fix](https://github.com/arnog/mathlive/security/advisories/GHSA-fm7p-gw32-828p), [React decoder fix](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g), [Next ImageResponse fix](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
