import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { EffectSpotlight } from "./EffectSpotlight.js";

const card = (): ClientCardModel => ({
  instanceId: "source-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Resolving Card",
  category: "Character",
  effectText: "[On Play] Draw 1 card.",
  effectTextSourceMap: {
    textKind: "effect",
    sourceText: "[On Play] Draw 1 card.",
    spans: [
      {
        id: "span:body:draw",
        role: "body",
        start: 10,
        end: 22,
        text: "Draw 1 card.",
      },
    ],
  },
  imageUrl: "https://example.test/card.png",
  attachedDonCount: 0,
  attachedDonCards: [],
});

describe("EffectSpotlight", () => {
  it("renders the resolving card text with active span highlights", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        card: card(),
        active: {
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP00-001" as CardId,
            playerId: "p1" as PlayerId,
          },
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
      }),
    );

    expect(html).toContain("effect-spotlight");
    expect(html).toContain("effect-spotlight-card");
    expect(html).toContain("effect-spotlight-card__rules");
    expect(html).toContain("Resolving Card");
    expect(html).toContain("effect-rules-span--active");
  });

  it("keeps a visible resolving shell when catalog text is missing", () => {
    const model = card();
    delete model.effectText;
    delete model.effectTextSourceMap;

    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        card: model,
        active: {
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP00-001" as CardId,
            playerId: "p1" as PlayerId,
          },
          textKind: "effect",
          activeSpanIds: ["span:body:draw"],
        },
      }),
    );

    expect(html).toContain("effect-spotlight");
    expect(html).toContain("Resolving Card");
  });
});
