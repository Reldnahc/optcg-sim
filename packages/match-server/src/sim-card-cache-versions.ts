import type { CardDataCache, DevManifestVersions } from "@optcg/cards";

export const activeSimCardCacheVersionsKey = "sim-card-cache:active-versions";

const cacheSchemaVersion = 1;
const activeVersionsTtlSeconds = 60 * 60 * 24 * 7;

export interface ActiveSimCardCacheVersions {
  readonly cacheSchemaVersion: 1;
  readonly versions: {
    readonly cardDataVersion: string;
    readonly effectDefinitionsVersion: string;
    readonly overlayVersion: string;
  };
  readonly updatedAt: string;
}

export const activeSimCardCacheVersionsFromManifest = (
  versions: Pick<
    DevManifestVersions,
    "cardDataVersion" | "effectDefinitionsVersion" | "overlayVersion"
  >,
): ActiveSimCardCacheVersions["versions"] => ({
  cardDataVersion: versions.cardDataVersion,
  effectDefinitionsVersion: versions.effectDefinitionsVersion,
  overlayVersion: versions.overlayVersion,
});

export const writeActiveSimCardCacheVersions = async (
  cache: CardDataCache,
  versions: Pick<
    DevManifestVersions,
    "cardDataVersion" | "effectDefinitionsVersion" | "overlayVersion"
  >,
): Promise<void> => {
  await cache.setJson(
    activeSimCardCacheVersionsKey,
    {
      cacheSchemaVersion,
      versions: activeSimCardCacheVersionsFromManifest(versions),
      updatedAt: new Date().toISOString(),
    } satisfies ActiveSimCardCacheVersions,
    { ttlSeconds: activeVersionsTtlSeconds },
  );
};
