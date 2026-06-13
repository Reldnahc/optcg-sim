import type { Attribute, CardFilter } from "@optcg/types";

import type { PrimitiveEvidence } from "../../types.js";

export interface CardFilterPredicateParseResult {
  readonly filter: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export interface CardFilterPredicateParseOptions {
  readonly powerSemantics?: "printed" | "current";
}

export type PredicateParser = (
  text: string,
  current: CardFilter,
  options: CardFilterPredicateParseOptions,
) => CardFilterPredicateParseResult | undefined;

export function parseBraceName(text: string): string | undefined {
  const name = /^\{(?<name>[^}]+)\}$/.exec(text)?.groups?.["name"]?.trim();
  return name === undefined || name.length === 0 ? undefined : name;
}

export function parseAngleAttribute(text: string): Attribute | undefined {
  const name = /^[<＜](?<name>[^>＞]+)[>＞]$/
    .exec(text)
    ?.groups?.["name"]?.trim();
  return name === undefined || name.length === 0
    ? undefined
    : (name.toLowerCase() as Attribute);
}

export function categoryEvidence(category: string): PrimitiveEvidence {
  const normalized = category.toLowerCase();
  if (normalized === "character") {
    return "filter:category:character";
  }
  if (normalized === "stage") {
    return "filter:category:stage";
  }
  return "filter:category:event";
}
