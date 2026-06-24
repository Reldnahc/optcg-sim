import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  EffectTextSpotlightHistoryEntry,
  SpotlightEntryCreatedPayload,
} from "@optcg/types";

import { applyAction } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1 } from "../../action-test-fixtures.js";
import { filterStateForPlayer } from "../../view/filter-state-for-player.js";

const authoredPendingSpotlights = (
  state: Parameters<typeof filterStateForPlayer>[0],
) =>
  state.eventJournal
    .filter((event) => event.type === "spotlightEntryCreated")
    .map((event) => event.payload as SpotlightEntryCreatedPayload)
    .filter(
      (
        payload,
      ): payload is SpotlightEntryCreatedPayload & {
        entry: EffectTextSpotlightHistoryEntry;
      } =>
        payload.entry.kind === undefined &&
        payload.entry.mode === "live" &&
        payload.entry.status === "pending",
    );

test("optional activate main prompt carries source effect spotlight", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-optional-spotlight");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-optional-spotlight",
    effectId,
    optional: true,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.presentation = {
    textKind: "effect",
    spanIds: ["span:body"],
  };
  const resolved = must(
    state.cardManifest.cards[leader.cardId],
    "leader metadata",
  );
  resolved.effectTextSourceMap = {
    textKind: "effect",
    sourceText: "[Activate: Main] Draw 1 card.",
    spans: [
      {
        id: "span:body",
        role: "body",
        start: 17,
        end: 29,
        text: "Draw 1 card.",
      },
    ],
  };

  const prompted = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  const view = filterStateForPlayer(prompted.state, p1);

  assert.equal(prompted.errors, undefined);
  assert.equal(view.pendingDecision?.type, "chooseOptionalActivation");
  const pendingSpotlight = must(
    authoredPendingSpotlights(prompted.state)[0],
    "pending spotlight",
  );
  assert.equal(
    pendingSpotlight.entry.pendingDecisionId,
    view.pendingDecision.spotlightPendingId,
  );
  assert.deepEqual(pendingSpotlight.entry.active.activeSpanIds, ["span:body"]);
  assert.deepEqual(view.pendingDecision.presentation.activeEffectText, {
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    textKind: "effect",
    activeSpanIds: ["span:body"],
  });
});

test("activate main pay cost decision narrows spotlight to cost spans", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-sequence-pay-cost-spotlight");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-sequence-pay-cost-spotlight",
    effectId,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "activate-main-pay-cost",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "chooseOne",
            optional: true,
            options: [
              {
                type: "trashFromField",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { categories: ["character"], typesAny: ["Navy"] },
              },
              {
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
              },
            ],
          },
        },
      },
      {
        id: "activate-main-if-you-do-draw",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };
  effectBlock.presentation = {
    textKind: "effect",
    spanIds: ["span:cost:optional", "span:sequence:1:body"],
  };
  const resolved = must(
    state.cardManifest.cards[leader.cardId],
    "leader metadata",
  );
  resolved.effectTextSourceMap = {
    textKind: "effect",
    sourceText: "[Activate: Main] You may trash 1 card: Draw 1 card.",
    spans: [
      {
        id: "span:cost:optional",
        role: "cost",
        start: 17,
        end: 38,
        text: "You may trash 1 card:",
      },
      {
        id: "span:sequence:1:body",
        role: "body",
        start: 39,
        end: 51,
        text: "Draw 1 card.",
        effectPath: ["effect", "sequence"],
        sequenceIndex: 1,
      },
    ],
  };

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  const view = filterStateForPlayer(result.state, p1);

  assert.equal(result.errors, undefined);
  const pendingSpotlight = must(
    authoredPendingSpotlights(result.state)[0],
    "pay-cost pending spotlight",
  );
  assert.equal(
    pendingSpotlight.entry.pendingDecisionId,
    view.pendingDecision?.spotlightPendingId,
  );
  assert.deepEqual(pendingSpotlight.entry.active.activeSpanIds, [
    "span:cost:optional",
  ]);
  assert.deepEqual(view.pendingDecision?.presentation.activeEffectText, {
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    textKind: "effect",
    activeSpanIds: ["span:cost:optional"],
  });
});
