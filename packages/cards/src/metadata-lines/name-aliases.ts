import type { ParsedMetadataLine, ParseInput } from "../types.js";

const gameRulesPattern =
  /^Under the rules of this game, also treat this card's name as (?<names>\[[^\]]+\](?:\s+and\s+\[[^\]]+\])*)\.$/u;
const conciseRulesPattern =
  /^Also treat this card's name as (?<names>\[[^\]]+\](?:\s+and\s+\[[^\]]+\])*) according to the rules\.$/u;

export const parseNameAliasesRuleLine = (
  input: ParseInput,
): ParsedMetadataLine | undefined => {
  const text = input.text.trim();
  const match = gameRulesPattern.exec(text) ?? conciseRulesPattern.exec(text);
  const namesText = match?.groups?.["names"];
  if (namesText === undefined) {
    return undefined;
  }

  const names = [...namesText.matchAll(/\[([^\]]+)\]/gu)]
    .map((nameMatch) => nameMatch[1]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);
  if (names.length === 0) {
    return undefined;
  }

  return {
    kind: "metadata",
    metadata: {
      type: "nameAliases",
      names,
    },
    evidence: [
      "metadata:nameAliases",
      ...names.map(() => "filter:name" as const),
      "target:thisCard",
    ],
  };
};
