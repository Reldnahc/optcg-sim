import type { CardId, MatchCardManifest } from "@optcg/types";
import {
  defaultPoneglyphSimCardCacheVersions,
  fetchPoneglyphCardCatalogSnapshot,
} from "optcg-card-cache";

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

export interface DevManifestVersions {
  readonly cardDataVersion: string;
  readonly effectDefinitionsVersion: string;
  readonly customHandlerVersion: string;
  readonly banlistVersion: string;
  readonly rulesVersion: string;
  readonly overlayVersion: string;
}

export const defaultDevManifestVersions: DevManifestVersions = {
  ...defaultPoneglyphSimCardCacheVersions,
  customHandlerVersion: "none",
  banlistVersion: "none",
  rulesVersion: "dev-rules",
};

export interface FetchDevPoneglyphCatalogSnapshotInput {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly pageSize?: number;
  readonly versions?: Partial<DevManifestVersions>;
}

export interface DevPoneglyphCatalogSnapshot {
  readonly cardIds: readonly CardId[];
  readonly versions: DevManifestVersions;
}

export const fetchDevPoneglyphCatalogSnapshot = async ({
  baseUrl,
  fetch,
  pageSize,
  versions,
}: FetchDevPoneglyphCatalogSnapshotInput = {}): Promise<DevPoneglyphCatalogSnapshot> => {
  const snapshot = await fetchPoneglyphCardCatalogSnapshot({
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(fetch === undefined ? {} : { fetch }),
    ...(pageSize === undefined ? {} : { pageSize }),
  });
  return {
    cardIds: snapshot.cardIds as readonly CardId[],
    versions: {
      ...defaultDevManifestVersions,
      ...versions,
      cardDataVersion: snapshot.cardDataVersion,
    },
  };
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
