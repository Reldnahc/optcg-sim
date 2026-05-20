import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CardId, PoneglyphCardDetail } from "@optcg/types";

import { runSupportProbe } from "./support-probe.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

describe("support probe diagnostics", () => {
  it.each([
    {
      cardId: "CARD-020C-SUPERNOVAS",
      effect:
        "[On Play]/[When Attacking] If your Leader has the {Supernovas} type and you have no other [Cavendish] Characters, set up to 2 of your DON!! cards as active.",
      expected: [
        "Playable: no",
        "recognized trigger candidate: [On Play]",
        "recognized trigger candidate: [When Attacking]",
        "recognized condition candidate: If",
        "recognized condition candidate: your Leader has the {Supernovas} type",
        "unsupported condition predicate: you have no other [Cavendish] Characters",
        "recognized condition connector candidate: and",
        "recognized cardinality candidate: up to 2",
        "recognized target candidate: your DON!! cards",
        "recognized action candidate: set as active",
      ],
    },
    {
      cardId: "CARD-020C-SLASH-KO",
      effect:
        "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters −1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
      expected: [
        "Playable: no",
        "recognized trigger candidate: [On Play]",
        "recognized trigger candidate: [When Attacking]",
        "recognized cardinality candidate: up to 1",
        "recognized target candidate: your opponent's Characters",
        "recognized syntax fragment: modifier:cost-negative",
        "recognized duration candidate: this turn",
        "recognized sequence candidate: Then",
        "recognized action candidate: K.O",
        "recognized predicate candidate: cost of 0",
      ],
    },
    {
      cardId: "CARD-020C-CONDITIONAL-DRAW",
      effect:
        "[On Play] If your Leader is multicolored and you have 5 or less cards in your hand, draw 2 cards.",
      expected: ["Playable: yes", "Blockers: none"],
    },
    {
      cardId: "CARD-020C-BOTTOM-DECK",
      effect:
        "[On Play] Place up to 1 of your opponent's Characters with 1000 power or less at the bottom of the owner's deck.",
      expected: [
        "Playable: no",
        "recognized trigger candidate: [On Play]",
        "recognized cardinality candidate: up to 1",
        "recognized target candidate: your opponent's Characters",
        "recognized predicate candidate: 1000 power or less",
        "recognized action candidate: place at the bottom of the owner's deck",
      ],
    },
    {
      cardId: "CARD-020C-ACTIVATE-MAIN",
      effect:
        "[Activate: Main] You may rest this Stage and turn 1 card from the top of your Life cards face-up: Up to 1 of your {Straw Hat Crew} type Characters gains +1000 power until the end of your opponent's next turn.",
      expected: [
        "Playable: no",
        "unsupported wrapper blocker: [Activate: Main]",
        "recognized optionality candidate: may",
        "recognized cost candidate: rest this Stage",
        "recognized cost candidate: turn 1 card from the top of your Life cards face-up",
        "recognized cost candidate: :",
        "recognized cardinality candidate: Up to 1",
        "recognized target candidate: your {Straw Hat Crew} type Characters",
        "recognized modifier candidate: +1000 power",
        "recognized duration candidate: until the end of your opponent's next turn",
      ],
    },
    {
      cardId: "CARD-020C-UNWRAPPED-CONTINUOUS",
      effect:
        "If your Leader has the {Sky Island} type, this Character gains [Rush].",
      expected: [
        "Playable: no",
        "recognized wrapper candidate: If",
        "recognized condition candidate: your Leader has the {Sky Island} type",
        "recognized target candidate: this Character",
        "recognized verb candidate: gains",
        "recognized keyword candidate: [Rush]",
        "unsupported syntax blocker: conditional-keyword-grant:schema-runtime-bridge-missing",
      ],
    },
  ])(
    "produces component-driven diagnostics for representative CARD-020C sample $cardId",
    async ({ cardId, effect, expected }) => {
      const text = await probeText(cardId, effect);

      for (const snippet of expected) {
        expect(text).toContain(snippet);
      }
    },
  );

  it.each([
    {
      cardId: "CARD-020C-VAR-SLASH-COND",
      effect:
        "[On Play]/[When Attacking] If your Leader has the {Heart Pirates} type and you have no other [Trafalgar Law] Characters, set up to 3 of your DON!! cards as active.",
      expected: [
        "recognized trigger candidate: [On Play]",
        "recognized trigger candidate: [When Attacking]",
        "recognized condition candidate: your Leader has the {Heart Pirates} type",
        "unsupported condition predicate: you have no other [Trafalgar Law] Characters",
        "recognized cardinality candidate: up to 3",
        "recognized target candidate: your DON!! cards",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-020C-VAR-SLASH-SEQ-ASCII",
      effect:
        "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters -1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
      expected: [
        "recognized syntax fragment: wrapper:slash",
        "recognized syntax fragment: sequence:then",
        "recognized syntax fragment: modifier:cost-negative",
        "recognized action candidate: K.O.",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-020C-VAR-SLASH-SEQ-UNICODE",
      effect:
        "[On Play]/[When Attacking] Give up to 1 of your opponent's Characters −1 cost during this turn. Then, K.O. up to 1 of your opponent's Characters with a cost of 0.",
      expected: [
        "recognized syntax fragment: wrapper:slash",
        "recognized syntax fragment: sequence:then",
        "recognized syntax fragment: modifier:cost-negative",
        "recognized modifier candidate: −1 cost",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-020C-VAR-COND-DRAW",
      effect:
        "[On Play] If your Leader is multicolored and you have 7 or less cards in your hand, draw 1 card.",
      expected: ["Playable: yes", "Blockers: none"],
      playable: "Playable: yes",
    },
    {
      cardId: "CARD-020C-VAR-BOTTOM-DECK",
      effect:
        "[On Play] Place up to 1 of your opponent's Characters with a cost of 3 or less at the bottom of the owner's deck.",
      expected: [
        "recognized trigger candidate: [On Play]",
        "recognized cardinality candidate: up to 1",
        "recognized target candidate: your opponent's Characters",
        "recognized predicate candidate: cost of 3",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-020C-VAR-ACTIVATE-MAIN",
      effect:
        "[Activate: Main] You may rest this Stage and turn 1 card from the top of your Life cards face-up: Up to 1 of your {Revolutionary Army} type Characters gains +1000 power until the end of your opponent's next turn.",
      expected: [
        "unsupported wrapper blocker: [Activate: Main]",
        "recognized cost candidate: rest this Stage",
        "recognized cost candidate: turn 1 card from the top of your Life cards face-up",
        "recognized target candidate: your {Revolutionary Army} type Characters",
        "recognized modifier candidate: +1000 power",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-020C-VAR-UNWRAPPED-CONTINUOUS",
      effect:
        "If your Leader has the {Revolutionary Army} type, this Character gains [Banish].",
      expected: [
        "recognized wrapper candidate: If",
        "recognized condition candidate: your Leader has the {Revolutionary Army} type",
        "recognized target candidate: this Character",
        "recognized verb candidate: gains",
        "recognized keyword candidate: [Banish]",
        "unsupported syntax blocker: conditional-keyword-grant:schema-runtime-bridge-missing",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-021C-VAR-PROTECTION",
      effect:
        "This Character cannot be removed from the field by your opponent's effect",
      expected: [
        "recognized syntax fragment: protection-components:v1",
        "recognized syntax fragment: protection:opponent-effect-field-removal",
        "recognized target candidate: This Character",
        "recognized action candidate: cannot be removed",
        "recognized destination candidate: from the field",
        "recognized predicate candidate: your opponent",
        "recognized predicate candidate: effect",
        "unsupported syntax blocker: protection:schema-runtime-bridge-missing",
      ],
      playable: "Playable: no",
    },
    {
      cardId: "CARD-021C-VAR-PROTECTION-UNSUPPORTED",
      effect:
        "this Character cannot be removed from the field by your opponent's costs",
      expected: [
        "recognized syntax fragment: protection-components:v1",
        "recognized target candidate: this Character",
        "recognized action candidate: cannot be removed",
        "recognized destination candidate: from the field",
        "recognized predicate candidate: your opponent",
        "unsupported predicate blocker: costs",
        "unsupported syntax blocker: protection-fragment:unsupported",
      ],
      playable: "Playable: no",
    },
  ])(
    "proves component-driven variation diagnostics for CARD-020C class $cardId",
    async ({ cardId, effect, expected, playable }) => {
      const text = await probeText(cardId, effect);

      expect(text).toContain(playable);
      for (const snippet of expected) {
        expect(text).toContain(snippet);
      }
    },
  );
});

async function probeText(cardId: string, effect: string): Promise<string> {
  const detail = await loadFixture("OP03-044.kaya.json");
  const output: string[] = [];

  await runSupportProbe({
    cardId: cardId as CardId,
    getCard: () =>
      Promise.resolve({
        ...detail,
        card_number: cardId,
        effect,
        name: cardId,
      }),
    stdout: {
      write(chunk: string | Uint8Array): boolean {
        output.push(String(chunk));
        return true;
      },
    },
  });

  return output.join("");
}

async function loadFixture(
  fixtureFileName: string,
): Promise<PoneglyphCardDetail> {
  const source = await readFile(
    path.join(repoRoot, "fixtures/poneglyph/cards", fixtureFileName),
    "utf8",
  );

  return JSON.parse(source) as PoneglyphCardDetail;
}
