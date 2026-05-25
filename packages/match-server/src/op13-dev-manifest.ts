import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCardEffectLineDetailed } from "@optcg/cards";
import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type {
  Attribute,
  CardColor,
  CardId,
  CardSupportStatus,
  EffectBlock,
  EffectDefinition,
  NormalizedErrata,
  PlayerId,
  PoneglyphCardDetail,
  PoneglyphErrata,
  ResolvedCard,
  ResolvedCardVariant,
  VariantKey,
} from "@optcg/types";

import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

interface CreateOp13DevMatchSetupInput {
  readonly matchId: DevMatchSetup["matchId"];
  readonly firstPlayerId: PlayerId;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly createdAt: string;
}

interface BuiltCard {
  readonly card: ResolvedCard;
  readonly definition?: EffectDefinition;
}

const devCardDataVersion = "op13-fixture-dev-v1";
const devEffectDefinitionsVersion = "op13-generated-dev-v1";
const devCustomHandlerVersion = "none";
const devBanlistVersion = "none";
const devRulesVersion = "dev-rules";
const devLeaderCardId = "OP13-079" as CardId;

const devDeckCardIds = [
  "OP13-080",
  "OP13-082",
  "OP13-083",
  "OP13-084",
  "OP13-089",
  "OP13-091",
  "OP13-099",
] as const;

const fixtureFiles: Record<string, string> = {
  "OP13-079": "OP13-079.imu.json",
  "OP13-080": "OP13-080.st-ethanbaron-v-nusjuro.json",
  "OP13-082": "OP13-082.five-elders.json",
  "OP13-083": "OP13-083.st-jaygarcia-saturn.json",
  "OP13-084": "OP13-084.st-shepherd-ju-peter.json",
  "OP13-089": "OP13-089.st-topman-warcury.json",
  "OP13-091": "OP13-091.st-marcus-mars.json",
  "OP13-099": "OP13-099.the-empty-throne.json",
};

const fixturesRoot = new URL(
  "../../../fixtures/poneglyph/cards/",
  import.meta.url,
);

const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const optional = <T>(
  key: string,
  value: T | null | undefined,
): Record<string, T> =>
  value === undefined || value === null ? {} : { [key]: value };

const toCardId = (value: string): CardId => value as CardId;

const readFixture = (cardId: string): PoneglyphCardDetail => {
  const fileName = fixtureFiles[cardId];
  if (fileName === undefined) {
    throw new Error(`Missing OP13 dev fixture mapping for ${cardId}.`);
  }
  const raw = readFileSync(
    fileURLToPath(new URL(fileName, fixturesRoot)),
    "utf8",
  );
  return JSON.parse(raw) as PoneglyphCardDetail;
};

const normalizeCategory = (value: string): ResolvedCard["category"] => {
  switch (value) {
    case "Leader":
      return "leader";
    case "Character":
      return "character";
    case "Stage":
      return "stage";
    case "Event":
      return "event";
    case "DON!!":
      return "don";
    default:
      throw new Error(`Unsupported OP13 fixture card type ${value}.`);
  }
};

const normalizeColor = (value: string): CardColor => {
  switch (value) {
    case "Red":
      return "red";
    case "Green":
      return "green";
    case "Blue":
      return "blue";
    case "Purple":
      return "purple";
    case "Black":
      return "black";
    case "Yellow":
      return "yellow";
    default:
      throw new Error(`Unsupported OP13 fixture color ${value}.`);
  }
};

const normalizeAttribute = (value: string): Attribute => {
  switch (value) {
    case "Slash":
      return "slash";
    case "Strike":
      return "strike";
    case "Ranged":
      return "ranged";
    case "Special":
      return "special";
    case "Wisdom":
      return "wisdom";
    case "?":
      return "?";
    default:
      throw new Error(`Unsupported OP13 fixture attribute ${value}.`);
  }
};

const variantKey = (
  card: PoneglyphCardDetail,
  variantIndex: number,
): VariantKey => `${card.card_number}:v${String(variantIndex)}` as VariantKey;

const normalizeErrata = (
  errata: readonly PoneglyphErrata[],
  card: PoneglyphCardDetail,
  variantIndex: number,
): NormalizedErrata[] =>
  errata.map((entry) => ({
    ...entry,
    variantIndex,
    variantKey: variantKey(card, variantIndex),
  }));

const normalizeVariants = (
  card: PoneglyphCardDetail,
): {
  readonly variants: ResolvedCardVariant[];
  readonly errata: NormalizedErrata[];
} => {
  const variants: ResolvedCardVariant[] = [];
  const errata: NormalizedErrata[] = [];
  for (const variant of card.variants) {
    variants.push({
      variantKey: variantKey(card, variant.index),
      variantIndex: variant.index,
      ...optional("label", variant.label),
      ...optional("artist", variant.artist),
      ...optional("productId", variant.product.id),
      ...optional("productSlug", variant.product.slug),
      ...optional("productName", variant.product.name),
      ...optional("productSetCode", variant.product.set_code),
      ...optional("stockImageFull", variant.images.stock.full),
      ...optional("stockImageThumb", variant.images.stock.thumb),
      ...optional("scanImageDisplay", variant.images.scan.display),
      ...optional("scanImageFull", variant.images.scan.full),
      ...optional("scanImageThumb", variant.images.scan.thumb),
    });
    errata.push(...normalizeErrata(variant.errata, card, variant.index));
  }
  return { variants, errata };
};

const effectLines = (card: PoneglyphCardDetail): string[] =>
  (card.effect ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const effectBlockId = (cardId: CardId, index: number): EffectBlock["id"] =>
  `${String(cardId)}:generated:${String(index + 1)}` as EffectBlock["id"];

const buildEffectDefinition = (
  cardId: CardId,
  lines: readonly string[],
  sourceTextHash: string,
): {
  readonly definition?: EffectDefinition;
  readonly complete: boolean;
  readonly runtimeSupported: boolean;
  readonly diagnostics: readonly string[];
} => {
  const blocks: EffectBlock[] = [];
  const diagnostics: string[] = [];
  for (const [index, line] of lines.entries()) {
    const parsed = parseCardEffectLineDetailed(line);
    if (!parsed.ok) {
      diagnostics.push(
        `line ${String(index + 1)} parse failed: ${parsed.diagnostic.reason}`,
      );
      continue;
    }
    const block: EffectBlock = {
      ...parsed.value.block,
      id: effectBlockId(cardId, index),
    };
    const runtimeSupport = evaluateEffectBlockRuntimeSupport(block);
    if (!runtimeSupport.supported) {
      diagnostics.push(
        `line ${String(index + 1)} runtime unsupported: ${
          runtimeSupport.reason ?? "unknown reason"
        }`,
      );
    }
    blocks.push(block);
  }

  if (blocks.length === 0) {
    return {
      complete: lines.length === 0,
      runtimeSupported: lines.length === 0,
      diagnostics,
    };
  }

  const complete = blocks.length === lines.length;
  const runtimeSupported =
    complete &&
    blocks.every((block) => evaluateEffectBlockRuntimeSupport(block).supported);
  return {
    definition: {
      cardId,
      implementationStatus: runtimeSupported
        ? "implemented-dsl"
        : "unsupported",
      effects: blocks,
      metadata: {
        sourceTextHash,
        rulesVersion: devRulesVersion,
        effectDefinitionsVersion: devEffectDefinitionsVersion,
        tested: runtimeSupported,
        generatedBy: "rule-parser",
        reviewedBy: "dev-manifest-builder",
        reviewedAt: "2026-05-24T00:00:00.000Z",
        notes:
          diagnostics.length === 0
            ? "Generated from OP13 dev fixture primitive parser output."
            : diagnostics.join("; "),
      },
    },
    complete,
    runtimeSupported,
    diagnostics,
  };
};

const buildCard = (fixture: PoneglyphCardDetail): BuiltCard => {
  const cardId = toCardId(fixture.card_number);
  const lines = effectLines(fixture);
  const sourceTextHash = sha256({
    effect: fixture.effect,
    trigger: fixture.trigger,
    card_number: fixture.card_number,
  });
  const builtDefinition = buildEffectDefinition(cardId, lines, sourceTextHash);
  const behaviorHash = sha256({
    effect: fixture.effect,
    trigger: fixture.trigger,
    definition: builtDefinition.definition?.effects ?? [],
  });
  const supportStatus: CardSupportStatus =
    lines.length === 0
      ? "vanilla-confirmed"
      : builtDefinition.runtimeSupported
        ? "implemented-dsl"
        : "unsupported";
  const normalized = normalizeVariants(fixture);
  const definitionId = `${fixture.card_number}.generated-dev-support`;
  const supportNotes =
    builtDefinition.diagnostics.length === 0
      ? undefined
      : builtDefinition.diagnostics.join("; ");
  const card: ResolvedCard = {
    cardId,
    language: fixture.language,
    name: fixture.name,
    category: normalizeCategory(fixture.card_type),
    set: fixture.set,
    setName: fixture.set_name,
    released: fixture.released,
    colors: fixture.color.map(normalizeColor),
    attributes: (fixture.attribute ?? []).map(normalizeAttribute),
    types: fixture.types,
    printedKeywords: [],
    variants: normalized.variants,
    legality: fixture.legality,
    officialFaq: fixture.official_faq,
    errata: normalized.errata,
    sourceTextHash,
    behaviorHash,
    support: {
      cardId,
      status: supportStatus,
      ...(builtDefinition.definition === undefined
        ? {}
        : { effectDefinitionId: definitionId }),
      tested: builtDefinition.runtimeSupported || lines.length === 0,
      rulesVersion: devRulesVersion,
      cardDataVersion: devCardDataVersion,
      sourceTextHash,
      behaviorHash,
      ...optional("notes", supportNotes),
    },
    ...optional("block", fixture.block),
    ...optional("releasedAt", fixture.released_at),
    ...optional("rarity", fixture.rarity),
    ...optional("cost", fixture.cost),
    ...optional("power", fixture.power),
    ...optional("counter", fixture.counter),
    ...optional("life", fixture.life),
    ...optional("effectText", fixture.effect),
    ...optional("triggerText", fixture.trigger),
  };

  if (builtDefinition.definition === undefined) {
    return { card };
  }
  return {
    card,
    definition: {
      ...builtDefinition.definition,
      implementationStatus: supportStatus,
    },
  };
};

const donCard = (index: number): ResolvedCard => {
  const cardId = `dev-don-${String(index)}` as CardId;
  const sourceTextHash = sha256({ cardId, type: "don" });
  const behaviorHash = sha256({ cardId, type: "don", behavior: "don-card" });
  return {
    cardId,
    language: "en",
    name: "DON!!",
    category: "don",
    set: "DEV",
    setName: "Dev DON",
    released: true,
    colors: [],
    attributes: [],
    types: [],
    printedKeywords: [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash,
    behaviorHash,
    support: {
      cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: devRulesVersion,
      cardDataVersion: devCardDataVersion,
      sourceTextHash,
      behaviorHash,
    },
  };
};

const repeatedDeck = (): CardId[] =>
  devDeckCardIds.flatMap((cardId) =>
    Array.from({ length: 4 }, () => toCardId(cardId)),
  );

const donDeck = (): CardId[] =>
  Array.from({ length: 10 }, (_, index) => donCard(index + 1).cardId);

const playerSetup = (
  playerId: PlayerId,
  deckCardIds: CardId[],
  donDeckCardIds: CardId[],
): DevMatchPlayerSetup => ({
  playerId,
  leaderCardId: devLeaderCardId,
  leaderLifeCount: 4,
  deckCardIds,
  donDeckCardIds,
});

export const createOp13DevMatchSetup = (
  input: CreateOp13DevMatchSetupInput,
): DevMatchSetup => {
  const cards: Record<CardId, ResolvedCard> = {};
  const effectDefinitions: Record<string, EffectDefinition> = {};
  for (const cardId of [String(devLeaderCardId), ...devDeckCardIds]) {
    const built = buildCard(readFixture(cardId));
    cards[built.card.cardId] = built.card;
    const effectDefinitionId = built.card.support.effectDefinitionId;
    if (effectDefinitionId !== undefined && built.definition !== undefined) {
      effectDefinitions[effectDefinitionId] = built.definition;
    }
  }
  for (const index of Array.from({ length: 10 }, (_, value) => value + 1)) {
    const card = donCard(index);
    cards[card.cardId] = card;
  }

  const sharedDeck = repeatedDeck();
  const sharedDonDeck = donDeck();
  return {
    matchId: input.matchId,
    firstPlayerId: input.firstPlayerId,
    rngSeed: "op13-dev-local-seed",
    playerOrder: input.playerOrder,
    players: [
      playerSetup(input.playerOrder[0], sharedDeck, sharedDonDeck),
      playerSetup(input.playerOrder[1], sharedDeck, sharedDonDeck),
    ],
    cardManifest: {
      manifestHash: sha256({
        cards: Object.keys(cards).sort(),
        effectDefinitions: Object.keys(effectDefinitions).sort(),
      }),
      source: "manual-test",
      cardDataVersion: devCardDataVersion,
      effectDefinitionsVersion: devEffectDefinitionsVersion,
      customHandlerVersion: devCustomHandlerVersion,
      banlistVersion: devBanlistVersion,
      effectDefinitions,
      cards,
      createdAt: input.createdAt,
    },
    shuffleDecks: true,
  };
};
