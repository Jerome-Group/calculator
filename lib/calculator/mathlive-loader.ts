let pending: Promise<typeof import("mathlive")> | undefined;

export function loadMathLive(): Promise<typeof import("mathlive")> {
  if (pending) return pending;
  let evaluating = false;
  pending = (async () => {
    const emitted = new URL(
      "../../node_modules/mathlive/mathlive.min.mjs",
      import.meta.url,
    );
    // Command-line conversion checks use the pinned package's server entry.
    if (typeof window === "undefined") {
      evaluating = true;
      const server = new URL("mathlive-ssr.min.mjs", emitted).href;
      return import(/* @vite-ignore */ server);
    }
    // Vinext can retain a server file base while emitting a browser asset path.
    const asset = new URL(
      emitted.pathname + emitted.search,
      window.location.origin,
    );
    const response = await fetch(asset);
    if (!response.ok) throw Error("Math editor download failed");
    const source = await response.text();
    const url = URL.createObjectURL(
      new Blob([source, "\n//# sourceURL=", asset.href], {
        type: "text/javascript",
      }),
    );
    // Fetch failures remain retryable without poisoning the browser module map.
    // Once evaluation starts, retain its result to avoid duplicate side effects.
    evaluating = true;
    try {
      return await import(/* @vite-ignore */ url);
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch((error: unknown) => {
    if (!evaluating) pending = undefined;
    throw error;
  });
  return pending;
}
