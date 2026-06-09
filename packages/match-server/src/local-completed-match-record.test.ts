import { describe, expect, test } from "vitest";

import {
  buildLocalCompletedMatchRecord,
  type CompletedMatchSeatContext,
} from "./local-completed-match-record.js";
import {
  createLocalDevMatch,
  createPremadeDevMatchSetup,
} from "./local-match.js";
import type { CardId, MatchId } from "@optcg/types";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";

const readySubmission = (
  hash: string,
  leaderCardNumber: string,
): ReadyDeckSubmission => ({
  source: "deckHash",
  hash,
  status: "ready",
  decoded: {
    leader: { cardId: leaderCardNumber as CardId, count: 1 },
    main: [{ cardId: "OP01-016" as CardId, count: 4 }],
  },
  donDeckCount: 10,
});

const verifiedHandoff = (hash: string): VerifiedSimHandoff => ({
  claims: {
    jti: "token-id",
    sub: "00000000-0000-0000-0000-000000000001",
    sid: "00000000-0000-0000-0000-0000000000aa",
    loadout_id: "10000000-0000-0000-0000-000000000001",
    lobby_id: "lobby-1",
    seat_id: "p1",
    aud: "optcg-sim",
    iat: 1,
    exp: 2,
  },
  resolvedLoadout: {
    loadoutId: "10000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000001",
    mainDeck: {
      deckId: "10000000-0000-0000-0000-000000000001",
      hash,
    },
    donDeck: {
      donDeckId: null,
      count: 10,
    },
    cosmetics: {
      playmatId: "playmat-1",
      donSleeveId: "don-sleeve-1",
      deckSleeveId: "deck-sleeve-1",
    },
  },
});

describe("local completed match record mapping", () => {
  test("preserves verified account loadout snapshots for completed matches", async () => {
    const setup = await createPremadeDevMatchSetup({
      matchId: "11111111-1111-1111-1111-111111111111" as MatchId,
      lobbyId: "lobby-1",
    });
    const match = createLocalDevMatch(setup);
    match.state.status = { type: "completed", winner: setup.playerOrder[0] };
    const firstSeat: CompletedMatchSeatContext = {
      playerId: setup.playerOrder[0],
      subject: {
        type: "user",
        userId: "00000000-0000-0000-0000-000000000001",
        sessionId: "00000000-0000-0000-0000-0000000000aa",
        displayName: "Account Player",
      },
      deckSubmission: readySubmission("account-hash", "OP01-001"),
      verifiedHandoff: verifiedHandoff("account-hash"),
    };
    const secondSeat: CompletedMatchSeatContext = {
      playerId: setup.playerOrder[1],
      deckSubmission: readySubmission("local-hash", "OP05-060"),
    };

    const record = buildLocalCompletedMatchRecord({
      match,
      setup,
      seats: {
        [setup.playerOrder[0]]: firstSeat,
        [setup.playerOrder[1]]: secondSeat,
      },
      firstPlayerChoice: {
        source: "game-one-random-chooser",
        chooserPlayerId: setup.playerOrder[0],
        choice: "goFirst",
        resolvedFirstPlayerId: setup.playerOrder[0],
      },
      records: [],
      endedAt: "2026-06-08T00:10:00.000Z",
    });

    expect(record).toBeDefined();
    expect(record?.matchId).toBe("11111111-1111-1111-1111-111111111111");
    expect(record?.lobbyId).toBe("lobby-1");
    expect(record?.creationSource).toMatchObject({
      type: "customLobby",
      lobbyId: "lobby-1",
    });
    const firstPlayer = record?.players[0];
    expect(firstPlayer?.userId).toBe("00000000-0000-0000-0000-000000000001");
    expect(firstPlayer?.savedDeckId).toBe(
      "10000000-0000-0000-0000-000000000001",
    );
    expect(firstPlayer?.deckHash).toBe("account-hash");
    expect(firstPlayer?.resolvedLoadoutSnapshot).toMatchObject({
      loadoutId: "10000000-0000-0000-0000-000000000001",
      cosmetics: {
        deckSleeveId: "deck-sleeve-1",
      },
    });
    expect(firstPlayer?.deckSnapshot).toMatchObject({
      hash: "account-hash",
      decoded: {
        leader: { cardId: "OP01-001" },
      },
    });
  });
});
