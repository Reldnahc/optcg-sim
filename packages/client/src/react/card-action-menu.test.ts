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
    assert.equal(railMarkup.includes("Concede"), true);

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

    for (const selector of [".zone", ".zone-cards", ".zone-cards-slots"]) {
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

  test("match app removes concede from global action menu", async () => {
    const source = await readFile(
      join(sourceDirectory, "MatchApp.tsx"),
      "utf8",
    );

    assert.equal(source.includes('action.type !== "concede"'), true);
  });

  test("control rail shows confirm concede label when pending confirmation", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        concedeDisabled: false,
        concedeConfirming: true,
        onConcede: () => undefined,
      }),
    );

    assert.equal(markup.includes("Confirm concede"), true);
    assert.match(markup, /class="[^"]*concede-button[^"]*is-confirming/u);
  });

  test("concede button uses dedicated red styles", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(styles, /\.concede-button\s*\{[^}]*background:\s*#8b232b;/u);
    assert.match(
      styles,
      /\.concede-button\.is-confirming\s*\{[^}]*background:\s*#b12d36;/u,
    );
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

  test("renders positive and negative power deltas on modified cards", () => {
    const layout = board();
    layout.self.leader = {
      ...layout.self.leader,
      printedPower: 5000,
      currentPower: 7000,
      powerDelta: 2000,
    };
    layout.self.characters = [
      {
        ...card("self-character", "Reduced Character"),
        printedPower: 5000,
        currentPower: 4000,
        powerDelta: -1000,
      },
    ];

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

    assert.match(markup, /class="[^"]*power-delta-positive/u);
    assert.match(markup, /class="[^"]*power-delta-negative/u);
    assert.equal(markup.includes("+2000"), true);
    assert.equal(markup.includes("-1000"), true);
  });

  test("power delta badge sits near the top-right power area", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(styles, /\.power-delta\s*\{[^}]*right:\s*2px;/u);
    assert.match(styles, /\.power-delta\s*\{[^}]*top:\s*12px;/u);
    assert.equal(/\.power-delta\s*\{[^}]*left:\s*2px;/u.test(styles), false);
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

  test("pending zone-click decision candidates render on board cards", () => {
    const layout = board();
    layout.opponent.characters = [card("target-1", "Target")];

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        pendingChoiceInstanceIds: ["target-1"],
        decisionSelectedInstanceIds: ["target-1"],
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*is-pending-choice/u);
    assert.match(markup, /class="[^"]*is-selected/u);
  });

  test("battle arrow renders from public battle state", () => {
    const layout = board();
    layout.battleArrow = {
      attackerInstanceId: "self-leader",
      targetInstanceId: "opponent-leader",
    };

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="[^"]*battle-arrow-overlay/u);
    assert.match(markup, /data-battle-attacker="self-leader"/u);
    assert.match(markup, /data-battle-target="opponent-leader"/u);
  });
});
