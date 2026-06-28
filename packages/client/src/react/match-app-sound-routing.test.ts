import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { describe, test } from "vitest";

describe("MatchApp sound routing", () => {
  test("routes interaction sounds through production handlers", async () => {
    const source = await readFile(new URL("MatchApp.tsx", import.meta.url), {
      encoding: "utf8",
    });

    assert.match(source, /playInteractionSound/u);
    assert.match(source, /boardCardClickInteractionCue/u);
    assert.match(source, /matchPresentationSoundOptions/u);
    assert.match(source, /playInteractionCue\("emptyClick", "board"\)/u);
    assert.match(source, /playInteractionCue\("select", `collection-card:/u);
    assert.match(source, /playInteractionCue\("select",/u);
    assert.match(source, /playInteractionCue\("confirm",/u);
  });

  test("passes the persisted sound volume into board presentation effects", async () => {
    const matchSource = await readFile(
      new URL("MatchApp.tsx", import.meta.url),
      { encoding: "utf8" },
    );
    const boardLayoutSource = await readFile(
      new URL("BoardLayout.tsx", import.meta.url),
      { encoding: "utf8" },
    );
    const effectsSource = await readFile(
      new URL(
        "presentation-effects/use-presentation-effects.ts",
        import.meta.url,
      ),
      { encoding: "utf8" },
    );

    assert.match(matchSource, /matchPresentationSoundOptions/u);
    assert.match(matchSource, /soundVolume=\{presentationSound\.volume\}/u);
    assert.match(boardLayoutSource, /soundVolume\?: number/u);
    assert.match(effectsSource, /volume: input\.soundVolume/u);
  });
});
