import {
  gameplayLinesFromTextParts,
  materializeEffectDefinition,
  parseCardEffectLinesDetailed,
  parseRawKeywordLine,
} from "@optcg/cards";
import {
  createInitialState,
  evaluateEffectBlockRuntimeSupport,
  filterStateForPlayer,
} from "@optcg/engine-core";
import type {
  CardCategory,
  CardId,
  EffectDefinition,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

export interface ManifestViewProbeEntry {
  readonly label: string;
  readonly cardId: string;
  readonly effectText?: string | null;
  readonly triggerText?: string | null;
  readonly category?: CardCategory;
}

export type ManifestViewProbeResultStatus = "passed" | "failed" | "skipped";

export interface ManifestViewProbeResult {
  readonly label: string;
  readonly cardId: string;
  readonly status: ManifestViewProbeResultStatus;
  readonly reason?: string;
}

export interface ManifestViewProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
  readonly results: readonly ManifestViewProbeResult[];
}

export const createManifestViewProbeReport = (input: {
  readonly entries: readonly ManifestViewProbeEntry[];
}): ManifestViewProbeReport => {
  const results = input.entries.map((entry) =>
    validateManifestViewProbeEntry(entry),
  );
  const passedCount = results.filter(
    (result) => result.status === "passed",
  ).length;
  const failedCount = results.filter(
    (result) => result.status === "failed",
  ).length;
  const skippedCount = results.filter(
    (result) => result.status === "skipped",
  ).length;

  return {
    exitCode: failedCount === 0 ? 0 : 1,
    lines: [
      `Manifest view probe entries: ${String(input.entries.length)}`,
      `Manifest view probe passed: ${String(passedCount)}`,
      `Manifest view probe failed: ${String(failedCount)}`,
      `Manifest view probe skipped: ${String(skippedCount)}`,
      ...results.flatMap((result) =>
        result.status === "failed"
          ? [
              `Manifest view probe failure: ${result.label} - ${
                result.reason ?? "unknown failure"
              }`,
            ]
          : [],
      ),
    ],
    errors: [],
    results,
  };
};

export const validateMatchCardManifestViewSafety = (input: {
  readonly manifest: MatchCardManifest;
  readonly cardIds: readonly CardId[];
}): readonly ManifestViewProbeResult[] =>
  input.cardIds.map((cardId) =>
    validateManifestCard({
      label: String(cardId),
      cardId,
      manifest: input.manifest,
      projectView: true,
    }),
  );

const validateManifestViewProbeEntry = (
  entry: ManifestViewProbeEntry,
): ManifestViewProbeResult => {
  const cardId = entry.cardId as CardId;
  const manifest = createProbeManifestFromEntry({ ...entry, cardId });
  return validateManifestCard({
    label: entry.label,
    cardId,
    manifest,
    projectView: true,
  });
};

const validateManifestCard = (input: {
  readonly label: string;
  readonly cardId: CardId;
  readonly manifest: MatchCardManifest;
  readonly projectView: boolean;
}): ManifestViewProbeResult => {
  const card = input.manifest.cards[input.cardId];
  if (card === undefined) {
    return failed(input, `manifest is missing card ${String(input.cardId)}`);
  }
  const contractFailure = validateImplementedDslContract(card, input.manifest);
  if (contractFailure !== undefined) {
    return failed(input, contractFailure);
  }
  if (!input.projectView) {
    return passed(input);
  }
  if (!isProjectionCategory(card.category)) {
    return {
      label: input.label,
      cardId: String(input.cardId),
      status: "skipped",
      reason: `category ${card.category} has no field projection`,
    };
  }
  const stateResult = createProjectionState(input.manifest, input.cardId);
  if (!stateResult.ok) {
    return failed(input, stateResult.reason);
  }
  try {
    filterStateForPlayer(stateResult.state, probePlayerOne);
    filterStateForPlayer(stateResult.state, probePlayerTwo);
    return passed(input);
  } catch (error: unknown) {
    return failed(
      input,
      `player view projection threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const validateImplementedDslContract = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
): string | undefined => {
  if (card.support.status !== "implemented-dsl") {
    return undefined;
  }
  const definitionId = card.support.effectDefinitionId;
  if (definitionId === undefined) {
    return isMetadataOnlyImplementedDsl(card)
      ? undefined
      : "implemented-dsl card has runtime text but no effect definition";
  }
  const definition = manifest.effectDefinitions?.[definitionId];
  if (definition === undefined) {
    return `implemented-dsl card references missing effect definition ${definitionId}`;
  }
  if (definition.cardId !== card.cardId) {
    return `effect definition ${definitionId} belongs to ${String(
      definition.cardId,
    )}`;
  }
  if (definition.implementationStatus !== "implemented-dsl") {
    return `effect definition ${definitionId} has status ${definition.implementationStatus}`;
  }
  if (definition.metadata.sourceTextHash !== card.support.sourceTextHash) {
    return `effect definition ${definitionId} source hash does not match card support`;
  }
  if (definition.metadata.rulesVersion !== card.support.rulesVersion) {
    return `effect definition ${definitionId} rules version does not match card support`;
  }
  if (
    definition.metadata.effectDefinitionsVersion !==
    manifest.effectDefinitionsVersion
  ) {
    return `effect definition ${definitionId} version does not match manifest`;
  }
  return undefined;
};

const isMetadataOnlyImplementedDsl = (card: ResolvedCard): boolean => {
  const lines = manifestEffectLines(card);
  if (lines.length === 0) {
    return true;
  }
  for (const line of lines) {
    const parsed = parseCardEffectLinesDetailed(line);
    if (!parsed.ok) {
      return false;
    }
    if (parsed.value.some((value) => value.kind !== "metadata")) {
      return false;
    }
  }
  return true;
};

const createProbeManifestFromEntry = (
  entry: ManifestViewProbeEntry & { readonly cardId: CardId },
): MatchCardManifest => {
  const sourceTextHash = `manifest-view:${String(entry.cardId)}:${manifestText(
    entry,
  )}`;
  const materialized = materializeEffectDefinition(
    entry.cardId,
    manifestEffectLines(entry),
    sourceTextHash,
    {
      effectDefinitionsVersion: manifestViewVersion,
      rulesVersion: manifestViewVersion,
    },
    { evaluateRuntimeSupport: evaluateEffectBlockRuntimeSupport },
  );
  const definitionId = `${String(entry.cardId)}.manifest-view-probe`;
  const supportStatus =
    manifestEffectLines(entry).length === 0
      ? "vanilla-confirmed"
      : materialized.runtimeSupported
        ? "implemented-dsl"
        : "unsupported";
  const card = createResolvedProbeCard({
    cardId: entry.cardId,
    category: entry.category ?? "character",
    sourceTextHash,
    behaviorHash: sourceTextHash,
    support: {
      cardId: entry.cardId,
      status: supportStatus,
      ...(materialized.definition === undefined
        ? {}
        : { effectDefinitionId: definitionId }),
      tested: supportStatus !== "unsupported",
      rulesVersion: manifestViewVersion,
      cardDataVersion: manifestViewVersion,
      sourceTextHash,
      behaviorHash: sourceTextHash,
      ...(materialized.diagnostics.length === 0
        ? {}
        : { notes: materialized.diagnostics.join("; ") }),
    },
    ...(entry.effectText === null || entry.effectText === undefined
      ? {}
      : { effectText: entry.effectText }),
    ...(entry.triggerText === null || entry.triggerText === undefined
      ? {}
      : { triggerText: entry.triggerText }),
  });
  const effectDefinitions =
    materialized.definition === undefined
      ? undefined
      : {
          [definitionId]: {
            ...materialized.definition,
            implementationStatus: supportStatus,
          } satisfies EffectDefinition,
        };
  return createManifest({
    cards: {
      ...fillerCards(),
      [entry.cardId]: card,
    },
    ...(effectDefinitions === undefined ? {} : { effectDefinitions }),
  });
};

const createProjectionState = (
  manifest: MatchCardManifest,
  cardId: CardId,
):
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string } => {
  const card = manifest.cards[cardId];
  if (card === undefined) {
    return { ok: false, reason: `manifest is missing card ${String(cardId)}` };
  }
  const leaderOne = card.category === "leader" ? cardId : probeLeaderOne;
  const deckOne =
    card.category === "leader"
      ? projectionDeckCardIds("p1")
      : [cardId, ...projectionDeckCardIds("p1")];
  let state: GameState;
  try {
    state = createInitialState({
      matchId: "manifest-view-probe" as MatchId,
      firstPlayerId: probePlayerOne,
      playerOrder: [probePlayerOne, probePlayerTwo],
      leaderCardIds: {
        [probePlayerOne]: leaderOne,
        [probePlayerTwo]: probeLeaderTwo,
      },
      leaderLifeCounts: {
        [probePlayerOne]: 0,
        [probePlayerTwo]: 0,
      },
      deckCardIds: {
        [probePlayerOne]: deckOne,
        [probePlayerTwo]: projectionDeckCardIds("p2"),
      },
      donDeckCardIds: {
        [probePlayerOne]: [],
        [probePlayerTwo]: [],
      },
      cardManifest: manifest,
      rngSeed: "manifest-view-probe",
      shuffleDecks: false,
    });
  } catch (error: unknown) {
    return {
      ok: false,
      reason: `projection state setup threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  state.status = { type: "active" };
  state.turn.phase = "main";
  state.turn.turnPlayerId = probePlayerOne;
  if (card.category === "leader") {
    return { ok: true, state };
  }
  const player = state.players[probePlayerOne];
  if (player === undefined) {
    return { ok: false, reason: "projection state is missing player p1" };
  }
  const handIndex = player.hand.findIndex(
    (candidate) => candidate.cardId === cardId,
  );
  const fieldCard = player.hand[handIndex];
  if (handIndex < 0 || fieldCard === undefined) {
    return { ok: false, reason: "projection source card was not in hand" };
  }
  player.hand = player.hand.filter((_, index) => index !== handIndex);
  if (card.category === "character") {
    player.characters = [
      {
        ...fieldCard,
        zone: {
          zone: "characterArea",
          playerId: probePlayerOne,
          slot: "character",
          index: 0,
        },
        state: "active",
        turnPlayed: 0,
      },
    ];
    return { ok: true, state };
  }
  player.stage = {
    ...fieldCard,
    zone: { zone: "stageArea", playerId: probePlayerOne, slot: "stage" },
    state: "active",
    turnPlayed: 0,
  };
  return { ok: true, state };
};

const createManifest = (input: {
  readonly cards: Record<CardId, ResolvedCard>;
  readonly effectDefinitions?: Record<string, EffectDefinition>;
}): MatchCardManifest => ({
  manifestHash: "manifest-view-probe",
  source: "manual-test",
  cardDataVersion: manifestViewVersion,
  effectDefinitionsVersion: manifestViewVersion,
  customHandlerVersion: manifestViewVersion,
  banlistVersion: manifestViewVersion,
  createdAt: "2026-06-26T00:00:00.000Z",
  cards: input.cards,
  ...(input.effectDefinitions === undefined
    ? {}
    : { effectDefinitions: input.effectDefinitions }),
});

const createResolvedProbeCard = (params: {
  readonly cardId: CardId;
  readonly category: CardCategory;
  readonly effectText?: string;
  readonly triggerText?: string;
  readonly sourceTextHash: string;
  readonly behaviorHash: string;
  readonly support: ResolvedCard["support"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: String(params.cardId),
  category: params.category,
  set: "PROBE",
  setName: "Manifest View Probe",
  released: true,
  colors: params.category === "don" ? [] : ["red"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: params.sourceTextHash,
  behaviorHash: params.behaviorHash,
  support: params.support,
  ...(params.category === "character" ? { cost: 1, power: 2000 } : {}),
  ...(params.category === "leader" ? { power: 5000, life: 5 } : {}),
  ...(params.category === "event" || params.category === "stage"
    ? { cost: 1 }
    : {}),
  ...(params.effectText === undefined ? {} : { effectText: params.effectText }),
  ...(params.triggerText === undefined
    ? {}
    : { triggerText: params.triggerText }),
});

const fillerCards = (): Record<CardId, ResolvedCard> => {
  const cards: Record<CardId, ResolvedCard> = {
    [probeLeaderOne]: createResolvedProbeCard({
      cardId: probeLeaderOne,
      category: "leader",
      sourceTextHash: manifestViewVersion,
      behaviorHash: manifestViewVersion,
      support: vanillaSupport(probeLeaderOne),
    }),
    [probeLeaderTwo]: createResolvedProbeCard({
      cardId: probeLeaderTwo,
      category: "leader",
      sourceTextHash: manifestViewVersion,
      behaviorHash: manifestViewVersion,
      support: vanillaSupport(probeLeaderTwo),
    }),
  };
  for (const cardId of [
    ...projectionDeckCardIds("p1"),
    ...projectionDeckCardIds("p2"),
  ]) {
    cards[cardId] = createResolvedProbeCard({
      cardId,
      category: "character",
      sourceTextHash: manifestViewVersion,
      behaviorHash: manifestViewVersion,
      support: vanillaSupport(cardId),
    });
  }
  return cards;
};

const vanillaSupport = (cardId: CardId): ResolvedCard["support"] => ({
  cardId,
  status: "vanilla-confirmed",
  tested: true,
  rulesVersion: manifestViewVersion,
  cardDataVersion: manifestViewVersion,
  sourceTextHash: manifestViewVersion,
  behaviorHash: manifestViewVersion,
});

const manifestEffectLines = (input: {
  readonly effectText?: string | null;
  readonly triggerText?: string | null;
}): readonly string[] =>
  gameplayLinesFromTextParts([input.effectText, input.triggerText]).filter(
    (line) => parseRawKeywordLine({ text: line }) === undefined,
  );

const manifestText = (input: {
  readonly effectText?: string | null;
  readonly triggerText?: string | null;
}): string => [input.effectText ?? "", input.triggerText ?? ""].join("\n");

const projectionDeckCardIds = (suffix: "p1" | "p2"): CardId[] =>
  Array.from(
    { length: 5 },
    (_, index) => `manifest-view-${suffix}-${String(index + 1)}` as CardId,
  );

const isProjectionCategory = (
  category: CardCategory,
): category is "leader" | "character" | "stage" =>
  category === "leader" || category === "character" || category === "stage";

const failed = (
  input: { readonly label: string; readonly cardId: CardId },
  reason: string,
): ManifestViewProbeResult => ({
  label: input.label,
  cardId: String(input.cardId),
  status: "failed",
  reason,
});

const passed = (input: {
  readonly label: string;
  readonly cardId: CardId;
}): ManifestViewProbeResult => ({
  label: input.label,
  cardId: String(input.cardId),
  status: "passed",
});

const manifestViewVersion = "manifest-view-probe";
const probePlayerOne = "manifest-view-p1" as PlayerId;
const probePlayerTwo = "manifest-view-p2" as PlayerId;
const probeLeaderOne = "manifest-view-leader-p1" as CardId;
const probeLeaderTwo = "manifest-view-leader-p2" as CardId;
