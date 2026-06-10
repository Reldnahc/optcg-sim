import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import { BoardLayout } from "./BoardLayout.js";
import { CardTile } from "./CardTile.js";
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

describe("card action menu", () => {
  test("renders active-turn feedback on the matching player summary", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        selfLabel: "Player",
        opponentLabel: "Opponent",
        selfIsTurnPlayer: true,
        opponentIsTurnPlayer: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
      }),
    );

    assert.equal(
      markup.includes("summary-panel player-summary is-turn-player"),
      true,
    );
    assert.equal(
      markup.includes("summary-panel opponent-summary is-turn-player"),
      false,
    );
  });

  test("renders player-level restriction badges beside the leader zones", () => {
    const layout = board();
    layout.selfRestrictions = ["no-character-don-refresh"];
    layout.opponentRestrictions = ["no-event-don-refresh"];

    const boardMarkup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(boardMarkup, /class="[^"]*player-restriction-area/u);
    assert.match(boardMarkup, /class="[^"]*opponent-restriction-area/u);
    assert.match(boardMarkup, /class="[^"]*player-restriction-badges/u);
    assert.match(boardMarkup, /class="[^"]*player-restriction-badge/u);
    assert.equal(boardMarkup.includes("no character DON refresh"), true);
    assert.equal(boardMarkup.includes("no Event DON refresh"), true);
  });

  test("renders dynamic player-level play restriction badge labels", () => {
    const layout = board();
    layout.selfRestrictions = ["no-playing-characters-cost-7-or-more"];

    const boardMarkup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.equal(
      boardMarkup.includes("no playing characters cost 7 or more"),
      true,
    );
  });

  test("player-level restriction badges are not buried in player summaries", async () => {
    const controlRailSource = await readFile(
      join(sourceDirectory, "ControlRail.tsx"),
      "utf8",
    );

    assert.equal(
      controlRailSource.includes("player-restriction-badges"),
      false,
    );
    assert.equal(controlRailSource.includes("PlayerRestrictionBadges"), false);
  });

  test("active-turn player summary uses outline feedback without a dot indicator", async () => {
    const controlsCss = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.equal(
      controlsCss.includes(".summary-panel.is-turn-player::after"),
      false,
    );
    assert.equal(controlsCss.includes(".summary-panel.is-turn-player"), true);
    assert.equal(controlsCss.includes("border-color: #59ff8f"), true);
  });

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

  test("match app session removes concede from global action menu", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-match-app-session.ts"),
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

  test("concede confirmation unarms after a short timeout", async () => {
    const source = await readFile(
      join(sourceDirectory, "use-concede-confirmation.ts"),
      "utf8",
    );

    assert.match(source, /const concedeConfirmationTimeoutMs = 3000;/u);
    assert.match(source, /globalThis\.setTimeout/u);
    assert.match(source, /setConcedeConfirming\(false\);/u);
    assert.match(source, /globalThis\.clearTimeout\(timeoutId\);/u);
  });

  test("control rail omits match fact text table", async () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
      }),
    );
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    for (const text of ["Lobby", "Match", "Seat", "Status", "Phase"]) {
      assert.equal(markup.includes(text), false);
    }
    assert.equal(markup.includes("match-facts"), false);
    assert.equal(styles.includes(".match-facts"), false);
  });

  test("control rail renders preview control in the top-left controls panel slot", async () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        previewControl: createElement("button", {
          className: "card-preview-minimized-button",
          type: "button",
        }),
      }),
    );
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(markup, /control-tool-strip/u);
    assert.match(markup, /control-preview-slot/u);
    assert.match(markup, /card-preview-minimized-button/u);
    assert.match(styles, /\.controls-panel\s*\{[^}]*position:\s*relative;/u);
    assert.match(
      styles,
      /\.control-tool-strip\s*\{[^}]*position:\s*absolute;/u,
    );
    assert.match(styles, /\.control-tool-strip\s*\{[^}]*top:\s*10px;/u);
    assert.match(styles, /\.control-tool-strip\s*\{[^}]*left:\s*10px;/u);
  });

  test("control rail orders icon controls before global actions", () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
        concedeDisabled: false,
        onConcede: () => undefined,
        previewControl: createElement("button", {
          "aria-label": "Preview",
          type: "button",
        }),
        actionLogControl: createElement("button", {
          "aria-label": "Log",
          type: "button",
        }),
        settingsControl: createElement("button", {
          "aria-label": "Settings",
          type: "button",
        }),
      }),
    );

    const positions = [
      'aria-label="Preview"',
      'aria-label="Log"',
      'aria-label="Settings"',
      'aria-label="Concede"',
      'aria-label="New match"',
    ].map((needle) => markup.indexOf(needle));

    assert.deepEqual(
      positions.map((position) => position >= 0),
      [true, true, true, true, true],
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
  });

  test("control rail hides empty global action chrome", () => {
    const emptyMarkup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
      }),
    );

    assert.equal(emptyMarkup.includes("Global actions"), false);
    assert.equal(emptyMarkup.includes("No actions"), false);

    const actionMarkup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [{ index: 12, type: "endMainPhase", label: "End turn" }],
        disabled: false,
        onAction: () => undefined,
        onNewMatch: () => undefined,
      }),
    );

    assert.equal(actionMarkup.includes("Global actions"), true);
    assert.equal(actionMarkup.includes("End turn"), true);
  });

  test("concede icon uses dedicated red hover styles", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.concede-button:hover,\s*\.concede-button\.is-confirming\s*\{[^}]*background:\s*rgba\(177,\s*45,\s*54,\s*0\.82\);/u,
    );
    assert.match(
      styles,
      /\.concede-button:disabled\s*\{[^}]*opacity:\s*0\.45;/u,
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

  test("renders positive and negative cost deltas on modified cards", () => {
    const layout = board();
    layout.self.leader = {
      ...layout.self.leader,
      printedCost: 5,
      currentCost: 4,
      costDelta: -1,
    };
    layout.self.characters = [
      {
        ...card("self-character", "Increased Cost Character"),
        printedCost: 3,
        currentCost: 5,
        costDelta: 2,
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

    assert.match(markup, /class="[^"]*cost-delta-positive/u);
    assert.match(markup, /class="[^"]*cost-delta-negative/u);
    assert.equal(markup.includes("+2"), true);
    assert.equal(markup.includes("-1"), true);
  });

  test("renders field card keyword labels with the shared power and cost badge treatment", async () => {
    const layout = board();
    layout.self.leader = {
      ...layout.self.leader,
      keywords: ["blocker"],
    };
    layout.self.characters = [
      {
        ...card("self-character", "Keyword Character"),
        keywords: ["doubleAttack", "rush"],
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
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(markup, /class="[^"]*keyword-badges/u);
    assert.equal(markup.includes("blocker"), true);
    assert.equal(markup.includes("double attack"), true);
    assert.equal(markup.includes("rush"), true);
    assert.match(
      styles,
      /\.power-delta,\s*\.cost-delta,\s*\.keyword-badge\s*\{[^}]*border-radius:\s*3px;[^}]*padding:\s*2px 4px;[^}]*background:\s*rgba\(12,\s*12,\s*12,\s*0\.78\);[^}]*font-size:\s*12px;[^}]*font-weight:\s*800;/u,
    );
    assert.match(
      styles,
      /\.keyword-badge-positive\s*\{[^}]*color:\s*#42e67c;/u,
    );
  });

  test("renders field card restriction labels with the shared badge treatment", () => {
    const layout = board();
    layout.self.characters = [
      {
        ...card("self-character", "Restricted Character"),
        restrictions: ["cannot-attack", "cannot-become-active", "no-blocker"],
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

    assert.match(markup, /class="[^"]*keyword-badges/u);
    assert.match(markup, /class="[^"]*keyword-badge-negative/u);
    assert.match(markup, /class="[^"]*keyword-badge-positive/u);
    assert.equal(markup.includes("can&#x27;t attack"), true);
    assert.equal(markup.includes("no refresh"), true);
    assert.equal(markup.includes("No Blocker"), true);
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

  test("cost delta badge sits near the top-left cost area", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(styles, /\.cost-delta\s*\{[^}]*left:\s*2px;/u);
    assert.match(styles, /\.cost-delta\s*\{[^}]*top:\s*12px;/u);
    assert.equal(/\.cost-delta\s*\{[^}]*right:\s*2px;/u.test(styles), false);
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

  test("card styling removes the default border while selected feedback hugs the face", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(styles, /\.card-face\s*\{[^}]*border:\s*0;/u);
    assert.match(
      styles,
      /\.card-tile\.is-selected \.card-face\s*\{[^}]*--card-selected-glow:\s*inset 0 0 0 3px #ffdc62;/u,
    );
    assert.equal(/\.card-face\s*\{[^}]*border:\s*[12]px/u.test(styles), false);
  });

  test("card styling includes hover feedback and a separate active card state", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.card-tile:hover:not\(:disabled\) \.card-face\s*\{[^}]*--card-hover-glow:\s*inset 0 0 0 2px rgba\(255,\s*255,\s*255,\s*0\.95\),\s*0 0 10px\s+rgba\(255,\s*255,\s*255,\s*0\.56\);/u,
    );
    assert.match(
      styles,
      /\.card-tile\.is-active \.card-face\s*\{[^}]*--card-active-glow:\s*inset 0 0 0 3px rgba\(89,\s*255,\s*143,\s*0\.98\),\s*0 0 12px\s+rgba\(89,\s*255,\s*143,\s*0\.56\);/u,
    );
  });

  test("pending choice cards keep hard emphasis inside the card face", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.card-tile\.is-pending-choice \.card-face\s*\{[^}]*--card-pending-glow:\s*inset 0 0 0 3px rgba\(68,\s*216,\s*255,\s*0\.98\),\s*0 0 12px rgba\(68,\s*216,\s*255,\s*0\.56\);/u,
    );
    assert.equal(/\.card-tile\.is-pending-choice::after/u.test(styles), false);
  });

  test("active card state is rendered independently from selection", () => {
    const markup = renderToStaticMarkup(
      createElement(CardTile, {
        card: card("active-card", "Resolving Card"),
        active: true,
      }),
    );

    assert.match(markup, /class="[^"]*card-tile[^"]*is-active/u);
    assert.equal(markup.includes("is-selected"), false);
  });

  test("first-turn attack restriction uses a separate dimming card state", async () => {
    const markup = renderToStaticMarkup(
      createElement(CardTile, {
        card: {
          ...card("fresh-character", "Fresh Character"),
          freshlyPlayedAttackRestricted: true,
        },
      }),
    );
    const styles = await readFile(
      join(sourceDirectory, "styles", "card.css"),
      "utf8",
    );

    assert.match(
      markup,
      /class="[^"]*card-tile[^"]*is-freshly-played-attack-restricted/u,
    );
    assert.match(
      styles,
      /\.card-tile\.is-freshly-played-attack-restricted::before\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.42\);/u,
    );
    assert.match(
      styles,
      /\.card-tile\.is-freshly-played-attack-restricted::before\s*\{[^}]*inset:\s*0;/u,
    );
    assert.match(styles, /\.card-tile\s*\{[^}]*border-radius:\s*6px;/u);
    assert.match(styles, /\.card-face\s*\{[^}]*border-radius:\s*6px;/u);
    assert.match(
      styles,
      /\.card-tile\.is-freshly-played-attack-restricted::before\s*\{[^}]*border-radius:\s*6px;/u,
      "fresh restriction dimming must use the rounder visible card mask without clipping outer highlight rings.",
    );
    assert.equal(
      /\.card-tile\.is-freshly-played-attack-restricted \.card-face\s*\{[^}]*filter:/u.test(
        styles,
      ),
      false,
      "fresh restriction dimming must not filter the card face because that also dampens selection and highlight effects.",
    );
    assert.equal(markup.includes("is-active"), false);
  });

  test("first-turn attack restriction can render together with rested state", () => {
    const markup = renderToStaticMarkup(
      createElement(CardTile, {
        card: {
          ...card("fresh-rested-character", "Fresh Rested Character"),
          freshlyPlayedAttackRestricted: true,
          state: "rested",
        },
      }),
    );

    assert.match(markup, /class="[^"]*card-tile[^"]*is-rested/u);
    assert.match(
      markup,
      /class="[^"]*card-tile[^"]*is-freshly-played-attack-restricted/u,
    );
  });

  test("board layout passes active card ids to card tiles", () => {
    const layout = board();
    layout.self.characters = [card("active-character", "Resolving Character")];
    layout.activeCardInstanceIds = ["active-character"];

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

    assert.match(markup, /class="[^"]*card-tile[^"]*is-active/u);
  });

  test("board layout renders prominent pending decision prompt above hand", () => {
    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: board(),
        decisionPrompt: "Trash 1 card from hand",
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /class="decision-status-prompt"/u);
    assert.equal(markup.includes("Trash 1 card from hand"), true);
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

  test("pending zone-click decision candidates render on opponent DON", () => {
    const layout = board();
    layout.opponent.costArea = [card("opponent-don-1", "DON!!")];

    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        pendingChoiceInstanceIds: ["opponent-don-1"],
        decisionSelectedInstanceIds: ["opponent-don-1"],
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

  test("life zones render hidden card backs from life count", () => {
    const layout = board();
    layout.self.lifeCount = 4;
    layout.opponent.lifeCount = 5;
    layout.self.lifeCards = hiddenLifeCards(4, "hidden-life-self");
    layout.opponent.lifeCards = hiddenLifeCards(5, "hidden-life-opponent");

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

    assert.equal(markup.includes("Life 4"), false);
    assert.equal(markup.includes("Life 5"), false);
    assert.match(markup, /zone-cards-life/u);
    assert.match(markup, /card-back/u);
    assert.equal(markup.includes(">Hidden card<"), false);
    assert.equal((markup.match(/hidden-life-self-/gu) ?? []).length, 4);
    assert.equal((markup.match(/hidden-life-opponent-/gu) ?? []).length, 5);
    assert.match(markup, /--life-card-y-offset:0%;z-index:4/u);
    assert.match(markup, /--life-card-y-offset:36%;z-index:1/u);
  });

  test("life zones compact vertically per count without shifting sideways above five life", () => {
    const layout = board();
    layout.self.lifeCount = 10;
    layout.self.lifeCards = hiddenLifeCards(10, "hidden-life-self");

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

    assert.equal((markup.match(/hidden-life-self-/gu) ?? []).length, 10);
    assert.match(markup, /--life-card-y-offset:0%;z-index:10/u);
    assert.match(markup, /--life-card-y-offset:30%;z-index:5/u);
    assert.match(markup, /--life-card-y-offset:54%;z-index:1/u);
    assert.equal(markup.includes("--life-card-x-offset"), false);

    layout.self.lifeCount = 6;
    layout.self.lifeCards = hiddenLifeCards(6, "hidden-life-self");
    const sixLifeMarkup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: layout,
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );
    assert.match(sixLifeMarkup, /--life-card-y-offset:50%;z-index:1/u);
    assert.equal(sixLifeMarkup.includes("--life-card-x-offset"), false);
  });
});
