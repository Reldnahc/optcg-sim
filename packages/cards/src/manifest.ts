import { createHash } from "node:crypto";
import type {
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
  return validateDecklist({
    ...input,
    deck: input.loadout.deck,
  });
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
    manifestCards[card.cardId] = card;
  }

  return manifestCards;
}

function applyManifestOverlay(
  card: ResolvedCard,
  overlay: ResolvedCardOverlay | undefined,
): ResolvedCard {
  if (overlay === undefined) {
    return card;
  }
  assertOverlayReferencesCard(card.cardId, overlay);
  return {
    ...card,
    support: overlay.support,
  };
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
