import type {
  CardRef,
  GameState,
  PlayerId,
  SpotlightEntryDisclosure,
} from "@optcg/types";

import { isSpotlightCardRefVisibleToPlayer } from "./card-ref-visibility.js";

export type SafeCombatSpotlightPresentation =
  | {
      readonly eventKind: "attackDeclared" | "blockerActivated";
      readonly attacker: CardRef;
      readonly defender: CardRef;
      readonly attackerPower?: number;
      readonly defenderPower?: number;
    }
  | {
      readonly eventKind: "damageDealt";
      readonly attacker: CardRef;
      readonly defender: CardRef;
      readonly attackerPower: number;
      readonly defenderPower: number;
      readonly amount: number;
    }
  | {
      readonly eventKind: "counterUsed";
      readonly source: CardRef;
      readonly target: CardRef;
      readonly counterPower?: number;
      readonly targetPower?: number;
    };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isObjectRecord(value) ? value : undefined;

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

export const toAllowedCombatSpotlightPresentation = (
  value: unknown,
): SafeCombatSpotlightPresentation | undefined => {
  const combat = asRecord(value);
  if (combat === undefined) {
    return undefined;
  }
  const eventKind = combat["eventKind"];
  if (eventKind === "counterUsed") {
    const source = toAllowedCardRef(combat["source"]);
    const target = toAllowedCardRef(combat["target"]);
    if (source === undefined || target === undefined) {
      return undefined;
    }
    const counterPower = combat["counterPower"];
    const targetPower = combat["targetPower"];
    return {
      eventKind,
      source,
      target,
      ...(typeof counterPower === "number" ? { counterPower } : {}),
      ...(typeof targetPower === "number" ? { targetPower } : {}),
    };
  }
  const attacker = toAllowedCardRef(combat["attacker"]);
  const defender = toAllowedCardRef(combat["defender"]);
  if (
    (eventKind !== "attackDeclared" &&
      eventKind !== "blockerActivated" &&
      eventKind !== "damageDealt") ||
    attacker === undefined ||
    defender === undefined
  ) {
    return undefined;
  }
  const attackerPower = combat["attackerPower"];
  const defenderPower = combat["defenderPower"];
  const amount = combat["amount"];
  if (eventKind === "damageDealt") {
    return typeof attackerPower === "number" &&
      typeof defenderPower === "number" &&
      typeof amount === "number"
      ? {
          eventKind,
          attacker,
          defender,
          attackerPower,
          defenderPower,
          amount,
        }
      : undefined;
  }
  return {
    eventKind,
    attacker,
    defender,
    ...(typeof attackerPower === "number" ? { attackerPower } : {}),
    ...(typeof defenderPower === "number" ? { defenderPower } : {}),
  };
};

export const isSafeCombatSpotlightVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  combat: SafeCombatSpotlightPresentation,
  disclosure: SpotlightEntryDisclosure | undefined,
): boolean =>
  combat.eventKind === "counterUsed"
    ? isSpotlightCardRefVisibleToPlayer(
        state,
        playerId,
        combat.source,
        "combatSource",
        disclosure,
      ) &&
      isSpotlightCardRefVisibleToPlayer(
        state,
        playerId,
        combat.target,
        "combatTarget",
        disclosure,
      )
    : isSpotlightCardRefVisibleToPlayer(
        state,
        playerId,
        combat.attacker,
        "combatAttacker",
        disclosure,
      ) &&
      isSpotlightCardRefVisibleToPlayer(
        state,
        playerId,
        combat.defender,
        "combatDefender",
        disclosure,
      );

export const safeCombatSpotlightSemanticKey = (
  anchorId: string,
  ordinal: number,
  combat: SafeCombatSpotlightPresentation,
): string => {
  const powerFields =
    combat.eventKind === "counterUsed"
      ? [
          combat.counterPower === undefined ? "" : String(combat.counterPower),
          combat.targetPower === undefined ? "" : String(combat.targetPower),
        ]
      : combat.eventKind === "damageDealt"
        ? [
            String(combat.attackerPower),
            String(combat.defenderPower),
            String(combat.amount),
          ]
        : [
            combat.attackerPower === undefined
              ? ""
              : String(combat.attackerPower),
            combat.defenderPower === undefined
              ? ""
              : String(combat.defenderPower),
          ];
  return [
    "combat",
    anchorId,
    String(ordinal),
    combat.eventKind,
    ...powerFields,
  ].join("|");
};
