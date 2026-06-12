import type { PlayerRef, Zone } from "./primitives.js";
import type { CardFilter, ReplacementTrigger } from "./effects.js";

export type EffectCategory = "auto" | "activate" | "permanent" | "replacement";

export type EffectEntryPointFilter = {
  type:
    | "onPlay"
    | "whenAttacking"
    | "onOpponentAttack"
    | "onBlock"
    | "onKO"
    | "endOfYourTurn"
    | "endOfOpponentTurn"
    | "trigger"
    | "damageDealt"
    | "lifeRemoved"
    | "fieldRemoved"
    | "cardPlayed"
    | "cardRested"
    | "donReturned"
    | "donAttached"
    | "attackDeclared"
    | "handTrashedByEffect"
    | "opponentActivated"
    | "donAttach"
    | "activateMain"
    | "main"
    | "counter"
    | "permanent"
    | "replacement"
    | "startOfGame"
    | "startOfYourTurn"
    | "startOfOpponentTurn"
    | "startOfMainPhase"
    | "endOfBattle"
    | "custom"
    | "effectQueued";
};

export type OpponentActivationKind = "event" | "blocker" | "trigger";

export type Trigger =
  | { type: "onPlay" }
  | { type: "whenAttacking" }
  | { type: "onOpponentAttack"; attackerFilter?: CardFilter }
  | { type: "onBlock" }
  | { type: "onKO" }
  | { type: "endOfYourTurn" }
  | { type: "endOfOpponentTurn" }
  | { type: "trigger" }
  | { type: "anyOf"; triggers: Trigger[] }
  | { type: "damageDealt"; players: PlayerRef[] }
  | { type: "lifeRemoved"; players: PlayerRef[]; destination?: Zone }
  | {
      type: "fieldRemoved";
      target?: "self" | "any";
      player: PlayerRef;
      filter?: CardFilter;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "ko" | "any";
    }
  | {
      type: "cardPlayed";
      player: PlayerRef;
      filter?: CardFilter;
      sourceZone?: Zone;
      sourceFilter?: CardFilter;
      anyOf?: Array<{
        filter?: CardFilter;
        sourceZone?: Zone;
        sourceFilter?: CardFilter;
      }>;
    }
  | {
      type: "cardRested";
      target?: "self" | "any";
      player: PlayerRef;
      filter?: CardFilter;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "any";
    }
  | {
      type: "donReturned";
      player: PlayerRef;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "any";
    }
  | {
      type: "donAttached";
      player: PlayerRef;
      target?: "self" | "yourLeaderOrCharacters" | "any";
      filter?: CardFilter;
      sourceController?: PlayerRef;
      sourceKind?: "effect" | "any";
    }
  | {
      type: "attackDeclared";
      role: "attacker" | "target" | "attackerOrTarget";
      player: PlayerRef;
      filter?: CardFilter;
    }
  | {
      type: "effectQueued";
      player: PlayerRef;
      effectEntryPoint?: EffectEntryPointFilter;
      effectCategory?: EffectCategory;
      sourceFilter?: CardFilter;
    }
  | {
      type: "effectResolved";
      player: PlayerRef;
      effectEntryPoint?: EffectEntryPointFilter;
      effectCategory?: EffectCategory;
      sourceFilter?: CardFilter;
      status?: "resolved";
    }
  | {
      type: "triggerActivated";
      player: PlayerRef;
      sourceFilter?: CardFilter;
    }
  | {
      type: "handTrashedByEffect";
      player: PlayerRef;
      sourceFilter?: CardFilter;
    }
  | { type: "opponentActivated"; activations: OpponentActivationKind[] }
  | { type: "donAttach"; count: number }
  | { type: "activateMain" }
  | { type: "main" }
  | { type: "counter" }
  | { type: "permanent" }
  | { type: "replacement"; replacement: ReplacementTrigger }
  | { type: "startOfGame" }
  | { type: "startOfYourTurn" }
  | { type: "startOfOpponentTurn" }
  | { type: "startOfMainPhase" }
  | { type: "endOfBattle" }
  | { type: "custom"; event: string };
