import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  key: (index) => [...values.keys()][index] ?? null,
  get length() {
    return values.size;
  },
};
globalThis.localStorage = storage;
globalThis.window = { dispatchEvent() {}, addEventListener() {} };
globalThis.CustomEvent = class {
  constructor(type, options) {
    this.type = type;
    this.detail = options.detail;
  }
};
Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true, serviceWorker: {} },
  configurable: true,
});
globalThis.fetch = async () =>
  Response.json({
    user: { id: "test-account", name: "Test" },
    state: null,
    revision: 0,
  });
const { initializeAccount, forgetAccount } = await import(
  "../lib/calculator/sync.ts"
);
const {
  validateState,
  loadState,
  persist,
  accountStorage,
  STORAGE_KEY,
  BACKUP_KEY,
} = await import("../lib/calculator/storage.ts");
const { newNotebook, DEFAULT_SETTINGS } = await import(
  "../lib/calculator/types.ts"
);
await initializeAccount();
navigator.onLine = false;
const key = accountStorage(STORAGE_KEY),
  backup = accountStorage(BACKUP_KEY);
const book = newNotebook();
const first = {
  version: 1,
  notebooks: [book],
  active: book.id,
  settings: DEFAULT_SETTINGS,
};
persist(first);
const second = structuredClone(first);
second.notebooks[0].definitions.push({
  id: "a",
  name: "A",
  expression: "Matrix([[1,2],[3,4]])",
  kind: "matrix",
  updated: 1,
});
persist(second);
assert.deepEqual(loadState().state, second);
assert.deepEqual(validateState(JSON.parse(JSON.stringify(second))), second);
const invalid = structuredClone(second);
invalid.notebooks[0].definitions.push({
  ...invalid.notebooks[0].definitions[0],
});
assert.throws(() => validateState(invalid));
values.set(key, "{broken");
const recovered = loadState();
assert.deepEqual(recovered.state, first);
assert(recovered.warning);
assert.equal(values.get(key), "{broken");
values.delete(backup);
assert.equal(loadState().state, null);
assert.equal(values.get(key), "{broken");
globalThis.localStorage = {
  ...storage,
  setItem() {
    throw Error("Quota exceeded");
  },
};
assert.throws(() => persist(second), /Quota/);
assert.equal(values.get(key), "{broken");
globalThis.localStorage = storage;
forgetAccount();
assert.throws(() => accountStorage(STORAGE_KEY), /Sign in/);
assert.equal(values.get(key), "{broken");
console.log(
  "Account-scoped persistence, duplicate rejection, previous-state recovery, corrupt-state preservation, quota failure and sign-out passed.",
);
