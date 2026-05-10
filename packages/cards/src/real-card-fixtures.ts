import type {
  CardImplementationRecord,
  EffectDefinition,
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

export type RealCardFixtureId = "OP01-060" | "OP05-091" | "EB01-023";

const checkedInCardFixturePathById = {
  "OP01-060": "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
  "OP05-091": "fixtures/poneglyph/cards/OP05-091.rebecca.json",
  "EB01-023": "fixtures/poneglyph/cards/EB01-023.edward-weevil.json",
} as const satisfies Record<RealCardFixtureId, string>;

const realCardFixtureIds = Object.freeze(
  Object.keys(checkedInCardFixturePathById) as RealCardFixtureId[],
);

const supportedEffectDefinitionId = "eb01-023.on-play-draw-1";
const supportedEffectRulesVersion = "2026-01-16";

export const realCardDslEffectDefinitionFixturePath =
  "fixtures/effect-dsl/valid/eb01-023-on-play-draw-1.json";

export const realCardDslMatchCardManifestFixturePath =
  "fixtures/cards/real-card-dsl-match-card-manifest.json";

const realCardMatchManifestCreatedAt = "2026-05-09T00:00:00.000Z";

const realCardMatchManifestVersions = createManifestVersions({
  banlistVersion: "real-card-banlist-v1",
  cardDataVersion: "real-card-poneglyph-fixture-v1",
  customHandlerVersion: "real-card-custom-handlers-v1",
  effectDefinitionsVersion: "real-card-effects-v1",
  overlayVersion: "real-card-overlays-v1",
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export function listRealCardFixtureIds(): readonly RealCardFixtureId[] {
  return realCardFixtureIds;
}

export async function loadCheckedInRealPoneglyphFixture(
  fixtureId: RealCardFixtureId,
): Promise<PoneglyphCardDetail> {
  const source = await readFile(
    path.join(repoRoot, checkedInCardFixturePathById[fixtureId]),
    "utf8",
  );
  const parsed = JSON.parse(source) as unknown;

  return validatePoneglyphCardDetail(parsed);
}

export async function loadCheckedInEb01023OnPlayDraw1EffectDefinition(): Promise<EffectDefinition> {
  const source = await readFile(
    path.join(repoRoot, realCardDslEffectDefinitionFixturePath),
    "utf8",
  );

  return JSON.parse(source) as EffectDefinition;
}

export async function buildRealCardDslMatchCardManifest(): Promise<MatchCardManifest> {
  const effectDefinition =
    await loadCheckedInEb01023OnPlayDraw1EffectDefinition();
  const cards = await Promise.all(
    realCardFixtureIds.map(async (fixtureId) => {
      const normalized = normalizePoneglyphCardDetail(
        await loadCheckedInRealPoneglyphFixture(fixtureId),
      );
      const merged = mergeSimulatorOverlay(
        normalized,
        createRealCardOverlay(fixtureId, normalized),
      );

      return merged.card;
    }),
  );

  return buildMatchCardManifest({
    cards,
    createdAt: realCardMatchManifestCreatedAt,
    effectDefinitions: { [supportedEffectDefinitionId]: effectDefinition },
    source: "poneglyph-fixture",
    versions: realCardMatchManifestVersions,
  });
}

export async function loadRealCardDslMatchCardManifestFixture(): Promise<MatchCardManifest> {
  const source = await readFile(
    path.join(repoRoot, realCardDslMatchCardManifestFixturePath),
    "utf8",
  );
  const parsed = JSON.parse(source) as MatchCardManifest;

  if (parsed.manifestHash !== computeMatchCardManifestHash(parsed)) {
    throw new Error(
      `Real-card DSL manifest fixture ${realCardDslMatchCardManifestFixturePath} has a stale manifestHash.`,
    );
  }

  return parsed;
}

function createRealCardOverlay(
  fixtureId: RealCardFixtureId,
  normalized: ReturnType<typeof normalizePoneglyphCardDetail>,
): ResolvedCardOverlay {
  const support: CardImplementationRecord = {
    behaviorHash: normalized.behaviorHash,
    cardDataVersion: realCardMatchManifestVersions.cardDataVersion,
    cardId: normalized.cardId,
    rulesVersion:
      fixtureId === "EB01-023"
        ? supportedEffectRulesVersion
        : "fixture-real-card",
    sourceTextHash: normalized.sourceTextHash,
    status: fixtureId === "EB01-023" ? "implemented-dsl" : "unsupported",
    tested: fixtureId === "EB01-023",
  };

  if (fixtureId === "EB01-023") {
    support.effectDefinitionId = supportedEffectDefinitionId;
    support.notes =
      "Reviewed real-card fixture with explicit [On Play] Draw 1 card DSL linkage.";
  } else {
    support.notes =
      "Checked-in real Poneglyph adapter fixture for normalization/hash coverage; gameplay support remains unsupported.";
  }

  return {
    cardId: normalized.cardId,
    support,
  };
}
