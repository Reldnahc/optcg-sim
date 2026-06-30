import type {
  CardId,
  CardRef,
  EffectBlock,
  EffectDefinition,
  EffectTextSpanId,
  MatchCardManifest,
} from "@optcg/types";
import {
  evaluateEffectBlockRuntimeSupport,
  splitEffectTextSpotlightPresentation,
} from "@optcg/engine-core";

import { buildDevMatchCardManifestFromPoneglyphIds } from "./runtime-supported-cards.js";

export interface SpotlightProbeRequest {
  readonly cardId?: string;
  readonly setCode?: string;
  readonly setCodes?: readonly string[];
  readonly fetchCard?: PoneglyphFetch;
  readonly baseUrl?: string;
}

export interface SpotlightProbeReport {
  readonly exitCode: number;
  readonly lines: readonly string[];
  readonly errors: readonly string[];
}

interface PoneglyphFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

interface PoneglyphFetchRequest {
  readonly method?: "GET" | "POST";
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

type PoneglyphFetch = (
  url: string | URL,
  init?: PoneglyphFetchRequest,
) => Promise<PoneglyphFetchResponse>;

interface SpotlightProbeFailure {
  readonly cardId: CardId;
  readonly effectId: EffectBlock["id"];
  readonly reason: "missing-presentation" | "unspotlightable-spans";
  readonly spanIds: readonly EffectTextSpanId[];
}

const defaultPoneglyphBaseUrl = "https://api.poneglyph.one";

export const createSpotlightProbeReport = async (
  request: SpotlightProbeRequest,
): Promise<SpotlightProbeReport> => {
  const baseUrl = request.baseUrl ?? defaultPoneglyphBaseUrl;
  const fetchCard = request.fetchCard ?? fetchPoneglyphCard;
  const cardIdsProbeResult = await catchProbeError("card catalog fetch", () =>
    probeCardIds(request, { baseUrl, fetchCard }),
  );
  if (!cardIdsProbeResult.ok) {
    return { exitCode: 1, lines: [], errors: [cardIdsProbeResult.error] };
  }
  const cardIdsResult = cardIdsProbeResult.value;
  if (!cardIdsResult.ok) {
    return { exitCode: 1, lines: [], errors: [cardIdsResult.error] };
  }

  const manifestResult = await catchProbeError("manifest build", () =>
    buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: cardIdsResult.cardIds,
      baseUrl,
      fetchCard,
    }),
  );
  if (!manifestResult.ok) {
    return { exitCode: 1, lines: [], errors: [manifestResult.error] };
  }
  return createManifestSpotlightReport({
    cardIds: cardIdsResult.cardIds,
    label: cardIdsResult.label,
    manifest: manifestResult.value,
  });
};

const catchProbeError = async <T>(
  step: string,
  action: () => Promise<T>,
): Promise<{ readonly ok: true; readonly value: T } | ProbeError> => {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return {
      ok: false,
      error: `Spotlight probe ${step} failed: ${unknownErrorMessage(error)}`,
    };
  }
};

interface ProbeError {
  readonly ok: false;
  readonly error: string;
}

const unknownErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "unknown error";
};

const probeCardIds = async (
  request: SpotlightProbeRequest,
  options: { readonly baseUrl: string; readonly fetchCard: PoneglyphFetch },
): Promise<
  | {
      readonly ok: true;
      readonly label: string;
      readonly cardIds: readonly CardId[];
    }
  | { readonly ok: false; readonly error: string }
> => {
  const setCodes = normalizedSetCodes([
    ...(request.setCode === undefined ? [] : [request.setCode]),
    ...(request.setCodes ?? []),
  ]);
  if (setCodes.length > 0) {
    const cardIds: CardId[] = [];
    for (const setCode of setCodes) {
      const fetched = await fetchPoneglyphSetCardIds(setCode, options);
      if (!fetched.ok) {
        return fetched;
      }
      if (fetched.cardIds.length === 0) {
        return {
          ok: false,
          error: `Poneglyph set catalog fetch returned no cards for ${setCode}`,
        };
      }
      cardIds.push(...fetched.cardIds);
    }
    return {
      ok: true,
      label:
        setCodes.length === 1
          ? `Set: ${setCodes[0] ?? ""}`
          : `Sets: ${setCodes.join(", ")}`,
      cardIds: uniqueCardIds(cardIds),
    };
  }
  if (request.cardId !== undefined && request.cardId.length > 0) {
    const cardId = request.cardId.toUpperCase() as CardId;
    return { ok: true, label: `Card: ${cardId}`, cardIds: [cardId] };
  }
  return {
    ok: false,
    error: "Usage: spotlight:probe -- --card <card id> | --set <set code>",
  };
};

const normalizedSetCodes = (setCodes: readonly string[]): readonly string[] => [
  ...new Set(
    setCodes
      .map((setCode) => setCode.trim().toUpperCase())
      .filter((setCode) => setCode.length > 0),
  ),
];

const uniqueCardIds = (cardIds: readonly CardId[]): readonly CardId[] => [
  ...new Set(cardIds),
];

const createManifestSpotlightReport = ({
  cardIds,
  label,
  manifest,
}: {
  readonly label: string;
  readonly cardIds: readonly CardId[];
  readonly manifest: MatchCardManifest;
}): SpotlightProbeReport => {
  const definitionsByCard = effectDefinitionsByCard(manifest);
  let runtimeSupportedCardCount = 0;
  let runtimeSupportedBlockCount = 0;
  let spotlightReadyBlockCount = 0;
  const failures: SpotlightProbeFailure[] = [];

  for (const cardId of cardIds) {
    const definitions = definitionsByCard.get(cardId) ?? [];
    let cardHasRuntimeSupportedBlock = false;
    for (const definition of definitions) {
      for (const block of definition.effects) {
        const support = evaluateEffectBlockRuntimeSupport(block, {
          siblingBlocks: definition.effects,
        });
        if (!support.supported) {
          continue;
        }
        runtimeSupportedBlockCount += 1;
        cardHasRuntimeSupportedBlock = true;
        const failure = spotlightFailureForBlock(cardId, block);
        if (failure === undefined) {
          spotlightReadyBlockCount += 1;
        } else {
          failures.push(failure);
        }
      }
    }
    if (cardHasRuntimeSupportedBlock) {
      runtimeSupportedCardCount += 1;
    }
  }

  const lines = [
    label,
    `Cards: ${String(cardIds.length)}`,
    `Runtime-supported cards: ${String(runtimeSupportedCardCount)}`,
    `Runtime-supported effect blocks: ${String(runtimeSupportedBlockCount)}`,
    `Spotlight-ready effect blocks: ${String(spotlightReadyBlockCount)}`,
    failures.length === 0
      ? "Failures: none"
      : `Failures: ${String(failures.length)} effect block${
          failures.length === 1 ? "" : "s"
        }`,
    ...failures.map(formatFailure),
  ];

  return {
    exitCode: failures.length === 0 ? 0 : 1,
    lines,
    errors: [],
  };
};

const effectDefinitionsByCard = (
  manifest: MatchCardManifest,
): ReadonlyMap<CardId, readonly EffectDefinition[]> => {
  const byCard = new Map<CardId, EffectDefinition[]>();
  for (const definition of Object.values(manifest.effectDefinitions ?? {})) {
    const definitions = byCard.get(definition.cardId) ?? [];
    definitions.push(definition);
    byCard.set(definition.cardId, definitions);
  }
  return byCard;
};

const spotlightFailureForBlock = (
  cardId: CardId,
  block: EffectBlock,
): SpotlightProbeFailure | undefined => {
  const presentation = block.presentation;
  if (presentation === undefined || presentation.spanIds.length === 0) {
    return {
      cardId,
      effectId: block.id,
      reason: "missing-presentation",
      spanIds: [],
    };
  }
  const split = splitEffectTextSpotlightPresentation({
    source: probeSource,
    textKind: presentation.textKind,
    activeSpanIds: presentation.spanIds,
  });
  return split.length === 0
    ? {
        cardId,
        effectId: block.id,
        reason: "unspotlightable-spans",
        spanIds: presentation.spanIds,
      }
    : undefined;
};

const formatFailure = (failure: SpotlightProbeFailure): string =>
  [
    `- ${String(failure.cardId)} ${String(failure.effectId)}`,
    failure.reason,
    failure.spanIds.length === 0
      ? ""
      : `[${failure.spanIds.map(String).join(", ")}]`,
  ]
    .filter((part) => part.length > 0)
    .join(" ");

const probeSource: CardRef = {
  instanceId: "spotlight-probe:source" as CardRef["instanceId"],
  cardId: "spotlight-probe:card" as CardRef["cardId"],
  playerId: "player-1" as CardRef["playerId"],
};

const fetchPoneglyphSetCardIds = async (
  setCode: string,
  options: {
    readonly baseUrl: string;
    readonly fetchCard: PoneglyphFetch;
  },
): Promise<
  | { readonly ok: true; readonly cardIds: readonly CardId[] }
  | { readonly ok: false; readonly error: string }
> => {
  const prefix = `${setCode}-`;
  const cardIds: CardId[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url = new URL(`${options.baseUrl.replace(/\/+$/u, "")}/v1/search`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "500");
    url.searchParams.set("sort", "card_number");
    url.searchParams.set("order", "asc");
    url.searchParams.set("collapse", "card");
    const response = await options.fetchCard(url);
    if (!response.ok) {
      return {
        ok: false,
        error: `Poneglyph set catalog fetch failed for ${setCode}: HTTP ${String(response.status)}`,
      };
    }
    const payload = await response.json();
    const catalog = toPoneglyphCardCatalogPayload(payload);
    if (catalog === undefined) {
      return {
        ok: false,
        error: `Poneglyph set catalog fetch failed for ${setCode}: invalid response payload`,
      };
    }
    for (const cardId of catalog.cardIds) {
      if (cardId.toUpperCase().startsWith(prefix)) {
        cardIds.push(cardId);
      }
    }
    hasMore = catalog.hasMore;
    page += 1;
  }
  return { ok: true, cardIds: [...new Set(cardIds)] };
};

const toPoneglyphCardCatalogPayload = (
  value: unknown,
):
  | { readonly cardIds: readonly CardId[]; readonly hasMore: boolean }
  | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const data = candidate["data"];
  if (!Array.isArray(data)) {
    return undefined;
  }
  const cardIds: CardId[] = [];
  for (const card of data) {
    if (typeof card !== "object" || card === null) {
      return undefined;
    }
    const cardNumber = (card as Record<string, unknown>)["card_number"];
    if (typeof cardNumber !== "string") {
      return undefined;
    }
    cardIds.push(cardNumber as CardId);
  }
  const pagination = candidate["pagination"];
  const hasMore =
    typeof pagination === "object" &&
    pagination !== null &&
    (pagination as Record<string, unknown>)["has_more"] === true;
  return { cardIds, hasMore };
};

const fetchPoneglyphCard: PoneglyphFetch = async (url, init) =>
  fetch(url, init);
