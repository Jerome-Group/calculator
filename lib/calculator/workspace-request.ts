import type { SavedState } from "./types";

export const MAX_WORKSPACE_REQUEST_BYTES = 1_800_000;
export const WORKSPACE_SIZE_ERROR =
  "Cloud save exceeds 1.8 MB. Export a backup and split large notebooks.";

export function serializeWorkspaceRequest(
  state: SavedState,
  revision: number,
  account: string,
): string {
  return JSON.stringify({ state, revision, account });
}
export function workspaceRequestFits(body: string): boolean {
  return (
    new TextEncoder().encode(body).byteLength <= MAX_WORKSPACE_REQUEST_BYTES
  );
}
