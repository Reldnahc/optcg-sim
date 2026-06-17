import type {
  Action,
  CardFilter,
  CardInstance,
  CardRef,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
  QueueEntryId,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { prependEventsToEngineResult } from "../../engine-result-events.js";
import {
  cardMatchesHandSelectionFilter,
  isSupportedHandSelectionCardFilter,
  toCardRef,
  zonesEqual,
} from "../../actions/state.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "../../concrete-card-movement.js";
import { applyAttachDonCostPayment } from "../primitives/attach-don-cost.js";
import { selectedFieldTrashSourceZone } from "../../effect-runtime-field-trash-payment.js";
import { applyModifyPowerPayment } from "../primitives/modify-power-cost.js";
import {
  applyRestFromFieldPaymentResponse,
  restFromFieldCandidates,
} from "../costs/rest-from-field.js";
import {
  applyMoveCardsPayment,
  isSupportedMoveCardsPaymentRoute,
} from "../../effect-runtime-move-cards-payment.js";
import { applyMoveFieldToLifePaymentResponse } from "../costs/move-field-to-life.js";
import { restFieldObjects } from "../../effect-runtime-sequence/saved-field-object.js";
import {
  processEffectRuntimeAfterOptionalActivationAccept,
  processEffectRuntimeAfterOptionalActivationDecline,
} from "../../effect-runtime.js";
import { cleanupResolvedLifeTrigger } from "../../effect-runtime-life-trigger-cleanup.js";
import {
  getSequencePayCostLegalActions,
  hasSequenceFrameForDecision,
} from "../../effect-runtime-sequence/frame-decisions.js";
import { applyTrashSelfPayment } from "../primitives/trash-self-cost.js";
import {
  resumeSequenceFrameAfterOptionalActivation,
  resumeSequenceFrameAfterOptionalCost,
} from "../../effect-runtime-sequence/frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "../primitives/trash-from-hand.js";
import { invalidDecision } from "../../engine-error-helpers.js";
import {
  applyLifeVisibilityPayment,
  type LifeVisibilityCostPaidPayload,
} from "./life-visibility-payment.js";
import { applyDonPayment, type DonCostPaidPayload } from "./don-payment.js";
import {
  clearPendingDecision,
  effectQueueEntryForDecision,
} from "../../decisions/continuation-gate.js";

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

const supportsChooseOneTrashFilter = (
  filter: CardFilter | undefined,
): boolean => isSupportedHandSelectionCardFilter(filter);

const fieldCardMatchesFilter = (
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  return cardMatchesHandSelectionFilter(state, playerId, card, filter);
};

const fieldTrashCandidates = (player: PlayerState): readonly CardInstance[] => [
  ...player.characters,
  ...(player.stage === undefined ? [] : [player.stage]),
];

export const applyOptionalActivationDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
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
        decision.cost.type !== "restFromField" &&
        decision.cost.type !== "trashSelf" &&
        decision.cost.type !== "returnDon" &&
        decision.cost.type !== "attachDon" &&
        decision.cost.type !== "moveCards" &&
        decision.cost.type !== "moveFieldToLife" &&
        decision.cost.type !== "turnLifeFaceUp" &&
        decision.cost.type !== "setLifeFaceUp" &&
        decision.cost.type !== "modifyPower" &&
        decision.cost.type !== "trashFromHand" &&
        decision.cost.type !== "trashFromField" &&
        decision.cost.type !== "koFromField" &&
        decision.cost.type !== "revealFromHand" &&
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
    let nextPlayers: GameState["players"] | undefined;
    let nextContinuousEffects = state.continuousEffects;
    let paidCostSelectedCards: CardRef[] = [];
    let paidCostSelectedDonInstanceIds: CardInstance["instanceId"][] = [];
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
        | DonCostPaidPayload
        | {
            playerId: PlayerId;
            optionId: "attachDon";
            selectedDonInstanceIds: NonNullable<
              typeof action.response.selectedDonInstanceIds
            >;
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          }
        | {
            playerId: PlayerId;
            optionId: "restSelf";
            selectedCardInstanceIds: [CardInstance["instanceId"]];
          }
        | {
            playerId: PlayerId;
            optionId: "trashSelf";
            selectedCardInstanceIds: [CardInstance["instanceId"]];
          }
        | {
            playerId: PlayerId;
            optionId:
              | "trashFromHand"
              | "trashFromField"
              | "koFromField"
              | "revealFromHand";
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          }
        | {
            playerId: PlayerId;
            optionId: "restFromField";
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
          }
        | {
            playerId: PlayerId;
            optionId: "moveFieldToLife";
            selectedCardInstanceIds: NonNullable<
              typeof action.response.selectedCardInstanceIds
            >;
          }
        | LifeVisibilityCostPaidPayload
        | {
            playerId: PlayerId;
            optionId: "modifyPower";
            value: number;
          };
      if (selectedOption.type === "moveCards") {
        if (!isSupportedMoveCardsPaymentRoute(selectedOption)) {
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
        const moved = applyMoveCardsPayment({
          decisionId: decision.id,
          events,
          player,
          playerId: decision.playerId,
          selected,
          selectedOption,
          state,
        });
        if (moved === null) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection is invalid."),
          );
        }
        nextPlayer = moved;
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "moveCards",
          selectedCardInstanceIds: selected,
        };
      } else if (selectedOption.type === "moveFieldToLife") {
        const paid = applyMoveFieldToLifePaymentResponse({
          chooserId: decision.playerId,
          decisionId: decision.id,
          events,
          option: selectedOption,
          response: paymentResponse,
          state,
        });
        if (!paid.ok) {
          return toEngineResult(state, [], invalidDecision(paid.message));
        }
        nextPlayers = paid.state.players;
        nextPlayer = paid.state.players[decision.playerId] ?? nextPlayer;
        paidCostSelectedCards = paid.selectedCardRefs;
        costPaidPayload = paid.costPaidPayload;
      } else if (selectedOption.type === "attachDon") {
        const paid = applyAttachDonCostPayment({
          decisionId: decision.id,
          paymentResponse,
          player,
          playerId: decision.playerId,
          selectedOption,
          state,
        });
        if (!paid.ok) {
          return toEngineResult(state, [], invalidDecision(paid.reason));
        }
        nextPlayers = paid.players;
        events.push(...paid.events);
        costPaidPayload = paid.costPaidPayload;
      } else if (
        selectedOption.type === "turnLifeFaceUp" ||
        selectedOption.type === "setLifeFaceUp"
      ) {
        const paid = applyLifeVisibilityPayment({
          decisionId: decision.id,
          events,
          paymentResponse,
          player,
          playerId: decision.playerId,
          selectedOption,
          state,
        });
        if (!paid.ok) {
          return toEngineResult(state, [], invalidDecision(paid.message));
        }
        nextPlayer = paid.player;
        costPaidPayload = paid.costPaidPayload;
      } else if (selectedOption.type === "modifyPower") {
        const paidPowerCost = applyModifyPowerPayment({
          causedBy: decision.causedBy,
          player,
          playerId: decision.playerId,
          ...(paymentResponse.selectedCardInstanceIds === undefined
            ? {}
            : {
                selectedCardInstanceIds:
                  paymentResponse.selectedCardInstanceIds,
              }),
          ...(paymentResponse.selectedDonInstanceIds === undefined
            ? {}
            : {
                selectedDonInstanceIds: paymentResponse.selectedDonInstanceIds,
              }),
          selectedOption,
          state,
        });
        if (paidPowerCost === null) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment power modification is unsupported."),
          );
        }
        nextContinuousEffects = [
          ...nextContinuousEffects,
          ...paidPowerCost.continuousEffects,
        ];
        costPaidPayload = paidPowerCost.costPaidPayload;
      } else if (selectedOption.type === "revealFromHand") {
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
          const card = player.hand.find(
            (candidate) => candidate.instanceId === selectedId,
          );
          if (
            card === undefined ||
            !supportsChooseOneTrashFilter(selectedOption.filter) ||
            !cardMatchesHandSelectionFilter(
              state,
              decision.playerId,
              card,
              selectedOption.filter,
            )
          ) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment card selection is invalid."),
            );
          }
          selectedCards.push(card);
        }
        appendEvent(
          state,
          events,
          "cardRevealed",
          {
            revealId: `reveal:reveal-from-hand:${String(decision.id)}`,
            cards: selectedCards.map((card) =>
              toCardRef(card, decision.playerId),
            ),
            origin: "hand",
            reason: "revealFromHandCost",
          },
          { type: "public" },
        );
        const revealed = events[events.length - 1];
        if (revealed !== undefined) {
          revealed.causedBy = { type: "decision", decisionId: decision.id };
        }
        paidCostSelectedCards = selectedCards.map((card) =>
          toCardRef(card, decision.playerId),
        );
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "revealFromHand",
          selectedCardInstanceIds: selected,
        };
      } else if (selectedOption.type === "restFromField") {
        const paid = applyRestFromFieldPaymentResponse({
          option: selectedOption,
          player,
          playerId: decision.playerId,
          response: paymentResponse,
          state,
        });
        if (!paid.ok) {
          return toEngineResult(state, [], invalidDecision(paid.message));
        }
        const selectedIds = new Set(
          paid.costPaidPayload.selectedCardInstanceIds,
        );
        const selectedRefs = restFromFieldCandidates(player)
          .filter((card) => selectedIds.has(card.instanceId))
          .map((card) => toCardRef(card, decision.playerId));
        const rested = restFieldObjects(state, selectedRefs, undefined, {
          events,
          sourceKind: "cost",
          sourceControllerId: decision.playerId,
        });
        nextPlayers = rested.state.players;
        costPaidPayload = paid.costPaidPayload;
      } else if (
        selectedOption.type === "trashFromHand" ||
        selectedOption.type === "trashFromField" ||
        selectedOption.type === "koFromField"
      ) {
        if (paymentResponse.selectedDonInstanceIds !== undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection must not include DON!!."),
          );
        }
        const selected = paymentResponse.selectedCardInstanceIds;
        const selectedCount = selected?.length;
        const maxCount =
          selectedOption.type === "trashFromHand"
            ? selectedOption.maxCount
            : undefined;
        if (
          selected === undefined ||
          selectedCount === undefined ||
          selectedCount < selectedOption.count ||
          (typeof maxCount === "number" && selectedCount > maxCount)
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
              : fieldTrashCandidates(player).find(
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
            !supportsChooseOneTrashFilter(selectedOption.filter) ||
            !fieldCardMatchesFilter(
              state,
              decision.playerId,
              card,
              selectedOption.filter,
            )
          ) {
            return toEngineResult(
              state,
              [],
              invalidDecision("Payment card selection is invalid."),
            );
          }
          selectedCards.push(card);
        }
        paidCostSelectedCards = selectedCards.map((card) =>
          toCardRef(card, decision.playerId),
        );
        const returnedDonIds =
          selectedOption.type === "trashFromField" ||
          selectedOption.type === "koFromField"
            ? selectedCards.flatMap((card) => card.attachedDon)
            : [];
        const returnedDonIdSet = new Set(returnedDonIds);
        const reason =
          selectedOption.type === "trashFromHand"
            ? "trashFromHand"
            : selectedOption.type === "koFromField"
              ? KO_TRASH_MOVEMENT_REASON
              : "trashFromField";
        const sourceZone =
          selectedOption.type === "trashFromHand"
            ? "hand"
            : selectedFieldTrashSourceZone(selectedCards);
        if (sourceZone === null) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment card selection is invalid."),
          );
        }
        if (selectedOption.type === "koFromField") {
          for (const selectedCard of selectedCards) {
            appendEvent(
              state,
              events,
              "cardKOd",
              {
                playerId: decision.playerId,
                instanceId: selectedCard.instanceId,
              },
              { type: "public" },
            );
            const koEvent = events[events.length - 1];
            if (koEvent !== undefined) {
              koEvent.causedBy = {
                type: "decision",
                decisionId: decision.id,
              };
            }
          }
        }
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
            sourceZone,
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
          selectedOption.type === "trashFromField" ||
          selectedOption.type === "koFromField"
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
          if (
            selectedOption.type === "trashFromField" ||
            selectedOption.type === "koFromField"
          ) {
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
        const entryLookup = effectQueueEntryForDecision(state, decision);
        const source = entryLookup.ok ? entryLookup.entry.source : undefined;
        if (source === undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source rest selection is invalid."),
          );
        }
        const rested = restFieldObjects(state, [source], undefined, {
          events,
          sourceKind: "cost",
          sourceControllerId: decision.playerId,
        });
        if (!rested.changed) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source rest selection is invalid."),
          );
        }
        nextPlayers = rested.state.players;
        paidCostSelectedCards = [source];
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "restSelf",
          selectedCardInstanceIds: [source.instanceId],
        };
      } else if (selectedOption.type === "trashSelf") {
        if (
          paymentResponse.selectedDonInstanceIds !== undefined ||
          paymentResponse.selectedCardInstanceIds !== undefined
        ) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source trash selection is invalid."),
          );
        }
        const entryLookup = effectQueueEntryForDecision(state, decision);
        const source = entryLookup.ok ? entryLookup.entry.source : undefined;
        if (source === undefined) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source trash selection is invalid."),
          );
        }
        const trashed = applyTrashSelfPayment({
          decisionId: decision.id,
          events,
          ...(selectedOption.filter === undefined
            ? {}
            : { filter: selectedOption.filter }),
          player,
          playerId: decision.playerId,
          source,
          state,
        });
        if (trashed === null) {
          return toEngineResult(
            state,
            [],
            invalidDecision("Payment source trash selection is invalid."),
          );
        }
        nextPlayer = trashed;
        paidCostSelectedCards = [source];
        costPaidPayload = {
          playerId: decision.playerId,
          optionId: "trashSelf",
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
        const paidDon = applyDonPayment({
          player,
          playerId: decision.playerId,
          response: paymentResponse,
          selectedOption,
        });
        if (!paidDon.ok) {
          return toEngineResult(state, [], invalidDecision(paidDon.message));
        }
        nextPlayer = paidDon.player;
        costPaidPayload = paidDon.costPaidPayload;
        paidCostSelectedDonInstanceIds = [
          ...paidDon.paidCostSelectedDonInstanceIds,
        ];
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
    let nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      players: nextPlayers ?? {
        ...state.players,
        [decision.playerId]: nextPlayer,
      },
      continuousEffects: nextContinuousEffects,
      eventJournal: [...state.eventJournal, ...events],
    };
    nextState = clearPendingDecision(nextState);
    const resumed = resumeSequenceFrameAfterOptionalCost(
      nextState,
      decision,
      paidCost,
      createSupportedTrashFromHandChoiceDecision,
      paidCostSelectedCards,
      paidCostSelectedDonInstanceIds,
    );
    if (resumed === undefined) {
      return null;
    }
    if (!resumed.ok) {
      return toEngineResult(state, [], [resumed.error], options);
    }
    return toEngineResult(
      resumed.state,
      [...events, ...resumed.events],
      undefined,
      options,
    );
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
    let nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      eventJournal: [...state.eventJournal, ...events],
    };
    nextState = clearPendingDecision(nextState);
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
      return toEngineResult(state, [], [resumed.error], options);
    }
    return toEngineResult(
      resumed.state,
      [...events, ...resumed.events],
      undefined,
      options,
    );
  }
  const entryLookup = effectQueueEntryForDecision(state, decision);
  if (!entryLookup.ok && entryLookup.reason === "not-effect-decision") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseOptionalActivation decision cause is unsupported.",
      ),
    );
  }
  const selected = entryLookup.ok ? entryLookup.entry : undefined;
  if (
    selected === undefined ||
    selected.state !== "pending" ||
    selected.effectBlockId !== decision.effectId ||
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

  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: shouldActivate
      ? state.effectQueue
      : state.effectQueue.filter((entry) => entry.id !== selected.id),
    eventJournal: [...state.eventJournal, ...events],
  };
  nextState = clearPendingDecision(nextState);

  if (!shouldActivate) {
    const cleanup = cleanupResolvedLifeTrigger(nextState, selected);
    const resumed = processEffectRuntimeAfterOptionalActivationDecline(
      cleanup.state,
    );
    return prependEventsToEngineResult(
      resumed,
      [...events, ...cleanup.events],
      options,
    );
  }

  const resumed = processEffectRuntimeAfterOptionalActivationAccept(
    nextState,
    selected.id,
    orderedCurrentChoiceGroupIds(state, selected) === undefined
      ? undefined
      : [selected.id],
  );
  return prependEventsToEngineResult(resumed, events, options);
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
