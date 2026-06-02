import type { MatchCardManifest } from "@optcg/types";

import type { DevMatchPlayerSetup, DevMatchSetup } from "./local-match.js";

const isDevMatchPlayerSetup = (
  value: unknown,
): value is DevMatchPlayerSetup => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["playerId"] === "string" &&
    typeof candidate["leaderCardId"] === "string" &&
    Number.isInteger(candidate["leaderLifeCount"]) &&
    (candidate["leaderVariantIndex"] === undefined ||
      Number.isInteger(candidate["leaderVariantIndex"])) &&
    Array.isArray(candidate["deckCardIds"]) &&
    candidate["deckCardIds"].every((cardId) => typeof cardId === "string") &&
    (candidate["deckVariantIndexes"] === undefined ||
      (Array.isArray(candidate["deckVariantIndexes"]) &&
        candidate["deckVariantIndexes"].every(
          (variantIndex) =>
            variantIndex === undefined || Number.isInteger(variantIndex),
        ))) &&
    Array.isArray(candidate["donDeckCardIds"]) &&
    candidate["donDeckCardIds"].every((cardId) => typeof cardId === "string")
  );
};

const isMatchCardManifest = (value: unknown): value is MatchCardManifest => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["manifestHash"] === "string" &&
    typeof candidate["source"] === "string" &&
    typeof candidate["cardDataVersion"] === "string" &&
    typeof candidate["effectDefinitionsVersion"] === "string" &&
    typeof candidate["customHandlerVersion"] === "string" &&
    typeof candidate["banlistVersion"] === "string" &&
    typeof candidate["cards"] === "object" &&
    candidate["cards"] !== null &&
    typeof candidate["createdAt"] === "string"
  );
};

export const isDevMatchSetup = (value: unknown): value is DevMatchSetup => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const players = candidate["players"];
  const order = candidate["playerOrder"];
  const manifest = candidate["cardManifest"];
  return (
    typeof candidate["matchId"] === "string" &&
    typeof candidate["firstPlayerId"] === "string" &&
    (typeof candidate["rngSeed"] === "string" ||
      typeof candidate["rngSeed"] === "number") &&
    Array.isArray(order) &&
    order.length === 2 &&
    order.every((playerId) => typeof playerId === "string") &&
    Array.isArray(players) &&
    players.length === 2 &&
    players.every(isDevMatchPlayerSetup) &&
    isMatchCardManifest(manifest) &&
    (candidate["shuffleDecks"] === undefined ||
      typeof candidate["shuffleDecks"] === "boolean")
  );
};
