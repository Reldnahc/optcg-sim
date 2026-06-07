import { expect, test } from "vitest";

import type {
  ActiveEffectTextPresentation,
  EffectTextSourceMap,
  EffectTextSpan,
  EffectTextTargetLink,
} from "./effect-presentation.js";
import type { CardId, CardRef, InstanceId, PlayerId } from "./index.js";

test("effect presentation source map describes exact original text ranges", () => {
  const span: EffectTextSpan = {
    id: "span:sequence:1:body",
    role: "body",
    start: 35,
    end: 64,
    text: "K.O. up to 1 Character.",
    primitiveEvidence: ["instruction:ko"],
    effectPath: ["effect", "sequence"],
    sequenceIndex: 1,
  };
  const map: EffectTextSourceMap = {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
    spans: [span],
  };

  expect(map.spans[0]?.start).toBe(35);
  expect(map.spans[0]?.end).toBe(64);
});

test("active presentation links public targets to exact span ids", () => {
  const target: CardRef = {
    instanceId: "target-1" as InstanceId,
    cardId: "OP00-001" as CardId,
    playerId: "p2" as PlayerId,
  };
  const link: EffectTextTargetLink = {
    spanId: "span:sequence:1:body",
    cards: [target],
    relation: "selectedTarget",
  };
  const active: ActiveEffectTextPresentation = {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-002" as CardId,
      playerId: "p1" as PlayerId,
    },
    activeSpanIds: ["span:sequence:1:body"],
    targetLinks: [link],
  };

  expect(active.targetLinks?.[0]?.cards[0]?.instanceId).toBe("target-1");
});
