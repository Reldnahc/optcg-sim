import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  EngineEvent,
  EventVisibility,
  GameState,
  Trigger,
} from "@optcg/types";

import { createEvent } from "../../action-results.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
} from "../../action-test-fixtures.js";
import { matchEventTrigger } from "./matcher.js";

const setupEventHookState = (): {
  readonly state: GameState;
  readonly source: CardInstance;
  readonly opponentLeader: CardInstance;
  readonly character: CardInstance;
} => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const opponent = must(state.players[p2], "p2");
  const source = player.leader;
  const character: CardInstance = {
    instanceId: "p1-character:event-hook" as CardInstance["instanceId"],
    cardId: toCardId("p1-character:event-hook"),
    owner: p1,
    controller: p1,
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    },
    state: "active",
    attachedDon: [],
  };
  player.characters = [character];
  const opponentLeader = opponent.leader;
  state.cardManifest.cards[source.cardId] = {
    ...resolvedCard({ cardId: source.cardId, category: "leader", power: 5000 }),
    types: ["Navy"],
  };
  state.cardManifest.cards[character.cardId] = {
    ...resolvedCard({
      cardId: character.cardId,
      category: "character",
      cost: 3,
      power: 5000,
    }),
    types: ["Navy"],
  };
  state.cardManifest.cards[opponentLeader.cardId] = resolvedCard({
    cardId: opponentLeader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("event-card")] = resolvedCard({
    cardId: toCardId("event-card"),
    category: "event",
    cost: 1,
  });
  return { state, source, opponentLeader, character };
};

const publicEvent = (
  state: GameState,
  type: EngineEvent["type"],
  payload: unknown,
): EngineEvent => createEvent(state, 1, type, payload, { type: "public" });

const hiddenVariants = (
  state: GameState,
  type: EngineEvent["type"],
  payload: unknown,
): readonly EngineEvent[] =>
  (
    [
      { type: "private", playerId: p1 },
      { type: "hidden" },
      { type: "serverOnly" },
      { type: "replayOnly" },
    ] satisfies readonly EventVisibility[]
  ).map((visibility) => createEvent(state, 1, type, payload, visibility));

test("canonical event matcher matches cardRested triggers by player, self target, source controller, and source kind", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "cardRested", {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardRested",
      target: "self",
      player: "self",
      sourceController: "self",
      sourceKind: "effect",
    },
    event,
  );

  assert.deepEqual(match, { matched: true, triggerTypes: ["cardRested"] });
});

test("canonical event matcher matches cardDrawn outside Draw Phase by player", () => {
  const { source, state } = setupEventHookState();
  state.turn.phase = "main";
  const event = publicEvent(state, "cardDrawn", {
    playerId: source.controller,
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardDrawn",
      player: "self",
      phase: { not: "draw" },
    },
    event,
  );

  assert.deepEqual(match, { matched: true, triggerTypes: ["cardDrawn"] });
});

test("canonical event matcher rejects cardDrawn phase exclusions", () => {
  const { source, state } = setupEventHookState();
  state.turn.phase = "draw";
  const event = publicEvent(state, "cardDrawn", {
    playerId: source.controller,
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardDrawn",
      player: "self",
      phase: { not: "draw" },
    },
    event,
  );

  assert.deepEqual(match, { matched: false, triggerTypes: [] });
});

test("canonical event matcher applies cardRested source-card filters", () => {
  const { character, source, state } = setupEventHookState();
  const event = publicEvent(state, "cardRested", {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
    sourceControllerId: character.controller,
    sourceKind: "effect",
    sourceCardId: character.cardId,
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "cardRested",
        target: "self",
        player: "self",
        sourceController: "self",
        sourceKind: "effect",
        sourceFilter: { categories: ["character"], typesAny: ["Navy"] },
      },
      event,
    ),
    { matched: true, triggerTypes: ["cardRested"] },
  );

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "cardRested",
        target: "self",
        player: "self",
        sourceController: "self",
        sourceKind: "effect",
        sourceFilter: { categories: ["event"] },
      },
      event,
    ),
    { matched: false, triggerTypes: [] },
  );
});

test("canonical event matcher rejects unsupported payload evidence instead of trusting trigger shape", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "cardRested", {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
  });

  const match = matchEventTrigger(
    state,
    source,
    {
      type: "cardRested",
      player: "self",
      sourceController: "opponent",
    },
    event,
  );

  assert.deepEqual(match, { matched: false, triggerTypes: [] });
});

test("canonical event matcher matches damageDealt by damaged player", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "damageDealt", {
    damagedPlayerId: p2,
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      { type: "damageDealt", players: ["opponent"] },
      event,
    ),
    { matched: true, triggerTypes: ["damageDealt"] },
  );
});

test("canonical event matcher matches fieldRemoved public cardMoved events and requires canonical source evidence", () => {
  const { source, state, character } = setupEventHookState();
  const missingEvidence = publicEvent(state, "cardMoved", {
    from: character.zone,
    playerId: character.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    reason: "effect",
  });
  const trigger: Trigger = {
    type: "fieldRemoved",
    player: "self",
    sourceController: "self",
    sourceKind: "effect",
    filter: { categories: ["character"] },
  };

  assert.deepEqual(matchEventTrigger(state, source, trigger, missingEvidence), {
    matched: false,
    triggerTypes: [],
  });

  const withEvidence = publicEvent(state, "cardMoved", {
    from: character.zone,
    playerId: character.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    reason: "effect",
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });

  assert.deepEqual(matchEventTrigger(state, source, trigger, withEvidence), {
    matched: true,
    triggerTypes: ["fieldRemoved"],
  });
});

test("canonical event matcher filters fieldRemoved destination", () => {
  const { source, state, character } = setupEventHookState();
  const trigger: Trigger = {
    type: "fieldRemoved",
    player: "self",
    sourceController: "self",
    sourceKind: "effect",
    destination: "hand",
    filter: { categories: ["character"] },
  };
  const returnedToHand = publicEvent(state, "cardMoved", {
    from: character.zone,
    to: { zone: "hand", playerId: character.controller },
    playerId: character.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    reason: "effect",
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });
  const movedToDeck = publicEvent(state, "cardMoved", {
    from: character.zone,
    to: { zone: "deck", playerId: character.controller },
    playerId: character.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    reason: "effect",
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });

  assert.deepEqual(matchEventTrigger(state, source, trigger, returnedToHand), {
    matched: true,
    triggerTypes: ["fieldRemoved"],
  });
  assert.deepEqual(matchEventTrigger(state, source, trigger, movedToDeck), {
    matched: false,
    triggerTypes: [],
  });
});

test("canonical event matcher matches cardPlayed sourceZone and source-card filters", () => {
  const { source, state, character } = setupEventHookState();
  const event = publicEvent(state, "cardPlayed", {
    playerId: source.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    sourceZone: "hand",
    sourceCardId: source.cardId,
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "cardPlayed",
        player: "self",
        sourceZone: "hand",
        anyOf: [
          { filter: { categories: ["stage"] } },
          { filter: { categories: ["character"] } },
        ],
      },
      event,
    ),
    { matched: true, triggerTypes: ["cardPlayed"] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "cardPlayed",
        player: "self",
        sourceFilter: { categories: ["leader"], typesAny: ["Navy"] },
      },
      event,
    ),
    { matched: true, triggerTypes: ["cardPlayed"] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "cardPlayed",
        player: "self",
        sourceFilter: { categories: ["event"] },
      },
      event,
    ),
    { matched: false, triggerTypes: [] },
  );
});

test("canonical event matcher matches donReturned and donAttached primitives", () => {
  const { source, state, character } = setupEventHookState();
  const donReturned = publicEvent(state, "donReturned", {
    playerId: source.controller,
    donInstanceId: "don-1",
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });
  const donAttached = publicEvent(state, "donAttached", {
    playerId: source.controller,
    donInstanceId: "don-1",
    target: character,
    targetPlayerId: character.controller,
    targetInstanceId: character.instanceId,
    targetCardId: character.cardId,
    sourceControllerId: source.controller,
    sourceKind: "effect",
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "donReturned",
        player: "self",
        sourceController: "self",
        sourceKind: "effect",
      },
      donReturned,
    ),
    { matched: true, triggerTypes: ["donReturned"] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "donReturned",
        player: "self",
        sourceController: "opponent",
        sourceKind: "effect",
      },
      donReturned,
    ),
    { matched: false, triggerTypes: [] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "donAttached",
        player: "self",
        target: "yourLeaderOrCharacters",
        filter: { categories: ["character"] },
        sourceController: "self",
        sourceKind: "effect",
      },
      donAttached,
    ),
    { matched: true, triggerTypes: ["donAttached"] },
  );
});

test("canonical event matcher matches attackDeclared roles for this leader attacking or being attacked", () => {
  const { source, state, opponentLeader } = setupEventHookState();
  const attacked = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: opponentLeader.instanceId,
      cardId: opponentLeader.cardId,
      playerId: opponentLeader.controller,
      zone: opponentLeader.zone,
    },
    target: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "attackDeclared",
        role: "attackerOrTarget",
        player: "self",
        filter: { categories: ["leader"] },
      },
      attacked,
    ),
    { matched: true, triggerTypes: ["attackDeclared"] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      { type: "onOpponentAttack", attackerFilter: { categories: ["leader"] } },
      attacked,
    ),
    { matched: true, triggerTypes: ["onOpponentAttack"] },
  );
});

test("canonical event matcher matches attackDeclared target constraints", () => {
  const { source, state, opponentLeader, character } = setupEventHookState();
  const leaderTarget = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
    target: {
      instanceId: opponentLeader.instanceId,
      cardId: opponentLeader.cardId,
      playerId: opponentLeader.controller,
      zone: opponentLeader.zone,
    },
  });
  const characterTarget = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
    target: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: character.controller,
      zone: character.zone,
    },
  });
  const trigger: Trigger = {
    type: "attackDeclared",
    role: "attacker",
    player: "self",
    filter: { categories: ["leader"] },
    targetPlayer: "opponent",
    targetFilter: { categories: ["leader"] },
  };

  assert.deepEqual(matchEventTrigger(state, source, trigger, leaderTarget), {
    matched: true,
    triggerTypes: ["attackDeclared"],
  });
  assert.deepEqual(matchEventTrigger(state, source, trigger, characterTarget), {
    matched: false,
    triggerTypes: [],
  });
});

test("canonical event matcher matches attackDeclared counterpart constraints for either battle role", () => {
  const { state, character } = setupEventHookState();
  const opponent = must(state.players[p2], "p2");
  const strikeCharacter: CardInstance = {
    instanceId: "p2-character:strike" as CardInstance["instanceId"],
    cardId: toCardId("p2-character:strike"),
    owner: p2,
    controller: p2,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index: 0,
    },
    state: "active",
    attachedDon: [],
  };
  const specialCharacter: CardInstance = {
    ...strikeCharacter,
    instanceId: "p2-character:special" as CardInstance["instanceId"],
    cardId: toCardId("p2-character:special"),
    zone: { ...strikeCharacter.zone, index: 1 },
  };
  opponent.characters = [strikeCharacter, specialCharacter];
  state.cardManifest.cards[strikeCharacter.cardId] = resolvedCard({
    cardId: strikeCharacter.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  must(
    state.cardManifest.cards[strikeCharacter.cardId],
    "strike character manifest",
  ).attributes = ["strike"];
  state.cardManifest.cards[specialCharacter.cardId] = resolvedCard({
    cardId: specialCharacter.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  must(
    state.cardManifest.cards[specialCharacter.cardId],
    "special character manifest",
  ).attributes = ["special"];

  const trigger: Trigger = {
    type: "attackDeclared",
    role: "attackerOrTarget",
    player: "self",
    filter: { categories: ["character"] },
    counterpartPlayer: "opponent",
    counterpartFilter: {
      categories: ["character"],
      attributesAny: ["strike"],
    },
  };

  const sourceAttacksStrike = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: character.controller,
      zone: character.zone,
    },
    target: {
      instanceId: strikeCharacter.instanceId,
      cardId: strikeCharacter.cardId,
      playerId: strikeCharacter.controller,
      zone: strikeCharacter.zone,
    },
  });
  const strikeAttacksSource = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: strikeCharacter.instanceId,
      cardId: strikeCharacter.cardId,
      playerId: strikeCharacter.controller,
      zone: strikeCharacter.zone,
    },
    target: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: character.controller,
      zone: character.zone,
    },
  });
  const specialAttacksSource = publicEvent(state, "attackDeclared", {
    attacker: {
      instanceId: specialCharacter.instanceId,
      cardId: specialCharacter.cardId,
      playerId: specialCharacter.controller,
      zone: specialCharacter.zone,
    },
    target: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: character.controller,
      zone: character.zone,
    },
  });

  assert.deepEqual(
    matchEventTrigger(state, character, trigger, sourceAttacksStrike),
    { matched: true, triggerTypes: ["attackDeclared"] },
  );
  assert.deepEqual(
    matchEventTrigger(state, character, trigger, strikeAttacksSource),
    { matched: true, triggerTypes: ["attackDeclared"] },
  );
  assert.deepEqual(
    matchEventTrigger(state, character, trigger, specialAttacksSource),
    { matched: false, triggerTypes: [] },
  );
});

test("canonical event matcher matches endOfBattle counterpart constraints for either battle role", () => {
  const { state, source, character } = setupEventHookState();
  const opponent = must(state.players[p2], "p2");
  const opponentCharacter: CardInstance = {
    instanceId: "p2-character:event-hook" as CardInstance["instanceId"],
    cardId: toCardId("p2-character:event-hook"),
    owner: p2,
    controller: p2,
    zone: {
      zone: "characterArea",
      playerId: p2,
      slot: "character",
      index: 0,
    },
    state: "rested",
    attachedDon: [],
  };
  opponent.characters = [opponentCharacter];
  state.cardManifest.cards[opponentCharacter.cardId] = resolvedCard({
    cardId: opponentCharacter.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  const trigger: Trigger = {
    type: "endOfBattle",
    role: "attackerOrTarget",
    player: "self",
    filter: { categories: ["character"] },
    counterpartPlayer: "opponent",
    counterpartFilter: { categories: ["character"] },
  };
  const event = publicEvent(state, "battleEnded", {
    attacker: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: p1,
      zone: character.zone,
    },
    target: {
      instanceId: opponentCharacter.instanceId,
      cardId: opponentCharacter.cardId,
      playerId: p2,
      zone: opponentCharacter.zone,
    },
  });

  assert.deepEqual(matchEventTrigger(state, character, trigger, event), {
    matched: true,
    triggerTypes: ["endOfBattle"],
  });
  assert.deepEqual(matchEventTrigger(state, source, trigger, event), {
    matched: false,
    triggerTypes: [],
  });
});

test("canonical event matcher matches effectQueued entry point, category, and source filter evidence", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "effectQueued", {
    queueEntryId: "queue-entry:1",
    timingWindowId: "timing-window:1",
    effectBlockId: "effect-1",
    controllerId: source.controller,
    sourceCardId: source.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onPlay" },
    sourceTypes: ["Navy"],
    sourceCategory: "leader",
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "effectQueued",
        player: "self",
        effectCategory: "auto",
        effectEntryPoint: { type: "onPlay" },
        sourceFilter: { typesAny: ["Navy"] },
      },
      event,
    ),
    { matched: true, triggerTypes: ["effectQueued"] },
  );
});

test("canonical event matcher matches effectResolved entry point, category, status, and source filter evidence", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "effectResolved", {
    queueEntryId: "queue-entry:1",
    timingWindowId: "timing-window:1",
    effectBlockId: "effect-1",
    controllerId: source.controller,
    sourceCardId: source.cardId,
    effectCategory: "auto",
    entryPoint: { type: "onPlay" },
    sourceTypes: ["Navy"],
    sourceCategory: "leader",
    status: "resolved",
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "effectResolved",
        player: "self",
        effectCategory: "auto",
        effectEntryPoint: { type: "onPlay" },
        sourceFilter: { typesAny: ["Navy"] },
        status: "resolved",
      },
      event,
    ),
    { matched: true, triggerTypes: ["effectResolved"] },
  );
});

test("canonical event matcher matches triggerActivated by player and trigger source filter evidence", () => {
  const { source, state } = setupEventHookState();
  const event = publicEvent(state, "triggerActivated", {
    playerId: source.controller,
    sourceCardId: source.cardId,
    sourceTypes: ["Navy"],
    sourceCategory: "leader",
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "triggerActivated",
        player: "self",
        sourceFilter: { typesAny: ["Navy"] },
      },
      event,
    ),
    { matched: true, triggerTypes: ["triggerActivated"] },
  );
});

test("canonical event matcher matches lifeRemoved and opponentActivated event families", () => {
  const { source, state, character } = setupEventHookState();
  const lifeRemoved = publicEvent(state, "cardMoved", {
    from: { zone: "life", playerId: source.controller, slot: "life", index: 0 },
    to: { zone: "hand", playerId: source.controller, slot: "hand", index: 0 },
    playerId: source.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    reason: "damage",
  });
  const eventActivated = publicEvent(state, "cardPlayed", {
    playerId: p2,
    instanceId: "event-instance",
    cardId: toCardId("event-card"),
    category: "event",
    sourceZone: "hand",
  });
  const triggerActivated = publicEvent(state, "triggerActivated", {
    playerId: p2,
    cardId: toCardId("event-card"),
  });
  const blockerActivated = publicEvent(state, "blockerActivated", {
    blocker: { playerId: p2 },
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      { type: "lifeRemoved", players: ["self"], destination: "hand" },
      lifeRemoved,
    ),
    { matched: true, triggerTypes: ["lifeRemoved"] },
  );
  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      { type: "lifeRemoved", players: ["self"], destination: "trash" },
      lifeRemoved,
    ),
    { matched: false, triggerTypes: [] },
  );
  for (const event of [eventActivated, triggerActivated, blockerActivated]) {
    assert.deepEqual(
      matchEventTrigger(
        state,
        source,
        {
          type: "opponentActivated",
          activations: ["event", "trigger", "blocker"],
        },
        event,
      ),
      { matched: true, triggerTypes: ["opponentActivated"] },
    );
  }
});

test("canonical event matcher matches On Block only for the activated blocker source", () => {
  const { state, character } = setupEventHookState();
  const blockerActivated = publicEvent(state, "blockerActivated", {
    blocker: {
      playerId: character.controller,
      instanceId: character.instanceId,
      cardId: character.cardId,
      zone: character.zone,
    },
  });

  assert.deepEqual(
    matchEventTrigger(state, character, { type: "onBlock" }, blockerActivated),
    { matched: true, triggerTypes: ["onBlock"] },
  );

  const otherSource = must(state.players[p1]?.leader, "other source");
  assert.deepEqual(
    matchEventTrigger(
      state,
      otherSource,
      { type: "onBlock" },
      blockerActivated,
    ),
    { matched: false, triggerTypes: [] },
  );
});

test("canonical event matcher de-duplicates anyOf trigger matches in child order", () => {
  const { source, state, character } = setupEventHookState();
  const event = publicEvent(state, "cardPlayed", {
    playerId: source.controller,
    instanceId: character.instanceId,
    cardId: character.cardId,
    sourceZone: "hand",
  });

  assert.deepEqual(
    matchEventTrigger(
      state,
      source,
      {
        type: "anyOf",
        triggers: [
          { type: "cardPlayed", player: "self" },
          { type: "cardPlayed", player: "self", sourceZone: "hand" },
          { type: "donReturned", player: "self" },
        ],
      },
      event,
    ),
    { matched: true, triggerTypes: ["cardPlayed"] },
  );
});

test("canonical event matcher rejects non-public events for public event hook triggers", () => {
  const { source, state } = setupEventHookState();
  const triggers: readonly Trigger[] = [
    { type: "cardRested", player: "self" },
    { type: "donReturned", player: "self" },
    { type: "effectQueued", player: "self" },
    { type: "effectResolved", player: "self" },
    { type: "triggerActivated", player: "self" },
  ];
  const events = hiddenVariants(state, "cardRested", {
    playerId: source.controller,
    instanceId: source.instanceId,
    cardId: source.cardId,
  });

  for (const trigger of triggers) {
    for (const event of events) {
      assert.deepEqual(matchEventTrigger(state, source, trigger, event), {
        matched: false,
        triggerTypes: [],
      });
    }
  }
});
