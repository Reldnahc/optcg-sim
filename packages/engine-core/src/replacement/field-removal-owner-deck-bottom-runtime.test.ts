import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectId,
  EffectQueueEntry,
  PlayerId,
  QueueEntryId,
  ReplacementTrigger,
  Target,
  TimingWindowId,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";
import {
  replacementPresentation,
  replacementSpotlightPayloads,
  stateWithPendingReplacementPresentation,
} from "./spotlight-test-support.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;

const sourceSnapshot = (
  card: CardInstance,
  controllerId: PlayerId,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId,
  zone: card.zone,
  category: "character",
  colors: ["red"],
  keywords: [],
  power: 5000,
});

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

test.each([
  { label: "direct pair", nested: false },
  { label: "nested sequence pair", nested: true },
])(
  "accepted opponent effect field-removal replacement places selected Character at owner deck bottom instead from $label",
  ({ nested }) => {
    const state = createActiveState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const sourceHand = must(p1State.hand[0], "source");
    const targetHand = must(p2State.hand[0], "target");
    const paymentHand = must(p2State.hand[1], "payment character");
    const selfRemovalSourceHand = must(
      p2State.hand[2],
      "self removal source character",
    );
    const source: CardInstance = {
      ...sourceHand,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    };
    const targetCardId = toCardId("effect-removal-owner-bottom-target");
    const targetCard: CardInstance = {
      ...targetHand,
      cardId: targetCardId,
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    };
    const paymentCard: CardInstance = {
      ...paymentHand,
      cardId: toCardId("effect-removal-owner-bottom-payment"),
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 1,
      },
      state: "active",
      attachedDon: [],
    };
    const selfRemovalSource: CardInstance = {
      ...selfRemovalSourceHand,
      cardId: toCardId("effect-removal-owner-bottom-self-source"),
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 2,
      },
      state: "active",
      attachedDon: [],
    };
    p1State.characters = [source];
    p1State.hand = p1State.hand.slice(1);
    p2State.characters = [targetCard, paymentCard, selfRemovalSource];
    p2State.hand = p2State.hand.slice(3);

    const replacementTarget: Target = {
      type: "all",
      zone: "characterArea",
      player: "self",
      filter: {
        categories: ["character"],
        power: { max: 7000 },
      },
    };
    const when: ReplacementTrigger = {
      type: "wouldMoveZone",
      from: "characterArea",
      sourceKind: "cardEffect",
      sourceControllerRelation: "opponentControlled",
      target: replacementTarget,
    };
    const effectId = toEffectId("replacement:effect-removal-owner-bottom");
    const effectDefinitionId = "definition:effect-removal-owner-bottom";
    state.cardManifest.cards[source.cardId] = resolvedCard({
      cardId: source.cardId,
      category: "character",
      power: 5000,
    });
    state.cardManifest.cards[targetCard.cardId] = resolvedCard({
      cardId: targetCard.cardId,
      category: "character",
      power: 7000,
      support: {
        status: "implemented-dsl",
        effectDefinitionId,
        rulesVersion: "replacement-rules",
        sourceTextHash: "replacement-source",
      },
    });
    state.cardManifest.cards[paymentCard.cardId] = resolvedCard({
      cardId: paymentCard.cardId,
      category: "character",
      power: 3000,
    });
    state.cardManifest.cards[selfRemovalSource.cardId] = resolvedCard({
      cardId: selfRemovalSource.cardId,
      category: "character",
      power: 5000,
    });
    const ownerDeckBottomInstead: Extract<Effect, { type: "sequence" }> = {
      type: "sequence",
      effects: [
        {
          id: "select:owner-deck-bottom",
          connector: "always",
          saveResultAs: "selected:owner-deck-bottom",
          effect: {
            type: "selectTargets",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zone: "characterArea",
              min: 1,
              max: 1,
              allowFewerIfUnavailable: false,
              visibility: "public",
              filter: { categories: ["character"] },
            },
          },
        },
        {
          connector: "then",
          effect: {
            type: "bounce",
            destination: "deckBottom",
            target: {
              type: "savedFieldObject",
              binding: {
                family: "selectedTargets",
                saveResultAs: "selected:owner-deck-bottom",
              },
              zone: "characterArea",
              player: "self",
              visibility: "publicOnly",
              onFailure: "failClosed",
            },
          },
        },
      ],
    };
    const instead: Extract<Effect, { type: "sequence" }> = nested
      ? {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: ownerDeckBottomInstead,
            },
          ],
        }
      : ownerDeckBottomInstead;
    const effectBlock: EffectDefinition["effects"][number] = {
      id: effectId,
      category: "replacement",
      trigger: { type: "replacement", replacement: when },
      optional: true,
      sourcePresencePolicy: "resolveFromLastKnownInformation",
      effect: {
        type: "replacement",
        when,
        instead,
      },
    };
    state.cardManifest.effectDefinitions = {
      [effectDefinitionId]: {
        cardId: targetCard.cardId,
        implementationStatus: "implemented-dsl",
        effects: [effectBlock],
        metadata: {
          sourceTextHash: "replacement-source",
          rulesVersion: "replacement-rules",
          effectDefinitionsVersion: state.cardManifest.effectDefinitionsVersion,
          tested: true,
          reviewedBy: "engine-reviewer",
          reviewedAt: "2026-06-05T00:00:00.000Z",
        },
      },
    };
    const entry: EffectQueueEntry = {
      id: toQueueEntryId("queue-entry-effect-removal-owner-bottom"),
      state: "pending",
      timingWindowId:
        "timing-window-effect-removal-owner-bottom" as TimingWindowId,
      generation: 0,
      controllerId: p1,
      source: cardRef(source, p1),
      sourceSnapshot: sourceSnapshot(source, p1),
      effectBlockId: toEffectId("ko-target-effect"),
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 0,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "field-removal-replacement-test" },
    };
    const selfRemovalEntry: EffectQueueEntry = {
      ...entry,
      id: toQueueEntryId("queue-entry-self-removal-owner-bottom"),
      controllerId: p2,
      source: cardRef(selfRemovalSource, p2),
      sourceSnapshot: sourceSnapshot(selfRemovalSource, p2),
    };

    const selfRemoval = executeSelectedTargetEffectPrimitive(
      structuredClone(state),
      selfRemovalEntry,
      {
        type: "ko",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      [cardRef(targetCard, p2)],
    );
    assert.equal(selfRemoval.state.pendingDecision, undefined);

    const paused = executeSelectedTargetEffectPrimitive(
      state,
      entry,
      {
        type: "ko",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
          },
        },
      },
      [cardRef(targetCard, p2)],
    );
    const replacementDecision = paused.state.pendingDecision;
    if (replacementDecision?.type !== "chooseReplacement") {
      assert.fail("expected chooseReplacement decision");
    }
    const replacementId = must(
      replacementDecision.replacementIds[0],
      "replacement id",
    );
    const accepted = applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: replacementDecision.id,
      response: { type: "replacement", replacementId },
    });
    const ownerDeckBottomDecision = accepted.state.pendingDecision;
    if (ownerDeckBottomDecision?.type !== "selectTargets") {
      assert.fail("expected owner deck-bottom replacement target decision");
    }

    const resolved = applyAction(
      stateWithPendingReplacementPresentation({
        state: accepted.state,
        pendingKey: "pendingReplacementOwnerDeckBottomInstead",
        presentation: replacementPresentation({
          source: cardRef(targetCard, p2),
          target: cardRef(paymentCard, p2),
        }),
      }),
      {
        type: "respondToDecision",
        decisionId: ownerDeckBottomDecision.id,
        response: { type: "targets", targets: [cardRef(paymentCard, p2)] },
      },
    );
    const nextP2 = must(resolved.state.players[p2], "next p2");

    assert.equal(resolved.errors, undefined);
    assert.equal(
      nextP2.characters.some(
        (card) => card.instanceId === targetCard.instanceId,
      ),
      true,
    );
    assert.equal(
      nextP2.characters.some(
        (card) => card.instanceId === paymentCard.instanceId,
      ),
      false,
    );
    assert.equal(
      must(nextP2.deck.at(-1), "deck-bottom payment card").instanceId,
      paymentCard.instanceId,
    );
    assert.equal(replacementSpotlightPayloads(resolved.events).length, 1);
  },
);
