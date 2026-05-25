import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

describe("OP13 dev manifest boundary", () => {
  test("does not compile card text or read card fixtures in match-server", async () => {
    const source = await readFile(
      new URL("./op13-dev-manifest.ts", import.meta.url),
      "utf8",
    );

    assert.equal(source.includes("parseCardEffectLineDetailed"), false);
    assert.equal(source.includes("evaluateEffectBlockRuntimeSupport"), false);
    assert.equal(source.includes("readFileSync"), false);
    assert.equal(source.includes("fixtures/poneglyph/cards"), false);
  });
});
