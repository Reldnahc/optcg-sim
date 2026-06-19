import type {
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { executeMoveCardsPrimitive } from "../effect-runtime-move-cards.js";
import type { SegmentLedgers } from "./runner/types.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type MoveCardsSequenceSegment = SequenceEffect["effects"][number] & {
  effect: MoveCardsEffect;
};

const movedCardRefsFromPublicEvents = (
  events: readonly EngineEvent[],
): CardRef[] =>
  events.flatMap((event) => {
    if (event.type !== "cardMoved" || event.visibility.type !== "public") {
      return [];
    }
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null) {
      return [];
    }
    const record = payload as Record<string, unknown>;
    const instanceId = record["instanceId"];
    const cardId = record["cardId"];
    const playerId = record["playerId"];
    if (
      typeof instanceId !== "string" ||
      typeof cardId !== "string" ||
      typeof playerId !== "string"
    ) {
      return [];
    }
    return [
      {
        instanceId: instanceId as CardRef["instanceId"],
        cardId: cardId as CardRef["cardId"],
        playerId: playerId as CardRef["playerId"],
      },
    ];
  });

const movedCardCountFromPublicEvents = (
  events: readonly EngineEvent[],
): number =>
  events.filter((event) => {
    if (event.type !== "cardMoved" || event.visibility.type !== "public") {
      return false;
    }
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null) {
      return false;
    }
    return (payload as Record<string, unknown>)["reason"] === "moveCards";
  }).length;

const segmentSavesChosenNumber = (
  segment: SequenceEffect["effects"][number],
): boolean => segment.saveResultKinds?.includes("chosenNumber") === true;

export const applyMoveCardsSegment = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: MoveCardsSequenceSegment,
  index: number,
  ledgers: SegmentLedgers,
  emptySegmentResult: () => SequenceSegmentResult,
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const resolution = executeMoveCardsPrimitive(state, entry, segment.effect, {
    savedReferences: ledgers.savedReferences,
  });
  if (resolution.errors !== undefined) {
    return { ok: false };
  }
  const result: SequenceSegmentResult = {
    ...emptySegmentResult(),
    attempted: true,
    succeeded: true,
    changedState: resolution.events.length > 0,
  };
  const movedCards = movedCardRefsFromPublicEvents(resolution.events);
  const movedCardCount = movedCardCountFromPublicEvents(resolution.events);
  const savedReferences =
    segment.saveResultAs === undefined
      ? ledgers.savedReferences
      : segmentSavesChosenNumber(segment)
        ? {
            ...ledgers.savedReferences,
            [segment.saveResultAs]: {
              kind: "chosenNumber" as const,
              value: movedCardCount,
            },
          }
        : movedCards.length === 0
          ? ledgers.savedReferences
          : {
              ...ledgers.savedReferences,
              [segment.saveResultAs]: {
                kind: "selectedCards" as const,
                cards: movedCards,
              },
            };
  return {
    events: resolution.events,
    ledgers: {
      segmentResults: {
        ...ledgers.segmentResults,
        [segmentKey(segment, index)]: {
          ...result,
          ...(movedCards.length === 0
            ? {}
            : { affectedCards: movedCards, selectedCards: movedCards }),
        },
      },
      savedReferences,
    },
    ok: true,
    state: resolution.state,
  };
};
