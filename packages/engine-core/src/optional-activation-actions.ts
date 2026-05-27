import type {
  Action,
  CardFilter,
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
  QueueEntryId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { reindexZoneCards, zonesEqual } from "./action-state.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
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

const restSourceCard = (
  player: PlayerState,
  source: CardRef,
): PlayerState | null => {
  if (
    player.leader.instanceId === source.instanceId &&
    player.leader.cardId === source.cardId &&
    source.zone?.zone === "leaderArea" &&
    player.leader.state !== "rested"
  ) {
    return {
      ...player,
      leader: { ...player.leader, state: "rested" },
    };
  }
  const characterIndex = player.characters.findIndex(
    (card) =>
      card.instanceId === source.instanceId &&
      card.cardId === source.cardId &&
      source.zone?.zone === "characterArea" &&
      card.state !== "rested",
  );
  if (characterIndex >= 0) {
    return {
      ...player,
      characters: player.characters.map((card, index) =>
        index === characterIndex ? { ...card, state: "rested" } : card,
      ),
    };
  }
  if (
    player.stage !== undefined &&
    player.stage.instanceId === source.instanceId &&
    player.stage.cardId === source.cardId &&
    source.zone?.zone === "stageArea" &&
    player.stage.state !== "rested"
  ) {
    return {
      ...player,
      stage: { ...player.stage, state: "rested" },
    };
  }
  return null;
};

const supportsScopedFieldTrashFilter = (
  filter: CardFilter | undefined,
): filter is { categories: ["character"]; typesAny: [string, ...string[]] } =>
  filter !== undefined &&
  Array.isArray(filter.categories) &&
  filter.categories.length === 1 &&
  filter.categories[0] === "character" &&
  Array.isArray(filter.typesAny) &&
  filter.typesAny.length > 0 &&
  filter.typesAny.every((value) => typeof value === "string");

const fieldCardMatchesFilter = (
  state: GameState,
  cardId: CardInstance["cardId"],
  filter: { categories: ["character"]; typesAny: [string, ...string[]] },
): boolean => {
  const metadata = state.cardManifest.cards[cardId];
  if (metadata === undefined || metadata.category !== "character") {
    return false;
  }
  return filter.typesAny.some((cardType) => metadata.types.includes(cardType));
};

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
        decision.cost.type !== "restSelf" &&
        decision.cost.type !== "returnDon" &&
        decision.cost.type !== "moveCards" &&
        decision.cost.type !== "trashFromHand" &&
        decision.cost.type !== "chooseOne")
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
      const paymentResponse = action.response;
      const selectedOption = decision.paymentOptions.find(
        (option) => option.id === paymentResponse.optionId,
      );
      if (selectedOption === undefined) {
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
            optionId: "restSelf";
            selectedCardInstanceIds: [CardInstance["instanceId"]];
          }
        | {
            playerId: PlayerId;
            optionId: "trashFromHand" | "trashFromField";
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          }
        | {
            playerId: PlayerId;
            optionId: "moveCards";
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          };
      if (selectedOption.type === "moveCards") {
        if (
          selectedOption.from.player !== "self" ||
          selectedOption.from.zone !== "trash" ||
          selectedOption.to.player !== "self" ||
          selectedOption.to.zone !== "deck" ||
          selectedOption.to.position !== "bottom"
        ) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment move-card route is unsupported."),
          );
        }
        if (paymentResponse.selectedDonInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection must not include DON!!."),
          );
        }
        const selected = paymentResponse.selectedCardInstanceIds;
        if (
          selected === undefined ||
          selected.length !== selectedOption.count
        ) {
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
          const card = player.trash.find(
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
        const movedCards = selectedCards.map((card, index) => ({
          ...card,
          attachedDon: [],
          zone: {
            zone: "deck" as const,
            playerId: decision.playerId,
            slot: "deck" as const,
            index: player.deck.length + index,
          },
        }));
        nextPlayer = {
          ...player,
          trash: reindexZoneCards(
            player.trash.filter((card) => !selectedSet.has(card.instanceId)),
            "trash",
            decision.playerId,
            "trash",
          ),
          deck: reindexZoneCards(
            [...player.deck, ...movedCards],
            "deck",
            decision.playerId,
            "deck",
          ),
        };
        for (let index = 0; index < selectedCards.length; index += 1) {
          appendEvent(
            state,
            events,
            "cardMoved",
            {
              from: "trash",
              to: "deck",
              playerId: decision.playerId,
              reason: "moveCardsCost",
            },
            { type: "public" },
          );
          const moved = events[events.length - 1];
          if (moved !== undefined) {
            moved.causedBy = { type: "decision", decisionId: decision.id };
          }
        }
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "moveCards",
          selectedCardInstanceIds: selected,
        };
      } else if (
        selectedOption.type === "trashFromHand" ||
        selectedOption.type === "trashFromField"
      ) {
        if (paymentResponse.selectedDonInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection must not include DON!!."),
          );
        }
        const selected = paymentResponse.selectedCardInstanceIds;
        if (
          selected === undefined ||
          selected.length !== selectedOption.count
        ) {
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
          const card =
            selectedOption.type === "trashFromHand"
              ? player.hand.find(
                  (candidate) => candidate.instanceId === selectedId,
                )
              : player.characters.find(
                  (candidate) => candidate.instanceId === selectedId,
                );
          if (card === undefined) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment card selection is invalid."),
            );
          }
          if (
            selectedOption.type === "trashFromField" &&
            (!supportsScopedFieldTrashFilter(selectedOption.filter) ||
              !fieldCardMatchesFilter(
                state,
                card.cardId,
                selectedOption.filter,
              ))
          ) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment card selection is invalid."),
            );
          }
          selectedCards.push(card);
        }
        const returnedDonIds =
          selectedOption.type === "trashFromField"
            ? selectedCards.flatMap((card) => card.attachedDon)
            : [];
        const returnedDonIdSet = new Set(returnedDonIds);
        const reason =
          selectedOption.type === "trashFromHand"
            ? "trashFromHand"
            : "trashFromField";
        const movement = moveConcreteCardsToTrash(
          state,
          events,
          selectedCards,
          {
            cardMovedPayloadShape: "publicZoneNames",
            cardMovedVisibility: { type: "public" },
            cardTrashedVisibility: { type: "public" },
            causedBy: { type: "decision", decisionId: decision.id },
            clearAttachedDon: true,
            emitCardTrashed: true,
            playerId: decision.playerId,
            reason,
            sourceZone:
              selectedOption.type === "trashFromHand"
                ? "hand"
                : "characterArea",
          },
        );
        const movedPlayer = movement.state.players[decision.playerId];
        if (movedPlayer === undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection is invalid."),
          );
        }
        nextPlayer =
          selectedOption.type === "trashFromField"
            ? {
                ...movedPlayer,
                costArea: movedPlayer.costArea.map((card) =>
                  returnedDonIdSet.has(card.instanceId)
                    ? { ...card, state: "rested" as const }
                    : card,
                ),
              }
            : movedPlayer;
        for (const selectedCard of selectedCards) {
          if (selectedOption.type === "trashFromField") {
            for (const donId of selectedCard.attachedDon) {
              appendEvent(
                state,
                events,
                "donReturned",
                {
                  playerId: decision.playerId,
                  donInstanceId: donId,
                  state: "rested",
                },
                { type: "replayOnly" },
              );
              const returnedDon = events[events.length - 1];
              if (returnedDon !== undefined) {
                returnedDon.causedBy = {
                  type: "decision",
                  decisionId: decision.id,
                };
              }
            }
          }
        }
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: selectedOption.type,
          selectedCardInstanceIds: selected,
        };
      } else if (selectedOption.type === "restSelf") {
        if (
          paymentResponse.selectedDonInstanceIds !== undefined ||
          paymentResponse.selectedCardInstanceIds !== undefined
        ) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source rest selection is invalid."),
          );
        }
        const causedBy = decision.causedBy;
        const source =
          causedBy.type === "effect" && "queueEntryId" in causedBy
            ? state.effectQueue.find(
                (entry) => entry.id === causedBy.queueEntryId,
              )?.source
            : undefined;
        if (source === undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source rest selection is invalid."),
          );
        }
        const rested = restSourceCard(player, source);
        if (rested === null) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source rest selection is invalid."),
          );
        }
        nextPlayer = rested;
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "restSelf",
          selectedCardInstanceIds: [source.instanceId],
        };
      } else {
        if (
          selectedOption.type !== "restDon" &&
          selectedOption.type !== "returnDon"
        ) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment option mismatch."),
          );
        }
        if (paymentResponse.selectedCardInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment DON!! selection must not include cards."),
          );
        }
        const selected = paymentResponse.selectedDonInstanceIds;
        if (
          selected === undefined ||
          selected.length !== selectedOption.count
        ) {
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
        if (selectedOption.type === "restDon") {
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
          optionId: selectedOption.type,
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
        orderedCurrentChoiceGroupIds(state, selected) === undefined
          ? undefined
          : [selected.id],
      )
    : processEffectRuntimeAfterOptionalActivationDecline(nextState);
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
