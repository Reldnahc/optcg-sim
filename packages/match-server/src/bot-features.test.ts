import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import { buildBotFeatures } from "./bot-features.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

const publicCard = (
  fields: Partial<PublicCardView>,
  defaults: {
    readonly playerId: PlayerId;
    readonly zone: PublicCardView["zone"]["zone"];
    readonly index: number;
  },
): PublicCardView => ({
  instanceId:
    fields.instanceId ??
    (`${defaults.playerId}:${defaults.zone}:${String(defaults.index)}` as InstanceId),
  cardId: fields.cardId ?? ("OP01-000" as CardId),
  owner: fields.owner ?? defaults.playerId,
  controller: fields.controller ?? defaults.playerId,
  zone: fields.zone ?? {
    playerId: defaults.playerId,
    zone: defaults.zone,
  },
  attachedDonCount: fields.attachedDonCount ?? 0,
  attachedDonIds: fields.attachedDonIds ?? [],
  ...fields,
});

const publicCards = (
  cards: readonly Partial<PublicCardView>[] | undefined,
  defaults: {
    readonly playerId: PlayerId;
    readonly zone: PublicCardView["zone"]["zone"];
  },
): PublicCardView[] =>
  (cards ?? []).map((card, index) => publicCard(card, { ...defaults, index }));

const snapshotWithActions = (
  actions: readonly DevVisibleAction[],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly selfCostArea?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentCharacters?: readonly Partial<PublicCardView>[];
    readonly opponentHandCount?: number;
  } = {},
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: {
          self: {
            leader: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP01-001" as CardId,
              owner: botPlayerId,
              controller: botPlayerId,
              zone: { playerId: botPlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.selfLeader,
            },
            hand: publicCards(cards.selfHand, {
              playerId: botPlayerId,
              zone: "hand",
            }),
            characters: publicCards(cards.selfCharacters, {
              playerId: botPlayerId,
              zone: "characterArea",
            }),
            costArea: publicCards(cards.selfCostArea, {
              playerId: botPlayerId,
              zone: "costArea",
            }),
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: cards.opponentHandCount ?? 0,
            leader: {
              instanceId: "opponent-leader" as InstanceId,
              cardId: "OP01-002" as CardId,
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.opponentLeader,
            },
            life: { count: 5, faceUpCards: [] },
            characters: publicCards(cards.opponentCharacters, {
              playerId: opponentPlayerId,
              zone: "characterArea",
            }),
            costArea: [],
          },
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("buildBotFeatures", () => {
  test("computes visible hand counter power", () => {
    const features = buildBotFeatures(
      snapshotWithActions([], {
        selfHand: [
          {
            instanceId: "counter-2000" as InstanceId,
            cardId: "OP01-003" as CardId,
            printedCounter: 2_000,
          },
          {
            instanceId: "counter-1000" as InstanceId,
            cardId: "OP01-004" as CardId,
            printedCounter: 1_000,
          },
        ],
      }),
      botPlayerId,
    );

    assert.equal(features.self.handCounterPower, 3_000);
  });

  test("indexes visible cards by instance id", () => {
    const features = buildBotFeatures(snapshotWithActions([]), botPlayerId);

    assert.equal(
      features.cards.byInstanceId.get("bot-leader")?.instanceId,
      "bot-leader",
    );
  });

  test("computes legal leader attack pressure", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfLeader: { currentPower: 6_000 },
          opponentLeader: { currentPower: 5_000 },
          opponentHandCount: 1,
        },
      ),
      botPlayerId,
    );

    assert.deepEqual(features.combat.leaderAttackPressure[0], {
      attackerInstanceId: "bot-leader",
      targetInstanceId: "opponent-leader",
      cardsToStop: 1,
    });
  });

  test("extracts resource, attacker, and blocker features", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfHand: [
            {
              instanceId: "hand-card" as InstanceId,
              cardId: "OP01-003" as CardId,
            },
          ],
          selfCharacters: [
            {
              instanceId: "bot-blocker" as InstanceId,
              cardId: "OP01-004" as CardId,
              keywords: ["blocker"],
            },
          ],
          selfCostArea: [
            {
              instanceId: "active-don" as InstanceId,
              cardId: "DON!!" as CardId,
              state: "active",
            },
            {
              instanceId: "rested-don" as InstanceId,
              cardId: "DON!!" as CardId,
              state: "rested",
            },
          ],
        },
      ),
      botPlayerId,
    );

    assert.equal(features.self.handCount, 1);
    assert.equal(features.self.activeDonCount, 1);
    assert.equal(features.self.characterCount, 1);
    assert.equal(features.self.attackerCount, 1);
    assert.equal(features.self.blockerCount, 1);
  });

  test("extracts opponent board pressure features", () => {
    const features = buildBotFeatures(
      snapshotWithActions([], {
        opponentCharacters: [
          {
            instanceId: "opponent-blocker" as InstanceId,
            cardId: "OP01-010" as CardId,
            currentPower: 4_000,
            printedCost: 4,
            keywords: ["blocker"],
          },
          {
            instanceId: "opponent-rested-threat" as InstanceId,
            cardId: "OP01-011" as CardId,
            currentPower: 8_000,
            printedCost: 7,
            state: "rested",
          },
        ],
      }),
      botPlayerId,
    );

    assert.equal(features.opponent.characterCount, 2);
    assert.equal(features.opponent.blockerCount, 1);
    assert.equal(features.opponent.restedCharacterCount, 1);
    assert.equal(features.opponent.highestCharacterValue, 15_000);
  });

  test("marks DON attachment as not useful when target has no remaining attack", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 1,
            type: "attachDon",
            label: "Attach DON to rested character",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "rested-character" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "rested-character" as InstanceId,
              cardId: "OP01-005" as CardId,
              currentPower: 5_000,
              state: "rested",
            },
          ],
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
            },
          ],
        },
      ),
      botPlayerId,
    );

    assert.equal(
      features.actions.byIndex.get(1)?.hasRemainingAttackAfterAttachment,
      false,
    );
  });

  test("marks single DON attachment as not useful when it cannot make a remaining attack live", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 1,
            type: "attachDon",
            label: "Attach DON to low-power character",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "low-power-character" as InstanceId,
            },
          },
          {
            index: 2,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "low-power-character" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "low-power-character" as InstanceId,
              cardId: "OP01-005" as CardId,
              currentPower: 3_000,
            },
          ],
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
            },
          ],
          opponentLeader: { currentPower: 6_000 },
        },
      ),
      botPlayerId,
    );

    assert.equal(
      features.actions.byIndex.get(1)?.hasUsefulDonAttachment,
      false,
    );
    assert.equal(features.actions.hasUsefulDonAttachment, false);
  });

  test("marks DON attachment as useful when available DON can make a remaining attack live", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 1,
            type: "attachDon",
            label: "Attach first DON to low-power character",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "low-power-character" as InstanceId,
            },
          },
          {
            index: 2,
            type: "attachDon",
            label: "Attach second DON to low-power character",
            attachment: {
              donInstanceId: "don-2" as InstanceId,
              targetInstanceId: "low-power-character" as InstanceId,
            },
          },
          {
            index: 3,
            type: "attachDon",
            label: "Attach third DON to low-power character",
            attachment: {
              donInstanceId: "don-3" as InstanceId,
              targetInstanceId: "low-power-character" as InstanceId,
            },
          },
          {
            index: 4,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "low-power-character" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "low-power-character" as InstanceId,
              cardId: "OP01-005" as CardId,
              currentPower: 3_000,
            },
          ],
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
            },
            {
              instanceId: "don-2" as InstanceId,
              cardId: "DON!!" as CardId,
            },
            {
              instanceId: "don-3" as InstanceId,
              cardId: "DON!!" as CardId,
            },
          ],
          opponentLeader: { currentPower: 6_000 },
        },
      ),
      botPlayerId,
    );

    assert.equal(features.actions.byIndex.get(1)?.hasUsefulDonAttachment, true);
    assert.equal(features.actions.hasUsefulDonAttachment, true);
  });
});
