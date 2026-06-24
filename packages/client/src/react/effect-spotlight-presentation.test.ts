import { describe, expect, it } from "vitest";

import type {
  CardId,
  CardRef,
  EngineEventId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { buildEffectSpotlightPresentation } from "./effect-spotlight-presentation.js";
import type {
  CombatSpotlightActiveSourceInput,
  EffectTextSpotlightActiveSourceInput,
  PlayedCardSpotlightActiveSourceInput,
} from "./use-effect-spotlight-playback.js";

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
  id: "spotlight:effect:event:target:0",
  key: "event:target",
  semanticKey: "effect|target",
  mode: "resolved",
  status: "resolved",
  resolvedEventId: "event:target" as EngineEventId,
  active: {
    source: ref("source-1", "OP00-001"),
    activeSpanIds: ["span:body:ko"],
  },
  ...overrides,
});

const combatEntry = (
  combat: CombatSpotlightActiveSourceInput["combat"] = {
    eventKind: "attackDeclared",
    attacker: ref("attacker-1", "OP00-010", "p1"),
    defender: ref("defender-1", "OP00-020", "p2"),
    attackerPower: 7000,
    defenderPower: 5000,
  },
): CombatSpotlightActiveSourceInput => ({
  kind: "combat",
  id: "spotlight:combat:event:combat:0",
  key: "event:combat",
  semanticKey: "combat|attack",
  mode: "resolved",
  status: "resolved",
  resolvedEventId: "event:combat" as EngineEventId,
  combat,
});

const playedCardEntry = (): PlayedCardSpotlightActiveSourceInput => ({
  kind: "playedCard",
  id: "spotlight:played:event:played:0",
  key: "event:played",
  semanticKey: "playedCard|event:played",
  mode: "resolved",
  status: "resolved",
  resolvedEventId: "event:played" as EngineEventId,
  source: ref("played-1", "OP00-030", "p1"),
});

describe("effect spotlight presentation", () => {
  it("normalizes combat and targeting spotlights into linked card presentations", () => {
    const combatPresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry(),
    });

    expect(combatPresentation?.kind).toBe("cardLink");
    if (combatPresentation?.kind !== "cardLink") {
      return;
    }
    expect(combatPresentation.sourceCard.name).toBe("Card attacker-1");
    expect(
      combatPresentation.relatedCards.map((card) => card.instanceId),
    ).toEqual(["defender-1"]);
    expect(combatPresentation.relationLabel).toBe("attacks");
    expect(combatPresentation.sourcePower).toBe(7000);
    expect(combatPresentation.relatedPowers).toEqual([5000]);
  });

  it("labels counter and damage combat spotlights by their combat role", () => {
    const counterPresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry({
        eventKind: "counterUsed",
        source: ref("counter-1", "OP00-040", "p2"),
        target: ref("target-1", "OP00-041", "p2"),
        counterPower: 1000,
      }),
    });

    expect(counterPresentation?.kind).toBe("cardLink");
    if (counterPresentation?.kind !== "cardLink") {
      return;
    }
    expect(counterPresentation.sourceCard.name).toBe("Card counter-1");
    expect(
      counterPresentation.relatedCards.map((card) => card.instanceId),
    ).toEqual(["target-1"]);
    expect(counterPresentation.relationLabel).toBe("counters");
    expect(counterPresentation.sourcePower).toBe(1000);
    expect(counterPresentation.relatedPowers).toBeUndefined();

    const damagePresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry({
        eventKind: "damageDealt",
        attacker: ref("attacker-1", "OP00-010", "p1"),
        defender: ref("defender-1", "OP00-020", "p2"),
        attackerPower: 7000,
        defenderPower: 5000,
        amount: 1,
      }),
    });

    expect(damagePresentation?.kind).toBe("cardLink");
    if (damagePresentation?.kind !== "cardLink") {
      return;
    }
    expect(damagePresentation.relationLabel).toBe("damages");
    expect(damagePresentation.sourcePower).toBe(7000);
    expect(damagePresentation.relatedPowers).toEqual([5000]);
  });

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

    expect(presentation?.kind).toBe("cardLink");
    if (presentation?.kind !== "cardLink") {
      return;
    }
    expect(presentation.sourceCard.name).toBe("Card source-1");
    expect(presentation.relatedCards.map((card) => card.instanceId)).toEqual([
      "target-1",
      "target-2",
    ]);
    expect(presentation.relationLabel).toBe("targets");
  });

  it("keeps effect text presentation when no current target links exist", () => {
    const presentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: effectEntry(),
    });

    expect(presentation?.kind).toBe("effectText");
  });

  it("builds targeting presentation when current target links point at the source", () => {
    const sourceCard = ref("source-1", "OP00-001");
    const presentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: effectEntry({
        active: {
          source: sourceCard,
          activeSpanIds: ["span:body:ko"],
          targetLinks: [
            {
              spanId: "span:body:ko",
              relation: "selectedTarget",
              cards: [sourceCard],
            },
          ],
        },
      }),
    });

    expect(presentation?.kind).toBe("cardLink");
    if (presentation?.kind !== "cardLink") {
      return;
    }
    expect(presentation.sourceCard.name).toBe("Card source-1");
    expect(presentation.relatedCards.map((card) => card.instanceId)).toEqual([
      "source-1",
    ]);
    expect(presentation.relationLabel).toBe("targets");
  });

  it("builds a card-play fallback from structured played-card entries", () => {
    const presentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: playedCardEntry(),
    });

    expect(presentation?.kind).toBe("cardLink");
    if (presentation?.kind !== "cardLink") {
      return;
    }
    expect(presentation.active).toBeUndefined();
    expect(presentation.sourceCard.name).toBe("Card played-1");
    expect(presentation.relatedCards).toEqual([]);
    expect(presentation.relationLabel).toBe("played");
  });
});
