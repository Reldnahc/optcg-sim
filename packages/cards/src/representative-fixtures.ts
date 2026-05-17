import type {
  CardImplementationRecord,
  CardId,
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
import type { GeneratedSupportBlockerCode } from "./generated-support-types.js";

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

export type RepresentativeSupportProofCandidateId =
  | "op10-045-cavendish"
  | "reverse-cavendish"
  | "ulti-style"
  | "impel-down-all-stars-style"
  | "rest"
  | "lock"
  | "power";

export type RepresentativeSupportProofMissingLayer =
  | "exact-card-id"
  | "checked-in-fixture-provenance"
  | "behavior-sensitive-printed-fields"
  | "source-text-hash"
  | "behavior-hash"
  | "parser-rule-evidence"
  | "runtime-capability-record"
  | "support-metadata"
  | "manifest-regeneration-plan";

interface RepresentativeSupportProofMatrixRowBase {
  readonly candidateId: RepresentativeSupportProofCandidateId;
  readonly displayName: string;
  readonly missingLayers: readonly RepresentativeSupportProofMissingLayer[];
  readonly sourceText: string;
}

export interface IncludedRealRepresentativeSupportProofMatrixRow extends RepresentativeSupportProofMatrixRowBase {
  readonly capabilityIds: readonly string[];
  readonly cardId: CardId;
  readonly doneStoryPath: string;
  readonly effectDefinitionId: string;
  readonly existingDiagnosticCodes: readonly [];
  readonly expectedBehaviorHash: string;
  readonly expectedSourceTextHash: string;
  readonly fixturePath: string;
  readonly missingLayers: readonly [];
  readonly parserRuleIds: readonly string[];
  readonly realCardPlayableSupport: true;
  readonly status: "included-real";
}

export interface SyntheticOnlyRepresentativeSupportProofMatrixRow extends RepresentativeSupportProofMatrixRowBase {
  readonly capabilityIds: readonly string[];
  readonly cardId: undefined;
  readonly existingDiagnosticCodes: readonly [];
  readonly missingLayers: readonly RepresentativeSupportProofMissingLayer[];
  readonly parserRuleIds: readonly string[];
  readonly realCardPlayableSupport: false;
  readonly status: "synthetic-only";
}

export interface BlockedRepresentativeSupportProofMatrixRow extends RepresentativeSupportProofMatrixRowBase {
  readonly cardId: undefined;
  readonly existingDiagnosticCodes: readonly GeneratedSupportBlockerCode[];
  readonly realCardPlayableSupport: false;
  readonly status: "blocked-missing-layer";
  readonly syntheticDiagnosticCardId: CardId;
}

export type RepresentativeSupportProofMatrixRow =
  | IncludedRealRepresentativeSupportProofMatrixRow
  | SyntheticOnlyRepresentativeSupportProofMatrixRow
  | BlockedRepresentativeSupportProofMatrixRow;

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

const blockedRepresentativeMissingLayers = [
  "exact-card-id",
  "checked-in-fixture-provenance",
  "behavior-sensitive-printed-fields",
  "source-text-hash",
  "behavior-hash",
  "parser-rule-evidence",
  "runtime-capability-record",
  "support-metadata",
  "manifest-regeneration-plan",
] as const satisfies readonly RepresentativeSupportProofMissingLayer[];

const representativeSupportProofMatrix = [
  {
    candidateId: "op10-045-cavendish",
    capabilityIds: [
      "category:auto",
      "effect:draw:self:count:positive-safe-integer",
      "effect:sequence:ordered",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trigger:whenAttacking:oncePerTurn",
    ],
    cardId: "OP10-045" as CardId,
    displayName: "OP10-045 Cavendish",
    doneStoryPath:
      "stories/done/CARD-009C-op10-045-generated-support-fixture-proof.yaml",
    effectDefinitionId: "op10-045.generated-support",
    existingDiagnosticCodes: [],
    expectedBehaviorHash:
      "91be13cae1812281f832a9d4801ab16b17f162937783b27a572ce153dc88f234",
    expectedSourceTextHash:
      "021421b539ccd217aba7f1b12a71c8237e0c0fda28985041d9e91d5df1cd2a28",
    fixturePath: "fixtures/poneglyph/cards/OP10-045.cavendish.json",
    missingLayers: [],
    parserRuleIds: [
      "exact:when-attacking:once-per-turn:draw-n:trash-m:hand:self",
    ],
    realCardPlayableSupport: true,
    sourceText:
      "[When Attacking] [Once Per Turn] Draw 2 cards and trash 1 card from your hand.",
    status: "included-real",
  },
  {
    candidateId: "reverse-cavendish",
    capabilityIds: [
      "effect:draw:self:count:positive-safe-integer",
      "effect:sequence:ordered",
      "effect:trashFromHand:self:count:positive-safe-integer:owner-chooses",
      "sequence:genericFrames",
      "sequence:trashFromHand:draw",
      "sourcePresencePolicy:mustRemainInSameZone",
      "trashFromHand:segment0:self:self:count-exact",
      "trigger:onPlay",
    ],
    cardId: undefined,
    displayName: "Reverse Cavendish synthetic trash-then-draw",
    existingDiagnosticCodes: [],
    missingLayers: [
      "exact-card-id",
      "checked-in-fixture-provenance",
      "behavior-sensitive-printed-fields",
      "source-text-hash",
      "behavior-hash",
      "support-metadata",
      "manifest-regeneration-plan",
    ],
    parserRuleIds: ["exact:on-play:trash-2-from-hand:draw-1:self"],
    realCardPlayableSupport: false,
    sourceText: "[On Play] Trash 2 cards from your hand. Draw 1 card.",
    status: "synthetic-only",
  },
  createBlockedRepresentativeSupportProofMatrixRow({
    candidateId: "ulti-style",
    displayName: "Ulti-style candidate",
    existingDiagnosticCodes: ["unparsed-span"],
    sourceText: "[On Play] You may trash 2 cards from your hand: Draw 2 cards.",
    syntheticDiagnosticCardId: "CARD-014H-ULTI-STYLE" as CardId,
  }),
  createBlockedRepresentativeSupportProofMatrixRow({
    candidateId: "impel-down-all-stars-style",
    displayName: "Impel Down All Stars-style candidate",
    existingDiagnosticCodes: ["unparsed-span"],
    sourceText:
      "[Main] Look at 5 cards from the top of your deck; reveal up to 1 {Impel Down} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    syntheticDiagnosticCardId: "CARD-014H-IMPEL-DOWN-ALL-STARS-STYLE" as CardId,
  }),
  createBlockedRepresentativeSupportProofMatrixRow({
    candidateId: "rest",
    displayName: "Rest candidate",
    existingDiagnosticCodes: ["unparsed-span"],
    sourceText:
      "[On Play] Rest up to 1 of your opponent's Characters with a cost of 4 or less.",
    syntheticDiagnosticCardId: "CARD-014H-REST" as CardId,
  }),
  createBlockedRepresentativeSupportProofMatrixRow({
    candidateId: "lock",
    displayName: "Lock candidate",
    existingDiagnosticCodes: ["unparsed-span"],
    sourceText:
      "[On Play] Your opponent cannot set up to 1 of their DON!! cards as active during their next Refresh Phase.",
    syntheticDiagnosticCardId: "CARD-014H-LOCK" as CardId,
  }),
  createBlockedRepresentativeSupportProofMatrixRow({
    candidateId: "power",
    displayName: "Power candidate",
    existingDiagnosticCodes: ["unparsed-span"],
    sourceText:
      "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle.",
    syntheticDiagnosticCardId: "CARD-014H-POWER" as CardId,
  }),
] as const satisfies readonly RepresentativeSupportProofMatrixRow[];

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

export function listRepresentativeSupportProofMatrixRows(): readonly RepresentativeSupportProofMatrixRow[] {
  return representativeSupportProofMatrix;
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

function createBlockedRepresentativeSupportProofMatrixRow({
  candidateId,
  displayName,
  existingDiagnosticCodes,
  sourceText,
  syntheticDiagnosticCardId,
}: {
  candidateId: Exclude<
    RepresentativeSupportProofCandidateId,
    "op10-045-cavendish" | "reverse-cavendish"
  >;
  displayName: string;
  existingDiagnosticCodes: readonly GeneratedSupportBlockerCode[];
  sourceText: string;
  syntheticDiagnosticCardId: CardId;
}): BlockedRepresentativeSupportProofMatrixRow {
  return {
    candidateId,
    cardId: undefined,
    displayName,
    existingDiagnosticCodes,
    missingLayers: blockedRepresentativeMissingLayers,
    realCardPlayableSupport: false,
    sourceText,
    status: "blocked-missing-layer",
    syntheticDiagnosticCardId,
  } satisfies BlockedRepresentativeSupportProofMatrixRow;
}
