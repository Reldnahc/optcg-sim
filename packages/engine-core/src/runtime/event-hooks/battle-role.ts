import type {
  CardFilter,
  CardId,
  CardInstance,
  CardRef,
  PlayerId,
  PlayerRef,
  Trigger,
} from "@optcg/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
  return {
    instanceId: instanceId as CardRef["instanceId"],
    cardId: cardId as CardId,
    playerId: playerId as PlayerId,
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
    cardId: cardId as CardId,
    playerId: playerId as PlayerId,
  };
};

type BattleRoleTrigger = {
  readonly role?: Extract<Trigger, { type: "attackDeclared" }>["role"];
  readonly player?: PlayerRef;
  readonly filter?: CardFilter;
  readonly targetPlayer?: PlayerRef;
  readonly targetFilter?: CardFilter;
  readonly counterpartPlayer?: PlayerRef;
  readonly counterpartFilter?: CardFilter;
};

const roleRefPairs = (
  payload: Record<string, unknown>,
  role: NonNullable<BattleRoleTrigger["role"]>,
): ReadonlyArray<{
  readonly roleRef: CardRef;
  readonly counterpart?: CardRef;
}> => {
  const attacker = flattenedCardRef(payload, "attacker");
  const target = flattenedCardRef(payload, "target");
  if (role === "attacker") {
    return attacker === undefined
      ? []
      : [
          {
            roleRef: attacker,
            ...(target === undefined ? {} : { counterpart: target }),
          },
        ];
  }
  if (role === "target") {
    return target === undefined
      ? []
      : [
          {
            roleRef: target,
            ...(attacker === undefined ? {} : { counterpart: attacker }),
          },
        ];
  }
  return [
    ...(attacker === undefined
      ? []
      : [
          {
            roleRef: attacker,
            ...(target === undefined ? {} : { counterpart: target }),
          },
        ]),
    ...(target === undefined
      ? []
      : [
          {
            roleRef: target,
            ...(attacker === undefined ? {} : { counterpart: attacker }),
          },
        ]),
  ];
};

const roleRefMatchesSource = (
  roleRef: CardRef,
  source: CardInstance,
): boolean =>
  roleRef.instanceId === source.instanceId && roleRef.cardId === source.cardId;

const targetMatches = (
  payload: Record<string, unknown>,
  trigger: BattleRoleTrigger,
  matchesPlayerRef: (ref: PlayerRef, playerId: PlayerId) => boolean,
  matchesCard: (cardId: CardId, filter: CardFilter | undefined) => boolean,
): boolean => {
  if (
    trigger.targetPlayer === undefined &&
    trigger.targetFilter === undefined
  ) {
    return true;
  }
  const target = flattenedCardRef(payload, "target");
  return (
    target !== undefined &&
    (trigger.targetPlayer === undefined ||
      matchesPlayerRef(trigger.targetPlayer, target.playerId)) &&
    matchesCard(target.cardId, trigger.targetFilter)
  );
};

const counterpartMatches = (
  trigger: BattleRoleTrigger,
  counterpart: CardRef | undefined,
  matchesPlayerRef: (ref: PlayerRef, playerId: PlayerId) => boolean,
  matchesCard: (cardId: CardId, filter: CardFilter | undefined) => boolean,
): boolean => {
  if (
    trigger.counterpartPlayer === undefined &&
    trigger.counterpartFilter === undefined
  ) {
    return true;
  }
  return (
    counterpart !== undefined &&
    (trigger.counterpartPlayer === undefined ||
      matchesPlayerRef(trigger.counterpartPlayer, counterpart.playerId)) &&
    matchesCard(counterpart.cardId, trigger.counterpartFilter)
  );
};

export const matchBattleRoleEvent = (params: {
  readonly payload: Record<string, unknown>;
  readonly source: CardInstance;
  readonly trigger: BattleRoleTrigger;
  readonly matchesPlayerRef: (ref: PlayerRef, playerId: PlayerId) => boolean;
  readonly matchesCard: (
    cardId: CardId,
    filter: CardFilter | undefined,
  ) => boolean;
}): boolean => {
  const { payload, source, trigger } = params;
  if (trigger.role === undefined || trigger.player === undefined) {
    return true;
  }
  return (
    targetMatches(
      payload,
      trigger,
      params.matchesPlayerRef,
      params.matchesCard,
    ) &&
    roleRefPairs(payload, trigger.role).some(
      ({ roleRef, counterpart }) =>
        roleRefMatchesSource(roleRef, source) &&
        params.matchesPlayerRef(trigger.player ?? "self", roleRef.playerId) &&
        params.matchesCard(roleRef.cardId, trigger.filter) &&
        counterpartMatches(
          trigger,
          counterpart,
          params.matchesPlayerRef,
          params.matchesCard,
        ),
    )
  );
};
