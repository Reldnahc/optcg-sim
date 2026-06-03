import type {
  CardRef,
  PendingDecision,
  PublicDecisionPresentation,
  Zone,
} from "@optcg/types";

const zoneLabel = (zone: Zone): string => {
  switch (zone) {
    case "deck":
      return "deck";
    case "life":
      return "Life";
    case "hand":
      return "hand";
    case "trash":
      return "trash";
    case "costArea":
      return "cost area";
    case "characterArea":
      return "Character area";
    case "stageArea":
      return "Stage area";
    case "leaderArea":
      return "Leader area";
    case "donDeck":
      return "DON!! deck";
    case "noZone":
      return "revealed cards";
  }
};

const stripPeriod = (value: string): string => value.replace(/\.$/u, "");

const withSource = (
  source: CardRef | undefined,
): Pick<PublicDecisionPresentation, "source"> =>
  source === undefined ? {} : { source };

const fallbackPresentation = (
  pending: PendingDecision,
  source: CardRef | undefined,
): PublicDecisionPresentation => ({
  title: stripPeriod(pending.prompt),
  instruction: stripPeriod(pending.prompt),
  ...withSource(source),
});

export const publicDecisionPresentation = ({
  pending,
  source,
}: {
  pending: PendingDecision;
  source?: CardRef | undefined;
}): PublicDecisionPresentation => {
  if (pending.type === "confirmLifeTrigger") {
    return {
      title: "Life trigger",
      instruction:
        "Choose whether to activate this trigger or add it to your hand.",
      ...withSource(source),
      choices: [
        {
          responseKey: "activateTrigger",
          label: "Activate trigger",
          cards: [pending.card],
        },
        {
          responseKey: "addToHand",
          label: "Add to hand",
          cards: [pending.card],
        },
      ],
    };
  }
  if (pending.type === "chooseReplacement") {
    return {
      title: "Choose replacement",
      instruction: stripPeriod(pending.prompt),
      ...withSource(source),
      choices: [
        ...(pending.replacementOptions ?? []).map((option) => ({
          responseKey: option.replacementId,
          label: option.label,
        })),
        ...(pending.mandatory
          ? []
          : [{ responseKey: "decline", label: "Do not replace" }]),
      ],
    };
  }
  if (pending.type === "chooseTriggerOrder") {
    return {
      title: "Resolve trigger",
      instruction: "Choose the next trigger to resolve.",
      ...withSource(source),
    };
  }
  if (pending.type === "chooseOptionalActivation") {
    return {
      title: "Optional effect",
      instruction: stripPeriod(pending.prompt),
      source: pending.source,
      choices: [
        { responseKey: "activate", label: "Activate effect" },
        { responseKey: "decline", label: "Decline effect" },
      ],
    };
  }
  if (pending.type === "chooseQuantity") {
    return {
      title: "Choose quantity",
      instruction: stripPeriod(pending.prompt),
      ...withSource(source),
    };
  }
  if (pending.type === "payCost") {
    return {
      title: "Pay cost",
      instruction: stripPeriod(pending.prompt),
      ...withSource(source),
    };
  }
  if (pending.type === "orderCards") {
    return {
      title: `Order cards for ${zoneLabel(pending.destination)}`,
      instruction: stripPeriod(pending.prompt),
      ...withSource(source),
    };
  }
  return fallbackPresentation(pending, source);
};
