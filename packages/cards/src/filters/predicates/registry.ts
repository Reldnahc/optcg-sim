import {
  parseActiveCharacterPredicate,
  parseCharacterCategoryPredicate,
  parseColorPredicate,
  parseEventCategoryPredicate,
  parseGenericCardPredicate,
  parseRestedCharacterPredicate,
  parseStageCategoryPredicate,
} from "./category.js";
import {
  parseEffectEntryPointPredicate,
  parseEffectEntryPointPresencePredicate,
} from "./effect-entry.js";
import {
  parseCardNameContainsPredicate,
  parseDifferentNamesPredicate,
  parseNameCardPredicate,
  parseNameExclusionPredicate,
  parseNamePredicate,
  parseSelfExclusionPredicate,
} from "./name.js";
import {
  parseCostPredicate,
  parseDynamicDonFieldCostPredicate,
  parsePowerPredicate,
} from "./stats.js";
import {
  parseAttributeCardPredicate,
  parseAttributeCategoryPredicate,
  parseAttributeOnlyPredicate,
  parseGenericTypeCardPredicate,
  parseMultiTypeCardPredicate,
  parseMultiTypeCategoryPredicate,
  parseMultiTypeLeaderOrCharacterPredicate,
  parseQuotedTypeIncludingPredicate,
  parseTypeCharacterPredicate,
  parseTypeLeaderOrCharacterPredicate,
  parseTypeOnlyPredicate,
  parseTypeOrAttributeCategoryPredicate,
} from "./type-attribute.js";
import type { PredicateParser } from "./types.js";

export const predicateParsers: readonly PredicateParser[] = [
  parseColorPredicate,
  parseMultiTypeCategoryPredicate,
  parseMultiTypeLeaderOrCharacterPredicate,
  parseMultiTypeCardPredicate,
  parseTypeOrAttributeCategoryPredicate,
  parseTypeLeaderOrCharacterPredicate,
  parseTypeCharacterPredicate,
  parseGenericTypeCardPredicate,
  parseQuotedTypeIncludingPredicate,
  parseTypeOnlyPredicate,
  parseAttributeCardPredicate,
  parseAttributeCategoryPredicate,
  parseAttributeOnlyPredicate,
  parseActiveCharacterPredicate,
  parseRestedCharacterPredicate,
  parseEventCategoryPredicate,
  parseStageCategoryPredicate,
  parseCharacterCategoryPredicate,
  parseGenericCardPredicate,
  parsePowerPredicate,
  parseEffectEntryPointPresencePredicate,
  parseEffectEntryPointPredicate,
  parseDynamicDonFieldCostPredicate,
  parseCostPredicate,
  parseCardNameContainsPredicate,
  parseSelfExclusionPredicate,
  parseNameExclusionPredicate,
  parseNameCardPredicate,
  parseNamePredicate,
  parseDifferentNamesPredicate,
];
