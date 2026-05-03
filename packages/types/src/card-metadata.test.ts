import { expect, test } from "vitest";

import type {
  CardCategory,
  CardColor,
  CardId,
  CardMetadata,
  MatchSource,
  PlayerId,
  VariantKey,
  ZoneRef,
} from "./index.js";

test("card metadata concern contracts compile", () => {
  const source: MatchSource = "poneglyph";
  const category: CardCategory = "character";
  const color: CardColor = "red";
  const cardId = "OP01-060" as CardId;
  const zone: ZoneRef = {
    zone: "characterArea",
    playerId: "player-1" as PlayerId,
  };

  const metadata: CardMetadata = {
    cardId,
    source,
    name: "Sample",
    category,
    colors: [color],
    text: "Sample text",
    variants: [{ variantKey: "OP01-060:v0" as VariantKey, variantIndex: 0 }],
  };

  expect(zone.zone).toBe("characterArea");
  expect(metadata.cardId).toBe(cardId);
});
