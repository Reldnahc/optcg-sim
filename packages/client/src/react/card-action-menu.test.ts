import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import { BoardLayout } from "./BoardLayout.js";
import { ControlRail } from "./ControlRail.js";
import type {
  BoardViewModel,
  ClientActionModel,
  ClientCardModel,
} from "../view-model.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (instanceId: string, name = instanceId): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const board = (): BoardViewModel => ({
  playerId: "p1" as PlayerId,
  self: {
    leader: card("self-leader", "Self Leader"),
    hand: [card("hand-1", "Playable Card")],
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
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
  },
  actionsByCardInstanceId: {},
});

describe("card action menu", () => {
  test("renders selected-card actions on the selected card instead of the control rail", () => {
    const playActions: readonly ClientActionModel[] = [
      { index: 7, type: "playCard", label: "Play" },
    ];
    const railMarkup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
      }),
    );
    assert.equal(railMarkup.includes("Selected card"), false);

    const boardMarkup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: board(),
        selectedCardInstanceId: "hand-1",
        cardActions: (instanceId: string) =>
          instanceId === "hand-1" ? playActions : [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(boardMarkup, /class="[^"]*card-action-popover/u);
    assert.equal(boardMarkup.includes("Play"), true);
  });

  test("card action popovers are not clipped by immediate card containers", async () => {
    const [zoneStyles, appShellStyles] = await Promise.all([
      readFile(join(sourceDirectory, "styles", "zone.css"), "utf8"),
      readFile(join(sourceDirectory, "styles", "app-shell.css"), "utf8"),
    ]);

    for (const selector of [".zone", ".zone-cards"]) {
      assert.equal(
        new RegExp(
          `${selector.replace(".", "\\.")}\\s*\\{[^}]*overflow:\\s*hidden`,
          "u",
        ).test(zoneStyles),
        false,
        `${selector} must not clip card action popovers.`,
      );
    }

    for (const selector of [".hand-row", ".hand-cards"]) {
      assert.equal(
        new RegExp(
          `${selector.replace(".", "\\.")}\\s*\\{[^}]*overflow:\\s*hidden`,
          "u",
        ).test(appShellStyles),
        false,
        `${selector} must not clip card action popovers.`,
      );
    }
  });

  test("match app keeps card actions available while a decision modal is open", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.equal(
      source.includes("decisionModal === undefined ? client.cardActions"),
      false,
    );
    assert.equal(source.includes("cardActions={client.cardActions}"), true);
  });

  test("attached DON cards render under their target card", () => {
    const target = {
      ...card("self-leader", "Self Leader"),
      attachedDonCount: 2,
      attachedDonCards: [card("don-1", "DON!! 1"), card("don-2", "DON!! 2")],
    };
    const layout = board();
    layout.self.leader = target;

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        selectedCardInstanceId: undefined,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*attached-don-stack/u);
    assert.equal(markup.includes("DON!! 1"), true);
    assert.equal(markup.includes("DON!! 2"), true);
  });

  test("selected cost-area DON cards use the selected card styling", () => {
    const layout = board();
    layout.self.costArea = [card("don-1", "DON!!")];

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        selectedDonInstanceIds: ["don-1"],
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*card-tile[^"]*is-selected/u);
  });

  test("selected DON attachment is rendered as a selected-card menu action", () => {
    const layout = board();
    const attachActions: readonly ClientActionModel[] = [
      { index: -1, type: "attachDon", label: "Attach selected DON!!" },
    ];

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        selectedCardInstanceId: "self-leader",
        selectedDonInstanceIds: ["don-1"],
        cardActions: (instanceId: string) =>
          instanceId === "self-leader" ? attachActions : [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*card-action-popover/u);
    assert.equal(markup.includes("Attach selected DON!!"), true);
  });
});
