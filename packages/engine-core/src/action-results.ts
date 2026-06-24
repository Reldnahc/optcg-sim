import type {
  DecisionId,
  ActiveEffectTextPresentation,
  CardRef,
  CombatSpotlightPresentation,
  EffectDefinition,
  EffectQueueEntry,
  EffectSpotlightHistoryEntry,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  PendingDecision,
  ResolvedCard,
  SpotlightEntryCreatedEngineEvent,
  SpotlightEntryCreatedPayload,
  SpotlightEntryDisclosure,
  StateSeq,
} from "@optcg/types";

import { assertGameStateInvariants } from "./state/invariants.js";
import { hashCanonicalStateValue } from "./state/canonical-state.js";
import {
  combatSpotlightEntry,
  effectTextSpotlightEntry,
  entryCardRefDisclosure,
  pendingEffectTextSpotlightEntry,
  playedCardSpotlightEntry,
  splitEffectTextSpotlightPresentation,
  spotlightDisclosureVisibilityForCardRef,
  targetLinkDisclosure,
} from "./spotlight/spotlight-entry.js";
import { publicPendingDecisionIdForAnchor } from "./spotlight/public-pending-identity.js";

export const toStateSeq = (value: number): StateSeq => value as StateSeq;

export const toDecisionId = (value: string): DecisionId => value as DecisionId;

const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

export interface EngineResultOptions {
  readonly includeStateHash?: boolean;
  readonly profileSpan?: <T>(name: string, fn: () => T) => T;
  readonly validateInvariants?: boolean;
}

const profileEngineSpan = <T>(
  options: EngineResultOptions,
  name: string,
  fn: () => T,
): T => options.profileSpan?.(name, fn) ?? fn();

export const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
  options: EngineResultOptions = {},
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash: "",
  };
  if (options.includeStateHash !== false) {
    let cachedStateHash: string | undefined;
    Object.defineProperty(result, "stateHash", {
      enumerable: true,
      configurable: true,
      get() {
        cachedStateHash ??= profileEngineSpan(
          options,
          "engine:toEngineResult:stateHash",
          () => hashCanonicalStateValue(state),
        );
        return cachedStateHash;
      },
    });
  }
  if (state.pendingDecision !== undefined) {
    result.decisions = [state.pendingDecision];
  }
  if (errors !== undefined) {
    result.errors = [...errors];
  }
  return result;
};

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  return first === undefined
    ? [{ type: "illegalAction", reason: "Runtime failed without error." }]
    : [first, ...errors.slice(1)];
};

export const replaceEngineResultEvents = (
  result: EngineResult,
  events: EngineEvent[],
  options: EngineResultOptions = {},
): EngineResult =>
  toEngineResult(
    result.state,
    events,
    result.errors === undefined ? undefined : toErrorTuple(result.errors),
    options,
  );

export const assertGameStateInvariantsIfEnabled = (
  state: GameState,
  options: EngineResultOptions = {},
): void => {
  if (options.validateInvariants === false) {
    return;
  }
  profileEngineSpan(options, "engine:assertGameStateInvariants", () => {
    assertGameStateInvariants(state);
  });
};

export const illegalAction = (state: GameState, reason: string): EngineResult =>
  toEngineResult(state, [], [{ type: "illegalAction", reason }]);

export const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy: { type: "ruleProcess", name: "turnFlow" },
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

export const appendEvent = (
  state: GameState,
  events: EngineEvent[],
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): void => {
  events.push(createEvent(state, events.length + 1, type, payload, visibility));
};

export const appendSpotlightEntryCreatedEvent = (
  state: GameState,
  events: EngineEvent[],
  entry: EffectSpotlightHistoryEntry,
  options: {
    readonly causedBy?: EngineEvent["causedBy"] | undefined;
    readonly disclosure?: SpotlightEntryDisclosure | undefined;
    readonly visibility: EngineEvent["visibility"];
  },
): SpotlightEntryCreatedEngineEvent => {
  const payload: SpotlightEntryCreatedPayload =
    options.disclosure === undefined
      ? { entry }
      : { entry, disclosure: options.disclosure };
  appendEvent(
    state,
    events,
    "spotlightEntryCreated",
    payload,
    options.visibility,
  );
  const created = events.at(-1);
  if (created === undefined || created.type !== "spotlightEntryCreated") {
    throw new Error("Expected appended spotlightEntryCreated event.");
  }
  if (options.causedBy === undefined) {
    delete created.causedBy;
  } else {
    created.causedBy = options.causedBy;
  }
  return created as SpotlightEntryCreatedEngineEvent;
};

const spotlightDisclosureForActive = (
  active: ActiveEffectTextPresentation,
): SpotlightEntryDisclosure => ({
  entryRefs: [
    entryCardRefDisclosure({
      card: active.source,
      role: "effectSource",
      visibility: spotlightDisclosureVisibilityForCardRef(active.source),
    }),
  ],
  targetLinks: (active.targetLinks ?? []).flatMap((link) =>
    link.cards.map((card) =>
      targetLinkDisclosure({
        card,
        relation: link.relation,
        spanId: link.spanId,
        visibility: spotlightDisclosureVisibilityForCardRef(card),
      }),
    ),
  ),
});

export const appendReplacementSpotlightEntryCreatedEvents = ({
  events,
  presentation,
  replacementAppliedEvent,
  replacementId,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly replacementAppliedEvent: EngineEvent;
  readonly presentation: ActiveEffectTextPresentation | undefined;
  readonly replacementId: string | undefined;
}): readonly SpotlightEntryCreatedEngineEvent[] => {
  if (
    replacementAppliedEvent.type !== "replacementApplied" ||
    presentation === undefined
  ) {
    return [];
  }
  const causedBy =
    replacementId === undefined
      ? replacementAppliedEvent.causedBy
      : { type: "replacement" as const, replacementId };
  const appended: SpotlightEntryCreatedEngineEvent[] = [];
  for (const active of splitEffectTextSpotlightPresentation(presentation)) {
    const sourceVisibility = spotlightDisclosureVisibilityForCardRef(
      active.source,
    );
    appended.push(
      appendSpotlightEntryCreatedEvent(
        state,
        events,
        effectTextSpotlightEntry({
          active,
          anchorEventId: replacementAppliedEvent.id,
        }),
        {
          ...(causedBy === undefined ? {} : { causedBy }),
          disclosure: spotlightDisclosureForActive(active),
          visibility: sourceVisibility,
        },
      ),
    );
  }
  return appended;
};

export const appendCombatSpotlightEntryCreatedEvent = ({
  anchorEvent,
  combat,
  events,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly anchorEvent: EngineEvent;
  readonly combat: CombatSpotlightPresentation;
}): SpotlightEntryCreatedEngineEvent =>
  appendSpotlightEntryCreatedEvent(
    state,
    events,
    combatSpotlightEntry({ anchorEventId: anchorEvent.id, combat }),
    {
      causedBy: anchorEvent.causedBy,
      disclosure: {
        entryRefs: [
          entryCardRefDisclosure({
            card: combat.attacker,
            role: "combatAttacker",
            visibility: spotlightDisclosureVisibilityForCardRef(
              combat.attacker,
            ),
          }),
          entryCardRefDisclosure({
            card: combat.defender,
            role: "combatDefender",
            visibility: spotlightDisclosureVisibilityForCardRef(
              combat.defender,
            ),
          }),
        ],
      },
      visibility: { type: "public" },
    },
  );

export const appendPlayedCardSpotlightEntryCreatedEvent = ({
  anchorEvent,
  events,
  source,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly anchorEvent: EngineEvent;
  readonly source: CardRef;
}): SpotlightEntryCreatedEngineEvent =>
  appendSpotlightEntryCreatedEvent(
    state,
    events,
    playedCardSpotlightEntry({ anchorEventId: anchorEvent.id, source }),
    {
      causedBy: anchorEvent.causedBy,
      disclosure: {
        entryRefs: [
          entryCardRefDisclosure({
            card: source,
            role: "playedCardSource",
            visibility: spotlightDisclosureVisibilityForCardRef(source),
          }),
        ],
      },
      visibility: { type: "public" },
    },
  );

export const appendPendingSpotlightEntryCreatedEvents = <
  TDecision extends PendingDecision,
>({
  activeEffectText,
  decisionCreatedEvent,
  events,
  pendingDecision,
  recipientPlayerId,
  state,
  visibility,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly pendingDecision: TDecision;
  readonly decisionCreatedEvent: EngineEvent | undefined;
  readonly recipientPlayerId: PendingDecision["playerId"];
  readonly activeEffectText: ActiveEffectTextPresentation | undefined;
  readonly visibility: EngineEvent["visibility"];
}): {
  readonly pendingDecision: TDecision;
  readonly spotlightEvents: readonly SpotlightEntryCreatedEngineEvent[];
} => {
  if (
    decisionCreatedEvent === undefined ||
    decisionCreatedEvent.type !== "decisionCreated"
  ) {
    return { pendingDecision, spotlightEvents: [] };
  }
  const anchoredDecision: TDecision = {
    ...pendingDecision,
    decisionAnchorEventId: decisionCreatedEvent.id,
  };
  if (activeEffectText === undefined) {
    return { pendingDecision: anchoredDecision, spotlightEvents: [] };
  }
  const publicPendingDecisionId = publicPendingDecisionIdForAnchor({
    decisionAnchorEventId: decisionCreatedEvent.id,
    playerId: recipientPlayerId,
  });
  const appended: SpotlightEntryCreatedEngineEvent[] = [];
  for (const active of splitEffectTextSpotlightPresentation(activeEffectText)) {
    appended.push(
      appendSpotlightEntryCreatedEvent(
        state,
        events,
        pendingEffectTextSpotlightEntry({
          active,
          anchorEventId: decisionCreatedEvent.id,
          pendingDecisionId: publicPendingDecisionId,
        }),
        {
          causedBy: pendingDecision.causedBy,
          disclosure: spotlightDisclosureForActive(active),
          visibility,
        },
      ),
    );
  }
  return { pendingDecision: anchoredDecision, spotlightEvents: appended };
};

export const appendEffectResolvedEvent = (
  state: GameState,
  events: EngineEvent[],
  queuedEntry: EffectQueueEntry,
  effectBlock?: EffectDefinition["effects"][number],
  resolvedSourceCard?: ResolvedCard,
  options: { readonly status?: "resolved" | "conditionFailed" } = {},
): EngineEvent => {
  appendEvent(
    state,
    events,
    "effectResolved",
    {
      queueEntryId: queuedEntry.id,
      timingWindowId: queuedEntry.timingWindowId,
      generation: queuedEntry.generation,
      effectBlockId: queuedEntry.effectBlockId,
      ...(queuedEntry.triggerEventId === undefined
        ? {}
        : { triggerEventId: queuedEntry.triggerEventId }),
      sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
      orderingGroup: queuedEntry.orderingGroup,
      ...(effectBlock === undefined
        ? {}
        : {
            controllerId: queuedEntry.controllerId,
            source: queuedEntry.source,
            sourceCardId: queuedEntry.sourceSnapshot.cardId,
            effectCategory: effectBlock.category,
            entryPoint: effectBlock.trigger,
            sourceTypes: resolvedSourceCard?.types ?? [],
            sourceCategory:
              resolvedSourceCard?.category ??
              queuedEntry.sourceSnapshot.category,
          }),
      ...(queuedEntry.presentation === undefined
        ? {}
        : { presentation: queuedEntry.presentation }),
      status: options.status ?? ("resolved" as const),
    },
    { type: "public" },
  );
  const resolved = events[events.length - 1];
  if (resolved === undefined || resolved.type !== "effectResolved") {
    throw new Error("Expected appended effectResolved event.");
  }
  const causedBy = {
    type: "effect" as const,
    queueEntryId: queuedEntry.id,
    effectId: queuedEntry.effectBlockId,
  };
  resolved.causedBy = causedBy;
  if (queuedEntry.presentation !== undefined) {
    for (const active of splitEffectTextSpotlightPresentation(
      queuedEntry.presentation,
    )) {
      const sourceVisibility = spotlightDisclosureVisibilityForCardRef(
        active.source,
      );
      appendSpotlightEntryCreatedEvent(
        state,
        events,
        effectTextSpotlightEntry({
          active,
          anchorEventId: resolved.id,
          effectBlockId: queuedEntry.effectBlockId,
          queueEntryId: queuedEntry.id,
        }),
        {
          causedBy,
          disclosure: spotlightDisclosureForActive(active),
          visibility: sourceVisibility,
        },
      );
    }
  }
  return resolved;
};

export const appendEffectQueuedEvent = (
  state: GameState,
  events: EngineEvent[],
  queuedEntry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number],
  resolvedSourceCard: ResolvedCard | undefined,
): void => {
  appendEvent(
    state,
    events,
    "effectQueued",
    {
      queueEntryId: queuedEntry.id,
      timingWindowId: queuedEntry.timingWindowId,
      generation: queuedEntry.generation,
      effectBlockId: queuedEntry.effectBlockId,
      ...(queuedEntry.triggerEventId === undefined
        ? {}
        : { triggerEventId: queuedEntry.triggerEventId }),
      sourcePresencePolicy: queuedEntry.sourcePresencePolicy,
      orderingGroup: queuedEntry.orderingGroup,
      controllerId: queuedEntry.controllerId,
      source: queuedEntry.source,
      sourceCardId: queuedEntry.sourceSnapshot.cardId,
      effectCategory: effectBlock.category,
      entryPoint: effectBlock.trigger,
      sourceTypes: resolvedSourceCard?.types ?? [],
      sourceCategory:
        resolvedSourceCard?.category ?? queuedEntry.sourceSnapshot.category,
      ...(queuedEntry.presentation === undefined
        ? {}
        : { presentation: queuedEntry.presentation }),
    },
    { type: "public" },
  );
  const queued = events[events.length - 1];
  if (queued !== undefined) {
    queued.causedBy = queuedEntry.causedBy;
  }
};

export const rebaseEvents = (
  state: GameState,
  events: EngineEvent[],
  seqOffset: number,
): EngineEvent[] =>
  events.map((event, index) => ({
    ...event,
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset + index)}:${event.type}`,
    ),
    seq: state.eventJournal.length + seqOffset + index,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  }));
