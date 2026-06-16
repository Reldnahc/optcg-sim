import { describe, expect, it } from "vitest";

import type { CardId, CardRef, InstanceId, PlayerId } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { buildEffectSpotlightPresentation } from "./effect-spotlight-presentation.js";
import type { EffectTextSpotlightActiveSourceInput } from "./use-effect-spotlight-playback.js";

const ref = (
  instanceId: string,
  cardId: string,
  playerId: string = "p1",
): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  playerId: playerId as PlayerId,
});

const cardModel = (card: CardRef): ClientCardModel => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  name: `Card ${String(card.instanceId)}`,
  category: "Character",
  imageUrl: `https://example.test/${String(card.instanceId)}.png`,
  attachedDonCount: 0,
  attachedDonCards: [],
});

const effectEntry = (
  overrides: Partial<EffectTextSpotlightActiveSourceInput> = {},
): EffectTextSpotlightActiveSourceInput => ({
  kind: "effectText",
  key: "event:target",
  semanticKey: "effect|target",
  mode: "resolved",
  status: "resolved",
  active: {
    source: ref("source-1", "OP00-001"),
    activeSpanIds: ["span:body:ko"],
  },
  ...overrides,
});

describe("effect spotlight presentation", () => {
  it("builds targeting presentation from current active span target links", () => {
    const targetOne = ref("target-1", "OP00-002", "p2");
    const targetTwo = ref("target-2", "OP00-003", "p2");

    const presentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: effectEntry({
        active: {
          source: ref("source-1", "OP00-001"),
          activeSpanIds: ["span:body:ko"],
          targetLinks: [
            {
              spanId: "span:body:ko",
              relation: "selectedTarget",
              cards: [targetOne, targetTwo, targetOne],
            },
            {
              spanId: "span:body:draw",
              relation: "affectedCard",
              cards: [ref("unrelated-1", "OP00-004")],
            },
          ],
        },
      }),
    });

    expect(presentation?.kind).toBe("targeting");
    if (presentation?.kind !== "targeting") {
      return;
    }
    expect(presentation.sourceCard.name).toBe("Card source-1");
    expect(presentation.targetCards.map((card) => card.instanceId)).toEqual([
      "target-1",
      "target-2",
    ]);
    expect(presentation.label).toBe("targets");
  });

  it("keeps effect text presentation when no current target links exist", () => {
    const presentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: effectEntry(),
    });

    expect(presentation?.kind).toBe("effectText");
  });
});
