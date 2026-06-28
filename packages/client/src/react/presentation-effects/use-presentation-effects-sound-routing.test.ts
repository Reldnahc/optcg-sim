import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

describe("presentation effects sound routing", () => {
  test("merges movement, event, and attention sound intents", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-presentation-effects.ts"),
      "utf8",
    );

    assert.match(source, /planSoundIntents/u);
    assert.match(source, /planEventSoundIntents/u);
    assert.match(source, /planAttentionSoundIntent/u);
    assert.match(source, /\.\.\.movementSoundIntents/u);
    assert.match(source, /\.\.\.eventSoundIntents/u);
    assert.match(source, /\.\.\.attentionSoundIntents/u);
  });
});
