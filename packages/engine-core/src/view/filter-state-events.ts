import type {
  CardRef,
  EffectTextTargetLink,
  EngineEvent,
  EventVisibility,
  GameState,
  PlayerId,
  PublicPendingDecisionId,
  SpotlightEntryDisclosure,
} from "@optcg/types";

import { isSpotlightCardRefVisibleToPlayer } from "./card-ref-visibility.js";
import {
  isSafeCombatSpotlightVisibleToPlayer,
  safeCombatSpotlightSemanticKey,
  toAllowedCombatSpotlightPresentation,
} from "./filter-state-combat-spotlight.js";

export const isEventVisibleToPlayer = (
  event: EngineEvent,
  playerId: PlayerId,
): boolean =>
  event.visibility.type === "public" ||
  (event.visibility.type === "private" &&
    event.visibility.playerId === playerId);

const toPlayerEventCausedBy = (
  causedBy: EngineEvent["causedBy"],
): EngineEvent["causedBy"] | undefined => {
  if (
    causedBy === undefined ||
    causedBy.type === "effect" ||
    "queueEntryId" in causedBy
  ) {
    return undefined;
  }
  return causedBy;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObjectRecord(value) ? value : undefined;

const toAllowedZoneRef = (
  value: unknown,
): Record<string, string | number> | undefined => {
  const zoneRef = asRecord(value);
  if (zoneRef === undefined || typeof zoneRef["zone"] !== "string") {
    return undefined;
  }
  const playerId = zoneRef["playerId"];
  const index = zoneRef["index"];
  const slot = zoneRef["slot"];
  return {
    zone: zoneRef["zone"],
    ...(typeof playerId === "string" ? { playerId } : {}),
    ...(typeof index === "number" ? { index } : {}),
    ...(typeof slot === "string" ? { slot } : {}),
  };
};

const toAllowedRevealCard = (
  value: unknown,
): Record<string, unknown> | null => {
  const card = asRecord(value);
  if (card === undefined) {
    return null;
  }
  const instanceId = card["instanceId"];
  const cardId = card["cardId"];
  const playerId = card["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return null;
  }
  const zone = toAllowedZoneRef(card["zone"]);
  return {
    instanceId,
    cardId,
    playerId,
    ...(zone === undefined ? {} : { zone }),
  };
};

const countRevealCards = (value: unknown): number | undefined =>
  Array.isArray(value) ? value.length : undefined;

const toAllowedCardRef = (value: unknown): CardRef | undefined => {
  const ref = asRecord(value);
  if (ref === undefined) {
    return undefined;
  }
  const instanceId = ref["instanceId"];
  const cardId = ref["cardId"];
  const playerId = ref["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return undefined;
  }
  return {
    instanceId: instanceId as CardRef["instanceId"],
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as PlayerId,
  };
};

type SafeEffectTextTargetLink = {
  readonly spanId: `span:${string}`;
  readonly relation: EffectTextTargetLink["relation"];
  readonly cards: readonly CardRef[];
};

type SafeEffectTextPresentation = {
  readonly source: CardRef;
  readonly textKind?: "effect" | "trigger";
  readonly activeSpanIds: readonly `span:${string}`[];
  readonly targetLinks?: readonly SafeEffectTextTargetLink[];
};

const allowedEffectTextTargetLinkRelations = new Set<
  EffectTextTargetLink["relation"]
>(["candidateTarget", "selectedTarget", "affectedCard"]);

const toAllowedEffectTextTargetLinks = (
  value: unknown,
  activeSpanIds: readonly string[],
): SafeEffectTextTargetLink[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const activeSpanIdSet = new Set(activeSpanIds);
  const links = value.flatMap((candidate): SafeEffectTextTargetLink[] => {
    const link = asRecord(candidate);
    if (link === undefined) {
      return [];
    }
    const spanId = link["spanId"];
    const relation = link["relation"];
    const cards = link["cards"];
    if (
      typeof spanId !== "string" ||
      !activeSpanIdSet.has(spanId) ||
      typeof relation !== "string" ||
      !allowedEffectTextTargetLinkRelations.has(
        relation as EffectTextTargetLink["relation"],
      ) ||
      !Array.isArray(cards)
    ) {
      return [];
    }
    const safeCards = cards.flatMap((card) => {
      const safeCard = toAllowedCardRef(card);
      return safeCard === undefined ? [] : [safeCard];
    });
    return safeCards.length === 0
      ? []
      : [
          {
            spanId: spanId as `span:${string}`,
            relation: relation as EffectTextTargetLink["relation"],
            cards: safeCards,
          },
        ];
  });
  return links.length === 0 ? undefined : links;
};

const toAllowedEffectTextPresentation = (
  value: unknown,
): SafeEffectTextPresentation | undefined => {
  const presentation = asRecord(value);
  if (presentation === undefined) {
    return undefined;
  }
  const source = toAllowedCardRef(presentation["source"]);
  const activeSpanIds = presentation["activeSpanIds"];
  if (source === undefined || !Array.isArray(activeSpanIds)) {
    return undefined;
  }
  const safeSpanIds = activeSpanIds.filter(
    (spanId): spanId is `span:${string}` =>
      typeof spanId === "string" && spanId.startsWith("span:"),
  );
  if (safeSpanIds.length === 0) {
    return undefined;
  }
  const textKind = presentation["textKind"];
  const targetLinks = toAllowedEffectTextTargetLinks(
    presentation["targetLinks"],
    safeSpanIds,
  );
  return {
    source,
    ...(textKind === "effect" || textKind === "trigger" ? { textKind } : {}),
    activeSpanIds: safeSpanIds,
    ...(targetLinks === undefined ? {} : { targetLinks }),
  };
};

const toRecipientSafeTargetLinks = (
  state: GameState,
  context: PlayerEventViewContext,
  active: SafeEffectTextPresentation,
  disclosure: SpotlightEntryDisclosure | undefined,
): SafeEffectTextTargetLink[] | undefined => {
  const links = active.targetLinks;
  if (!Array.isArray(links)) {
    return undefined;
  }
  const safeLinks = links.flatMap((candidate): SafeEffectTextTargetLink[] => {
    const link = asRecord(candidate);
    if (link === undefined) {
      return [];
    }
    const spanId = link["spanId"];
    const relation = link["relation"];
    const cards = link["cards"];
    if (
      typeof spanId !== "string" ||
      !spanId.startsWith("span:") ||
      typeof relation !== "string" ||
      !allowedEffectTextTargetLinkRelations.has(
        relation as EffectTextTargetLink["relation"],
      ) ||
      !Array.isArray(cards)
    ) {
      return [];
    }
    const safeCards = cards.flatMap((card) => {
      const safeCard = toAllowedCardRef(card);
      return safeCard !== undefined &&
        isSpotlightCardRefVisibleToPlayer(
          state,
          context.playerId,
          safeCard,
          {
            type: "targetLink",
            spanId: spanId as `span:${string}`,
            relation: relation as EffectTextTargetLink["relation"],
          },
          disclosure,
        )
        ? [safeCard]
        : [];
    });
    return safeCards.length === 0
      ? []
      : [
          {
            spanId: spanId as `span:${string}`,
            relation: relation as EffectTextTargetLink["relation"],
            cards: safeCards,
          },
        ];
  });
  return safeLinks.length === 0 ? undefined : safeLinks;
};

interface PlayerEventViewContext {
  readonly playerId: PlayerId;
  readonly visiblePublicPendingDecisionId?: PublicPendingDecisionId | undefined;
}

const visiblePendingSpotlightId = (
  context: PlayerEventViewContext,
  pendingDecisionId: string,
): PublicPendingDecisionId | undefined =>
  context.visiblePublicPendingDecisionId !== undefined &&
  String(context.visiblePublicPendingDecisionId) === pendingDecisionId
    ? context.visiblePublicPendingDecisionId
    : undefined;

const safeEntryId = (
  prefix: "effectText" | "combat" | "playedCard",
  anchor: string,
  ordinal: number,
): string => `spotlight:${prefix}:${anchor}:${String(ordinal)}`;

const visibleAnchorEventId = (
  state: GameState,
  context: PlayerEventViewContext,
  eventId: string,
): EngineEvent["id"] | undefined => {
  const anchor = state.eventJournal.find(
    (candidate) => String(candidate.id) === eventId,
  );
  return anchor !== undefined &&
    isEventVisibleToPlayer(anchor, context.playerId)
    ? anchor.id
    : undefined;
};

const spotlightEntryPrefix = (
  entry: Record<string, unknown>,
): "effectText" | "combat" | "playedCard" | undefined => {
  if (entry["kind"] === "combat") {
    return "combat";
  }
  if (entry["kind"] === "playedCard") {
    return "playedCard";
  }
  return entry["kind"] === undefined || entry["kind"] === "effectText"
    ? "effectText"
    : undefined;
};

const rawAnchorForSpotlightEntry = (
  entry: Record<string, unknown>,
  fallbackEventId: EngineEvent["id"],
): string => {
  const pendingDecisionId = entry["pendingDecisionId"];
  if (
    entry["mode"] === "live" &&
    entry["status"] === "pending" &&
    typeof pendingDecisionId === "string"
  ) {
    return pendingDecisionId;
  }
  const resolvedEventId = entry["resolvedEventId"];
  return typeof resolvedEventId === "string"
    ? resolvedEventId
    : String(fallbackEventId);
};

const spotlightOrdinalForAnchor = (
  state: GameState,
  event: EngineEvent,
  prefix: "effectText" | "combat" | "playedCard",
  rawAnchor: string,
): number => {
  let ordinal = 0;
  for (const candidate of state.eventJournal) {
    if (candidate.id === event.id) {
      break;
    }
    if (
      candidate.type !== "spotlightEntryCreated" ||
      !isObjectRecord(candidate.payload)
    ) {
      continue;
    }
    const entry = asRecord(candidate.payload["entry"]);
    if (
      entry !== undefined &&
      spotlightEntryPrefix(entry) === prefix &&
      rawAnchorForSpotlightEntry(entry, candidate.id) === rawAnchor
    ) {
      ordinal += 1;
    }
  }
  return ordinal;
};

const toAllowedSpotlightEntry = (
  state: GameState,
  event: EngineEvent,
  context: PlayerEventViewContext,
  value: unknown,
  disclosure: SpotlightEntryDisclosure | undefined,
): Record<string, unknown> | undefined => {
  const entry = asRecord(value);
  if (entry === undefined) {
    return undefined;
  }
  const mode = entry["mode"];
  const status = entry["status"];
  if (
    (mode !== "live" && mode !== "resolved") ||
    (status !== "pending" && status !== "resolved")
  ) {
    return undefined;
  }
  if (entry["kind"] === "combat") {
    const combat = toAllowedCombatSpotlightPresentation(entry["combat"]);
    const resolvedEventId = entry["resolvedEventId"];
    if (
      combat === undefined ||
      !isSafeCombatSpotlightVisibleToPlayer(
        state,
        context.playerId,
        combat,
        disclosure,
      ) ||
      mode !== "resolved" ||
      status !== "resolved" ||
      typeof resolvedEventId !== "string"
    ) {
      return undefined;
    }
    const safeResolvedEventId = visibleAnchorEventId(
      state,
      context,
      resolvedEventId,
    );
    const anchorId = safeResolvedEventId ?? event.id;
    const ordinal = spotlightOrdinalForAnchor(
      state,
      event,
      "combat",
      safeResolvedEventId === undefined ? String(event.id) : resolvedEventId,
    );
    const id = safeEntryId("combat", String(anchorId), ordinal);
    return {
      kind: "combat",
      id,
      key: id,
      semanticKey: safeCombatSpotlightSemanticKey(
        String(anchorId),
        ordinal,
        combat,
      ),
      mode,
      status,
      combat,
      resolvedEventId: safeResolvedEventId ?? event.id,
    };
  }
  if (entry["kind"] === "playedCard") {
    const source = toAllowedCardRef(entry["source"]);
    const resolvedEventId = entry["resolvedEventId"];
    if (
      source === undefined ||
      !isSpotlightCardRefVisibleToPlayer(
        state,
        context.playerId,
        source,
        "playedCardSource",
        disclosure,
      ) ||
      mode !== "resolved" ||
      status !== "resolved" ||
      typeof resolvedEventId !== "string"
    ) {
      return undefined;
    }
    const safeResolvedEventId = visibleAnchorEventId(
      state,
      context,
      resolvedEventId,
    );
    const anchorId = safeResolvedEventId ?? event.id;
    const ordinal = spotlightOrdinalForAnchor(
      state,
      event,
      "playedCard",
      safeResolvedEventId === undefined ? String(event.id) : resolvedEventId,
    );
    const id = safeEntryId("playedCard", String(anchorId), ordinal);
    return {
      kind: "playedCard",
      id,
      key: id,
      semanticKey: ["playedCard", String(anchorId), String(ordinal)].join("|"),
      mode,
      status,
      source,
      resolvedEventId: safeResolvedEventId ?? event.id,
    };
  }
  const active = toAllowedEffectTextPresentation(entry["active"]);
  if (
    active === undefined ||
    !isSpotlightCardRefVisibleToPlayer(
      state,
      context.playerId,
      active.source,
      "effectSource",
      disclosure,
    )
  ) {
    return undefined;
  }
  const pendingDecisionId = entry["pendingDecisionId"];
  const resolvedEventId = entry["resolvedEventId"];
  if (entry["kind"] !== undefined && entry["kind"] !== "effectText") {
    return undefined;
  }
  const safePendingDecisionId =
    typeof pendingDecisionId === "string"
      ? visiblePendingSpotlightId(context, pendingDecisionId)
      : undefined;
  const safeResolvedEventId =
    typeof resolvedEventId === "string"
      ? visibleAnchorEventId(state, context, resolvedEventId)
      : undefined;
  const anchorId =
    mode === "live" &&
    status === "pending" &&
    safePendingDecisionId !== undefined
      ? safePendingDecisionId
      : (safeResolvedEventId ?? event.id);
  const rawAnchor =
    mode === "live" &&
    status === "pending" &&
    safePendingDecisionId !== undefined
      ? String(safePendingDecisionId)
      : safeResolvedEventId === undefined || typeof resolvedEventId !== "string"
        ? String(event.id)
        : resolvedEventId;
  const ordinal = spotlightOrdinalForAnchor(
    state,
    event,
    "effectText",
    rawAnchor,
  );
  const id = safeEntryId("effectText", String(anchorId), ordinal);
  const targetLinks = toRecipientSafeTargetLinks(
    state,
    context,
    active,
    disclosure,
  );
  const safeActive: SafeEffectTextPresentation = {
    source: active.source,
    ...(active.textKind === undefined ? {} : { textKind: active.textKind }),
    activeSpanIds: active.activeSpanIds,
    ...(targetLinks === undefined ? {} : { targetLinks }),
  };
  return {
    ...(entry["kind"] === "effectText" ? { kind: "effectText" } : {}),
    id,
    key: id,
    semanticKey: [
      "effectText",
      String(anchorId),
      String(ordinal),
      active.textKind ?? "effect",
      active.activeSpanIds.join("+"),
      mode,
      status,
    ].join("|"),
    mode,
    status,
    active: safeActive,
    ...(mode === "live" &&
    status === "pending" &&
    safePendingDecisionId !== undefined
      ? { pendingDecisionId: safePendingDecisionId }
      : {}),
    ...(mode === "resolved" &&
    status === "resolved" &&
    typeof resolvedEventId === "string"
      ? { resolvedEventId: safeResolvedEventId ?? event.id }
      : {}),
  };
};

const toAllowedSpotlightPayload = (
  state: GameState,
  event: EngineEvent,
  context: PlayerEventViewContext,
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const rawDisclosure = asRecord(payload["disclosure"]);
  const disclosure =
    rawDisclosure === undefined
      ? undefined
      : (rawDisclosure as unknown as SpotlightEntryDisclosure);
  const entry = toAllowedSpotlightEntry(
    state,
    event,
    context,
    payload["entry"],
    disclosure,
  );
  return entry === undefined ? {} : { entry };
};

const pickStringPayloadFields = (
  payload: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const value = payload[field];
      return typeof value === "string" ? [[field, value] as const] : [];
    }),
  );

const pickNumberPayloadFields = (
  payload: Record<string, unknown>,
  fields: readonly string[],
): Record<string, number> =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const value = payload[field];
      return typeof value === "number" ? [[field, value] as const] : [];
    }),
  );

const pickCardIdentityPayloadFields = (
  payload: Record<string, unknown>,
): Record<string, string> =>
  pickStringPayloadFields(payload, [
    "playerId",
    "instanceId",
    "cardId",
    "category",
    "reason",
  ]);

const pickVisibleCardPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => pickCardIdentityPayloadFields(payload);

const pickVisibleCardMovePayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const fromZone = toAllowedZoneRef(payload["from"]);
  const toZone = toAllowedZoneRef(payload["to"]);
  const from = payload["from"];
  const to = payload["to"];

  return {
    ...pickCardIdentityPayloadFields(payload),
    ...(fromZone !== undefined
      ? { from: fromZone }
      : typeof from === "string"
        ? { from }
        : {}),
    ...(toZone !== undefined
      ? { to: toZone }
      : typeof to === "string"
        ? { to }
        : {}),
  };
};

const pickPhasePayload = (
  payload: Record<string, unknown>,
): Record<string, string> =>
  pickStringPayloadFields(payload, ["phase", "playerId"]);

const countArrayPayloadField = (
  payload: Record<string, unknown>,
  field: string,
): number | undefined => {
  const value = payload[field];
  return Array.isArray(value) ? value.length : undefined;
};

const pickCostPaidPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => ({
  ...pickStringPayloadFields(payload, ["playerId", "optionId"]),
  ...(countArrayPayloadField(payload, "selectedDonInstanceIds") === undefined
    ? {}
    : {
        selectedDonCount: countArrayPayloadField(
          payload,
          "selectedDonInstanceIds",
        ),
      }),
  ...(countArrayPayloadField(payload, "selectedCardInstanceIds") === undefined
    ? {}
    : {
        selectedCardCount: countArrayPayloadField(
          payload,
          "selectedCardInstanceIds",
        ),
      }),
});

const pickCardRefPayloadFields = (
  payload: Record<string, unknown>,
  fields: readonly string[],
): Record<string, CardRef> =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const ref = toAllowedCardRef(payload[field]);
      return ref === undefined ? [] : [[field, ref] as const];
    }),
  );

const toAllowedPlayerEventPayload = (event: EngineEvent): unknown => {
  const payload = asRecord(event.payload);
  if (payload === undefined) {
    return {};
  }
  if (event.type === "phaseStarted" || event.type === "phaseEnded") {
    return pickPhasePayload(payload);
  }
  if (event.type === "decisionCreated") {
    return pickStringPayloadFields(payload, [
      "decisionId",
      "decisionType",
      "playerId",
      "prompt",
    ]);
  }
  if (event.type === "decisionResolved") {
    const base = pickStringPayloadFields(payload, [
      "decisionId",
      "decisionType",
      "playerId",
      "responseType",
      "status",
    ]);
    const selectedCount = payload["selectedCount"];
    return {
      ...base,
      ...(typeof selectedCount === "number" ? { selectedCount } : {}),
    };
  }
  if (event.type === "damageDealt") {
    return typeof payload["amount"] === "number"
      ? { amount: payload["amount"] }
      : {};
  }
  if (event.type === "lifeTaken") {
    const amount = payload["amount"];
    return {
      ...pickStringPayloadFields(payload, ["damagedPlayerId"]),
      ...(typeof amount === "number" ? { amount } : {}),
    };
  }
  if (event.type === "cardRevealed") {
    const revealCards = payload["cards"];
    if (Array.isArray(revealCards)) {
      const cards = revealCards.flatMap((card) => {
        const allowed = toAllowedRevealCard(card);
        return allowed === null ? [] : [allowed];
      });
      const revealId = payload["revealId"];
      const origin = payload["origin"];
      const reason = payload["reason"];
      const selectionSetId = payload["selectionSetId"];
      const lifeOrigin =
        isObjectRecord(origin) &&
        origin["zone"] === "life" &&
        typeof origin["playerId"] === "string"
          ? { zone: "life", playerId: origin["playerId"] }
          : undefined;
      return {
        ...(typeof revealId === "string" ? { revealId } : {}),
        cards,
        ...(typeof origin === "string" ? { origin } : {}),
        ...(lifeOrigin === undefined ? {} : { origin: lifeOrigin }),
        ...(typeof reason === "string" ? { reason } : {}),
        ...(typeof selectionSetId === "string" ? { selectionSetId } : {}),
      };
    }
    const playerId = payload["playerId"];
    const instanceId = payload["instanceId"];
    const cardId = payload["cardId"];
    if (
      typeof playerId === "string" &&
      typeof instanceId === "string" &&
      typeof cardId === "string"
    ) {
      return { playerId, instanceId, cardId };
    }
    return {};
  }
  if (event.type === "cardMoved") {
    return pickVisibleCardMovePayload(payload);
  }
  if (event.type === "costPaid") {
    return pickCostPaidPayload(payload);
  }
  if (event.type === "attackDeclared") {
    return {
      ...pickCardRefPayloadFields(payload, ["attacker", "target"]),
      ...pickNumberPayloadFields(payload, ["attackerPower", "defenderPower"]),
    };
  }
  if (event.type === "blockerActivated") {
    return {
      ...pickCardRefPayloadFields(payload, [
        "attacker",
        "blocker",
        "previousTarget",
        "currentTarget",
      ]),
      ...pickNumberPayloadFields(payload, ["attackerPower", "defenderPower"]),
    };
  }
  if (event.type === "donAttached") {
    return {
      ...pickStringPayloadFields(payload, ["playerId", "donInstanceId"]),
      ...pickCardRefPayloadFields(payload, ["target"]),
      ...(toAllowedZoneRef(payload["from"]) === undefined
        ? {}
        : { from: toAllowedZoneRef(payload["from"]) }),
      ...(toAllowedZoneRef(payload["to"]) === undefined
        ? {}
        : { to: toAllowedZoneRef(payload["to"]) }),
    };
  }
  if (event.type === "donReturned") {
    return {
      ...pickStringPayloadFields(payload, ["playerId", "donInstanceId"]),
      ...pickCardRefPayloadFields(payload, ["source"]),
      ...(toAllowedZoneRef(payload["to"]) === undefined
        ? {}
        : { to: toAllowedZoneRef(payload["to"]) }),
    };
  }
  if (
    event.type === "cardPlayed" ||
    event.type === "cardTrashed" ||
    event.type === "cardDiscarded" ||
    event.type === "cardKOd" ||
    event.type === "cardReturned" ||
    event.type === "counterUsed" ||
    event.type === "triggerActivated"
  ) {
    return pickVisibleCardPayload(payload);
  }
  return {};
};

export const toPlayerEvent = (event: EngineEvent): EngineEvent => {
  const causedBy = toPlayerEventCausedBy(event.causedBy);
  const base = {
    id: event.id,
    seq: event.seq,
    type: event.type,
    ...(event.actor === undefined ? {} : { actor: event.actor }),
    ...(event.source === undefined ? {} : { source: event.source }),
    ...(event.affected === undefined ? {} : { affected: event.affected }),
    visibility: event.visibility,
    createdAtStateSeq: event.createdAtStateSeq,
    ...(causedBy === undefined ? {} : { causedBy }),
  };

  if (event.type === "effectQueued") {
    return { ...base, payload: { status: "queued" } };
  }
  if (event.type === "effectResolved") {
    return {
      ...base,
      payload: { status: "resolved" },
    };
  }
  if (event.type === "replacementApplied") {
    return {
      ...base,
      payload: { status: "applied" },
    };
  }
  return { ...base, payload: toAllowedPlayerEventPayload(event) };
};

const shouldCensorStaleSelectionSetRevealEvent = (
  state: GameState,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardRevealed" || !isObjectRecord(event.payload)) {
    return false;
  }
  const revealId = event.payload["revealId"];
  const selectionSetId = event.payload["selectionSetId"];
  const origin = event.payload["origin"];
  if (typeof selectionSetId !== "string") {
    return false;
  }
  if (isObjectRecord(origin)) {
    return false;
  }
  if (typeof revealId !== "string") {
    return true;
  }
  return !state.revealedCards.some((record) => record.id === revealId);
};

const toCensoredSelectionSetRevealPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const revealId = payload["revealId"];
  const selectionSetId = payload["selectionSetId"];
  const revealedCount = countRevealCards(payload["cards"]);
  return {
    censored: true,
    reason: "hidden-info",
    ...(typeof revealId === "string" ? { revealId } : {}),
    ...(typeof selectionSetId === "string" ? { selectionSetId } : {}),
    ...(revealedCount === undefined ? {} : { revealedCount }),
  };
};

export const toPlayerEventForView = (
  state: GameState,
  event: EngineEvent,
  context: PlayerEventViewContext,
): EngineEvent => {
  if (event.type === "spotlightEntryCreated" && isObjectRecord(event.payload)) {
    return {
      ...toPlayerEvent(event),
      payload: toAllowedSpotlightPayload(state, event, context, event.payload),
    };
  }
  if (
    shouldCensorStaleSelectionSetRevealEvent(state, event) &&
    isObjectRecord(event.payload)
  ) {
    return {
      ...toPlayerEvent(event),
      payload: toCensoredSelectionSetRevealPayload(event.payload),
    };
  }
  return toPlayerEvent(event);
};

export const isVisibleToPlayer = (
  visibility: EventVisibility,
  playerId: PlayerId,
): boolean =>
  visibility.type === "public" ||
  (visibility.type === "private" && visibility.playerId === playerId);
