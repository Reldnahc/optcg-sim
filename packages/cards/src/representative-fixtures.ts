import type {
  CardImplementationRecord,
  CardSupportStatus,
  MatchCardManifest,
  ResolvedCardOverlay,
} from "@optcg/types";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PoneglyphCardDetail } from "@optcg/types";
import {
  buildMatchCardManifest,
  computeMatchCardManifestHash,
  createManifestVersions,
} from "./manifest.js";
import { normalizePoneglyphCardDetail } from "./normalization.js";
import { mergeSimulatorOverlay } from "./overlay.js";
import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

export type RepresentativeFixtureId =
  | "FX-LEADER-VANILLA"
  | "FX-CHAR-VANILLA"
  | "FX-BLOCKER"
  | "FX-ONPLAY-DRAW"
  | "OP01-060"
  | "OP05-091";

export interface RepresentativeFixtureSupportMetadata {
  cardId: RepresentativeFixtureId;
  support: Pick<
    CardImplementationRecord,
    "status" | "tested" | "notes" | "rulesVersion" | "cardDataVersion"
  >;
  checkedInPoneglyphFixture: boolean;
}

const checkedInCardFixturePathById = {
  "FX-LEADER-VANILLA": undefined,
  "FX-CHAR-VANILLA": undefined,
  "FX-BLOCKER": undefined,
  "FX-ONPLAY-DRAW": undefined,
  "OP01-060": "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
  "OP05-091": "fixtures/poneglyph/cards/OP05-091.rebecca.json",
} as const satisfies Record<RepresentativeFixtureId, string | undefined>;

const supportMetadataById = {
  "FX-LEADER-VANILLA": {
    cardId: "FX-LEADER-VANILLA",
    checkedInPoneglyphFixture: false,
    support: {
      cardDataVersion: "fixture-representative",
      notes:
        "Representative fixture placeholder for minimal vanilla leader coverage; no gameplay semantics are implemented in @optcg/cards.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: true,
    },
  },
  "FX-CHAR-VANILLA": {
    cardId: "FX-CHAR-VANILLA",
    checkedInPoneglyphFixture: false,
    support: {
      cardDataVersion: "fixture-representative",
      notes:
        "Representative fixture placeholder for minimal vanilla character coverage; no gameplay semantics are implemented in @optcg/cards.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: true,
    },
  },
  "FX-BLOCKER": {
    cardId: "FX-BLOCKER",
    checkedInPoneglyphFixture: false,
    support: {
      cardDataVersion: "fixture-representative",
      notes:
        "Representative fixture placeholder for blocker coverage when full gameplay semantics are pending in downstream stories.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: true,
    },
  },
  "FX-ONPLAY-DRAW": {
    cardId: "FX-ONPLAY-DRAW",
    checkedInPoneglyphFixture: false,
    support: {
      cardDataVersion: "fixture-representative",
      notes:
        "Representative fixture placeholder for simple on-play draw coverage when effect execution semantics are pending in downstream stories.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: true,
    },
  },
  "OP01-060": {
    cardId: "OP01-060",
    checkedInPoneglyphFixture: true,
    support: {
      cardDataVersion: "poneglyph-fixture-v1",
      notes:
        "Checked-in real Poneglyph adapter fixture for representative coverage; gameplay support is deferred to downstream effect/card implementation stories.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: false,
    },
  },
  "OP05-091": {
    cardId: "OP05-091",
    checkedInPoneglyphFixture: true,
    support: {
      cardDataVersion: "poneglyph-fixture-v1",
      notes:
        "Checked-in real Poneglyph adapter fixture for representative coverage; gameplay support is deferred to downstream effect/card implementation stories.",
      rulesVersion: "fixture-representative",
      status: "unsupported",
      tested: false,
    },
  },
} as const satisfies Record<
  RepresentativeFixtureId,
  RepresentativeFixtureSupportMetadata
>;

const representativeFixtureIds = Object.freeze(
  Object.keys(supportMetadataById) as RepresentativeFixtureId[],
);

export const representativeMatchCardManifestFixturePath =
  "fixtures/cards/representative-match-card-manifest.json";

const representativeMatchManifestCreatedAt = "2026-05-09T00:00:00.000Z";

const representativeMatchManifestVersions = createManifestVersions({
  banlistVersion: "representative-banlist-v1",
  cardDataVersion: "representative-poneglyph-fixture-v1",
  customHandlerVersion: "representative-custom-handlers-v1",
  effectDefinitionsVersion: "representative-effects-v1",
  overlayVersion: "representative-overlays-v1",
});

const representativeManifestPoneglyphFixtureIds = [
  "OP01-060",
  "OP05-091",
] as const satisfies readonly RepresentativeFixtureId[];

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export function listRepresentativeFixtureIds(): readonly RepresentativeFixtureId[] {
  return representativeFixtureIds;
}

export function getRepresentativeFixtureSupportMetadata(
  fixtureId: RepresentativeFixtureId,
): RepresentativeFixtureSupportMetadata {
  return supportMetadataById[fixtureId];
}

export async function loadCheckedInRepresentativePoneglyphFixture(
  fixtureId: RepresentativeFixtureId,
): Promise<PoneglyphCardDetail> {
  const relativePath = checkedInCardFixturePathById[fixtureId];

  if (relativePath === undefined) {
    throw new Error(
      `Representative fixture ${fixtureId} has no checked-in Poneglyph payload; support status is ${supportMetadataById[fixtureId].support.status}.`,
    );
  }

  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  const parsed = JSON.parse(source) as unknown;

  return validatePoneglyphCardDetail(parsed);
}

export async function buildRepresentativeMatchCardManifest(): Promise<MatchCardManifest> {
  const cards = await Promise.all(
    representativeManifestPoneglyphFixtureIds.map(async (fixtureId) => {
      const normalized = normalizePoneglyphCardDetail(
        await loadCheckedInRepresentativePoneglyphFixture(fixtureId),
      );
      const merged = mergeSimulatorOverlay(
        normalized,
        createRepresentativeOverlay(fixtureId, normalized),
      );

      return merged.card;
    }),
  );

  return buildMatchCardManifest({
    cards,
    createdAt: representativeMatchManifestCreatedAt,
    effectDefinitions: {},
    source: "poneglyph-fixture",
    versions: representativeMatchManifestVersions,
  });
}

export async function loadRepresentativeMatchCardManifestFixture(): Promise<MatchCardManifest> {
  const source = await readFile(
    path.join(repoRoot, representativeMatchCardManifestFixturePath),
    "utf8",
  );
  const parsed = JSON.parse(source) as MatchCardManifest;

  if (parsed.manifestHash !== computeMatchCardManifestHash(parsed)) {
    throw new Error(
      `Representative manifest fixture ${representativeMatchCardManifestFixturePath} has a stale manifestHash.`,
    );
  }

  return parsed;
}

export function hasCheckedInRepresentativePoneglyphFixture(
  fixtureId: RepresentativeFixtureId,
): boolean {
  return checkedInCardFixturePathById[fixtureId] !== undefined;
}

export function isRepresentativeFixtureStatusSupported(
  status: CardSupportStatus,
): boolean {
  return status !== "unsupported" && status !== "banned-in-simulator";
}

function createRepresentativeOverlay(
  fixtureId: (typeof representativeManifestPoneglyphFixtureIds)[number],
  normalized: ReturnType<typeof normalizePoneglyphCardDetail>,
): ResolvedCardOverlay {
  const metadata = getRepresentativeFixtureSupportMetadata(fixtureId);
  const support: CardImplementationRecord = {
    behaviorHash: normalized.behaviorHash,
    cardDataVersion: representativeMatchManifestVersions.cardDataVersion,
    cardId: normalized.cardId,
    rulesVersion: metadata.support.rulesVersion,
    sourceTextHash: normalized.sourceTextHash,
    status: metadata.support.status,
    tested: metadata.support.tested,
  };

  if (metadata.support.notes !== undefined) {
    support.notes = metadata.support.notes;
  }

  return {
    cardId: normalized.cardId,
    support,
  };
}
