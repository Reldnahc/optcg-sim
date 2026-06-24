import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { strict as assert } from "node:assert";

const sourceDirectory = fileURLToPath(new URL(".", import.meta.url));

describe("card-support public runtime boundary", () => {
  test("does not export TypeScript-backed tooling from the package index", async () => {
    const source = await readFile(join(sourceDirectory, "index.ts"), "utf8");

    assert.equal(source.includes("engine-primitive-inventory"), false);
    assert.equal(source.includes("behavior-coverage-cli"), false);
  });
});
