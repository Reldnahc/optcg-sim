import type {
  CardCategory,
  CardId,
  CardImplementationRecord,
  EffectDefinition,
  Keyword,
} from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import {
  isCompleteGeneratedSupportParseResult,
  type GeneratedSupportBlocker,
  type GeneratedSupportParserResultStatus,
} from "./generated-support-types.js";
import {
  generatedSupportRuntimeCapabilityMatrix,
  type RuntimeCapabilityMatrix,
} from "./runtime-capability-matrix.js";

export interface GeneratedSupportCardTextInput {
  behaviorHash: string;
  cardDataVersion: string;
  cardId: CardId;
  effectDefinitionsVersion: string;
  expectedSourceTextHash?: string;
  category?: CardCategory;
  printedKeywords?: readonly Keyword[];
  rulesVersion: string;
  sourceText: string;
  sourceTextHash: string;
}

export type EffectDefinitionValidationResult =
  | { valid: true }
  | { errors: readonly string[]; valid: false };

export interface GeneratedSupportIndexInput {
  cards: readonly GeneratedSupportCardTextInput[];
  runtimeCapabilityMatrix?: RuntimeCapabilityMatrix;
  validateEffectDefinition: (
    definition: EffectDefinition,
  ) => EffectDefinitionValidationResult;
}

export interface GeneratedSupportIndex {
  effectDefinitions: Record<string, EffectDefinition>;
  entries: readonly GeneratedSupportIndexEntry[];
}

export interface GeneratedSupportIndexEntry {
  blockers: readonly GeneratedSupportBlocker[];
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  cardId: CardId;
  effectDefinition?: EffectDefinition;
  effectDefinitionId?: string;
  missingCapabilityIds: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
  sourceTextHash: string;
  status: "supported" | "unsupported";
  support?: CardImplementationRecord;
}

export interface GeneratedSupportManifestEvidence {
  effectDefinitions: Record<string, EffectDefinition>;
  generatedSupport: Record<CardId, GeneratedSupportIndexEntry>;
  support: Record<CardId, CardImplementationRecord>;
}

export interface RuntimeCapabilityEvidence {
  capabilityId: string;
  parserRuleId: string;
}

export interface RuntimeCapabilityCoverageResult {
  blockers: readonly GeneratedSupportBlocker[];
  evidence: readonly RuntimeCapabilityEvidence[];
  missing: readonly RuntimeCapabilityEvidence[];
  missingCapabilityIds: readonly string[];
}

export function buildGeneratedSupportIndex(
  input: GeneratedSupportIndexInput,
): GeneratedSupportIndex {
  const entries = input.cards
    .map((card) => buildGeneratedSupportIndexEntry(card, input))
    .sort((left, right) =>
      String(left.cardId).localeCompare(String(right.cardId)),
    );
  const effectDefinitionEntries: [string, EffectDefinition][] = entries
    .filter(
      (
        entry,
      ): entry is GeneratedSupportIndexEntry & {
        effectDefinition: EffectDefinition;
        effectDefinitionId: string;
      } =>
        entry.effectDefinition !== undefined &&
        entry.effectDefinitionId !== undefined,
    )
    .map((entry) => [entry.effectDefinitionId, entry.effectDefinition]);
  const effectDefinitions = Object.fromEntries(
    effectDefinitionEntries.sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  return {
    effectDefinitions,
    entries,
  };
}

export function toGeneratedSupportManifestEvidence(
  index: GeneratedSupportIndex,
): GeneratedSupportManifestEvidence {
  const supportEntries = index.entries
    .filter(
      (
        entry,
      ): entry is GeneratedSupportIndexEntry & {
        support: CardImplementationRecord;
      } => entry.support !== undefined,
    )
    .map((entry) => [entry.cardId, entry.support] as const)
    .sort(([left], [right]) => String(left).localeCompare(String(right)));

  return {
    effectDefinitions: { ...index.effectDefinitions },
    generatedSupport: Object.fromEntries(
      index.entries
        .map((entry) => [entry.cardId, entry] as const)
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    ),
    support: Object.fromEntries(supportEntries),
  };
}

export function evaluateRuntimeCapabilityCoverageForParserRuleIds({
  matrix = generatedSupportRuntimeCapabilityMatrix,
  parserRuleIds,
}: {
  matrix?: RuntimeCapabilityMatrix;
  parserRuleIds: readonly string[];
}): RuntimeCapabilityCoverageResult {
  const coverage = resolveCapabilityCoverage({ matrix, parserRuleIds });
  const missingCapabilityIds = [
    ...new Set(coverage.missing.map((missing) => missing.capabilityId)),
  ].sort();

  return {
    blockers: coverage.missing.map((missing) =>
      toMissingRuntimeCapabilityBlocker(missing),
    ),
    evidence: coverage.evidence,
    missing: coverage.missing,
    missingCapabilityIds,
  };
}

function buildGeneratedSupportIndexEntry(
  card: GeneratedSupportCardTextInput,
  input: GeneratedSupportIndexInput,
): GeneratedSupportIndexEntry {
  if (
    card.expectedSourceTextHash !== undefined &&
    card.expectedSourceTextHash !== card.sourceTextHash
  ) {
    return unsupportedEntry({
      blockers: [
        {
          code: "stale-hash",
          expectedHash: card.expectedSourceTextHash,
          message: "Poneglyph text hash changed.",
          receivedHash: card.sourceTextHash,
        },
      ],
      card,
      parseStatus: "staleHash",
      parserRuleIds: [],
    });
  }

  if (card.sourceText.length === 0) {
    if (!hasEmptyEffectSupportMetadata(card)) {
      return unsupportedMetadataEntry({
        card,
        message:
          "Normalized card metadata does not satisfy certified empty-effect support preconditions.",
        parserRuleIds: [],
      });
    }

    return supportedVanillaEntry({
      capabilityEvidence: [],
      card,
      parseStatus: "complete",
      parserRuleIds: [],
    });
  }

  const parseResult = parseCertifiedCardText({
    cardId: card.cardId,
    effectDefinitionsVersion: card.effectDefinitionsVersion,
    rulesVersion: card.rulesVersion,
    sourceText: card.sourceText,
    sourceTextHash: card.sourceTextHash,
  });

  if (!isCompleteGeneratedSupportParseResult(parseResult)) {
    return unsupportedEntry({
      blockers: parseResult.blockers,
      card,
      parseStatus: parseResult.status,
      parserRuleIds:
        "parsedRuleIds" in parseResult ? parseResult.parsedRuleIds : [],
    });
  }

  if (
    parseResult.parserRuleIds.includes("exact:keyword:blocker:standalone") &&
    !hasBlockerKeywordSupportMetadata(card)
  ) {
    return unsupportedMetadataEntry({
      card,
      message:
        "Normalized card metadata does not satisfy certified Blocker keyword support preconditions.",
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const keywordMetadataPrecondition = getKeywordMetadataPrecondition(
    parseResult.parserRuleIds,
  );
  if (
    keywordMetadataPrecondition !== undefined &&
    !hasKeywordSupportMetadata(card, keywordMetadataPrecondition.keyword)
  ) {
    return unsupportedMetadataEntry({
      card,
      message: `Normalized card metadata does not satisfy certified ${keywordMetadataPrecondition.label} keyword support preconditions.`,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const capabilityCoverage = evaluateRuntimeCapabilityCoverageForParserRuleIds({
    matrix:
      input.runtimeCapabilityMatrix ?? generatedSupportRuntimeCapabilityMatrix,
    parserRuleIds: parseResult.parserRuleIds,
  });
  if (capabilityCoverage.missing.length > 0) {
    return unsupportedEntry({
      blockers: capabilityCoverage.blockers,
      card,
      missingCapabilityIds: capabilityCoverage.missingCapabilityIds,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  if (
    parseResult.effectDefinition.implementationStatus === "vanilla-confirmed"
  ) {
    return supportedVanillaEntry({
      capabilityEvidence: capabilityCoverage.evidence,
      card,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const validation = input.validateEffectDefinition(
    parseResult.effectDefinition,
  );
  if (!validation.valid) {
    return unsupportedEntry({
      blockers: [
        {
          code: "invalid-dsl-schema",
          component: validation.errors.join("\n"),
          message: "Generated DSL failed effect DSL schema validation.",
        },
      ],
      card,
      parseStatus: parseResult.status,
      parserRuleIds: parseResult.parserRuleIds,
    });
  }

  const effectDefinitionId = toGeneratedEffectDefinitionId(card.cardId);
  return {
    blockers: [],
    capabilityEvidence: capabilityCoverage.evidence,
    cardId: card.cardId,
    effectDefinition: parseResult.effectDefinition,
    effectDefinitionId,
    missingCapabilityIds: [],
    parseStatus: parseResult.status,
    parserRuleIds: parseResult.parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "supported",
    support: {
      behaviorHash: card.behaviorHash,
      cardDataVersion: card.cardDataVersion,
      cardId: card.cardId,
      effectDefinitionId,
      rulesVersion: card.rulesVersion,
      sourceTextHash: card.sourceTextHash,
      status: "implemented-dsl",
      tested: true,
    },
  };
}

function hasBlockerKeywordSupportMetadata(
  card: GeneratedSupportCardTextInput,
): boolean {
  return card.category === "character" && hasPrintedKeyword(card, "blocker");
}

function hasKeywordSupportMetadata(
  card: GeneratedSupportCardTextInput,
  keyword: Keyword,
): boolean {
  return card.category === "character" && hasPrintedKeyword(card, keyword);
}

function hasEmptyEffectSupportMetadata(
  card: GeneratedSupportCardTextInput,
): boolean {
  return card.category === "character" && card.printedKeywords?.length === 0;
}

function hasPrintedKeyword(
  card: GeneratedSupportCardTextInput,
  keyword: Keyword,
): boolean {
  return card.printedKeywords?.includes(keyword) === true;
}

function getKeywordMetadataPrecondition(
  parserRuleIds: readonly string[],
): { keyword: Keyword; label: string } | undefined {
  if (parserRuleIds.includes("exact:keyword:rush:standalone")) {
    return { keyword: "rush", label: "Rush" };
  }

  if (parserRuleIds.includes("exact:keyword:rush-character:standalone")) {
    return { keyword: "rushCharacter", label: "Rush: Character" };
  }

  if (parserRuleIds.includes("exact:keyword:double-attack:standalone")) {
    return { keyword: "doubleAttack", label: "Double Attack" };
  }

  if (parserRuleIds.includes("exact:keyword:banish:standalone")) {
    return { keyword: "banish", label: "Banish" };
  }

  return undefined;
}

function supportedVanillaEntry({
  capabilityEvidence,
  card,
  parseStatus,
  parserRuleIds,
}: {
  capabilityEvidence: readonly RuntimeCapabilityEvidence[];
  card: GeneratedSupportCardTextInput;
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers: [],
    capabilityEvidence,
    cardId: card.cardId,
    missingCapabilityIds: [],
    parseStatus,
    parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "supported",
    support: {
      behaviorHash: card.behaviorHash,
      cardDataVersion: card.cardDataVersion,
      cardId: card.cardId,
      rulesVersion: card.rulesVersion,
      sourceTextHash: card.sourceTextHash,
      status: "vanilla-confirmed",
      tested: true,
    },
  };
}

function unsupportedMetadataEntry({
  card,
  message,
  parserRuleIds,
}: {
  card: GeneratedSupportCardTextInput;
  message: string;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return unsupportedEntry({
    blockers: [
      {
        code: "unsupported-primitive",
        message,
      },
    ],
    card,
    parseStatus: "unsupportedPrimitive",
    parserRuleIds,
  });
}

function unsupportedEntry({
  blockers,
  card,
  missingCapabilityIds = [],
  parseStatus,
  parserRuleIds,
}: {
  blockers: readonly GeneratedSupportBlocker[];
  card: GeneratedSupportCardTextInput;
  missingCapabilityIds?: readonly string[];
  parseStatus: GeneratedSupportParserResultStatus;
  parserRuleIds: readonly string[];
}): GeneratedSupportIndexEntry {
  return {
    blockers,
    capabilityEvidence: [],
    cardId: card.cardId,
    missingCapabilityIds,
    parseStatus,
    parserRuleIds,
    sourceTextHash: card.sourceTextHash,
    status: "unsupported",
  };
}

function resolveCapabilityCoverage({
  matrix,
  parserRuleIds,
}: {
  matrix: RuntimeCapabilityMatrix;
  parserRuleIds: readonly string[];
}): {
  evidence: readonly RuntimeCapabilityEvidence[];
  missing: readonly RuntimeCapabilityEvidence[];
} {
  const evidence: RuntimeCapabilityEvidence[] = [];
  const missing: RuntimeCapabilityEvidence[] = [];

  for (const parserRuleId of parserRuleIds) {
    for (const capabilityId of capabilityIdsForParserRuleId(parserRuleId)) {
      if (
        hasRuntimeCapabilityForParserRule({
          capabilityId,
          matrix,
          parserRuleId,
        })
      ) {
        evidence.push({ capabilityId, parserRuleId });
      } else {
        missing.push({ capabilityId, parserRuleId });
      }
    }
  }

  return {
    evidence: evidence.sort(compareCapabilityEvidence),
    missing: missing.sort(compareCapabilityEvidence),
  };
}

function hasRuntimeCapabilityForParserRule({
  capabilityId,
  matrix,
  parserRuleId,
}: {
  capabilityId: string;
  matrix: RuntimeCapabilityMatrix;
  parserRuleId: string;
}): boolean {
  const capability = matrix.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  );

  return (
    capability !== undefined &&
    capability.supported &&
    capability.supportedParserRuleIds.includes(parserRuleId)
  );
}

function compareCapabilityEvidence(
  left: RuntimeCapabilityEvidence,
  right: RuntimeCapabilityEvidence,
): number {
  const capabilityOrder = left.capabilityId.localeCompare(right.capabilityId);
  if (capabilityOrder !== 0) {
    return capabilityOrder;
  }

  return left.parserRuleId.localeCompare(right.parserRuleId);
}

function toMissingRuntimeCapabilityBlocker(
  missing: RuntimeCapabilityEvidence,
): GeneratedSupportBlocker {
  return {
    capabilityId: missing.capabilityId,
    code: "missing-runtime-capability",
    component: missing.parserRuleId,
    message: `Missing runtime capability ${missing.capabilityId} for parser rule ${missing.parserRuleId}.`,
  };
}

const parserRuleCapabilityIds: Readonly<Record<string, readonly string[]>> = {
  "exact:condition:self-attached-don-count": [
    "category:auto",
    "condition:selfAttachedDonCount",
    "effect:draw:self:count:positive-safe-integer",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "exact:condition:your-turn": [
    "category:auto",
    "condition:yourTurn",
    "effect:draw:self:count:positive-safe-integer",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "card014a:modifier:power-all-this-turn": ["modifyPower:all:thisTurn"],
  "card014a:modifier:power-choose-this-turn": ["modifyPower:choose:thisTurn"],
  "card014a:modifier:power-self-this-battle": ["modifyPower:self:thisBattle"],
  "card014a:modifier:power-self-this-turn": ["modifyPower:self:thisTurn"],
  "exact:on-play:draw-up-to-n:self": [
    "category:auto",
    "drawUpTo:self:chooseQuantity",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "exact:on-play:optional-effect:draw-1:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "optionalEffectBlock:onPlay:draw-1:self",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "card014a:on-play:return-don-play-selected-character": [
    "category:auto",
    "payCost:returnDon:self:count-exact",
    "playSelected:hand:character:max1",
    "playSelected:hand:character:max1:ignoreCost",
    "returnDon:cost:self:count-exact",
    "selectCards:hand:self:character:max1",
    "sequence:genericFrames",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "card014a:on-play:select-target-modify-power": [
    "category:auto",
    "modifyPower:choose:thisTurn",
    "savedFieldObject:consumer:generic",
    "savedSelectedTargets:producer",
    "selectTargets:field:public:character:max1",
    "sequence:genericFrames",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "card014a:restriction:cannot-attack-all-this-turn": [
    "cannotAttack:all:thisTurn",
  ],
  "card014a:restriction:cannot-attack-choose-this-turn": [
    "cannotAttack:choose:thisTurn",
  ],
  "card014a:restriction:cannot-attack-self-this-turn": [
    "cannotAttack:self:thisTurn",
  ],
  "card014a:restriction:cannot-block-all-this-turn": [
    "cannotBlock:all:thisTurn",
  ],
  "card014a:restriction:cannot-block-choose-this-turn": [
    "cannotBlock:choose:thisTurn",
  ],
  "card014a:restriction:cannot-block-self-this-turn": [
    "cannotBlock:self:thisTurn",
  ],
  "card014a:sequence:draw-trashFromHand": [
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sequence:draw:trashFromHand",
    "sequence:genericFrames",
  ],
  "card014a:sequence:trashFromHand-draw": [
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sequence:genericFrames",
    "sequence:trashFromHand:draw",
    "trashFromHand:segment0:self:self:count-exact",
  ],
  "card014a:static:no-source-required": [
    "sourcePresencePolicy:noSourceRequired",
  ],
  "card014a:trigger:resolve-from-destination-zone": [
    "sourcePresencePolicy:resolveFromDestinationZone",
  ],
  "card014a:trigger:resolve-from-last-known-information": [
    "sourcePresencePolicy:resolveFromLastKnownInformation",
  ],
  "card014a:unsupported:duration-permanent": ["modifyPower:self:permanent"],
  "card014a:unsupported:duration-until-start-next-turn": [
    "modifyPower:self:untilStartOfNextTurn",
  ],
  "card014a:unsupported:event-trigger": ["trigger:event"],
  "card014a:unsupported:refresh-lock": ["refreshLock:don"],
  "card014a:unsupported:replacement-damage": ["replacement:damage"],
  "card014a:unsupported:saved-field-object-as-modifier-target": [
    "savedFieldObject:consumer:modifierTarget",
  ],
  "card014a:unsupported:saved-field-object-as-restriction-target": [
    "savedFieldObject:consumer:restrictionTarget",
  ],
  "card014a:unsupported:saved-reference-play-selected-input": [
    "playSelected:savedReference:character:max1",
  ],
  "card014a:unsupported:saved-reference-select-cards-hand-input": [
    "selectCards:hand:savedReference:character:max1",
  ],
  "card014a:unsupported:sequence-loop": ["sequence:repeat"],
  "card014a:unsupported:sequence-third-segment-position": [
    "sequence:position:segment2",
  ],
  "card014a:unsupported:stage-trigger": ["trigger:stage"],
  "card014a:unsupported:target-opponent-leader": [
    "selectTargets:field:public:opponentLeader:max1",
  ],
  "card014a:unsupported:trigger-activate-main-source-destination": [
    "sourcePresencePolicy:resolveFromDestinationZone:trigger:activateMain",
  ],
  "card014a:unsupported:trigger-on-play-no-source": [
    "sourcePresencePolicy:noSourceRequired:trigger:onPlay",
  ],
  "card014a:unsupported:trigger-on-play-source-destination": [
    "sourcePresencePolicy:resolveFromDestinationZone:trigger:onPlay",
  ],
  "card014a:unsupported:trigger-on-play-source-lki": [
    "sourcePresencePolicy:resolveFromLastKnownInformation:trigger:onPlay",
  ],
  "card014a:unsupported:trigger-when-attacking-no-source": [
    "sourcePresencePolicy:noSourceRequired:trigger:whenAttacking",
  ],
  "exact:keyword:banish:standalone": [
    "keyword:banish:printed",
    "sourcePresencePolicy:none-for-keyword",
  ],
  "exact:keyword:blocker:standalone": [
    "keyword:blocker:printed",
    "sourcePresencePolicy:none-for-keyword",
  ],
  "exact:keyword:double-attack:standalone": [
    "keyword:doubleAttack:printed",
    "sourcePresencePolicy:none-for-keyword",
  ],
  "exact:keyword:rush-character:standalone": [
    "keyword:rushCharacter:printed",
    "sourcePresencePolicy:none-for-keyword",
  ],
  "exact:keyword:rush:standalone": [
    "keyword:rush:printed",
    "sourcePresencePolicy:none-for-keyword",
  ],
  "exact:on-play:draw-n:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "exact:on-play:draw-n:trash-m:hand:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:onPlay",
  ],
  "exact:on-play:trash-2-from-hand:draw-1:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sequence:genericFrames",
    "sequence:trashFromHand:draw",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trashFromHand:segment0:self:self:count-exact",
    "trigger:onPlay",
  ],
  "exact:when-attacking:draw-n:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:whenAttacking",
  ],
  "exact:when-attacking:draw-n:trash-m:hand:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:whenAttacking",
  ],
  "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self": [
    "category:auto",
    "effect:draw:self:count:positive-safe-integer",
    "effect:sequence:ordered",
    "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
    "sourcePresencePolicy:mustRemainInSameZone",
    "trigger:whenAttacking:oncePerTurn",
  ],
  "line-separated-effect-blocks:v1": [
    "composition:line-separated-effect-blocks:v1",
  ],
};

function capabilityIdsForParserRuleId(parserRuleId: string): readonly string[] {
  return parserRuleCapabilityIds[parserRuleId] ?? [parserRuleId];
}

function toGeneratedEffectDefinitionId(cardId: CardId): string {
  return `${String(cardId).toLowerCase()}.generated-support`;
}
