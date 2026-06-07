import { describe, expect, test } from "vitest";
import type { EffectTextSourceMap } from "@optcg/types";

import {
  activeSpanIdsForCost,
  activeSpanIdsForEffectPath,
  activeSpanIdsForSearchRevealRemaining,
  activeSpanIdsForSequenceIndex,
  activeSpanIdsWithoutCost,
} from "./runtime/effect-presentation.js";

describe("runtime effect presentation refs", () => {
  test("resolves sequence effect paths to parser span ids", () => {
    const sourceMap: EffectTextSourceMap = {
      textKind: "effect",
      sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
      spans: [
        {
          id: "span:sequence:1:body",
          role: "body",
          start: 35,
          end: 64,
          text: "K.O. up to 1 Character.",
          effectPath: ["effect", "sequence"],
          sequenceIndex: 1,
        },
      ],
    };

    const ids = activeSpanIdsForEffectPath({
      sourceMap,
      effectPath: ["effect", "sequence"],
      sequenceIndex: 1,
    });

    expect(ids).toEqual(["span:sequence:1:body"]);
  });

  test("narrows active span ids by shared presentation phases", () => {
    const ids = [
      "span:cost:optional",
      "span:sequence:1:body",
      "span:search:remaining",
    ] as const;

    expect(activeSpanIdsForCost(ids)).toEqual(["span:cost:optional"]);
    expect(activeSpanIdsWithoutCost(ids)).toEqual([
      "span:sequence:1:body",
      "span:search:remaining",
    ]);
    expect(activeSpanIdsForSequenceIndex(ids, 1)).toEqual([
      "span:sequence:1:body",
    ]);
    expect(activeSpanIdsForSearchRevealRemaining(ids)).toEqual([
      "span:search:remaining",
    ]);
    expect(activeSpanIdsForSequenceIndex(ids, 0)).toBeUndefined();
  });
});
