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

const drawQuantityPromptPattern = /^Choose how many cards to draw\.?$/u;
const moveQuantityPromptPattern =
  /^Choose how many cards to move from (?<from>.+) to (?<to>.+)\.?$/u;
const revealQuantityPromptPattern =
  /^Choose how many cards to reveal from (?<zone>.+)\.?$/u;

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

const binaryQuantityPresentation = (
  pending: Extract<PendingDecision, { type: "chooseQuantity" }>,
  source: CardRef | undefined,
): PublicDecisionPresentation | undefined => {
  if (pending.min !== 0 || pending.max !== 1) {
    return undefined;
  }
  const prompt = stripPeriod(pending.prompt);
  if (drawQuantityPromptPattern.test(prompt)) {
    return {
      title: "Draw card",
      instruction: "Do you want to draw 1 card?",
      ...withSource(source),
    };
  }
  const moveMatch = moveQuantityPromptPattern.exec(prompt);
  const fromZone = moveMatch?.groups?.["from"];
  const toZone = moveMatch?.groups?.["to"];
  if (fromZone !== undefined && toZone !== undefined) {
    return {
      title: "Move card",
      instruction: `Do you want to move 1 card from ${fromZone} to ${toZone}?`,
      ...withSource(source),
    };
  }
  const revealMatch = revealQuantityPromptPattern.exec(prompt);
  const revealZone = revealMatch?.groups?.["zone"];
  if (revealZone !== undefined) {
    return {
      title: "Reveal card",
      instruction: `Do you want to reveal 1 card from ${revealZone}?`,
      ...withSource(source),
    };
  }
  return undefined;
};

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
          ...(option.source === undefined ? {} : { cards: [option.source] }),
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
    const binaryPresentation = binaryQuantityPresentation(pending, source);
    if (binaryPresentation !== undefined) {
      return binaryPresentation;
    }
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
