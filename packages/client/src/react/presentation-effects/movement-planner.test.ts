import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { CardId, EngineEvent, InstanceId, PlayerId } from "@optcg/types";

import type { ClientCardModel } from "../../view-model.js";
import {
  planCardMovementIntents,
  type CardMovementIntent,
  type PresentationCardPosition,
  type PresentationSnapshot,
} from "./movement-planner.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const card = (
  instanceId: string,
  overrides: Partial<ClientCardModel> = {},
): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Moving Card",
  category: "Character",
  imageUrl: "https://example.test/card.png",
  attachedDonCount: 0,
  attachedDonCards: [],
  ...overrides,
});

const rect = (
  x: number,
  y: number,
  width = 50,
  height = 70,
): DOMRectReadOnly => ({
  x,
  y,
  width,
  height,
  top: y,
  right: x + width,
  bottom: y + height,
  left: x,
  toJSON: () => ({}),
});

const rectFields = (value: DOMRectReadOnly | undefined) =>
  value === undefined
    ? undefined
    : {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
      };

const onlyMovement = (
  movements: readonly CardMovementIntent[],
): CardMovementIntent => {
  assert.equal(movements.length, 1);
  const movement = movements[0];
  assert.ok(movement !== undefined);
  return movement;
};

const snapshot = (
  input: Partial<PresentationSnapshot>,
): PresentationSnapshot => ({
  cards: {},
  zones: {},
  ...input,
});

const event = (input: {
  id: string;
  type: EngineEvent["type"];
  payload: unknown;
  affected?: EngineEvent["affected"];
}): EngineEvent =>
  ({
    id: input.id,
    seq: 1,
    type: input.type,
    payload: input.payload,
    ...(input.affected === undefined ? {} : { affected: input.affected }),
    visibility: { type: "public" },
    createdAtStateSeq: 1,
  }) as EngineEvent;

describe("presentation movement planner", () => {
  test("plans a visible card movement from its previous rect to current rect", () => {
    const movingCard = card("card-1");

    const movements = planCardMovementIntents({
      previous: snapshot({
        cards: {
          "card-1": {
            card: movingCard,
            rect: rect(10, 20),
            zoneKey: "self:hand",
          },
        },
      }),
      current: snapshot({
        cards: {
          "card-1": {
            card: movingCard,
            rect: rect(300, 240),
            zoneKey: "self:characterArea",
          },
        },
      }),
      events: [],
      currentPlayerId: p1,
    });

    const movement = onlyMovement(movements);
    assert.deepEqual(rectFields(movement.fromRect), {
      x: 10,
      y: 20,
      width: 50,
      height: 70,
    });
    assert.deepEqual(rectFields(movement.toRect), {
      x: 300,
      y: 240,
      width: 50,
      height: 70,
    });
    assert.equal(movement.fromZoneKey, "self:hand");
    assert.equal(movement.toZoneKey, "self:characterArea");
  });

  test("uses filtered movement events and zone anchors for deck to hand", () => {
    const drawnCard = card("card-2", { name: "Drawn Card" });
    const movements = planCardMovementIntents({
      previous: snapshot({
        zones: { "self:deck": { zoneKey: "self:deck", rect: rect(500, 300) } },
      }),
      current: snapshot({
        cards: {
          "card-2": {
            card: drawnCard,
            rect: rect(40, 600),
            zoneKey: "self:hand",
          },
        },
        zones: { "self:deck": { zoneKey: "self:deck", rect: rect(500, 300) } },
      }),
      currentPlayerId: p1,
      events: [
        event({
          id: "event:draw",
          type: "cardMoved",
          payload: {
            cards: [{ instanceId: "card-2", cardId: "OP00-001", playerId: p1 }],
            from: { zone: "deck", playerId: p1 },
            to: { zone: "hand", playerId: p1 },
          },
        }),
      ],
    });

    const movement = onlyMovement(movements);
    assert.equal(movement.eventId, "event:draw");
    assert.equal(movement.fromZoneKey, "self:deck");
    assert.equal(movement.toZoneKey, "self:hand");
    assert.deepEqual(rectFields(movement.fromRect), {
      x: 500,
      y: 300,
      width: 50,
      height: 70,
    });
    assert.deepEqual(rectFields(movement.toRect), {
      x: 40,
      y: 600,
      width: 50,
      height: 70,
    });
  });

  test("uses string zone movement payloads with playerId as aggregate zone anchors", () => {
    const movements = planCardMovementIntents({
      previous: snapshot({
        zones: {
          "opponent:deck": { zoneKey: "opponent:deck", rect: rect(500, 40) },
          "opponent:hand": { zoneKey: "opponent:hand", rect: rect(40, 40) },
        },
      }),
      current: snapshot({
        zones: {
          "opponent:deck": { zoneKey: "opponent:deck", rect: rect(500, 40) },
          "opponent:hand": { zoneKey: "opponent:hand", rect: rect(40, 40) },
        },
      }),
      currentPlayerId: p1,
      events: [
        event({
          id: "event:opponent-draw",
          type: "cardMoved",
          payload: {
            from: "deck",
            to: "hand",
            playerId: p2,
            reason: "draw",
          },
        }),
      ],
    });

    const movement = onlyMovement(movements);
    assert.equal(movement.instanceId, "event:opponent-draw:hidden");
    assert.equal(movement.card.category, "hidden");
    assert.equal(movement.fromZoneKey, "opponent:deck");
    assert.equal(movement.toZoneKey, "opponent:hand");
  });

  test("keeps zone-ref card identity movement preferred over aggregate movement", () => {
    const drawnCard = card("card-visible", { name: "Visible Drawn Card" });
    const movements = planCardMovementIntents({
      previous: snapshot({
        zones: { "self:deck": { zoneKey: "self:deck", rect: rect(500, 300) } },
      }),
      current: snapshot({
        cards: {
          "card-visible": {
            card: drawnCard,
            rect: rect(40, 600),
            zoneKey: "self:hand",
          },
        },
        zones: { "self:deck": { zoneKey: "self:deck", rect: rect(500, 300) } },
      }),
      currentPlayerId: p1,
      events: [
        event({
          id: "event:self-private-draw",
          type: "cardMoved",
          payload: {
            instanceId: "card-visible",
            cardId: "OP00-001",
            playerId: p1,
            from: { zone: "deck", playerId: p1 },
            to: { zone: "hand", playerId: p1 },
          },
        }),
      ],
    });

    const movement = onlyMovement(movements);
    assert.equal(movement.instanceId, "card-visible");
    assert.equal(movement.card.name, "Visible Drawn Card");
    assert.equal(movement.fromZoneKey, "self:deck");
    assert.equal(movement.toZoneKey, "self:hand");
  });

  test("does not plan hidden opponent identity movement without visible card or safe zone endpoint", () => {
    const movements = planCardMovementIntents({
      previous: snapshot({
        zones: {
          "opponent:deck": {
            zoneKey: "opponent:deck",
            rect: rect(500, 40),
          },
        },
      }),
      current: snapshot({
        zones: {
          "opponent:deck": {
            zoneKey: "opponent:deck",
            rect: rect(500, 40),
          },
        },
      }),
      currentPlayerId: p1,
      events: [
        event({
          id: "event:opponent-hidden-draw",
          type: "cardMoved",
          payload: {
            from: { zone: "deck", playerId: p2 },
            to: { zone: "hand", playerId: p2 },
          },
        }),
      ],
    });

    assert.deepEqual(movements, []);
  });

  test("does not animate unchanged cards", () => {
    const stableCard = card("card-3");
    const current = {
      card: stableCard,
      rect: rect(25, 35),
      zoneKey: "self:hand",
    } satisfies PresentationCardPosition;

    const movements = planCardMovementIntents({
      previous: snapshot({ cards: { "card-3": current } }),
      current: snapshot({ cards: { "card-3": current } }),
      events: [],
      currentPlayerId: p1,
    });

    assert.deepEqual(movements, []);
  });
});
