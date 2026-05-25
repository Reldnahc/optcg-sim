import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

describe("default dev manifest boundary", () => {
  test("does not compile card text or read card fixtures in match-server", async () => {
    const source = await readFile(
      new URL("./default-dev-manifest.ts", import.meta.url),
      "utf8",
    );

    assert.equal(source.includes("parseCardEffectLineDetailed"), false);
    assert.equal(source.includes("evaluateEffectBlockRuntimeSupport"), false);
    assert.equal(source.includes("readFileSync"), false);
    assert.equal(source.includes("fixtures/poneglyph/cards"), false);
  });
});
