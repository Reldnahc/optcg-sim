import type { Trigger } from "@optcg/types";

import type { ExpressionParseResult } from "../../types.js";
import type { ReactionPredicateParser } from "../event-reaction.js";

type OpponentActivatedTrigger = Extract<Trigger, { type: "opponentActivated" }>;

const anyOfTrigger = (triggers: readonly Trigger[]): Trigger => {
  const first = triggers[0];
  return first !== undefined && triggers.length === 1
    ? first
    : { type: "anyOf", triggers: [...triggers] };
};

const triggerActivatedForBothPlayers = (): Trigger =>
  anyOfTrigger([
    { type: "triggerActivated", player: "self" },
    { type: "triggerActivated", player: "opponent" },
  ]);

export const parseActivationPredicate: ReactionPredicateParser = ({ text }) => {
  const normalized = text.trim();

  if (normalized.toLowerCase() === "a [trigger] activates") {
    return {
      trigger: triggerActivatedForBothPlayers(),
      evidence: [
        "activation:trigger",
        "player:self",
        "player:opponent",
        "composition:triggerAnyOf",
      ],
    };
  }

  if (normalized.toLowerCase() === "you activate an event") {
    return {
      trigger: {
        type: "effectQueued",
        player: "self",
        sourceFilter: { categories: ["event"] },
      },
      evidence: [
        "trigger:effectQueued",
        "player:self",
        "filter:category:event",
        "activation:event",
      ],
    };
  }

  const opponentActivation =
    /^your opponent activates (?<activation>an Event(?: or \[(?:Blocker|Trigger)\])?|(?:a\s+)?\[Blocker\](?: or an Event)?)$/iu.exec(
      normalized,
    );
  const activationText = opponentActivation?.groups?.["activation"];
  if (activationText === undefined) {
    return undefined;
  }

  const parsed = parseOpponentActivationKinds(activationText);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    trigger: {
      type: "opponentActivated",
      activations: parsed.activations,
    },
    evidence: ["trigger:opponentActivated", ...parsed.evidence],
    ...(parsed.allowBodyBlockPatch ? { allowBodyBlockPatch: true } : {}),
  };
};

const parseOpponentActivationKinds = (
  text: string,
):
  | {
      readonly activations: OpponentActivatedTrigger["activations"];
      readonly evidence: readonly ExpressionParseResult["evidence"][number][];
      readonly allowBodyBlockPatch?: boolean;
    }
  | undefined => {
  const normalized = text.toLowerCase();
  if (normalized === "an event") {
    return {
      activations: ["event"],
      evidence: ["activation:event"],
    };
  }
  if (normalized === "an event or [blocker]") {
    return {
      activations: ["event", "blocker"],
      evidence: ["activation:event", "activation:blocker"],
      allowBodyBlockPatch: true,
    };
  }
  if (normalized === "[blocker] or an event") {
    return {
      activations: ["blocker", "event"],
      evidence: ["activation:blocker", "activation:event"],
      allowBodyBlockPatch: true,
    };
  }
  if (normalized === "[blocker]" || normalized === "a [blocker]") {
    return {
      activations: ["blocker"],
      evidence: ["activation:blocker"],
      allowBodyBlockPatch: true,
    };
  }
  if (normalized === "an event or [trigger]") {
    return {
      activations: ["event", "trigger"],
      evidence: ["activation:event", "activation:trigger"],
    };
  }
  return undefined;
};
