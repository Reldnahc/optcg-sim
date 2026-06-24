import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";
import { BoardLayout } from "./BoardLayout.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (instanceId: string, name = instanceId): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const hiddenLifeCards = (count: number, prefix: string): ClientCardModel[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId: `${prefix}-${String(index)}` as InstanceId,
    cardId: "hidden" as CardId,
    name: "Hidden card",
    category: "hidden",
    attachedDonCount: 0,
    attachedDonCards: [],
  }));

const board = (): BoardViewModel => ({
  playerId: "p1" as PlayerId,
  selfLabel: "Player",
  opponentLabel: "Opponent",
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  self: {
    leader: card("self-leader", "Self Leader"),
    hand: [card("hand-1", "Playable Card")],
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: hiddenLifeCards(5, "hidden-life-self"),
  },
  opponent: {
    leader: card("opponent-leader", "Opponent Leader"),
    handCount: 5,
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: hiddenLifeCards(5, "hidden-life-opponent"),
  },
  actionsByCardInstanceId: {},
});

const renderBoard = (
  layout: BoardViewModel,
  props: Partial<Parameters<typeof BoardLayout>[0]> = {},
): string =>
  renderToStaticMarkup(
    createElement(BoardLayout, {
      board: layout,
      cardActions: () => [],
      onCardClick: () => undefined,
      onCardAction: () => undefined,
      onViewCollection: () => undefined,
      onBackgroundClick: () => undefined,
      ...props,
    }),
  );

describe("board layout rendering", () => {
  test("board layout passes active card ids to card tiles", () => {
    const layout = board();
    layout.self.characters = [card("active-character", "Resolving Character")];
    layout.activeCardInstanceIds = ["active-character"];

    const markup = renderBoard(layout);

    assert.match(markup, /class="[^"]*card-tile[^"]*is-active/u);
  });

  test("board layout renders prominent pending decision prompt above hand", async () => {
    const markup = renderBoard(board(), {
      decisionPrompt: "Trash 1 card from hand",
    });
    const appShellStyles = await readFile(
      join(sourceDirectory, "styles", "app-shell.css"),
      "utf8",
    );

    assert.match(markup, /class="decision-status-prompt"/u);
    assert.equal(markup.includes("Trash 1 card from hand"), true);
    assert.match(
      appShellStyles,
      /\.decision-status-prompt\s*\{[\s\S]*bottom:\s*calc\([\s\S]*var\(--card-height\)[\s\S]*clamp\(24px,\s*calc\(var\(--card-height\) \/ 4\.75\),\s*44px\)[\s\S]*\);[\s\S]*font-size:\s*clamp\(28px,\s*calc\(var\(--card-height\) \/ 4\.5\),\s*56px\);/u,
    );
  });

  test("selected DON attachment is rendered as a selected-card menu action", () => {
    const attachActions: readonly ClientActionModel[] = [
      { index: -1, type: "attachDon", label: "Attach selected DON!!" },
    ];

    const markup = renderBoard(board(), {
      selectedCardInstanceId: "self-leader",
      selectedDonInstanceIds: ["don-1"],
      cardActions: (instanceId: string) =>
        instanceId === "self-leader" ? attachActions : [],
    });

    assert.match(markup, /class="[^"]*card-action-popover/u);
    assert.equal(markup.includes("Attach selected DON!!"), true);
  });

  test("pending zone-click decision candidates render on board cards", () => {
    const layout = board();
    layout.opponent.characters = [card("target-1", "Target")];

    const markup = renderBoard(layout, {
      pendingChoiceInstanceIds: ["target-1"],
      decisionSelectedInstanceIds: ["target-1"],
    });

    assert.match(markup, /class="[^"]*is-pending-choice/u);
    assert.match(markup, /class="[^"]*is-selected/u);
  });

  test("pending zone-click decision candidates render on opponent DON", () => {
    const layout = board();
    layout.opponent.costArea = [card("opponent-don-1", "DON!!")];

    const markup = renderBoard(layout, {
      pendingChoiceInstanceIds: ["opponent-don-1"],
      decisionSelectedInstanceIds: ["opponent-don-1"],
    });

    assert.match(markup, /class="[^"]*is-pending-choice/u);
    assert.match(markup, /class="[^"]*is-selected/u);
  });

  test("battle arrow renders from public battle state", () => {
    const layout = board();
    layout.battleArrow = {
      attackerInstanceId: "self-leader",
      attackPower: 7000,
      defendPower: 5000,
      targetInstanceId: "opponent-leader",
    };

    const markup = renderBoard(layout);

    assert.match(markup, /class="[^"]*battle-arrow-overlay/u);
    assert.match(markup, /data-battle-attacker="self-leader"/u);
    assert.match(markup, /data-battle-power="7000 vs 5000"/u);
    assert.match(markup, /data-battle-target="opponent-leader"/u);
  });

  test("life zones render hidden card backs from life count", () => {
    const layout = board();
    layout.self.lifeCount = 4;
    layout.opponent.lifeCount = 5;
    layout.self.lifeCards = hiddenLifeCards(4, "hidden-life-self");
    layout.opponent.lifeCards = hiddenLifeCards(5, "hidden-life-opponent");

    const markup = renderBoard(layout);

    assert.equal(markup.includes("Life 4"), false);
    assert.equal(markup.includes("Life 5"), false);
    assert.match(markup, /zone-cards-life/u);
    assert.match(markup, /card-back/u);
    assert.equal(markup.includes(">Hidden card<"), false);
    assert.equal((markup.match(/hidden-life-self-/gu) ?? []).length, 4);
    assert.equal((markup.match(/hidden-life-opponent-/gu) ?? []).length, 5);
    [
      /--life-card-y-offset:30%;z-index:4;bottom:var\(--life-card-y-offset\)[\s\S]*hidden-life-self-0/u,
      /--life-card-y-offset:0%;z-index:1;bottom:var\(--life-card-y-offset\)[\s\S]*hidden-life-self-3/u,
      /--life-card-y-offset:40%;z-index:5;top:var\(--life-card-y-offset\)[\s\S]*hidden-life-opponent-0/u,
      /--life-card-y-offset:0%;z-index:1;top:var\(--life-card-y-offset\)[\s\S]*hidden-life-opponent-4/u,
    ].forEach((pattern) => {
      assert.match(markup, pattern);
    });
  });

  test("life zones keep the same vertical spacing above five life", () => {
    const layout = board();
    layout.self.lifeCount = 10;
    layout.self.lifeCards = hiddenLifeCards(10, "hidden-life-self");

    const markup = renderBoard(layout);

    assert.equal((markup.match(/hidden-life-self-/gu) ?? []).length, 10);
    [
      /--life-card-y-offset:90%;z-index:10;bottom:var\(--life-card-y-offset\)[\s\S]*hidden-life-self-0/u,
      /--life-card-y-offset:40%;z-index:5;bottom:var\(--life-card-y-offset\)[\s\S]*hidden-life-self-5/u,
      /--life-card-y-offset:0%;z-index:1;bottom:var\(--life-card-y-offset\)[\s\S]*hidden-life-self-9/u,
    ].forEach((pattern) => {
      assert.match(markup, pattern);
    });
    assert.equal(markup.includes("--life-card-x-offset"), false);
  });
});
