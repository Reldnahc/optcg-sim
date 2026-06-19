import type {
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EventVisibility,
  GameState,
  PlayerId,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";

type RevealSelectedEffect = Extract<Effect, { type: "revealSelected" }>;
type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
};

type RevealSelectedParams = {
  effect: RevealSelectedEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
};

const revealSelectedVisibility = (
  visibility: RevealSelectedEffect["visibility"],
  controllerId: PlayerId,
): EventVisibility =>
  visibility === "chooserOnly"
    ? { type: "private", playerId: controllerId }
    : { type: "public" };

const selectedCardRefs = (
  ledgers: SegmentLedgers,
  effect: RevealSelectedEffect,
): readonly CardRef[] | null => {
  const selected = ledgers.savedReferences[effect.selection];
  return selected?.kind === "selectedCards" ? selected.cards : null;
};

const allSelectedFromDeck = (selected: readonly CardRef[]): boolean =>
  selected.length > 0 && selected.every((card) => card.zone?.zone === "deck");

export const applyRevealSelectedSequenceSegment = (
  params: RevealSelectedParams,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const selected = selectedCardRefs(params.ledgers, params.effect);
  if (selected === null) {
    return { ok: false };
  }
  const visibility = revealSelectedVisibility(
    params.effect.visibility,
    params.entry.controllerId,
  );
  const revealId = `reveal:sequence-selected:${String(params.entry.id)}:${String(params.index)}`;
  const events: EngineEvent[] = [];
  if (selected.length > 0) {
    appendEvent(
      params.state,
      events,
      "cardRevealed",
      {
        revealId,
        cards: selected,
        origin: "topOfDeck",
      },
      visibility,
    );
    const event = events[0];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
  }
  const nextState =
    selected.length === 0
      ? params.state
      : {
          ...params.state,
          seq: toStateSeq(params.state.seq + 1),
          revealedCards: allSelectedFromDeck(selected)
            ? [
                ...params.state.revealedCards,
                {
                  id: revealId,
                  cards: [...selected],
                  visibility,
                  origin: "topOfDeck" as const,
                  selectionSetId: String(params.effect.selection),
                  createdAtStateSeq: toStateSeq(params.state.seq + 1),
                  cleanupPolicy: "returnToOrigin" as const,
                },
              ]
            : params.state.revealedCards,
          eventJournal: [...params.state.eventJournal, ...events],
        };
  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: selected.length > 0,
          selectedCards: [...selected],
        },
      },
    },
    ok: true,
    state: nextState,
  };
};
