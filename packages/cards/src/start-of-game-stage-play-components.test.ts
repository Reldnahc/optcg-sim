import { describe, expect, it } from "vitest";
import type { CardId, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import {
  parsePlayVerbPrefix,
  parseSelfDeckSourceSuffix,
  parseStartOfGameTimingPhrase,
  parseStartOfGameTypedStagePlayClause,
  parseTypedStageFilter,
  parseUpToOneCardinalityPrefix,
} from "./start-of-game-stage-play-components.js";

const cardId = "SUP-003G-PARSER" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "effects-sup-003g",
    rulesVersion: "rules-sup-003g",
    sourceText,
    sourceTextHash: "sha256:sup-003g-source",
  });

describe("SUP-003G start-of-game typed Stage play parser components", () => {
  it("parses primitive boundaries independently", () => {
    expect(
      parseStartOfGameTimingPhrase(
        "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
      ),
    ).toEqual({
      bodyText: "play up to 1 {Mary Geoise} type Stage card from your deck.",
      prefix: "at the start of the game, ",
    });
    expect(
      parsePlayVerbPrefix(
        "play up to 1 {Mary Geoise} type Stage card from your deck.",
      ),
    ).toEqual({
      bodyText: "up to 1 {Mary Geoise} type Stage card from your deck.",
      prefix: "play ",
    });
    expect(
      parseUpToOneCardinalityPrefix(
        "up to 1 {Mary Geoise} type Stage card from your deck.",
      ),
    ).toEqual({
      bodyText: "{Mary Geoise} type Stage card from your deck.",
      max: 1,
      min: 0,
      text: "up to 1",
    });
    expect(
      parseTypedStageFilter("{Mary Geoise} type Stage card from your deck."),
    ).toEqual({
      bodyText: " from your deck.",
      category: "stage",
      typeName: "Mary Geoise",
    });
    expect(parseSelfDeckSourceSuffix(" from your deck.")).toEqual({
      bodyText: "",
      sourceZone: "deck",
    });
  });

  it.each(["Mary Geoise", "Dressrosa", "Alabasta"])(
    "parses start-of-game typed Stage play generically for %s",
    (typeName) => {
      const sourceText = `at the start of the game, play up to 1 {${typeName}} type Stage card from your deck.`;
      const result = parse(sourceText);

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete start-of-game Stage play parse.");
      }

      expect(result.parserRuleIds).toEqual([
        "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
      ]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: {
            effects: [
              {
                connector: "always",
                effect: {
                  request: {
                    destination: "stageArea",
                    filter: {
                      categories: ["stage"],
                      typesAny: [typeName],
                    },
                    max: 1,
                    min: 0,
                    player: "self",
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                    zone: "deck",
                  },
                  type: "search",
                },
              },
              {
                connector: "ifPreviousSucceeded",
                effect: {
                  ignoreCost: true,
                  selection: "selected:start-of-game",
                  type: "playSelected",
                },
              },
            ],
            type: "sequence",
          },
          id: toEffectId(
            "SUP-003G-PARSER:auto-start-of-game-play-up-to-1-typed-stage-from-self-deck",
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "startOfGame" },
        },
      ]);
    },
  );

  it("exposes the reusable parser clause without exact type-name branching", () => {
    const clause = parseStartOfGameTypedStagePlayClause(
      cardId,
      "at the start of the game, play up to 1 {Water Seven} type Stage card from your deck.",
    );

    expect(clause?.parserRuleId).toBe(
      "exact:start-of-game:play-up-to-1-typed-stage-from-self-deck",
    );
    expect(clause?.effectBlock?.effect.type).toBe("sequence");
    expect(
      clause?.effectBlock?.effect.type === "sequence"
        ? clause.effectBlock.effect.effects[0]?.effect
        : undefined,
    ).toMatchObject({
      request: {
        filter: { categories: ["stage"], typesAny: ["Water Seven"] },
      },
      type: "search",
    });
  });

  it.each([
    "at the start of the game, play 1 {Mary Geoise} type Stage card from your deck.",
    "at the start of the game, play up to 1 {Mary Geoise} type Character card from your deck.",
    "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your hand.",
    "at the start of the game, reveal up to 1 {Mary Geoise} type Stage card from your deck.",
    "at the start of the game, play up to 2 {Mary Geoise} type Stage cards from your deck.",
  ])("fails closed for unsupported partial shape %s", (sourceText) => {
    expect(parseStartOfGameTypedStagePlayClause(cardId, sourceText)).toBe(
      undefined,
    );
    expect(parse(sourceText).status).not.toBe("complete");
  });
});
