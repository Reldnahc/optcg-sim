import type { CardId, EffectId } from "./primitives.js";
import type { CardSupportStatus } from "./card-metadata.js";
import type { EffectTextPresentationRef } from "./effect-presentation.js";
import type {
  Condition,
  Cost,
  Effect,
  EffectCategory,
  FailurePolicy,
  OptionalChooseOneTrashCost,
  SourcePresencePolicy,
  Trigger,
} from "./effects.js";

export type EffectBlockCost = Exclude<Cost, OptionalChooseOneTrashCost>;

export interface EffectDefinitionMetadata {
  sourceTextHash: string;
  rulesVersion: string;
  effectDefinitionsVersion: string;
  tested: boolean;
  reviewer?: string;
  notes?: string;
  generatedBy?: "manual" | "rule-parser" | "llm-assisted";
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface EffectBlock {
  id: EffectId;
  category: EffectCategory;
  trigger: Trigger;
  condition?: Condition;
  conditionTiming?: "activation" | "resolution" | "both";
  cost?: EffectBlockCost;
  optional?: boolean;
  oncePerTurn?: boolean;
  failurePolicy?: FailurePolicy;
  sourcePresencePolicy?: SourcePresencePolicy;
  presentation?: EffectTextPresentationRef;
  effect: Effect;
}

export interface EffectDefinition {
  cardId: CardId;
  implementationStatus: CardSupportStatus;
  effects: EffectBlock[];
  metadata: EffectDefinitionMetadata;
}
