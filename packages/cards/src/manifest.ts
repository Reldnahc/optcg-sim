import { createHash } from "node:crypto";
import type {
  BanlistRecord,
  CardId,
  CardSupportStatus,
  DecklistEntry,
  DeckValidationError,
  DeckValidationResult,
  DeckValidationWarning,
  EffectDefinition,
  Loadout,
  MatchCardManifest,
  MatchSource,
  ResolvedCard,
  ResolvedCardOverlay,
  ResolvedDeckCard,
  VariantKey,
} from "@optcg/types";

import type { SimulatorOverlayRegistry } from "./overlay.js";

export type DeckValidationMode =
  | "dev-sandbox"
  | "sandbox"
  | "unranked"
  | "custom"
  | "ranked";

export interface ManifestVersions {
  cardDataVersion: string;
  effectDefinitionsVersion: string;
  customHandlerVersion: string;
  overlayVersion: string;
  banlistVersion: string;
}

export interface BuildMatchCardManifestInput {
  source: MatchSource;
  cards: readonly ResolvedCard[];
  versions: ManifestVersions;
  overlays?: SimulatorOverlayRegistry;
  effectDefinitions?: Record<string, EffectDefinition>;
  createdAt?: string;
}

export interface ValidateDecklistInput {
  deck: readonly DecklistEntry[];
  manifest: MatchCardManifest;
  format: string;
  mode: DeckValidationMode;
  overlayVersion: string;
  expectedMainDeckSize?: number;
  expectedDonDeckSize?: number;
  enforceLeaderColorIdentity?: boolean;
  allowUnreleased?: boolean;
  allowStaleBehaviorHash?: boolean;
  allowSimulatorBannedOverride?: boolean;
}

export interface ValidateLoadoutInput extends Omit<
  ValidateDecklistInput,
  "deck"
> {
  loadout: Loadout;
}

type CardAccumulator = {
  card: ResolvedCard;
  quantity: number;
  variants: Set<VariantKey>;
};

type ProjectedSupport = {
  behaviorHash: string;
  cardDataVersion: string;
  cardId: CardId;
  customHandlerIds?: string[];
  effectDefinitionId?: string;
  rulesVersion: string;
  sourceTextHash: string;
  status: CardSupportStatus;
  tested: boolean;
};

type ManifestLegalityRecord = ResolvedCard["legality"][string];

export const deckValidationContractDeferrals = {
  donDeckVariantKey:
    "Loadout.donDeckVariantKey does not identify a DON!! card ID; validation is limited to manifest DON!! variant metadata when present.",
} as const;

export function createManifestVersions(
  versions: ManifestVersions,
): ManifestVersions {
  return { ...versions };
}

export function buildMatchCardManifest(
  input: BuildMatchCardManifestInput,
): MatchCardManifest {
  const cards = buildManifestCards(input.cards, input.overlays);
  const manifestWithoutHash: Omit<MatchCardManifest, "manifestHash"> = {
    banlistVersion: input.versions.banlistVersion,
    cardDataVersion: input.versions.cardDataVersion,
    cards,
    createdAt: input.createdAt ?? new Date().toISOString(),
    customHandlerVersion: input.versions.customHandlerVersion,
    effectDefinitionsVersion: input.versions.effectDefinitionsVersion,
    source: input.source,
  };

  if (input.effectDefinitions !== undefined) {
    manifestWithoutHash.effectDefinitions = sortRecord(input.effectDefinitions);
  }

  return {
    ...manifestWithoutHash,
    manifestHash: computeMatchCardManifestHash(manifestWithoutHash),
  };
}

export function computeMatchCardManifestHash(
  manifest: Omit<MatchCardManifest, "manifestHash"> | MatchCardManifest,
): string {
  return sha256(canonicalJson(toManifestHashInput(manifest)));
}

export function validateLoadout(
  input: ValidateLoadoutInput,
): DeckValidationResult {
  const result = validateDecklist({
    ...input,
    deck: input.loadout.deck,
  });

  validateLoadoutCardVariants(input, result.errors);
  validateLoadoutDonDeckVariant(input, result.errors, result.warnings);

  return {
    ...result,
    valid: result.errors.length === 0,
  };
}

export function validateDecklist(
  input: ValidateDecklistInput,
): DeckValidationResult {
  const errors: DeckValidationError[] = [];
  const warnings: DeckValidationWarning[] = [];
  const accumulators = new Map<CardId, CardAccumulator>();
  const order: CardId[] = [];

  for (const entry of input.deck) {
    validateDeckEntry(entry, input.manifest, errors, accumulators, order);
  }

  validateDeckStructure(input, errors, accumulators, order);

  for (const cardId of order) {
    const accumulator = accumulators.get(cardId);
    if (accumulator === undefined) {
      continue;
    }
    validateCardSupportAndLegality({
      accumulator,
      errors,
      input,
      warnings,
    });
  }

  const resolvedCards = order
    .map((cardId) => accumulators.get(cardId))
    .filter((entry): entry is CardAccumulator => entry !== undefined)
    .map(toResolvedDeckCard);

  return {
    errors,
    resolvedCards,
    valid: errors.length === 0,
    versions: {
      banlistVersion: input.manifest.banlistVersion,
      cardDataVersion: input.manifest.cardDataVersion,
      effectDefinitionsVersion: input.manifest.effectDefinitionsVersion,
      overlayVersion: input.overlayVersion,
    },
    warnings,
  };
}

function buildManifestCards(
  cards: readonly ResolvedCard[],
  overlays: SimulatorOverlayRegistry | undefined,
): Record<CardId, ResolvedCard> {
  const entries = cards
    .map((card) => applyManifestOverlay(card, overlays?.[card.cardId]))
    .sort((left, right) =>
      String(left.cardId).localeCompare(String(right.cardId)),
    );
  const manifestCards: Record<CardId, ResolvedCard> = {};

  for (const card of entries) {
    if (manifestCards[card.cardId] !== undefined) {
      throw new Error(`Duplicate manifest card ID ${String(card.cardId)}.`);
    }
    manifestCards[card.cardId] = card;
  }

  return manifestCards;
}

function applyManifestOverlay(
  card: ResolvedCard,
  overlay: ResolvedCardOverlay | undefined,
): ResolvedCard {
  const manifestCard = toManifestCard(card);

  if (overlay === undefined) {
    return manifestCard;
  }
  assertOverlayReferencesCard(manifestCard.cardId, overlay);
  return applyOverlayBanlist(
    {
      ...manifestCard,
      support: overlay.support,
    },
    overlay.banlist,
  );
}

function toManifestCard(card: ResolvedCard): ResolvedCard {
  const { raw: auditPayload, ...manifestCard } = card as ResolvedCard & {
    raw?: unknown;
  };
  void auditPayload;
  return manifestCard;
}

function assertOverlayReferencesCard(
  cardId: CardId,
  overlay: ResolvedCardOverlay,
): void {
  if (overlay.cardId !== cardId || overlay.support.cardId !== cardId) {
    throw new Error(
      `Manifest overlay for ${String(cardId)} references ${String(
        overlay.cardId,
      )}/${String(overlay.support.cardId)}`,
    );
  }
}

function applyOverlayBanlist(
  card: ResolvedCard,
  banlist: readonly BanlistRecord[] | undefined,
): ResolvedCard {
  if (banlist === undefined || banlist.length === 0) {
    return card;
  }

  let nextCard = card;
  for (const record of banlist) {
    const existing = nextCard.legality[record.format];

    nextCard = {
      ...nextCard,
      legality: {
        ...nextCard.legality,
        [record.format]: mergeOverlayBanlistLegality(
          nextCard.cardId,
          existing,
          record,
        ),
      },
      support:
        record.status === "simulatorBanned"
          ? { ...nextCard.support, status: "banned-in-simulator" }
          : nextCard.support,
    };
  }

  return nextCard;
}

function mergeOverlayBanlistLegality(
  cardId: CardId,
  existing: ManifestLegalityRecord | undefined,
  record: BanlistRecord,
): ManifestLegalityRecord {
  const maxCopies = getStricterMaxCopies(
    existing?.max_copies,
    record.maxCopies,
  );
  const merged: ManifestLegalityRecord = {
    ...(existing ?? { status: "legal" }),
    status: getOverlayBanlistStatus(cardId, existing?.status, record),
  };

  if (maxCopies !== undefined) {
    merged.max_copies = maxCopies;
  }

  if (record.reason !== undefined) {
    merged.reason = record.reason;
  }

  return merged;
}

function getOverlayBanlistStatus(
  cardId: CardId,
  canonicalStatus: string | undefined,
  record: BanlistRecord,
): string {
  if (record.status === "leaderLocked") {
    throw new Error(
      `Overlay banlist leaderLocked status for ${String(cardId)} has no current validation semantics.`,
    );
  }

  if (canonicalStatus !== undefined && isIllegalFormatStatus(canonicalStatus)) {
    return canonicalStatus;
  }

  if (record.status === "restricted" && record.maxCopies === undefined) {
    throw new Error(
      `Overlay banlist restricted status for ${String(cardId)} requires maxCopies in ${record.format}.`,
    );
  }

  switch (record.status) {
    case "banned":
      return "banned";
    case "legal":
    case "simulatorBanned":
      return canonicalStatus ?? "legal";
    case "restricted":
      return canonicalStatus ?? "restricted";
  }
}

function getStricterMaxCopies(
  canonicalMaxCopies: number | undefined,
  overlayMaxCopies: number | undefined,
): number | undefined {
  if (canonicalMaxCopies !== undefined && overlayMaxCopies !== undefined) {
    return Math.min(canonicalMaxCopies, overlayMaxCopies);
  }

  return canonicalMaxCopies ?? overlayMaxCopies;
}

function validateDeckEntry(
  entry: DecklistEntry,
  manifest: MatchCardManifest,
  errors: DeckValidationError[],
  accumulators: Map<CardId, CardAccumulator>,
  order: CardId[],
): void {
  const card = manifest.cards[entry.cardId];

  if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) {
    errors.push({
      cardId: entry.cardId,
      code: "invalid-quantity",
      message: `Deck entry ${String(entry.cardId)} has invalid quantity ${String(
        entry.quantity,
      )}.`,
    });
    return;
  }

  if (card === undefined) {
    errors.push({
      cardId: entry.cardId,
      code: "unknown-card-id",
      message: `Card ${String(entry.cardId)} is not present in the manifest.`,
    });
    return;
  }

  if (
    entry.variantKey !== undefined &&
    !card.variants.some((variant) => variant.variantKey === entry.variantKey)
  ) {
    errors.push({
      cardId: entry.cardId,
      code: "invalid-variant",
      message: `Variant ${String(entry.variantKey)} is not valid for card ${String(
        entry.cardId,
      )}.`,
    });
  }

  const current = accumulators.get(entry.cardId);
  if (current === undefined) {
    const next: CardAccumulator = {
      card,
      quantity: entry.quantity,
      variants: new Set(),
    };
    if (entry.variantKey !== undefined) {
      next.variants.add(entry.variantKey);
    }
    accumulators.set(entry.cardId, next);
    order.push(entry.cardId);
    return;
  }

  current.quantity += entry.quantity;
  if (entry.variantKey !== undefined) {
    current.variants.add(entry.variantKey);
  }
}

function validateDeckStructure(
  input: ValidateDecklistInput,
  errors: DeckValidationError[],
  accumulators: Map<CardId, CardAccumulator>,
  order: readonly CardId[],
): void {
  if (input.deck.length === 0) {
    errors.push({
      code: "empty-deck",
      message: "Deck must contain at least one entry.",
    });
  }

  const leaderAccumulators = order
    .map((cardId) => accumulators.get(cardId))
    .filter(
      (accumulator): accumulator is CardAccumulator =>
        accumulator !== undefined && accumulator.card.category === "leader",
    );

  if (leaderAccumulators.length === 0) {
    errors.push({
      code: "missing-leader",
      message: "Deck must include exactly one leader entry.",
    });
  }

  if (leaderAccumulators.length > 1) {
    errors.push({
      code: "multiple-leaders",
      message: "Deck must not include multiple leader entries.",
    });
  }

  for (const leader of leaderAccumulators) {
    if (leader.quantity !== 1) {
      errors.push({
        cardId: leader.card.cardId,
        code: "leader-quantity-invalid",
        message: `Leader ${String(leader.card.cardId)} must have quantity 1.`,
      });
    }
  }

  validateRequestedDeckSizes(input, errors, accumulators);
  validateLeaderColorIdentity(input, errors, accumulators, leaderAccumulators);
}

function validateRequestedDeckSizes(
  input: ValidateDecklistInput,
  errors: DeckValidationError[],
  accumulators: Map<CardId, CardAccumulator>,
): void {
  let mainDeckSize = 0;
  let donDeckSize = 0;

  for (const accumulator of accumulators.values()) {
    if (accumulator.card.category === "don") {
      donDeckSize += accumulator.quantity;
    } else if (accumulator.card.category !== "leader") {
      mainDeckSize += accumulator.quantity;
    }
  }

  if (
    input.expectedMainDeckSize !== undefined &&
    mainDeckSize !== input.expectedMainDeckSize
  ) {
    errors.push({
      code: "main-deck-size-invalid",
      message: `Main deck has ${String(mainDeckSize)} cards; expected ${String(
        input.expectedMainDeckSize,
      )}.`,
    });
  }

  if (
    input.expectedDonDeckSize !== undefined &&
    donDeckSize !== input.expectedDonDeckSize
  ) {
    errors.push({
      code: "don-deck-size-invalid",
      message: `DON!! deck has ${String(donDeckSize)} cards; expected ${String(
        input.expectedDonDeckSize,
      )}.`,
    });
  }
}

function validateLeaderColorIdentity(
  input: ValidateDecklistInput,
  errors: DeckValidationError[],
  accumulators: Map<CardId, CardAccumulator>,
  leaderAccumulators: readonly CardAccumulator[],
): void {
  if (input.enforceLeaderColorIdentity === false) {
    return;
  }

  const leader = leaderAccumulators[0];
  if (leader === undefined || leaderAccumulators.length !== 1) {
    return;
  }

  const leaderColors = new Set(leader.card.colors);
  for (const accumulator of accumulators.values()) {
    if (
      accumulator.card.category === "leader" ||
      accumulator.card.category === "don"
    ) {
      continue;
    }

    const outsideIdentity = accumulator.card.colors.some(
      (color) => !leaderColors.has(color),
    );
    if (outsideIdentity) {
      errors.push({
        cardId: accumulator.card.cardId,
        code: "leader-color-restriction",
        message: `Card ${String(
          accumulator.card.cardId,
        )} is outside the leader color identity.`,
      });
    }
  }
}

function validateCardSupportAndLegality(params: {
  accumulator: CardAccumulator;
  input: ValidateDecklistInput;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
}): void {
  const { accumulator, input, errors, warnings } = params;
  const { card } = accumulator;
  const legality = card.legality[input.format];
  const sandboxMode = isSandboxMode(input.mode);

  if (!card.released && input.allowUnreleased !== true) {
    errors.push({
      cardId: card.cardId,
      code: "unreleased-card",
      message: `Card ${String(card.cardId)} is not released.`,
    });
  }

  if (legality === undefined || isIllegalFormatStatus(legality.status)) {
    errors.push({
      cardId: card.cardId,
      code: "format-illegal-card",
      message: `Card ${String(card.cardId)} is not legal in ${input.format}.`,
    });
  }

  if (
    legality?.max_copies !== undefined &&
    accumulator.quantity > legality.max_copies
  ) {
    errors.push({
      cardId: card.cardId,
      code: "copy-limit-exceeded",
      message: `Card ${String(card.cardId)} has ${String(
        accumulator.quantity,
      )} copies, exceeding the ${String(legality.max_copies)} copy limit.`,
    });
  }

  validateSupportPolicy({
    card,
    errors,
    input,
    sandboxMode,
    warnings,
  });
}

function validateSupportPolicy(params: {
  card: ResolvedCard;
  input: ValidateDecklistInput;
  sandboxMode: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
}): void {
  const { card, input, sandboxMode, errors, warnings } = params;
  const { support } = card;

  if (card.behaviorHash !== support.behaviorHash) {
    const issue = {
      cardId: card.cardId,
      code: "stale-behavior-hash",
      message: `Card ${String(card.cardId)} support behavior hash is stale.`,
    };
    if (sandboxMode || input.allowStaleBehaviorHash === true) {
      warnings.push(issue);
    } else {
      errors.push(issue);
    }
  }

  if (support.status === "banned-in-simulator") {
    if (sandboxMode && input.allowSimulatorBannedOverride === true) {
      warnings.push({
        cardId: card.cardId,
        code: "simulator-banned-card",
        message: `Card ${String(card.cardId)} is banned in the simulator.`,
      });
    } else {
      errors.push({
        cardId: card.cardId,
        code: "simulator-banned-card",
        message: `Card ${String(card.cardId)} is banned in the simulator.`,
      });
    }
    return;
  }

  if (support.status === "unsupported") {
    const issue = {
      cardId: card.cardId,
      code: "unsupported-card",
      message: `Card ${String(card.cardId)} is unsupported by the simulator.`,
    };
    if (sandboxMode) {
      warnings.push(issue);
    } else {
      errors.push(issue);
    }
    return;
  }

  if (support.status === "vanilla-confirmed") {
    return;
  }

  if (support.status === "implemented-custom" && input.mode === "ranked") {
    errors.push({
      cardId: card.cardId,
      code: "ranked-custom-review-unsupported",
      message:
        "Ranked implemented-custom support requires reviewed metadata, which CardImplementationRecord does not currently expose.",
    });
    return;
  }

  if (!support.tested && !sandboxMode) {
    errors.push({
      cardId: card.cardId,
      code: "untested-card-support",
      message: `Card ${String(card.cardId)} support is not marked tested.`,
    });
  }

  if (support.status === "implemented-dsl") {
    validateEffectDefinition(card, input.manifest, errors);
  }
}

function validateLoadoutCardVariants(
  input: ValidateLoadoutInput,
  errors: DeckValidationError[],
): void {
  for (const [cardId, variantKey] of Object.entries(
    input.loadout.cardVariants ?? {},
  )) {
    if (variantKey === undefined) {
      continue;
    }

    const typedCardId = toCardId(cardId);
    const card = input.manifest.cards[typedCardId];

    if (card === undefined) {
      errors.push({
        cardId: typedCardId,
        code: "unknown-loadout-card-variant",
        message: `Loadout cardVariants references unknown card ${cardId}.`,
      });
      continue;
    }

    if (!hasVariantKey(card, variantKey)) {
      errors.push({
        cardId: typedCardId,
        code: "invalid-loadout-card-variant",
        message: `Loadout variant ${String(
          variantKey,
        )} is not valid for card ${cardId}.`,
      });
    }
  }
}

function validateLoadoutDonDeckVariant(
  input: ValidateLoadoutInput,
  errors: DeckValidationError[],
  warnings: DeckValidationWarning[],
): void {
  const variantKey = input.loadout.donDeckVariantKey;
  if (variantKey === undefined) {
    return;
  }

  const donCards = Object.values(input.manifest.cards).filter(
    (card) => card.category === "don",
  );

  if (donCards.length === 0) {
    warnings.push({
      code: "don-deck-variant-validation-deferred",
      message: deckValidationContractDeferrals.donDeckVariantKey,
    });
    return;
  }

  if (!donCards.some((card) => hasVariantKey(card, variantKey))) {
    errors.push({
      code: "invalid-don-deck-variant",
      message: `DON!! deck variant ${String(
        variantKey,
      )} is not present on manifest DON!! cards.`,
    });
  }
}

function hasVariantKey(card: ResolvedCard, variantKey: VariantKey): boolean {
  return card.variants.some((variant) => variant.variantKey === variantKey);
}

function validateEffectDefinition(
  card: ResolvedCard,
  manifest: MatchCardManifest,
  errors: DeckValidationError[],
): void {
  const effectDefinitionId = card.support.effectDefinitionId;

  if (effectDefinitionId === undefined) {
    errors.push({
      cardId: card.cardId,
      code: "missing-effect-definition-id",
      message: `Card ${String(card.cardId)} is implemented-dsl without an effect definition id.`,
    });
    return;
  }

  const definition = manifest.effectDefinitions?.[effectDefinitionId];
  if (definition === undefined) {
    errors.push({
      cardId: card.cardId,
      code: "missing-effect-definition",
      message: `Card ${String(card.cardId)} references missing effect definition ${effectDefinitionId}.`,
    });
    return;
  }

  if (
    definition.cardId !== card.cardId ||
    definition.implementationStatus !== card.support.status ||
    definition.metadata.sourceTextHash !== card.support.sourceTextHash ||
    definition.metadata.rulesVersion !== card.support.rulesVersion ||
    definition.metadata.effectDefinitionsVersion !==
      manifest.effectDefinitionsVersion
  ) {
    errors.push({
      cardId: card.cardId,
      code: "effect-definition-mismatch",
      message: `Card ${String(card.cardId)} effect definition metadata does not match support metadata.`,
    });
  }
}

function toResolvedDeckCard(accumulator: CardAccumulator): ResolvedDeckCard {
  return {
    cardId: accumulator.card.cardId,
    quantity: accumulator.quantity,
    resolvedCard: accumulator.card,
    variants: [...accumulator.variants].sort((left, right) =>
      String(left).localeCompare(String(right)),
    ),
  };
}

function isSandboxMode(mode: DeckValidationMode): boolean {
  return mode === "dev-sandbox" || mode === "sandbox";
}

function isIllegalFormatStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized === "banned" ||
    normalized === "illegal" ||
    normalized === "not_legal" ||
    normalized === "not legal"
  );
}

function toManifestHashInput(
  manifest: Omit<MatchCardManifest, "manifestHash"> | MatchCardManifest,
): unknown {
  return {
    banlistVersion: manifest.banlistVersion,
    cardDataVersion: manifest.cardDataVersion,
    cards: projectCards(manifest.cards),
    customHandlerVersion: manifest.customHandlerVersion,
    effectDefinitions: projectEffectDefinitions(
      manifest.effectDefinitions ?? {},
    ),
    effectDefinitionsVersion: manifest.effectDefinitionsVersion,
    source: manifest.source,
  };
}

function projectCards(
  cards: Record<CardId, ResolvedCard>,
): Record<CardId, unknown> {
  return Object.fromEntries(
    Object.entries(cards)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardId, card]) => [cardId, projectCard(card)]),
  );
}

function projectCard(card: ResolvedCard): unknown {
  return {
    attributes: card.attributes,
    behaviorHash: card.behaviorHash,
    block: card.block,
    cardId: card.cardId,
    category: card.category,
    colors: card.colors,
    cost: card.cost,
    counter: card.counter,
    effectText: card.effectText,
    errata: card.errata.map((entry) => ({
      after_text: entry.after_text,
      before_text: entry.before_text,
      label: entry.label,
      variantIndex: entry.variantIndex,
      variantKey: entry.variantKey,
    })),
    language: card.language,
    legality: card.legality,
    life: card.life,
    name: card.name,
    officialFaq: card.officialFaq.map((entry) => ({
      answer: entry.answer,
      question: entry.question,
    })),
    power: card.power,
    printedKeywords: card.printedKeywords,
    released: card.released,
    rarity: card.rarity,
    set: card.set,
    setName: card.setName,
    sourceTextHash: card.sourceTextHash,
    support: projectSupport(card.support),
    triggerText: card.triggerText,
    types: card.types,
    variants: card.variants.map((variant) => ({
      variantIndex: variant.variantIndex,
      variantKey: variant.variantKey,
    })),
  };
}

function projectSupport(support: ResolvedCard["support"]): ProjectedSupport {
  const projected: ProjectedSupport = {
    behaviorHash: support.behaviorHash,
    cardDataVersion: support.cardDataVersion,
    cardId: support.cardId,
    rulesVersion: support.rulesVersion,
    sourceTextHash: support.sourceTextHash,
    status: support.status,
    tested: support.tested,
  };

  if (support.customHandlerIds !== undefined) {
    projected.customHandlerIds = [...support.customHandlerIds].sort();
  }
  if (support.effectDefinitionId !== undefined) {
    projected.effectDefinitionId = support.effectDefinitionId;
  }

  return projected;
}

function projectEffectDefinitions(
  effectDefinitions: Record<string, EffectDefinition>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(effectDefinitions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, definition]) => [id, projectEffectDefinition(definition)]),
  );
}

function projectEffectDefinition(definition: EffectDefinition): unknown {
  return {
    cardId: definition.cardId,
    effects: definition.effects,
    implementationStatus: definition.implementationStatus,
    metadata: {
      effectDefinitionsVersion: definition.metadata.effectDefinitionsVersion,
      generatedBy: definition.metadata.generatedBy,
      notes: definition.metadata.notes,
      reviewedBy: definition.metadata.reviewedBy,
      reviewer: definition.metadata.reviewer,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
      tested: definition.metadata.tested,
    },
  };
}

function sortRecord<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toCardId(value: string): CardId {
  return value as CardId;
}
