import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const store = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } satisfies Storage,
});

afterEach(() => {
  cleanup();
  store.clear();
  if (typeof window !== "undefined" && window.history?.replaceState) {
    window.history.replaceState(null, "", "/");
  }
});
