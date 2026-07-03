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

const fieldRef = (
  instanceId: string,
  cardId: string,
  playerId: string,
  slot: "leader" | "character",
): CardRef => ({
  ...ref(instanceId, cardId, playerId),
  zone: {
    zone: slot === "leader" ? "leaderArea" : "characterArea",
    playerId: playerId as PlayerId,
    slot,
    index: 0,
  },
});

const cardModel = (card: CardRef): ClientCardModel => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  name: `Card ${String(card.instanceId)}`,
  category: card.zone?.slot === "leader" ? "Leader" : "Character",
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
  it("covers representative authored spotlight families for client presentation", () => {
    const cases = [
      {
        name: "effect text",
        entry: effectEntry(),
        expectedKind: "effectText",
        expectedRelation: undefined,
      },
      {
        name: "effect target link",
        entry: effectEntry({
          active: {
            source: ref("source-1", "OP00-001"),
            activeSpanIds: ["span:body:ko"],
            targetLinks: [
              {
                spanId: "span:body:ko",
                relation: "selectedTarget",
                cards: [ref("target-1", "OP00-002", "p2")],
              },
            ],
          },
        }),
        expectedKind: "cardLink",
        expectedRelation: "targets",
      },
      {
        name: "attack",
        entry: combatEntry(),
        expectedKind: "cardLink",
        expectedRelation: "attacks",
      },
      {
        name: "counter",
        entry: combatEntry({
          eventKind: "counterUsed",
          source: ref("counter-1", "OP00-040", "p2"),
          target: ref("target-1", "OP00-041", "p2"),
          counterPower: 1000,
        }),
        expectedKind: "cardLink",
        expectedRelation: "counters",
      },
      {
        name: "life damage",
        entry: combatEntry({
          eventKind: "damageDealt",
          attacker: fieldRef("attacker-1", "OP00-010", "p1", "character"),
          defender: fieldRef("leader-1", "OP00-001", "p2", "leader"),
          attackerPower: 7000,
          defenderPower: 5000,
          amount: 1,
        }),
        expectedKind: "cardLink",
        expectedRelation: "damages",
      },
      {
        name: "battle ko",
        entry: combatEntry({
          eventKind: "battleKOd",
          attacker: fieldRef("attacker-1", "OP00-010", "p1", "character"),
          defender: fieldRef("defender-1", "OP00-020", "p2", "character"),
          attackerPower: 7000,
          defenderPower: 5000,
        }),
        expectedKind: "cardLink",
        expectedRelation: "K.O.s",
      },
      {
        name: "played card",
        entry: playedCardEntry(),
        expectedKind: "cardLink",
        expectedRelation: "played",
      },
    ] as const;

    for (const item of cases) {
      const presentation = buildEffectSpotlightPresentation({
        cardModel,
        entry: item.entry,
      });

      expect(presentation?.kind, item.name).toBe(item.expectedKind);
      if (item.expectedRelation !== undefined) {
        expect(
          presentation?.kind === "cardLink"
            ? presentation.relationLabel
            : undefined,
          item.name,
        ).toBe(item.expectedRelation);
      }
    }
  });

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

  it("labels counter and combat damage spotlights by their combat role", () => {
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

    const characterKoPresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry({
        eventKind: "battleKOd",
        attacker: fieldRef("attacker-1", "OP00-010", "p1", "character"),
        defender: fieldRef("defender-1", "OP00-020", "p2", "character"),
        attackerPower: 7000,
        defenderPower: 5000,
      }),
    });

    expect(characterKoPresentation?.kind).toBe("cardLink");
    if (characterKoPresentation?.kind !== "cardLink") {
      return;
    }
    expect(characterKoPresentation.relationLabel).toBe("K.O.s");
    expect(characterKoPresentation.sourcePower).toBe(7000);
    expect(characterKoPresentation.relatedPowers).toEqual([5000]);

    const legacyCharacterDamagePresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry({
        eventKind: "damageDealt",
        attacker: fieldRef("attacker-1", "OP00-010", "p1", "character"),
        defender: fieldRef("defender-1", "OP00-020", "p2", "character"),
        attackerPower: 7000,
        defenderPower: 5000,
        amount: 1,
      }),
    });

    expect(legacyCharacterDamagePresentation?.kind).toBe("cardLink");
    if (legacyCharacterDamagePresentation?.kind !== "cardLink") {
      return;
    }
    expect(legacyCharacterDamagePresentation.relationLabel).toBe("K.O.s");

    const leaderDamagePresentation = buildEffectSpotlightPresentation({
      cardModel,
      entry: combatEntry({
        eventKind: "damageDealt",
        attacker: fieldRef("attacker-1", "OP00-010", "p1", "character"),
        defender: fieldRef("leader-1", "OP00-001", "p2", "leader"),
        attackerPower: 7000,
        defenderPower: 5000,
        amount: 1,
      }),
    });

    expect(leaderDamagePresentation?.kind).toBe("cardLink");
    if (leaderDamagePresentation?.kind !== "cardLink") {
      return;
    }
    expect(leaderDamagePresentation.relationLabel).toBe("damages");
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
