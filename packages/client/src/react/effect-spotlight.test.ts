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

const reminderCard = (): ClientCardModel => {
  const effectText =
    "[On Play] Up to 1 of your Characters gains [Unblockable] during this turn. (This card cannot be blocked.)";
  return {
    ...card(),
    effectText,
    effectTextSourceMap: {
      textKind: "effect",
      sourceText: effectText,
      spans: [
        {
          id: "span:body:unblockable",
          role: "body",
          start: 10,
          end: effectText.length,
          text: effectText.slice(10),
        },
      ],
    },
  };
};

const multilineCard = (effectText: string): ClientCardModel => ({
  ...card(),
  effectText,
  effectTextSourceMap: {
    textKind: "effect",
    sourceText: effectText,
    spans: [
      {
        id: "span:body:multiline",
        role: "body",
        start: 10,
        end: effectText.length,
        text: effectText.slice(10),
      },
    ],
  },
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

  it("omits parenthetical reminder text without losing active span highlights", () => {
    const html = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        card: reminderCard(),
        active: {
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP00-001" as CardId,
            playerId: "p1" as PlayerId,
          },
          textKind: "effect",
          activeSpanIds: ["span:body:unblockable"],
        },
      }),
    );

    expect(html).toContain("Unblockable");
    expect(html).not.toContain("This card cannot be blocked.");
    expect(html).toContain("effect-rules-span--active");
  });

  it("preserves source newlines without breaking same-line Then text", () => {
    const withSourceNewline = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        card: multilineCard("[On Play] Draw 1 card.\nThen, K.O. 1 Character."),
        active: {
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP00-001" as CardId,
            playerId: "p1" as PlayerId,
          },
          textKind: "effect",
          activeSpanIds: ["span:body:multiline"],
        },
      }),
    );
    const sameLineThen = renderToStaticMarkup(
      createElement(EffectSpotlight, {
        card: multilineCard("[On Play] Draw 1 card. Then, K.O. 1 Character."),
        active: {
          source: {
            instanceId: "source-1" as InstanceId,
            cardId: "OP00-001" as CardId,
            playerId: "p1" as PlayerId,
          },
          textKind: "effect",
          activeSpanIds: ["span:body:multiline"],
        },
      }),
    );

    expect(withSourceNewline).toContain("<br/>");
    expect(sameLineThen).not.toContain("<br/>");
  });
});
