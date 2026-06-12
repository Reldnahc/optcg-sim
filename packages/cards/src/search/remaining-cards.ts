import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface RestBottomParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly remainingCards: {
    readonly destination: "deck";
    readonly position: "bottom" | "topOrBottom";
    readonly order: "ownerChoice";
  };
  readonly rest: string;
}

export interface RestTrashParseResult {
  readonly evidence: readonly PrimitiveEvidence[];
  readonly remainingCards: {
    readonly destination: "trash";
  };
  readonly rest: string;
}

export function parseRestToBottomAnyOrder(
  input: ParseInput,
): RestBottomParseResult | undefined {
  const match =
    /^Then, place the rest at the bottom of your deck in any order(?:\.|,?\s+and\s+(?<rest>.+)|\.\s+Then,\s+(?<thenRest>.+))$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    evidence: ["remaining:rest", "remaining:bottomDeck", "order:anyOrder"],
    remainingCards: {
      destination: "deck",
      position: "bottom",
      order: "ownerChoice",
    },
    rest: match.groups?.["rest"] ?? match.groups?.["thenRest"] ?? "",
  };
}

export function parseRestToTopOrBottomAnyOrder(
  input: ParseInput,
): RestBottomParseResult | undefined {
  const match =
    /^Then, place the rest at the top or bottom of (?:your|the) deck in any order(?:\.|,?\s+and\s+(?<rest>.+)|\.\s+Then,\s+(?<thenRest>.+))$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    evidence: [
      "remaining:rest",
      "remaining:bottomDeck",
      "position:top",
      "position:bottom",
      "order:anyOrder",
    ],
    remainingCards: {
      destination: "deck",
      position: "topOrBottom",
      order: "ownerChoice",
    },
    rest: match.groups?.["rest"] ?? match.groups?.["thenRest"] ?? "",
  };
}

export function parseRestToTrash(
  input: ParseInput,
): RestTrashParseResult | undefined {
  const match = /^Then, trash the rest(?:\.|(?:,?\s+and\s+)(?<rest>.+))$/i.exec(
    input.text,
  );
  if (match === null) {
    return undefined;
  }

  return {
    evidence: ["remaining:rest", "remaining:trash"],
    remainingCards: { destination: "trash" },
    rest: match.groups?.["rest"] ?? "",
  };
}
