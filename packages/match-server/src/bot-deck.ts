import type { CardId } from "@optcg/types";

import type { ReadyDeckSubmission } from "./deck-submission.js";

const botDeckHash =
  "eJxrmLaQjfXDyobAGAY3lkMcwiyKPus6bxmd0tbhcZDaxGS0LuEMAOZVDKs";

const entry = (cardId: string, count: number) => ({
  cardId: cardId as CardId,
  count,
});

export const createDefaultBotDeckSubmission = (): ReadyDeckSubmission => ({
  source: "deckHash",
  hash: botDeckHash,
  status: "ready",
  decoded: {
    leader: entry("OP09-001", 1),
    main: [
      entry("EB04-007", 2),
      entry("OP06-007", 2),
      entry("OP09-002", 4),
      entry("OP09-004", 4),
      entry("OP09-009", 2),
      entry("OP09-011", 4),
      entry("OP09-014", 2),
      entry("OP09-020", 4),
      entry("OP10-011", 2),
      entry("OP12-008", 4),
      entry("OP13-007", 2),
      entry("PRB02-001", 2),
      entry("PRB02-002", 4),
      entry("ST23-002", 4),
      entry("OP16-012", 4),
      entry("OP16-018", 4),
    ],
  },
  donDeckCount: 10,
});
