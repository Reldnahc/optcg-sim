import type { CardId, MatchCardManifest } from "@optcg/types";

import {
  createCardRepository,
  createPoneglyphHttpClient,
  type CardDataCache,
  type CardRepositoryVersions,
  type PoneglyphFetch,
  type PoneglyphFetchRequest,
  type PoneglyphFetchResponse,
  type RuntimeSupportEvaluator,
} from "./card-repository.js";

export type DevPoneglyphFetchResponse = PoneglyphFetchResponse;
export type DevPoneglyphFetchRequest = PoneglyphFetchRequest;
export type DevPoneglyphFetch = PoneglyphFetch;

export interface BuildDevMatchCardManifestFromPoneglyphIdsRequest {
  readonly cardIds: readonly CardId[];
  readonly fetchCard?: DevPoneglyphFetch;
  readonly baseUrl?: string;
  readonly cache?: CardDataCache;
  readonly createdAt?: string;
  readonly devDonCount?: number;
  readonly versions?: Partial<DevManifestVersions>;
  readonly runtimeSupportEvaluator?: RuntimeSupportEvaluator;
}

interface DevManifestVersions {
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly customHandlerVersion: string;
  readonly banlistVersion: string;
  readonly rulesVersion: string;
  readonly overlayVersion: string;
}

export const defaultDevManifestVersions: DevManifestVersions = {
  cardDataVersion: "live-poneglyph-dev-v1",
  effectDefinitionsVersion: "generated-dev-v1",
  customHandlerVersion: "none",
  banlistVersion: "none",
  rulesVersion: "dev-rules",
  overlayVersion: "none",
};

export const parseDevCardIdList = (text: string): CardId[] => {
  const seen = new Set<string>();
  const cardIds: CardId[] = [];
  for (const token of text.split(/[\s,]+/u)) {
    const cardId = token.trim();
    if (cardId.length === 0 || seen.has(cardId)) {
      continue;
    }
    seen.add(cardId);
    cardIds.push(cardId as CardId);
  }
  return cardIds;
};

export const buildDevMatchCardManifestFromPoneglyphIds = async (
  request: BuildDevMatchCardManifestFromPoneglyphIdsRequest,
): Promise<MatchCardManifest> => {
  const versions: CardRepositoryVersions = {
    ...defaultDevManifestVersions,
    ...request.versions,
  };
  return createCardRepository({
    cache: request.cache ?? noOpCardDataCache,
    poneglyphClient: createPoneglyphHttpClient({
      ...(request.baseUrl === undefined ? {} : { baseUrl: request.baseUrl }),
      ...(request.fetchCard === undefined
        ? {}
        : { fetchCard: request.fetchCard }),
    }),
    versions,
    ...(request.runtimeSupportEvaluator === undefined
      ? {}
      : { runtimeSupportEvaluator: request.runtimeSupportEvaluator }),
  }).buildMatchManifest({
    cardIds: request.cardIds,
    ...(request.createdAt === undefined
      ? {}
      : { createdAt: request.createdAt }),
    ...(request.devDonCount === undefined
      ? {}
      : { devDonCount: request.devDonCount }),
  });
};

const noOpCardDataCache: CardDataCache = {
  getJson: () => Promise.resolve(undefined),
  setJson: () => Promise.resolve(),
};
