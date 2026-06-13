import type {
  CardFilter,
  CardId,
  CardInstance,
  CardRef,
  EngineEvent,
  GameState,
  PlayerId,
  PlayerRef,
  ResolvedCard,
  Trigger,
} from "@optcg/types";

import { cardMatchesSearchFilter, getOpponentId } from "../../actions/state.js";
import { zoneRefFromUnknown } from "../../effect-runtime-trigger-source-lookup.js";

export type EventReactionTriggerType =
  | "damageDealt"
  | "fieldRemoved"
  | "cardPlayed"
  | "cardRested"
  | "donReturned"
  | "donAttached"
  | "attackDeclared"
  | "onBlock"
  | "effectQueued"
  | "effectResolved"
  | "triggerActivated"
  | "lifeRemoved"
  | "onOpponentAttack"
  | "opponentActivated";

export interface EventTriggerMatch {
  readonly matched: boolean;
  readonly triggerTypes: readonly EventReactionTriggerType[];
}

const noMatch = (): EventTriggerMatch => ({
  matched: false,
  triggerTypes: [],
});

const primitiveMatch = (
  triggerType: EventReactionTriggerType,
  matched: boolean,
): EventTriggerMatch =>
  matched ? { matched: true, triggerTypes: [triggerType] } : noMatch();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const publicPayload = (
  event: EngineEvent,
): Record<string, unknown> | undefined =>
  event.visibility.type === "public" && isRecord(event.payload)
    ? event.payload
    : undefined;

const playerRefMatchesSource = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  playerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return playerId === source.controller;
    case "owner":
      return playerId === source.owner;
    case "opponent":
      return playerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return playerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return playerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const resolvedCardForId = (
  state: GameState,
  cardId: unknown,
): ResolvedCard | undefined =>
  typeof cardId === "string"
    ? state.cardManifest.cards[cardId as CardId]
    : undefined;

const matchesResolvedFilter = (
  state: GameState,
  resolved: ResolvedCard | undefined,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (resolved === undefined) {
    return false;
  }
  return cardMatchesSearchFilter(resolved, filter);
};

const matchesSourceEvidence = (
  state: GameState,
  source: CardInstance,
  sourceController: PlayerRef | undefined,
  sourceKind: string | undefined,
  payload: Record<string, unknown>,
): boolean => {
  if (sourceController !== undefined) {
    const sourceControllerId = payload["sourceControllerId"];
    if (
      typeof sourceControllerId !== "string" ||
      !playerRefMatchesSource(
        state,
        source,
        sourceController,
        sourceControllerId as PlayerId,
      )
    ) {
      return false;
    }
  }
  return sourceKind === undefined || sourceKind === "any"
    ? true
    : payload["sourceKind"] === sourceKind;
};

const cardRefFromUnknown = (value: unknown): CardRef | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const instanceId = value["instanceId"];
  const cardId = value["cardId"];
  const playerId = value["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return undefined;
  }
  const zone = zoneRefFromUnknown(value["zone"]);
  return {
    instanceId: instanceId as CardRef["instanceId"],
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as PlayerId,
    ...(zone === undefined ? {} : { zone }),
  };
};

const flattenedCardRef = (
  payload: Record<string, unknown>,
  prefix: "attacker" | "target",
): CardRef | undefined => {
  const nested = cardRefFromUnknown(payload[prefix]);
  if (nested !== undefined) {
    return nested;
  }
  const playerId = payload[`${prefix}PlayerId`];
  const cardId = payload[`${prefix}CardId`];
  const instanceId = payload[`${prefix}InstanceId`];
  if (typeof playerId !== "string" || typeof cardId !== "string") {
    return undefined;
  }
  return {
    instanceId:
      typeof instanceId === "string"
        ? (instanceId as CardRef["instanceId"])
        : ("" as CardRef["instanceId"]),
    cardId: cardId as CardRef["cardId"],
    playerId: playerId as PlayerId,
  };
};

const damagedPlayer = (
  state: GameState,
  event: EngineEvent,
): PlayerId | undefined => {
  const payload = publicPayload(event);
  if (event.type !== "damageDealt" || payload === undefined) {
    return undefined;
  }
  const damagedPlayerId = payload["damagedPlayerId"];
  if (typeof damagedPlayerId === "string") {
    return damagedPlayerId as PlayerId;
  }
  const target = payload["target"];
  if (typeof target !== "string") {
    return undefined;
  }
  return Object.values(state.players).find(
    (player) => player.leader.instanceId === target,
  )?.playerId;
};

const matchDamageDealt = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "damageDealt" }>,
  event: EngineEvent,
): boolean => {
  const playerId = damagedPlayer(state, event);
  return (
    playerId !== undefined &&
    trigger.players.some((ref) =>
      playerRefMatchesSource(state, source, ref, playerId),
    )
  );
};

const isFieldZone = (zone: string): boolean =>
  zone === "leaderArea" || zone === "characterArea" || zone === "stageArea";

const matchFieldRemoved = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "fieldRemoved" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "cardMoved" || payload === undefined) {
    return false;
  }
  const from = zoneRefFromUnknown(payload["from"]);
  if (
    from?.playerId === undefined ||
    !isFieldZone(from.zone) ||
    !playerRefMatchesSource(state, source, trigger.player, from.playerId)
  ) {
    return false;
  }
  if (
    trigger.target === "self" &&
    (payload["instanceId"] !== source.instanceId ||
      payload["cardId"] !== source.cardId)
  ) {
    return false;
  }
  if (trigger.sourceKind === "ko" && payload["reason"] !== "ko") {
    return false;
  }
  if (
    trigger.sourceKind !== "ko" &&
    !matchesSourceEvidence(
      state,
      source,
      trigger.sourceController,
      trigger.sourceKind,
      payload,
    )
  ) {
    return false;
  }
  return matchesResolvedFilter(
    state,
    resolvedCardForId(state, payload["cardId"]),
    trigger.filter,
  );
};

const matchLifeRemoved = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "lifeRemoved" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "cardMoved" || payload === undefined) {
    return false;
  }
  const from = zoneRefFromUnknown(payload["from"]);
  const playerId =
    from?.zone === "life" && from.playerId !== undefined
      ? from.playerId
      : payload["from"] === "life" && typeof payload["playerId"] === "string"
        ? (payload["playerId"] as PlayerId)
        : undefined;
  const to = zoneRefFromUnknown(payload["to"]);
  const destination =
    to?.zone ?? (typeof payload["to"] === "string" ? payload["to"] : undefined);
  return (
    playerId !== undefined &&
    (trigger.destination === undefined ||
      destination === trigger.destination) &&
    trigger.players.some((ref) =>
      playerRefMatchesSource(state, source, ref, playerId),
    )
  );
};

const matchesCardPlayedBranch = (
  state: GameState,
  payload: Record<string, unknown>,
  resolved: ResolvedCard | undefined,
  branch: {
    readonly filter?: CardFilter;
    readonly sourceZone?: string;
    readonly sourceFilter?: CardFilter;
  },
): boolean => {
  if (branch.sourceFilter !== undefined) {
    return false;
  }
  if (
    branch.sourceZone !== undefined &&
    payload["sourceZone"] !== branch.sourceZone
  ) {
    return false;
  }
  return matchesResolvedFilter(state, resolved, branch.filter);
};

const matchCardPlayed = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardPlayed" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "cardPlayed" || payload === undefined) {
    return false;
  }
  if (trigger.sourceFilter !== undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (
    trigger.sourceZone !== undefined &&
    payload["sourceZone"] !== trigger.sourceZone
  ) {
    return false;
  }
  const resolved = resolvedCardForId(state, payload["cardId"]);
  if (!matchesResolvedFilter(state, resolved, trigger.filter)) {
    return false;
  }
  return (
    trigger.anyOf === undefined ||
    trigger.anyOf.some((branch) =>
      matchesCardPlayedBranch(state, payload, resolved, branch),
    )
  );
};

const matchCardRested = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardRested" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "cardRested" || payload === undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (
    trigger.target === "self" &&
    (payload["instanceId"] !== source.instanceId ||
      payload["cardId"] !== source.cardId)
  ) {
    return false;
  }
  return (
    matchesSourceEvidence(
      state,
      source,
      trigger.sourceController,
      trigger.sourceKind,
      payload,
    ) &&
    matchesResolvedFilter(
      state,
      resolvedCardForId(state, payload["cardId"]),
      trigger.filter,
    ) &&
    matchesResolvedFilter(
      state,
      resolvedCardForId(state, payload["sourceCardId"]),
      trigger.sourceFilter,
    )
  );
};

const matchDonReturned = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "donReturned" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "donReturned" || payload === undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  return (
    typeof playerId === "string" &&
    playerRefMatchesSource(
      state,
      source,
      trigger.player,
      playerId as PlayerId,
    ) &&
    matchesSourceEvidence(
      state,
      source,
      trigger.sourceController,
      trigger.sourceKind,
      payload,
    )
  );
};

const matchDonAttachedTarget = (
  source: CardInstance,
  trigger: Extract<Trigger, { type: "donAttached" }>,
  payload: Record<string, unknown>,
): boolean => {
  if (trigger.target === undefined || trigger.target === "any") {
    return true;
  }
  if (trigger.target === "self") {
    return (
      payload["targetInstanceId"] === source.instanceId &&
      payload["targetCardId"] === source.cardId
    );
  }
  const target = cardRefFromUnknown(payload["target"]);
  const targetPlayerId = payload["targetPlayerId"];
  const rawTarget = payload["target"];
  const nestedTargetZone = isRecord(rawTarget)
    ? zoneRefFromUnknown(rawTarget["zone"])?.zone
    : undefined;
  const targetZone =
    target?.zone?.zone ??
    nestedTargetZone ??
    (typeof payload["targetZone"] === "string"
      ? payload["targetZone"]
      : undefined);
  return (
    targetPlayerId === source.controller &&
    (targetZone === "leaderArea" || targetZone === "characterArea")
  );
};

const matchDonAttached = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "donAttached" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "donAttached" || payload === undefined) {
    return false;
  }
  const playerId = payload["playerId"] ?? payload["targetPlayerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  if (!matchDonAttachedTarget(source, trigger, payload)) {
    return false;
  }
  return (
    matchesSourceEvidence(
      state,
      source,
      trigger.sourceController,
      trigger.sourceKind,
      payload,
    ) &&
    matchesResolvedFilter(
      state,
      resolvedCardForId(state, payload["targetCardId"]),
      trigger.filter,
    )
  );
};

const attackRoleRefs = (
  payload: Record<string, unknown>,
  role: Extract<Trigger, { type: "attackDeclared" }>["role"],
): readonly CardRef[] => {
  const attacker = flattenedCardRef(payload, "attacker");
  const target = flattenedCardRef(payload, "target");
  if (role === "attacker") {
    return attacker === undefined ? [] : [attacker];
  }
  if (role === "target") {
    return target === undefined ? [] : [target];
  }
  return [attacker, target].filter((ref): ref is CardRef => ref !== undefined);
};

const matchAttackDeclared = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "attackDeclared" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "attackDeclared" || payload === undefined) {
    return false;
  }
  return attackRoleRefs(payload, trigger.role).some(
    (ref) =>
      playerRefMatchesSource(state, source, trigger.player, ref.playerId) &&
      matchesResolvedFilter(
        state,
        resolvedCardForId(state, ref.cardId),
        trigger.filter,
      ),
  );
};

const matchOpponentAttack = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "onOpponentAttack" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "attackDeclared" || payload === undefined) {
    return false;
  }
  const attacker = flattenedCardRef(payload, "attacker");
  return (
    attacker !== undefined &&
    attacker.playerId === getOpponentId(state, source.controller) &&
    matchesResolvedFilter(
      state,
      resolvedCardForId(state, attacker.cardId),
      trigger.attackerFilter,
    )
  );
};

const matchOnBlock = (
  source: CardInstance,
  trigger: Extract<Trigger, { type: "onBlock" }>,
  event: EngineEvent,
): boolean => {
  void trigger;
  const payload = publicPayload(event);
  if (event.type !== "blockerActivated" || payload === undefined) {
    return false;
  }
  const blocker = cardRefFromUnknown(payload["blocker"]);
  return (
    blocker !== undefined &&
    blocker.playerId === source.controller &&
    blocker.instanceId === source.instanceId &&
    blocker.cardId === source.cardId
  );
};

const payloadPlayerId = (
  payload: Record<string, unknown>,
): PlayerId | undefined =>
  typeof payload["playerId"] === "string"
    ? (payload["playerId"] as PlayerId)
    : undefined;

const opponentActivationFromEvent = (
  state: GameState,
  event: EngineEvent,
):
  | {
      readonly kind: "event" | "blocker" | "trigger";
      readonly playerId: PlayerId;
    }
  | undefined => {
  const payload = publicPayload(event);
  if (payload === undefined) {
    return undefined;
  }
  if (event.type === "cardPlayed") {
    const playerId = payloadPlayerId(payload);
    return playerId !== undefined && payload["category"] === "event"
      ? { kind: "event", playerId }
      : undefined;
  }
  if (event.type === "counterUsed") {
    const playerId = payloadPlayerId(payload);
    const resolved = resolvedCardForId(state, payload["cardId"]);
    return playerId !== undefined && resolved?.category === "event"
      ? { kind: "event", playerId }
      : undefined;
  }
  if (event.type === "triggerActivated") {
    const playerId = payloadPlayerId(payload);
    return playerId === undefined ? undefined : { kind: "trigger", playerId };
  }
  if (event.type === "blockerActivated") {
    const blocker = payload["blocker"];
    if (!isRecord(blocker) || typeof blocker["playerId"] !== "string") {
      return undefined;
    }
    return { kind: "blocker", playerId: blocker["playerId"] as PlayerId };
  }
  return undefined;
};

const matchOpponentActivated = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "opponentActivated" }>,
  event: EngineEvent,
): boolean => {
  const activation = opponentActivationFromEvent(state, event);
  return (
    activation !== undefined &&
    activation.playerId === getOpponentId(state, source.controller) &&
    trigger.activations.includes(activation.kind)
  );
};

const entryPointTypeFromPayload = (
  payload: Record<string, unknown>,
): string | undefined => {
  const entryPoint = payload["entryPoint"];
  if (isRecord(entryPoint) && typeof entryPoint["type"] === "string") {
    return entryPoint["type"];
  }
  return typeof entryPoint === "string" ? entryPoint : undefined;
};

const matchEffectQueued = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "effectQueued" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "effectQueued" || payload === undefined) {
    return false;
  }
  const controllerId = payload["controllerId"];
  if (
    typeof controllerId !== "string" ||
    !playerRefMatchesSource(
      state,
      source,
      trigger.player,
      controllerId as PlayerId,
    )
  ) {
    return false;
  }
  if (
    trigger.effectEntryPoint !== undefined &&
    entryPointTypeFromPayload(payload) !== trigger.effectEntryPoint.type
  ) {
    return false;
  }
  if (
    trigger.effectCategory !== undefined &&
    payload["effectCategory"] !== trigger.effectCategory
  ) {
    return false;
  }
  const sourceResolved = resolvedCardForId(state, payload["sourceCardId"]);
  return matchesResolvedFilter(state, sourceResolved, trigger.sourceFilter);
};

const matchEffectResolved = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "effectResolved" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "effectResolved" || payload === undefined) {
    return false;
  }
  const controllerId = payload["controllerId"];
  if (
    typeof controllerId !== "string" ||
    !playerRefMatchesSource(
      state,
      source,
      trigger.player,
      controllerId as PlayerId,
    )
  ) {
    return false;
  }
  if (
    trigger.effectEntryPoint !== undefined &&
    entryPointTypeFromPayload(payload) !== trigger.effectEntryPoint.type
  ) {
    return false;
  }
  if (
    trigger.effectCategory !== undefined &&
    payload["effectCategory"] !== trigger.effectCategory
  ) {
    return false;
  }
  if (payload["status"] !== "resolved") {
    return false;
  }
  const sourceResolved = resolvedCardForId(state, payload["sourceCardId"]);
  return matchesResolvedFilter(state, sourceResolved, trigger.sourceFilter);
};

const matchTriggerActivated = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "triggerActivated" }>,
  event: EngineEvent,
): boolean => {
  const payload = publicPayload(event);
  if (event.type !== "triggerActivated" || payload === undefined) {
    return false;
  }
  const playerId = payload["playerId"];
  if (
    typeof playerId !== "string" ||
    !playerRefMatchesSource(state, source, trigger.player, playerId as PlayerId)
  ) {
    return false;
  }
  const sourceResolved = resolvedCardForId(state, payload["sourceCardId"]);
  return matchesResolvedFilter(state, sourceResolved, trigger.sourceFilter);
};

const matchPrimitiveEventTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Exclude<Trigger, { type: "anyOf" }>,
  event: EngineEvent,
): EventTriggerMatch => {
  if (trigger.type === "damageDealt") {
    return primitiveMatch(
      "damageDealt",
      matchDamageDealt(state, source, trigger, event),
    );
  }
  if (trigger.type === "fieldRemoved") {
    return primitiveMatch(
      "fieldRemoved",
      matchFieldRemoved(state, source, trigger, event),
    );
  }
  if (trigger.type === "cardPlayed") {
    return primitiveMatch(
      "cardPlayed",
      matchCardPlayed(state, source, trigger, event),
    );
  }
  if (trigger.type === "cardRested") {
    return primitiveMatch(
      "cardRested",
      matchCardRested(state, source, trigger, event),
    );
  }
  if (trigger.type === "donReturned") {
    return primitiveMatch(
      "donReturned",
      matchDonReturned(state, source, trigger, event),
    );
  }
  if (trigger.type === "donAttached") {
    return primitiveMatch(
      "donAttached",
      matchDonAttached(state, source, trigger, event),
    );
  }
  if (trigger.type === "attackDeclared") {
    return primitiveMatch(
      "attackDeclared",
      matchAttackDeclared(state, source, trigger, event),
    );
  }
  if (trigger.type === "effectQueued") {
    return primitiveMatch(
      "effectQueued",
      matchEffectQueued(state, source, trigger, event),
    );
  }
  if (trigger.type === "effectResolved") {
    return primitiveMatch(
      "effectResolved",
      matchEffectResolved(state, source, trigger, event),
    );
  }
  if (trigger.type === "triggerActivated") {
    return primitiveMatch(
      "triggerActivated",
      matchTriggerActivated(state, source, trigger, event),
    );
  }
  if (trigger.type === "lifeRemoved") {
    return primitiveMatch(
      "lifeRemoved",
      matchLifeRemoved(state, source, trigger, event),
    );
  }
  if (trigger.type === "onOpponentAttack") {
    return primitiveMatch(
      "onOpponentAttack",
      matchOpponentAttack(state, source, trigger, event),
    );
  }
  if (trigger.type === "onBlock") {
    return primitiveMatch("onBlock", matchOnBlock(source, trigger, event));
  }
  if (trigger.type === "opponentActivated") {
    return primitiveMatch(
      "opponentActivated",
      matchOpponentActivated(state, source, trigger, event),
    );
  }
  return noMatch();
};

const combineChildMatches = (
  matches: readonly EventTriggerMatch[],
): EventTriggerMatch => {
  const triggerTypes: EventReactionTriggerType[] = [];
  for (const match of matches) {
    for (const triggerType of match.triggerTypes) {
      if (!triggerTypes.includes(triggerType)) {
        triggerTypes.push(triggerType);
      }
    }
  }
  return { matched: triggerTypes.length > 0, triggerTypes };
};

export const matchEventTrigger = (
  state: GameState,
  source: CardInstance,
  trigger: Trigger,
  event: EngineEvent,
): EventTriggerMatch => {
  if (trigger.type === "anyOf") {
    return combineChildMatches(
      trigger.triggers.map((child) =>
        matchEventTrigger(state, source, child, event),
      ),
    );
  }
  return matchPrimitiveEventTrigger(state, source, trigger, event);
};
