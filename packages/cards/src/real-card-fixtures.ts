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

const selectedEffectShapeFixturePathById = {
  "EB01-003": "fixtures/poneglyph/cards/EB01-003.kid-killer.json",
  "EB01-006": "fixtures/poneglyph/cards/EB01-006.tony-tony-chopper.json",
  "EB01-008": "fixtures/poneglyph/cards/EB01-008.littleoars-jr.json",
  "EB01-009":
    "fixtures/poneglyph/cards/EB01-009.just-shut-up-and-come-with-us.json",
  "EB01-010":
    "fixtures/poneglyph/cards/EB01-010.there-s-no-way-you-could-defeat-me.json",
  "EB01-013": "fixtures/poneglyph/cards/EB01-013.kouzuki-hiyori.json",
  "EB01-019": "fixtures/poneglyph/cards/EB01-019.off-white.json",
  "EB01-028": "fixtures/poneglyph/cards/EB01-028.gum-gum-champion-rifle.json",
  "EB01-034": "fixtures/poneglyph/cards/EB01-034.ms-wednesday.json",
  "EB01-036": "fixtures/poneglyph/cards/EB01-036.minochihuahua.json",
  "EB01-040": "fixtures/poneglyph/cards/EB01-040.kyros.json",
  "EB01-051": "fixtures/poneglyph/cards/EB01-051.finger-pistol.json",
  "EB01-052": "fixtures/poneglyph/cards/EB01-052.viola.json",
  "EB01-053": "fixtures/poneglyph/cards/EB01-053.gastino.json",
  "EB01-054": "fixtures/poneglyph/cards/EB01-054.gan-fall.json",
  "EB01-057": "fixtures/poneglyph/cards/EB01-057.shirahoshi.json",
  "EB02-013": "fixtures/poneglyph/cards/EB02-013.carrot.json",
  "EB02-017": "fixtures/poneglyph/cards/EB02-017.nami.json",
  "EB02-018": "fixtures/poneglyph/cards/EB02-018.buggy.json",
  "EB02-025": "fixtures/poneglyph/cards/EB02-025.donquixote-rosinante.json",
  "EB03-001": "fixtures/poneglyph/cards/EB03-001.nefeltari-vivi.json",
  "EB03-048": "fixtures/poneglyph/cards/EB03-048.rebecca.json",
  "EB03-050": "fixtures/poneglyph/cards/EB03-050.conis.json",
  "EB04-001": "fixtures/poneglyph/cards/EB04-001.jewelry-bonney.json",
  "EB04-023": "fixtures/poneglyph/cards/EB04-023.chaka-pell.json",
  "OP01-002": "fixtures/poneglyph/cards/OP01-002.trafalgar-law.json",
  "OP01-003": "fixtures/poneglyph/cards/OP01-003.monkey-d-luffy.json",
  "OP01-061": "fixtures/poneglyph/cards/OP01-061.kaido.json",
  "OP01-067": "fixtures/poneglyph/cards/OP01-067.crocodile.json",
  "OP01-068": "fixtures/poneglyph/cards/OP01-068.gecko-moria.json",
  "OP01-073": "fixtures/poneglyph/cards/OP01-073.donquixote-doflamingo.json",
  "OP01-121": "fixtures/poneglyph/cards/OP01-121.yamato.json",
  "OP02-001": "fixtures/poneglyph/cards/OP02-001.edward-newgate.json",
  "OP02-002": "fixtures/poneglyph/cards/OP02-002.monkey-d-garp.json",
  "OP02-025": "fixtures/poneglyph/cards/OP02-025.kin-emon.json",
  "OP02-062": "fixtures/poneglyph/cards/OP02-062.monkey-d-luffy.json",
  "OP02-072": "fixtures/poneglyph/cards/OP02-072.zephyr.json",
  "OP02-087": "fixtures/poneglyph/cards/OP02-087.minotaur.json",
  "OP02-095": "fixtures/poneglyph/cards/OP02-095.onigumo.json",
  "OP03-001": "fixtures/poneglyph/cards/OP03-001.portgas-d-ace.json",
  "OP03-022": "fixtures/poneglyph/cards/OP03-022.arlong.json",
  "OP03-040": "fixtures/poneglyph/cards/OP03-040.nami.json",
  "OP03-058": "fixtures/poneglyph/cards/OP03-058.iceburg.json",
  "OP03-059": "fixtures/poneglyph/cards/OP03-059.kaku.json",
  "OP03-068": "fixtures/poneglyph/cards/OP03-068.minozebra.json",
  "OP03-076": "fixtures/poneglyph/cards/OP03-076.rob-lucci.json",
  "OP03-077": "fixtures/poneglyph/cards/OP03-077.charlotte-linlin.json",
  "OP03-099": "fixtures/poneglyph/cards/OP03-099.charlotte-katakuri.json",
  "OP04-039": "fixtures/poneglyph/cards/OP04-039.rebecca.json",
  "OP04-108": "fixtures/poneglyph/cards/OP04-108.charlotte-moscato.json",
} as const;

type SelectedEffectShapeFixtureId =
  keyof typeof selectedEffectShapeFixturePathById;

export type RealEffectShapeFixtureFamily =
  | "activate-main"
  | "banish"
  | "blocker"
  | "counter-event"
  | "double-attack"
  | "event-main"
  | "life-manipulation"
  | "on-ko"
  | "optional-choice"
  | "permanent-modifier"
  | "replacement"
  | "rush"
  | "search-reveal"
  | "target-ko"
  | "trigger"
  | "when-attacking";

export type RealEffectShapeFixtureCorpusEntry = {
  readonly cardId: SelectedEffectShapeFixtureId;
  readonly effectFamily: RealEffectShapeFixtureFamily;
  readonly printedTextIncludes: string;
  readonly rationale: string;
};

export const realEffectShapeFixtureCorpus = [
  {
    cardId: "EB01-003",
    effectFamily: "rush",
    printedTextIncludes: "[Rush]",
    rationale: "rush fixture: combines Rush with a When Attacking modifier.",
  },
  {
    cardId: "EB01-006",
    effectFamily: "blocker",
    printedTextIncludes: "[Blocker]",
    rationale: "blocker fixture: Blocker plus attack-time power reduction.",
  },
  {
    cardId: "EB01-008",
    effectFamily: "replacement",
    printedTextIncludes: "would be K.O.'d by an effect",
    rationale:
      "replacement fixture: prevents effect K.O. by paying a hand cost.",
  },
  {
    cardId: "EB01-009",
    effectFamily: "counter-event",
    printedTextIncludes: "[Counter] Look at 5 cards",
    rationale:
      "counter-event fixture: counter timing plus top-deck play search.",
  },
  {
    cardId: "EB01-010",
    effectFamily: "target-ko",
    printedTextIncludes: "[Trigger] K.O.",
    rationale:
      "target-ko fixture: counter and trigger both K.O. public targets.",
  },
  {
    cardId: "EB01-013",
    effectFamily: "activate-main",
    printedTextIncludes: "[Activate: Main]",
    rationale:
      "activate-main fixture: self-trash cost, play from hand, then draw.",
  },
  {
    cardId: "EB01-019",
    effectFamily: "search-reveal",
    printedTextIncludes: "reveal up to 1 {Donquixote Pirates}",
    rationale:
      "search-reveal fixture: counter event reveals a filtered top-deck hit.",
  },
  {
    cardId: "EB01-028",
    effectFamily: "trigger",
    printedTextIncludes: "returns 1 of their active Characters",
    rationale:
      "trigger fixture: counter bounce plus separate trigger bottom-deck text.",
  },
  {
    cardId: "EB01-034",
    effectFamily: "permanent-modifier",
    printedTextIncludes: "[On Your Opponent's Attack]",
    rationale:
      "permanent-modifier fixture: attack-window DON ramp with Blocker.",
  },
  {
    cardId: "EB01-036",
    effectFamily: "on-ko",
    printedTextIncludes: "[On K.O.]",
    rationale: "on-ko fixture: Rush body with K.O. zone-leave DON ramp.",
  },
  {
    cardId: "EB01-040",
    effectFamily: "target-ko",
    printedTextIncludes: "Characters with a cost of 0",
    rationale:
      "target-ko fixture: leader Activate Main selects and K.O.s a Character.",
  },
  {
    cardId: "EB01-051",
    effectFamily: "event-main",
    printedTextIncludes: "[Main] You may trash 2 cards",
    rationale:
      "event-main fixture: true Main Event with cost and target K.O. text.",
  },
  {
    cardId: "EB01-052",
    effectFamily: "optional-choice",
    printedTextIncludes: "Choose one:",
    rationale:
      "optional-choice fixture: on-play modal choice touches Life information.",
  },
  {
    cardId: "EB01-053",
    effectFamily: "life-manipulation",
    printedTextIncludes: "top or bottom of your opponent's Life",
    rationale:
      "life-manipulation fixture: moves an opponent Character into Life.",
  },
  {
    cardId: "EB01-054",
    effectFamily: "target-ko",
    printedTextIncludes: "K.O. up to 1",
    rationale: "target-ko fixture: conditional on-play K.O. on a Blocker body.",
  },
  {
    cardId: "EB01-057",
    effectFamily: "replacement",
    printedTextIncludes: "top of your Life cards",
    rationale:
      "replacement fixture: effect-K.O. response adds deck top to Life.",
  },
  {
    cardId: "EB02-013",
    effectFamily: "search-reveal",
    printedTextIncludes: "play up to 1 [Zou]",
    rationale:
      "search-reveal fixture: top-seven reveal and hand-to-field follow-up.",
  },
  {
    cardId: "EB02-017",
    effectFamily: "search-reveal",
    printedTextIncludes: "{Straw Hat Crew}",
    rationale:
      "search-reveal fixture: classic top-five reveal/add-to-hand shape.",
  },
  {
    cardId: "EB02-018",
    effectFamily: "double-attack",
    printedTextIncludes: "[Double Attack]",
    rationale:
      "double-attack fixture: grants Double Attack and has a Trigger rest.",
  },
  {
    cardId: "EB02-025",
    effectFamily: "activate-main",
    printedTextIncludes: "play up to 1 Character card",
    rationale:
      "activate-main fixture: rest costs before top-deck play selection.",
  },
  {
    cardId: "EB03-001",
    effectFamily: "replacement",
    printedTextIncludes: "would be K.O.'d",
    rationale:
      "replacement fixture: leader replacement plus Activate Main Rush grant.",
  },
  {
    cardId: "EB03-048",
    effectFamily: "search-reveal",
    printedTextIncludes: "{Dressrosa} type Stage",
    rationale:
      "search-reveal fixture: searches and can play a Stage from hand.",
  },
  {
    cardId: "EB03-050",
    effectFamily: "double-attack",
    printedTextIncludes: "[Double Attack]",
    rationale:
      "double-attack fixture: grants Double Attack to a typed Character.",
  },
  {
    cardId: "EB04-001",
    effectFamily: "permanent-modifier",
    printedTextIncludes: "[Opponent's Turn]",
    rationale:
      "permanent-modifier fixture: opponent-turn power plus optional Life cost.",
  },
  {
    cardId: "EB04-023",
    effectFamily: "double-attack",
    printedTextIncludes: "Draw 2 cards.",
    rationale:
      "double-attack fixture: printed keyword plus on-play draw with cost.",
  },
  {
    cardId: "OP01-002",
    effectFamily: "activate-main",
    printedTextIncludes: "different color than the returned Character",
    rationale:
      "activate-main fixture: leader bounce-to-play conditional sequencing.",
  },
  {
    cardId: "OP01-003",
    effectFamily: "activate-main",
    printedTextIncludes: "Set up to 1",
    rationale:
      "activate-main fixture: leader restand and temporary power modifier.",
  },
  {
    cardId: "OP01-061",
    effectFamily: "on-ko",
    printedTextIncludes: "When your opponent's Character is K.O.'d",
    rationale: "on-ko fixture: once-per-turn opponent Character K.O. watcher.",
  },
  {
    cardId: "OP01-067",
    effectFamily: "banish",
    printedTextIncludes: "[Banish]",
    rationale: "banish fixture: keyword plus Event cost modifier.",
  },
  {
    cardId: "OP01-068",
    effectFamily: "double-attack",
    printedTextIncludes: "5 or more cards in your hand",
    rationale: "double-attack fixture: hand-size conditional Double Attack.",
  },
  {
    cardId: "OP01-073",
    effectFamily: "blocker",
    printedTextIncludes: "top or bottom of the deck",
    rationale: "blocker fixture: Blocker plus public top-deck reorder text.",
  },
  {
    cardId: "OP01-121",
    effectFamily: "banish",
    printedTextIncludes: "Also treat this card's name",
    rationale:
      "banish fixture: alternate-name rule plus Double Attack and Banish.",
  },
  {
    cardId: "OP02-001",
    effectFamily: "life-manipulation",
    printedTextIncludes: "[End of Your Turn]",
    rationale:
      "life-manipulation fixture: forced end-turn Life-to-hand movement.",
  },
  {
    cardId: "OP02-002",
    effectFamily: "permanent-modifier",
    printedTextIncludes: "given a DON!! card",
    rationale:
      "permanent-modifier fixture: DON attachment watcher changes cost.",
  },
  {
    cardId: "OP02-025",
    effectFamily: "activate-main",
    printedTextIncludes: "cost will be reduced by 1",
    rationale:
      "activate-main fixture: once-per-turn future play cost reduction.",
  },
  {
    cardId: "OP02-062",
    effectFamily: "when-attacking",
    printedTextIncludes: "[On Play]/[When Attacking]",
    rationale:
      "when-attacking fixture: shared on-play/attack bounce and Double Attack.",
  },
  {
    cardId: "OP02-072",
    effectFamily: "target-ko",
    printedTextIncludes: "K.O. up to 1",
    rationale: "target-ko fixture: When Attacking DON-minus K.O. target.",
  },
  {
    cardId: "OP02-087",
    effectFamily: "on-ko",
    printedTextIncludes: "[On K.O.]",
    rationale: "on-ko fixture: Double Attack body with K.O. DON ramp.",
  },
  {
    cardId: "OP02-095",
    effectFamily: "banish",
    printedTextIncludes: "gains [Banish]",
    rationale: "banish fixture: conditional Banish based on board cost state.",
  },
  {
    cardId: "OP03-001",
    effectFamily: "counter-event",
    printedTextIncludes: "Event or Stage cards from your hand",
    rationale:
      "counter-event fixture: battle-time Event/Stage discard power scaling.",
  },
  {
    cardId: "OP03-022",
    effectFamily: "when-attacking",
    printedTextIncludes: "Play up to 1 Character card",
    rationale: "when-attacking fixture: attacks can play a Trigger Character.",
  },
  {
    cardId: "OP03-040",
    effectFamily: "replacement",
    printedTextIncludes: "deck is reduced to 0",
    rationale:
      "replacement fixture: alternate loss condition with attack damage mill.",
  },
  {
    cardId: "OP03-058",
    effectFamily: "activate-main",
    printedTextIncludes: "This Leader cannot attack.",
    rationale:
      "activate-main fixture: cannot-attack static text plus DON-minus play.",
  },
  {
    cardId: "OP03-059",
    effectFamily: "when-attacking",
    printedTextIncludes: "gains [Banish]",
    rationale:
      "when-attacking fixture: DON-minus attack trigger grants Banish.",
  },
  {
    cardId: "OP03-068",
    effectFamily: "banish",
    printedTextIncludes: "[Banish]",
    rationale: "banish fixture: printed Banish paired with On K.O. ramp.",
  },
  {
    cardId: "OP03-076",
    effectFamily: "on-ko",
    printedTextIncludes: "set this Leader as active",
    rationale: "on-ko fixture: opponent Character K.O. restands the leader.",
  },
  {
    cardId: "OP03-077",
    effectFamily: "life-manipulation",
    printedTextIncludes: "top of your Life cards",
    rationale:
      "life-manipulation fixture: When Attacking can add deck top to Life.",
  },
  {
    cardId: "OP03-099",
    effectFamily: "life-manipulation",
    printedTextIncludes: "top or bottom of the Life cards",
    rationale:
      "life-manipulation fixture: inspects and reorders Life card position.",
  },
  {
    cardId: "OP04-039",
    effectFamily: "search-reveal",
    printedTextIncludes: "reveal up to 1 {Dressrosa}",
    rationale:
      "search-reveal fixture: leader looks, reveals one card, and trashes rest.",
  },
  {
    cardId: "OP04-108",
    effectFamily: "trigger",
    printedTextIncludes: "[Trigger] You may trash 1 card",
    rationale:
      "trigger fixture: Banish body with Trigger play-from-life shape.",
  },
] as const satisfies readonly RealEffectShapeFixtureCorpusEntry[];

export type RealCardFixtureId =
  | "OP01-060"
  | "OP05-091"
  | "EB01-023"
  | "OP04-014"
  | "OP10-045"
  | SelectedEffectShapeFixtureId;

const checkedInCardFixturePathById = {
  "OP01-060": "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
  "OP05-091": "fixtures/poneglyph/cards/OP05-091.rebecca.json",
  "EB01-023": "fixtures/poneglyph/cards/EB01-023.edward-weevil.json",
  "OP04-014": "fixtures/poneglyph/cards/OP04-014.monkey-d-luffy.json",
  "OP10-045": "fixtures/poneglyph/cards/OP10-045.cavendish.json",
  ...selectedEffectShapeFixturePathById,
} as const satisfies Record<RealCardFixtureId, string>;

const realCardFixtureIds = Object.freeze(
  Object.keys(checkedInCardFixturePathById) as RealCardFixtureId[],
);

const supportedEffectDefinitionId = "eb01-023.on-play-draw-1";
const supportedGeneratedEffectDefinitionId = "op10-045.generated-support";
const supportedEffectRulesVersion = "2026-01-16";

export const realCardDslEffectDefinitionFixturePath =
  "fixtures/effect-dsl/valid/eb01-023-on-play-draw-1.json";
export const realCardDslGeneratedSupportFixturePath =
  "fixtures/effect-dsl/valid/op10-045-generated-support.json";

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

async function loadCheckedInOp10045GeneratedSupportEffectDefinition(): Promise<EffectDefinition> {
  const source = await readFile(
    path.join(repoRoot, realCardDslGeneratedSupportFixturePath),
    "utf8",
  );

  return JSON.parse(source) as EffectDefinition;
}

export async function buildRealCardDslMatchCardManifest(): Promise<MatchCardManifest> {
  const effectDefinition =
    await loadCheckedInEb01023OnPlayDraw1EffectDefinition();
  const generatedSupportEffectDefinition =
    await loadCheckedInOp10045GeneratedSupportEffectDefinition();
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
    effectDefinitions: {
      [supportedEffectDefinitionId]: effectDefinition,
      [supportedGeneratedEffectDefinitionId]: generatedSupportEffectDefinition,
    },
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
        : fixtureId === "OP04-014"
          ? "op04-014-banish-v1"
          : fixtureId === "OP10-045"
            ? supportedEffectRulesVersion
            : "fixture-real-card",
    sourceTextHash: normalized.sourceTextHash,
    status:
      fixtureId === "EB01-023"
        ? "implemented-dsl"
        : fixtureId === "OP04-014"
          ? "vanilla-confirmed"
          : fixtureId === "OP10-045"
            ? "implemented-dsl"
            : "unsupported",
    tested:
      fixtureId === "EB01-023" ||
      fixtureId === "OP04-014" ||
      fixtureId === "OP10-045",
  };

  if (fixtureId === "EB01-023") {
    support.effectDefinitionId = supportedEffectDefinitionId;
    support.notes =
      "Reviewed real-card fixture with explicit [On Play] Draw 1 card DSL linkage.";
  } else if (fixtureId === "OP10-045") {
    support.effectDefinitionId = supportedGeneratedEffectDefinitionId;
    support.notes =
      "Reviewed real-card fixture with complete [When Attacking] [Once Per Turn] draw-then-trash generated-support linkage.";
  } else if (fixtureId === "OP04-014") {
    support.notes =
      "Reviewed real-card fixture for complete printed Banish keyword behavior through parenthetical explanatory-note support gates.";
  } else {
    support.notes =
      "Checked-in real Poneglyph adapter fixture for normalization/hash coverage; gameplay support remains unsupported.";
  }

  return {
    cardId: normalized.cardId,
    support,
  };
}
