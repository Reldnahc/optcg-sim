import { strict as assert } from "node:assert";
import { beforeAll, test } from "vitest";

import type { MatchId } from "@optcg/types";

import { createFixtureDevMatchSetup } from "./default-dev-fixture-fetch.test-support.js";
import {
  createLocalDevMatchRegistry,
  type CreatedDevMatchResponse,
} from "./dev-local-match-registry.js";
import type { DevMatchSetup } from "./local-match.js";

let premadeSetup: DevMatchSetup;

beforeAll(async () => {
  premadeSetup = await createFixtureDevMatchSetup();
});

const resolveFirstPlayerChoice = (
  registry: Awaited<ReturnType<typeof createLocalDevMatchRegistry>>,
  created: CreatedDevMatchResponse,
): void => {
  const result = registry.chooseFirstPlayer(
    created.matchId,
    created.firstPlayerChoice.chooserPlayerId,
    "goFirst",
  );
  if (typeof result === "string") {
    throw new Error(`Unable to choose first player: ${result}`);
  }
};

test("can create active matches without game timers", async () => {
  const registry = await createLocalDevMatchRegistry(
    () => Promise.resolve(structuredClone(premadeSetup)),
    undefined,
    { createDefaultMatch: false },
  );
  const matchId = "timerless-match" as MatchId;

  const created = await registry.createMatch(
    { ...structuredClone(premadeSetup), matchId },
    { timersEnabled: false },
  );
  resolveFirstPlayerChoice(registry, created);

  const match = registry.getMatch(matchId);
  assert.ok(match !== undefined);
  assert.deepEqual(match.state.timers.players, {});
  assert.deepEqual(
    registry.advanceTimers({
      elapsedMs: 1_000,
      connectedPlayerIds: () => new Set(),
      matchIds: [matchId],
    }),
    [],
  );
  assert.deepEqual(match.state.timers.players, {});
});
