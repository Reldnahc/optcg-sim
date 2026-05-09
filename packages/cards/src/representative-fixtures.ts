import type { CardImplementationRecord, CardSupportStatus } from "@optcg/types";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PoneglyphCardDetail } from "@optcg/types";
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
