import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import { activeEffectTextPresentationFromPayloadValue } from "./presentation-payload.js";

const cardRef = (input: {
  readonly cardId: string;
  readonly instanceId: string;
  readonly playerId: string;
}) => ({
  cardId: input.cardId as CardId,
  instanceId: input.instanceId as InstanceId,
  playerId: input.playerId as PlayerId,
});

test("replacement presentation payload parsing preserves target links", () => {
  const spanId = "span:replacement" as EffectTextSpanId;
  const source = cardRef({
    cardId: "OP00-001",
    instanceId: "source-1",
    playerId: "p1",
  });
  const target = cardRef({
    cardId: "OP00-002",
    instanceId: "target-1",
    playerId: "p2",
  });

  const presentation = activeEffectTextPresentationFromPayloadValue({
    source,
    textKind: "effect",
    activeSpanIds: [spanId],
    targetLinks: [
      {
        spanId,
        relation: "affectedCard",
        cards: [target],
      },
    ],
  });

  assert.deepEqual(presentation?.targetLinks, [
    {
      spanId,
      relation: "affectedCard",
      cards: [target],
    },
  ]);
});
