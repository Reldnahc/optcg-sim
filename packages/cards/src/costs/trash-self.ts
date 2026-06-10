import { parseCardFilterPredicates } from "../filters/index.js";
import type { CostParseResult } from "./rest-don.js";
import type { ParseInput } from "../types.js";

export function parseTrashSelfCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match =
    /^trash this (?<target>card|Character|Stage)\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  const target = match?.groups?.["target"];
  if (match === null || target === undefined) {
    return undefined;
  }
  const rest = match.groups?.["rest"]?.trim() ?? "";
  const predicateText =
    rest.length === 0
      ? undefined
      : target.toLowerCase() === "card"
        ? rest
        : `${target} ${rest}`;
  const predicates =
    predicateText === undefined
      ? undefined
      : parseCardFilterPredicates({ text: predicateText });
  if (predicateText !== undefined && predicates === undefined) {
    return undefined;
  }
  if (predicates !== undefined && predicates.rest.length > 0) {
    return undefined;
  }

  return {
    cost: {
      type: "trashSelf",
      optional: true,
      ...(predicates === undefined ? {} : { filter: predicates.filter }),
    },
    evidence: [
      "cost:trashSelf",
      target.toLowerCase() === "character"
        ? "target:thisCharacter"
        : target.toLowerCase() === "stage"
          ? "target:thisStage"
          : "target:thisCard",
      ...(predicates?.evidence ?? []),
    ],
    rest: "",
  };
}
