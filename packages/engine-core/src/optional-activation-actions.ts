import type {
  Action,
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  QueueEntryId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { reindexZoneCards, zonesEqual } from "./action-state.js";
import {
  processEffectRuntimeAfterOptionalActivationAccept,
  processEffectRuntimeAfterOptionalActivationDecline,
} from "./effect-runtime.js";
import {
  getSequencePayCostLegalActions,
  hasSequenceFrameForDecision,
} from "./effect-runtime-sequence-frame-decisions.js";
import {
  resumeSequenceFrameAfterOptionalActivation,
  resumeSequenceFrameAfterOptionalCost,
} from "./effect-runtime-sequence-frames.js";
import {
  applyReturnDonPayment,
  getReturnDonEligibleInstanceIds,
} from "./effect-runtime-return-don.js";
import { createSupportedTrashFromHandChoiceDecision } from "./effect-runtime-trash-from-hand.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const sameSource = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined &&
      right.zone !== undefined &&
      zonesEqual(left.zone, right.zone)));

const orderedCurrentChoiceGroupIds = (
  state: GameState,
  selected: GameState["effectQueue"][number],
): readonly QueueEntryId[] | undefined => {
  const groupIds = state.effectQueue
    .filter(
      (entry) =>
        entry.state === "pending" &&
        entry.timingWindowId === selected.timingWindowId &&
        entry.generation === selected.generation &&
        entry.controllerId === selected.controllerId &&
        entry.orderingGroup === selected.orderingGroup,
    )
    .map((entry) => entry.id);
  return groupIds.length > 1 ? groupIds : undefined;
};

const orderedRemainingChoiceGroupIdsAfterDecline = (
  state: GameState,
  selected: GameState["effectQueue"][number],
): readonly QueueEntryId[] | undefined => {
  const ordered = orderedCurrentChoiceGroupIds(state, selected);
  if (ordered === undefined) {
    return undefined;
  }
  const remaining = ordered.filter((id) => id !== selected.id);
  return remaining.length > 1 ? remaining : undefined;
};

const toTrashCard = (
  card: CardInstance,
  playerId: PlayerId,
  index: number,
): CardInstance => ({
  ...card,
  attachedDon: [],
  zone: { zone: "trash", playerId, slot: "trash", index },
});

export const applyOptionalActivationDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return null;
  }
  if (
    decision.type === "payCost" &&
    hasSequenceFrameForDecision(state, decision.id)
  ) {
    if (
      action.response.type !== "payment" &&
      action.response.type !== "paymentDeclined"
    ) {
      return toEngineResult(
        state,
        [],
        invalidDecision(
          "Response type must be payment or paymentDeclined for payCost.",
        ),
      );
    }
    const player = state.players[decision.playerId];
    if (
      player === undefined ||
      (decision.cost.type !== "restDon" &&
        decision.cost.type !== "returnDon" &&
        decision.cost.type !== "trashFromHand")
    ) {
      return toEngineResult(
        state,
        [],
        invalidDecision("payCost decision is stale for current effect frame."),
      );
    }

    const events: EngineEvent[] = [];
    let paidCost = false;
    let nextPlayer = player;
    if (action.response.type === "payment") {
      if (action.response.optionId !== decision.cost.type) {
        return toEngineResult(
          state,
          [],
          invalidDecision("Payment option mismatch."),
        );
      }
      let costPaidPayload:
        | {
            playerId: PlayerId;
            optionId: "restDon" | "returnDon";
            selectedDonInstanceIds: NonNullable<
              typeof action.response.selectedDonInstanceIds
            >;
          }
        | {
            playerId: PlayerId;
            optionId: "trashFromHand";
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          };
      if (decision.cost.type === "trashFromHand") {
        if (action.response.selectedDonInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection must not include DON!!."),
          );
        }
        const selected = action.response.selectedCardInstanceIds;
        if (selected === undefined || selected.length !== decision.cost.count) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection count mismatch."),
          );
        }
        if (new Set(selected).size !== selected.length) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection contains duplicates."),
          );
        }
        const selectedCards: CardInstance[] = [];
        for (const selectedId of selected) {
          const card = player.hand.find(
            (candidate) => candidate.instanceId === selectedId,
          );
          if (card === undefined) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment card selection is invalid."),
            );
          }
          selectedCards.push(card);
        }
        const selectedSet = new Set(selected);
        const trashedCards = selectedCards.map((card, index) =>
          toTrashCard(card, decision.playerId, index),
        );
        nextPlayer = {
          ...player,
          hand: reindexZoneCards(
            player.hand.filter((card) => !selectedSet.has(card.instanceId)),
            "hand",
            decision.playerId,
            "hand",
          ),
          trash: reindexZoneCards(
            [...trashedCards, ...player.trash],
            "trash",
            decision.playerId,
            "trash",
          ),
        };
        for (const selectedCard of selectedCards) {
          appendEvent(
            state,
            events,
            "cardMoved",
            {
              from: "hand",
              to: "trash",
              playerId: decision.playerId,
              reason: "trashFromHand",
            },
            { type: "public" },
          );
          const moved = events[events.length - 1];
          if (moved !== undefined) {
            moved.causedBy = { type: "decision", decisionId: decision.id };
          }
          appendEvent(
            state,
            events,
            "cardTrashed",
            {
              playerId: decision.playerId,
              instanceId: selectedCard.instanceId,
              cardId: selectedCard.cardId,
              reason: "trashFromHand",
            },
            { type: "public" },
          );
          const trashed = events[events.length - 1];
          if (trashed !== undefined) {
            trashed.causedBy = { type: "decision", decisionId: decision.id };
          }
        }
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: decision.cost.type,
          selectedCardInstanceIds: selected,
        };
      } else {
        if (action.response.selectedCardInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment DON!! selection must not include cards."),
          );
        }
        const selected = action.response.selectedDonInstanceIds;
        if (selected === undefined || selected.length !== decision.cost.count) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment DON!! selection count mismatch."),
          );
        }
        if (new Set(selected).size !== selected.length) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment DON!! selection contains duplicates."),
          );
        }
        if (decision.cost.type === "restDon") {
          const costAreaById = new Map(
            player.costArea.map((card) => [card.instanceId, card]),
          );
          for (const donId of selected) {
            const don = costAreaById.get(donId);
            if (don === undefined || don.state !== "active") {
              return toEngineResult(
                state,
                [],
                invalidDecision("Payment DON!! selection is invalid."),
              );
            }
          }
          const restedSet = new Set(selected);
          nextPlayer = {
            ...player,
            costArea: player.costArea.map((card) =>
              restedSet.has(card.instanceId)
                ? { ...card, state: "rested" as const }
                : card,
            ),
          };
        } else {
          const eligibleIds = new Set(getReturnDonEligibleInstanceIds(player));
          for (const donId of selected) {
            if (!eligibleIds.has(donId)) {
              return toEngineResult(
                state,
                [],
                invalidDecision("Payment DON!! selection is invalid."),
              );
            }
          }
          const returned = applyReturnDonPayment({
            player,
            playerId: decision.playerId,
            selectedDonIds: selected,
          });
          if (returned === null) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment DON!! selection is invalid."),
            );
          }
          nextPlayer = returned;
        }
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: decision.cost.type,
          selectedDonInstanceIds: selected,
        };
      }
      paidCost = true;
      appendEvent(state, events, "costPaid", costPaidPayload, {
        type: "public",
      });
      const paid = events[events.length - 1];
      if (paid !== undefined) {
        paid.causedBy = { type: "decision", decisionId: decision.id };
      }
    }

    appendEvent(
      state,
      events,
      "decisionResolved",
      {
        decisionId: decision.id,
        decisionType: decision.type,
        playerId: decision.playerId,
        responseType: action.response.type,
      },
      decision.visibility,
    );
    const resolved = events[events.length - 1];
    if (resolved !== undefined) {
      resolved.causedBy = { type: "decision", decisionId: decision.id };
    }
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      players: { ...state.players, [decision.playerId]: nextPlayer },
      eventJournal: [...state.eventJournal, ...events],
    };
    delete nextState.pendingDecision;
    const resumed = resumeSequenceFrameAfterOptionalCost(
      nextState,
      decision,
      paidCost,
      createSupportedTrashFromHandChoiceDecision,
    );
    if (resumed === undefined) {
      return null;
    }
    if (!resumed.ok) {
      return toEngineResult(state, [], [resumed.error]);
    }
    return toEngineResult(resumed.state, [...events, ...resumed.events]);
  }
  if (decision.type !== "chooseOptionalActivation") {
    return null;
  }
  if (action.response.type !== "optionalActivation") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be optionalActivation for chooseOptionalActivation.",
      ),
    );
  }
  const choice: unknown = action.response.choice;
  if (choice !== "activate" && choice !== "decline") {
    return toEngineResult(
      state,
      [],
      invalidDecision("optionalActivation choice must be activate or decline."),
    );
  }
  const shouldActivate = choice === "activate";
  if (hasSequenceFrameForDecision(state, decision.id)) {
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionResolved",
      {
        decisionId: decision.id,
        decisionType: decision.type,
        playerId: decision.playerId,
        responseType: action.response.type,
      },
      decision.visibility,
    );
    const resolved = events[0];
    if (resolved !== undefined) {
      resolved.causedBy = { type: "decision", decisionId: decision.id };
    }
    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      eventJournal: [...state.eventJournal, ...events],
    };
    delete nextState.pendingDecision;
    const resumed = resumeSequenceFrameAfterOptionalActivation(
      nextState,
      decision,
      choice,
      createSupportedTrashFromHandChoiceDecision,
    );
    if (resumed === undefined) {
      return null;
    }
    if (!resumed.ok) {
      return toEngineResult(state, [], [resumed.error]);
    }
    return toEngineResult(resumed.state, [...events, ...resumed.events]);
  }
  if (decision.causedBy.type !== "effect") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseOptionalActivation decision cause is unsupported.",
      ),
    );
  }
  const effectCause = decision.causedBy;

  const selected = state.effectQueue.find(
    (entry) => entry.id === effectCause.queueEntryId,
  );
  if (
    selected === undefined ||
    selected.state !== "pending" ||
    selected.effectBlockId !== decision.effectId ||
    selected.effectBlockId !== effectCause.effectId ||
    !sameSource(decision.source, selected.source)
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseOptionalActivation decision is stale for current effectQueue.",
      ),
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: shouldActivate
      ? state.effectQueue
      : state.effectQueue.filter((entry) => entry.id !== selected.id),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const resumed = shouldActivate
    ? processEffectRuntimeAfterOptionalActivationAccept(
        nextState,
        selected.id,
        orderedCurrentChoiceGroupIds(state, selected),
      )
    : processEffectRuntimeAfterOptionalActivationDecline(
        nextState,
        orderedRemainingChoiceGroupIdsAfterDecline(state, selected),
      );
  return {
    ...resumed,
    events: [...events, ...resumed.events],
  };
};

export const getOptionalActivationLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (decision?.type === "payCost") {
    return getSequencePayCostLegalActions(state, playerId);
  }
  if (
    decision === undefined ||
    decision.type !== "chooseOptionalActivation" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return decision.options.map((choice) => ({
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice },
  }));
};
