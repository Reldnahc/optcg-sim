import { expect, test } from "vitest";

test("index.ts is a pure public barrel of concern modules", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./index.ts", import.meta.url), "utf8"),
  );

  expect(source).toContain('export type * from "./primitives.js";');
  expect(source).toContain('export type * from "./card-metadata.js";');
  expect(source).toContain('export type * from "./events.js";');
  expect(source).toContain('export type * from "./effects.js";');
  expect(source).toContain('export type * from "./decisions.js";');
  expect(source).toContain('export type * from "./runtime.js";');
  expect(source).toContain('export type * from "./game-state.js";');
  expect(source).not.toMatch(/\binterface\b|\btype\s+[A-Za-z0-9_]+\s*=/);
});

test("runtime entrypoint exposes no value exports", async () => {
  const moduleNamespace = await import("./index.js");
  expect(Object.keys(moduleNamespace)).toEqual([]);
});
