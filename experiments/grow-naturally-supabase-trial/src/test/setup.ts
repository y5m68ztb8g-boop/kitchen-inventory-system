import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

const memoryStorage = new Map<string, string>();

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => memoryStorage.clear(),
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      removeItem: (key: string) => memoryStorage.delete(key),
      setItem: (key: string, value: string) => memoryStorage.set(key, value)
    }
  });
}

afterEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    window.location.hash = "";
  }
});
