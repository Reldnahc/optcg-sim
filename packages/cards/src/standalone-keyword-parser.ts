import type {
  ReusableComposedParserClause,
  ReusableComposedParserResidueClause,
} from "./composed-parser-builder.js";

const blockerReminderText =
  "(After your opponent declares an attack, you may rest this card to make it the new target of the attack.)";
const standaloneBlockerSourceText = "[Blocker]";
const standaloneBlockerWithReminderSourceText = `${standaloneBlockerSourceText} ${blockerReminderText}`;
const standaloneEngineKeywordDefinitions = [
  [
    "exact:keyword:rush:standalone",
    "[Rush]",
    "(This card can attack on the turn in which it is played.)",
  ],
  [
    "exact:keyword:rush-character:standalone",
    "[Rush: Character]",
    "(This card can attack Characters on the turn in which it is played.)",
  ],
  [
    "exact:keyword:double-attack:standalone",
    "[Double Attack]",
    "(This card deals 2 damage.)",
  ],
  [
    "exact:keyword:banish:standalone",
    "[Banish]",
    "(When this card deals damage, the target card is trashed without activating its Trigger.)",
  ],
] as const;

export function parseStandaloneBlockerClause(
  sourceText: string,
): ReusableComposedParserClause | undefined {
  return parseStandaloneKeywordClauseSource(
    sourceText,
    standaloneBlockerSourceText,
    blockerReminderText,
    "exact:keyword:blocker:standalone",
  );
}

export function parseStandaloneEngineKeywordClause(
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const definition = standaloneEngineKeywordDefinitions.find((candidate) =>
    isStandaloneKeywordSource(sourceText, candidate[1], candidate[2]),
  );

  return definition === undefined
    ? undefined
    : createStandaloneKeywordClause(definition[0]);
}

export function parseStandaloneBlockerResidueClause(
  sourceText: string,
):
  | ReusableComposedParserResidueClause<ReusableComposedParserClause>
  | undefined {
  const reminderPrefix = `${standaloneBlockerWithReminderSourceText} `;
  const sourcePrefix = `${standaloneBlockerSourceText} `;
  const prefix = sourceText.startsWith(reminderPrefix)
    ? reminderPrefix
    : sourceText.startsWith(sourcePrefix)
      ? sourcePrefix
      : undefined;
  if (prefix === undefined) {
    return undefined;
  }

  return {
    clause: createStandaloneKeywordClause("exact:keyword:blocker:standalone"),
    prefix,
  };
}

export function parseStandaloneEngineKeywordResidueClause(
  sourceText: string,
):
  | ReusableComposedParserResidueClause<ReusableComposedParserClause>
  | undefined {
  for (const definition of standaloneEngineKeywordDefinitions) {
    const sourcePrefix = `${definition[1]} `;
    const reminderPrefix = `${definition[1]} ${definition[2]} `;
    const prefix = sourceText.startsWith(reminderPrefix)
      ? reminderPrefix
      : sourceText.startsWith(sourcePrefix)
        ? sourcePrefix
        : undefined;

    if (prefix !== undefined) {
      return {
        clause: createStandaloneKeywordClause(definition[0]),
        prefix,
      };
    }
  }

  return undefined;
}

function createStandaloneKeywordClause(
  parserRuleId: string,
): ReusableComposedParserClause {
  return { implementationStatus: "vanilla-confirmed", parserRuleId };
}

function parseStandaloneKeywordClauseSource(
  sourceText: string,
  keywordToken: string,
  reminderText: string,
  parserRuleId: string,
): ReusableComposedParserClause | undefined {
  return isStandaloneKeywordSource(sourceText, keywordToken, reminderText)
    ? createStandaloneKeywordClause(parserRuleId)
    : undefined;
}

function isStandaloneKeywordSource(
  sourceText: string,
  keywordToken: string,
  reminderText: string,
): boolean {
  if (!sourceText.startsWith(keywordToken)) {
    return false;
  }
  const residue = sourceText.slice(keywordToken.length).trim();
  return residue.length === 0 || residue === reminderText;
}
