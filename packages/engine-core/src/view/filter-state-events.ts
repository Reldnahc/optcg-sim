import type {
  EngineEvent,
  EventVisibility,
  GameState,
  PlayerId,
} from "@optcg/types";

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

const toAllowedCardRef = (
  value: unknown,
): Record<string, string> | undefined => {
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
  return { instanceId, cardId, playerId };
};

const toAllowedEffectTextPresentation = (
  value: unknown,
): Record<string, unknown> | undefined => {
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
  return {
    source,
    ...(textKind === "effect" || textKind === "trigger" ? { textKind } : {}),
    activeSpanIds: safeSpanIds,
  };
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
): Record<string, Record<string, string>> =>
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
    return pickCardRefPayloadFields(payload, ["attacker", "target"]);
  }
  if (event.type === "blockerActivated") {
    return pickCardRefPayloadFields(payload, [
      "blocker",
      "previousTarget",
      "currentTarget",
    ]);
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
    const payload = asRecord(event.payload);
    const presentation =
      payload === undefined
        ? undefined
        : toAllowedEffectTextPresentation(payload["presentation"]);
    return {
      ...base,
      payload: {
        status: "resolved",
        ...(presentation === undefined ? {} : { presentation }),
      },
    };
  }
  if (event.type === "replacementApplied") {
    const payload = asRecord(event.payload);
    const presentation =
      payload === undefined
        ? undefined
        : toAllowedEffectTextPresentation(payload["presentation"]);
    return {
      ...base,
      payload: {
        status: "applied",
        ...(presentation === undefined ? {} : { presentation }),
      },
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
): EngineEvent => {
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
