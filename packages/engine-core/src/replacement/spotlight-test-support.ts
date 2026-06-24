import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectTextSpanId,
  EngineEvent,
  GameState,
  SpotlightEntryCreatedPayload,
} from "@optcg/types";

export const replacementSpanId = "span:replacement" as EffectTextSpanId;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const replacementPresentation = ({
  source,
  target = source,
}: {
  readonly source: CardRef;
  readonly target?: CardRef | undefined;
}): ActiveEffectTextPresentation => ({
  source,
  textKind: "effect",
  activeSpanIds: [replacementSpanId],
  targetLinks: [
    {
      spanId: replacementSpanId,
      relation: "affectedCard",
      cards: [target],
    },
  ],
});

export const stateWithPendingReplacementPresentation = ({
  pendingKey,
  presentation,
  state,
}: {
  readonly state: GameState;
  readonly pendingKey: string;
  readonly presentation: ActiveEffectTextPresentation;
}): GameState => ({
  ...state,
  replacementState: state.replacementState.map((record) => {
    if (!isRecord(record.payload)) {
      return record;
    }
    const pending = record.payload[pendingKey];
    if (!isRecord(pending)) {
      return record;
    }
    return {
      ...record,
      payload: {
        ...record.payload,
        [pendingKey]: {
          ...pending,
          presentation,
        },
      },
    };
  }),
});

export const replacementSpotlightPayloads = (
  events: readonly EngineEvent[],
): readonly SpotlightEntryCreatedPayload[] =>
  events
    .filter((event) => event.type === "spotlightEntryCreated")
    .map((event) => event.payload as SpotlightEntryCreatedPayload);
