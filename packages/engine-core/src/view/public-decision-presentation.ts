import type {
  ActiveEffectTextPresentation,
  CardRef,
  EffectTextSourceMap,
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

interface PublicDecisionPresentationContext {
  source?: CardRef | undefined;
  effectTextSourceMap?: EffectTextSourceMap | undefined;
  activeEffectText?: ActiveEffectTextPresentation | undefined;
}

const withPresentationContext = ({
  source,
  effectTextSourceMap,
  activeEffectText,
}: PublicDecisionPresentationContext): Pick<
  PublicDecisionPresentation,
  "source" | "effectTextSourceMap" | "activeEffectText"
> => ({
  ...(source === undefined ? {} : { source }),
  ...(effectTextSourceMap === undefined ? {} : { effectTextSourceMap }),
  ...(activeEffectText === undefined ? {} : { activeEffectText }),
});

const fallbackPresentation = (
  pending: PendingDecision,
  context: PublicDecisionPresentationContext,
): PublicDecisionPresentation => ({
  title: stripPeriod(pending.prompt),
  instruction: stripPeriod(pending.prompt),
  ...withPresentationContext(context),
});

const binaryQuantityPresentation = (
  pending: Extract<PendingDecision, { type: "chooseQuantity" }>,
  context: PublicDecisionPresentationContext,
): PublicDecisionPresentation | undefined => {
  if (pending.min !== 0 || pending.max !== 1) {
    return undefined;
  }
  const prompt = stripPeriod(pending.prompt);
  if (drawQuantityPromptPattern.test(prompt)) {
    return {
      title: "Draw card",
      instruction: "Do you want to draw 1 card?",
      ...withPresentationContext(context),
    };
  }
  const moveMatch = moveQuantityPromptPattern.exec(prompt);
  const fromZone = moveMatch?.groups?.["from"];
  const toZone = moveMatch?.groups?.["to"];
  if (fromZone !== undefined && toZone !== undefined) {
    return {
      title: "Move card",
      instruction: `Do you want to move 1 card from ${fromZone} to ${toZone}?`,
      ...withPresentationContext(context),
    };
  }
  const revealMatch = revealQuantityPromptPattern.exec(prompt);
  const revealZone = revealMatch?.groups?.["zone"];
  if (revealZone !== undefined) {
    return {
      title: "Reveal card",
      instruction: `Do you want to reveal 1 card from ${revealZone}?`,
      ...withPresentationContext(context),
    };
  }
  return undefined;
};

export const publicDecisionPresentation = ({
  pending,
  source,
  effectTextSourceMap,
  activeEffectText,
}: {
  pending: PendingDecision;
  source?: CardRef | undefined;
  effectTextSourceMap?: EffectTextSourceMap | undefined;
  activeEffectText?: ActiveEffectTextPresentation | undefined;
}): PublicDecisionPresentation => {
  const context: PublicDecisionPresentationContext = {
    source,
    effectTextSourceMap,
    activeEffectText,
  };
  if (pending.type === "confirmLifeTrigger") {
    return {
      title: "Life trigger",
      instruction:
        "Choose whether to activate this trigger or add it to your hand.",
      ...withPresentationContext(context),
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
      ...withPresentationContext(context),
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
      ...withPresentationContext(context),
    };
  }
  if (pending.type === "chooseOptionalActivation") {
    return {
      title: "Optional effect",
      instruction: stripPeriod(pending.prompt),
      ...withPresentationContext({ ...context, source: pending.source }),
      choices: [
        { responseKey: "activate", label: "Activate effect" },
        { responseKey: "decline", label: "Decline effect" },
      ],
    };
  }
  if (pending.type === "chooseQuantity") {
    const binaryPresentation = binaryQuantityPresentation(pending, context);
    if (binaryPresentation !== undefined) {
      return binaryPresentation;
    }
    return {
      title: "Choose quantity",
      instruction: stripPeriod(pending.prompt),
      ...withPresentationContext(context),
    };
  }
  if (pending.type === "chooseEffectOption") {
    return {
      title: "Choose one",
      instruction: stripPeriod(pending.prompt),
      ...withPresentationContext(context),
      choices: [
        ...pending.options.map((option) => ({
          responseKey: option.id,
          label: option.label ?? "Choose option",
        })),
        ...(pending.min === 0
          ? [{ responseKey: "decline", label: "Do nothing" }]
          : []),
      ],
    };
  }
  if (pending.type === "payCost") {
    return {
      title: "Pay cost",
      instruction: stripPeriod(pending.prompt),
      ...withPresentationContext(context),
    };
  }
  if (pending.type === "orderCards") {
    return {
      title: `Order cards for ${zoneLabel(pending.destination)}`,
      instruction: stripPeriod(pending.prompt),
      ...withPresentationContext(context),
    };
  }
  return fallbackPresentation(pending, context);
};
