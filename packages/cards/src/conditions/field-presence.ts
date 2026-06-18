import type { CardFilter, Condition } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type {
  ConditionParseResult,
  ConditionParser,
  PrimitiveEvidence,
} from "../types.js";

type FieldCountCondition = Extract<Condition, { type: "fieldCount" }>;
type FieldCountPlayer = FieldCountCondition["player"];

interface PresenceSubject {
  readonly players: readonly FieldCountPlayer[];
  readonly predicate: string;
}

export const parseFieldPresenceCondition: ConditionParser = (
  input,
): ConditionParseResult | undefined => {
  const subject = parsePresenceSubject(input.text);
  if (subject === undefined) {
    return undefined;
  }

  const parsed = parseCardFilterPredicates(
    { text: normalizePredicate(subject.predicate) },
    { powerSemantics: "current" },
  );
  if (parsed === undefined || parsed.rest.trim().length > 0) {
    return undefined;
  }

  const conditions = distributeFieldCountConditions(
    subject.players,
    parsed.filter,
  );
  const firstCondition = conditions[0];
  if (firstCondition === undefined) {
    return undefined;
  }

  return {
    condition:
      conditions.length === 1
        ? firstCondition
        : { type: "or", conditions: conditions },
    evidence: [
      ...(conditions.length === 1 ? [] : ["composition:conditionOr" as const]),
      ...fieldPresenceEvidence(subject.players, parsed.evidence),
    ],
    rest: "",
  };
};

const parsePresenceSubject = (text: string): PresenceSubject | undefined => {
  const anyPlayer = /^there is an?\s+(?<predicate>.+)$/iu.exec(text);
  const anyPlayerPredicate = anyPlayer?.groups?.["predicate"];
  if (isCharacterPresencePredicate(anyPlayerPredicate)) {
    return { players: ["self", "opponent"], predicate: anyPlayerPredicate };
  }

  const opponent = /^your opponent has an?\s+(?<predicate>.+)$/iu.exec(text);
  const opponentPredicate = opponent?.groups?.["predicate"];
  if (isCharacterPresencePredicate(opponentPredicate)) {
    return { players: ["opponent"], predicate: opponentPredicate };
  }

  const self = /^you have an?\s+(?<predicate>.+)$/iu.exec(text);
  const selfPredicate = self?.groups?.["predicate"];
  if (!isCharacterPresencePredicate(selfPredicate)) {
    return undefined;
  }
  return { players: ["self"], predicate: selfPredicate };
};

const isCharacterPresencePredicate = (
  predicate: string | undefined,
): predicate is string =>
  predicate !== undefined && /\bCharacters?(?:\s+cards?)?\b/iu.test(predicate);

const normalizePredicate = (text: string): string =>
  text.replace(/^a\s+/iu, "").trim();

const distributeFieldCountConditions = (
  players: readonly FieldCountPlayer[],
  filter: CardFilter,
): FieldCountCondition[] => {
  const filters = distributeFilterAlternatives(filter);
  return filters.flatMap((branch) =>
    players.map(
      (player): FieldCountCondition => ({
        type: "fieldCount",
        player,
        filter: branch,
        op: "gte",
        value: 1,
      }),
    ),
  );
};

const distributeFilterAlternatives = (filter: CardFilter): CardFilter[] => {
  if (filter.anyOf === undefined) {
    return [withCharacterCategory(filter)];
  }
  const { anyOf, ...shared } = filter;
  return anyOf.map((branch) =>
    withCharacterCategory({
      ...shared,
      ...branch,
    }),
  );
};

const withCharacterCategory = (filter: CardFilter): CardFilter => ({
  ...filter,
  categories: filter.categories ?? ["character"],
});

const fieldPresenceEvidence = (
  players: readonly FieldCountPlayer[],
  predicateEvidence: readonly PrimitiveEvidence[],
): readonly PrimitiveEvidence[] => [
  ...(players.includes("self") ? ["condition:fieldCount" as const] : []),
  ...(players.includes("opponent")
    ? ["condition:opponentFieldCount" as const, "player:opponent" as const]
    : []),
  ...(players.includes("self") ? ["player:self" as const] : []),
  ...predicateEvidence,
];
