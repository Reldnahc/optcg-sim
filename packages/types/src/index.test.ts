import { expect, test } from "vitest";

test("types package entrypoint is importable in the shared Vitest baseline", async () => {
  const moduleNamespace = await import("./index.js");

  expect(Object.keys(moduleNamespace)).toEqual([]);
});
