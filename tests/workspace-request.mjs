import assert from "node:assert/strict";
import {
  MAX_WORKSPACE_REQUEST_BYTES,
  serializeWorkspaceRequest,
  workspaceRequestFits,
} from "../lib/calculator/workspace-request.ts";
import { validateState } from "../lib/calculator/storage.ts";
import { DEFAULT_SETTINGS, newNotebook } from "../lib/calculator/types.ts";
const book = newNotebook(),
  state = {
    version: 1,
    settings: DEFAULT_SETTINGS,
    active: book.id,
    notebooks: [book],
  };
book.history = Array.from({ length: 20 }, (_, i) => ({
  id: `e${i}`,
  operation: "evaluate",
  input: "1",
  mode: "text",
  params: {},
  settings: DEFAULT_SETTINGS,
  definitions: [],
  revision: 0,
  time: 1,
  result: { status: "exact", text: "", latex: "1", notes: [] },
}));
const bytes = (body) => new TextEncoder().encode(body).byteLength;
let available =
  MAX_WORKSPACE_REQUEST_BYTES - bytes(serializeWorkspaceRequest(state, 1, "a"));
for (const entry of book.history) {
  const size = Math.min(100000, available);
  entry.result.text = "x".repeat(size);
  available -= size;
}
assert.equal(available, 0);
assert.equal(
  bytes(serializeWorkspaceRequest(state, 1, "a")),
  MAX_WORKSPACE_REQUEST_BYTES,
);
assert(workspaceRequestFits(serializeWorkspaceRequest(state, 1, "a")));
assert(!workspaceRequestFits(serializeWorkspaceRequest(state, 10, "a")));
assert(!workspaceRequestFits(serializeWorkspaceRequest(state, 1, "😀")));
assert(validateState(state));
book.history.at(-1).result.text += "x";
assert(!workspaceRequestFits(serializeWorkspaceRequest(state, 1, "a")));
assert(validateState(state), "Legacy large local work must stay valid");
for (const entry of book.history) entry.result.text = "😀".repeat(25000);
const unicodeBody = serializeWorkspaceRequest(state, 1, "a");
assert(unicodeBody.length < MAX_WORKSPACE_REQUEST_BYTES);
assert(bytes(unicodeBody) > MAX_WORKSPACE_REQUEST_BYTES);
assert(
  !workspaceRequestFits(unicodeBody),
  "UTF8 bytes, not JS characters, determine the limit",
);
assert(validateState(state));
console.log(
  "Workspace request budget passed: full envelope, exact boundary, UTF8, legacy local state.",
);
