import type { CardRef } from "./card-metadata.js";
import type { PublicPendingDecisionId } from "./decisions.js";
import type {
  EffectId,
  EngineEventId,
  InstanceId,
  PlayerId,
  QueueEntryId,
} from "./primitives.js";

export type EffectTextDocumentKind = "effect" | "trigger";

export type EffectTextSpanRole =
  | "line"
  | "entry"
  | "marker"
  | "cost"
  | "condition"
  | "choice"
  | "choiceOption"
  | "connector"
  | "body"
  | "target"
  | "filter"
  | "duration";

export type EffectTextSpanId = `span:${string}`;

export interface EffectTextSpan {
  readonly id: EffectTextSpanId;
  readonly role: EffectTextSpanRole;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly primitiveEvidence?: readonly string[];
  readonly effectBlockId?: string;
  readonly effectPath?: readonly string[];
  readonly sequenceIndex?: number;
  readonly parentSpanId?: EffectTextSpanId;
}

export interface EffectTextSourceMap {
  readonly textKind: EffectTextDocumentKind;
  readonly sourceText: string;
  readonly spans: readonly EffectTextSpan[];
}

export interface EffectTextPresentationRef {
  readonly textKind: EffectTextDocumentKind;
  readonly spanIds: readonly EffectTextSpanId[];
}

export interface EffectTextTargetLink {
  readonly spanId: EffectTextSpanId;
  readonly cards: readonly CardRef[];
  readonly relation: "candidateTarget" | "selectedTarget" | "affectedCard";
}

export interface ActiveEffectTextPresentation {
  readonly source: CardRef;
  readonly textKind?: EffectTextDocumentKind;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly targetLinks?: readonly EffectTextTargetLink[];
}

export type EffectSpotlightHistoryEntryStatus = "pending" | "resolved";

export interface EffectSpotlightHistoryEntryBase {
  readonly id: string;
  readonly key: string;
  readonly semanticKey: string;
  readonly mode: "live" | "resolved";
  readonly status: EffectSpotlightHistoryEntryStatus;
}

export interface EffectTextSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind?: "effectText";
  readonly active: ActiveEffectTextPresentation;
  readonly pendingDecisionId?: PublicPendingDecisionId;
  readonly resolvedEventId?: EngineEventId;
  readonly queueEntryId?: QueueEntryId;
  readonly effectBlockId?: EffectId;
}

export type CombatSpotlightEventKind =
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageDealt"
  | "battleKOd";

interface BattleStepCombatSpotlightPresentation {
  readonly eventKind: "attackDeclared" | "blockerActivated";
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower?: number;
  readonly defenderPower?: number;
}

interface DamageDealtCombatSpotlightPresentation {
  readonly eventKind: "damageDealt";
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower: number;
  readonly defenderPower: number;
  readonly amount: number;
}

interface BattleKOCombatSpotlightPresentation {
  readonly eventKind: "battleKOd";
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower: number;
  readonly defenderPower: number;
}

interface CounterCombatSpotlightPresentation {
  readonly eventKind: "counterUsed";
  readonly source: CardRef;
  readonly target: CardRef;
  readonly counterPower?: number;
  readonly targetPower?: number;
}

export type CombatSpotlightPresentation =
  | BattleStepCombatSpotlightPresentation
  | DamageDealtCombatSpotlightPresentation
  | BattleKOCombatSpotlightPresentation
  | CounterCombatSpotlightPresentation;

export interface CombatSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind: "combat";
  readonly combat: CombatSpotlightPresentation;
  readonly resolvedEventId: EngineEventId;
}

export interface PlayedCardSpotlightHistoryEntry extends EffectSpotlightHistoryEntryBase {
  readonly kind: "playedCard";
  readonly source: CardRef;
  readonly resolvedEventId: EngineEventId;
}

export type EffectSpotlightHistoryEntry =
  | EffectTextSpotlightHistoryEntry
  | CombatSpotlightHistoryEntry
  | PlayedCardSpotlightHistoryEntry;

export interface EffectSpotlightHistory {
  readonly entries: readonly EffectSpotlightHistoryEntry[];
  readonly presentKey?: string;
}

export type SpotlightDisclosureVisibility =
  | { readonly type: "public" }
  | { readonly type: "private"; readonly playerId: PlayerId };

export interface SpotlightTargetLinkDisclosure {
  readonly spanId: EffectTextSpanId;
  readonly relation: EffectTextTargetLink["relation"];
  readonly cardInstanceId: InstanceId;
  readonly visibility: SpotlightDisclosureVisibility;
}

export interface SpotlightEntryCardRefDisclosure {
  readonly role:
    | "effectSource"
    | "playedCardSource"
    | "combatAttacker"
    | "combatDefender"
    | "combatSource"
    | "combatTarget";
  readonly cardInstanceId: InstanceId;
  readonly visibility: SpotlightDisclosureVisibility;
}

export interface SpotlightEntryDisclosure {
  readonly entryRefs?: readonly SpotlightEntryCardRefDisclosure[];
  readonly targetLinks?: readonly SpotlightTargetLinkDisclosure[];
}

export interface SpotlightEntryCreatedPayload {
  readonly entry: EffectSpotlightHistoryEntry;
  readonly disclosure?: SpotlightEntryDisclosure;
}
