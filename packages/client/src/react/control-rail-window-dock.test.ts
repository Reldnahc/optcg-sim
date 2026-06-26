import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import type { CardId, InstanceId, PlayerId } from "@optcg/types";

import type { BoardViewModel, ClientCardModel } from "../view-model.js";
import { BoardLayout } from "./BoardLayout.js";
import { ControlRail } from "./ControlRail.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

const card = (instanceId: string): ClientCardModel => ({
  instanceId: instanceId as InstanceId,
  cardId: `${instanceId}-card` as CardId,
  name: instanceId,
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const board = (): BoardViewModel => ({
  playerId: "p1" as PlayerId,
  selfLabel: "Alice",
  opponentLabel: "Bob",
  selfIsTurnPlayer: true,
  opponentIsTurnPlayer: false,
  selfConnectionStatus: "connected",
  opponentConnectionStatus: "disconnected",
  selfTimer: { game: "12:34", isRunning: true },
  opponentTimer: { game: "10:00", isRunning: false, disconnect: "0:30" },
  self: {
    leader: card("self-leader"),
    hand: [],
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: [],
  },
  opponent: {
    leader: card("opponent-leader"),
    handCount: 5,
    characters: [],
    costArea: [],
    trash: [],
    deckCount: 40,
    donDeckCount: 10,
    lifeCount: 5,
    lifeCards: [],
  },
  actionsByCardInstanceId: {},
});

describe("control rail window dock", () => {
  test("playmat summaries render connection status directly beside player names", () => {
    const markup = renderToStaticMarkup(
      createElement(BoardLayout, {
        board: board(),
        cardActions: () => [],
        onCardClick: () => undefined,
        onCardAction: () => undefined,
        onViewCollection: () => undefined,
        onBackgroundClick: () => undefined,
      }),
    );

    assert.match(markup, /playmat-summary opponent-summary/u);
    assert.match(markup, /playmat-summary player-summary/u);
    assert.match(
      markup,
      /<h2><span class="player-name">Bob<\/span><span class="connection-status is-disconnected"/u,
    );
    assert.match(
      markup,
      /<h2><span class="player-name">Alice<\/span><span class="connection-status is-connected"/u,
    );
    assert.match(markup, /12:34/u);
    assert.match(markup, /0:30/u);
  });

  test("control rail no longer owns player summary panels", async () => {
    const controlRailSource = await readFile(
      join(sourceDirectory, "ControlRail.tsx"),
      "utf8",
    );

    assert.equal(controlRailSource.includes("summary-panel"), false);
    assert.equal(controlRailSource.includes("PlayerSummaryLabel"), false);
  });

  test("connection indicator uses a dedicated connected color", async () => {
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(
      styles,
      /\.connection-status\s*\{[^}]*width:\s*calc\(var\(--control-title-font-size\) \* 0\.44\);[^}]*border:\s*max\(1px,\s*calc\(var\(--card-outline-thin\) \* 0\.45\)\) solid\s*rgba\(0,\s*0,\s*0,\s*0\.72\);[^}]*transform:\s*translateY\(0\.04em\);/u,
    );
    assert.match(
      styles,
      /\.connection-status\.is-connected\s*\{[^}]*background:\s*#28f27a;[^}]*box-shadow:\s*0 0 0 calc\(var\(--card-outline-thin\) \* 0\.35\) rgba\(40,\s*242,\s*122,\s*0\.34\),\s*inset 0 0 0 1px rgba\(255,\s*255,\s*255,\s*0\.28\);/u,
    );
  });

  test("renders docked windows as tabbed content inside the control rail", async () => {
    const props = {
      errors: [],
      globalActions: [],
      disabled: false,
      onAction: () => undefined,
      onHome: () => undefined,
      dockTabs: [
        {
          id: "action-log",
          title: "Log",
          renderContent: () => createElement("p", null, "docked log body"),
        },
        {
          id: "settings",
          title: "Settings",
          renderContent: () => createElement("p", null, "docked settings body"),
        },
      ],
      activeDockTabId: "settings",
      onDockTabChange: () => undefined,
      onDockTabClose: () => undefined,
      onDockTabDragOut: () => undefined,
      onDockGroupDragOut: () => undefined,
    } satisfies ComponentProps<typeof ControlRail> & {
      dockTabs: readonly {
        id: string;
        title: string;
        renderContent: () => React.ReactNode;
      }[];
      activeDockTabId: string;
      onDockTabChange: (id: string) => void;
      onDockTabClose: (id: string) => void;
      onDockTabDragOut: (id: string) => void;
      onDockGroupDragOut: () => void;
    };

    const markup = renderToStaticMarkup(createElement(ControlRail, props));
    const styles = await readFile(
      join(sourceDirectory, "styles", "controls.css"),
      "utf8",
    );

    assert.match(markup, /control-window-dock has-docked-window/u);
    assert.doesNotMatch(markup, /control-rail-resize-handle/u);
    assert.doesNotMatch(markup, /Resize controls/u);
    assert.doesNotMatch(markup, /--control-window-dock-height/u);
    assert.doesNotMatch(markup, /aria-label="Resize dock"/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-label="Pop out docked window group"/u);
    assert.match(markup, /control-dock-window-grab-nub/u);
    assert.match(markup, />Log<\/button>/u);
    assert.match(markup, />Settings<\/button>/u);
    assert.match(markup, /docked settings body/u);
    assert.doesNotMatch(markup, /docked log body/u);
    assert.match(
      styles,
      /\.control-window-dock\.has-docked-window\s*\{[^}]*pointer-events:\s*auto;/u,
    );
    assert.match(styles, /\.control-dock-window\s*\{[^}]*width:\s*100%;/u);
    assert.match(styles, /\.control-dock-window\s*\{[^}]*height:\s*100%;/u);
    assert.match(
      styles,
      /\.control-window-dock\s*>\s*span\s*\{[^}]*text-transform:\s*uppercase;/u,
    );
    assert.doesNotMatch(
      styles,
      /\.control-window-dock\s+span\s*\{[^}]*text-transform:\s*uppercase;/u,
    );
    assert.doesNotMatch(styles, /\.control-window-dock-resize-handle\s*\{/u);
    assert.doesNotMatch(styles, /\.control-rail-resize-handle\s*\{/u);
    assert.doesNotMatch(
      styles,
      /\.controls-panel\s*\{[^}]*border:\s*var\(--card-outline-thin\)\s+solid\s+var\(--match-border\);/u,
    );
    assert.match(styles, /\.control-dock-window-grab-nub\s*\{/u);
  });

  test("renders a single docked window as one draggable tab", async () => {
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onHome: () => undefined,
        dockTabs: [
          {
            id: "action-log",
            title: "Log",
            renderContent: () => createElement("p", null, "single docked log"),
          },
        ],
        activeDockTabId: "action-log",
        onDockTabChange: () => undefined,
        onDockTabClose: () => undefined,
        onDockTabDragOut: () => undefined,
      }),
    );
    const controlRailSource = await readFile(
      join(sourceDirectory, "ControlRail.tsx"),
      "utf8",
    );
    const dragOutSource = await readFile(
      join(sourceDirectory, "use-info-window-drag-out.ts"),
      "utf8",
    );

    assert.match(markup, /control-window-dock has-docked-window/u);
    assert.match(markup, /role="tablist"/u);
    assert.match(markup, /aria-selected="true"[^>]*>Log<\/button>/u);
    assert.match(markup, /single docked log/u);
    assert.doesNotMatch(markup, /Pop out Log/u);
    assert.match(controlRailSource, /onDockTabDragOut/u);
    assert.match(controlRailSource, /tabDragOutDistance/u);
    assert.match(dragOutSource, /dragOutDockWindow/u);
    assert.match(dragOutSource, /startPoppedOutDrag/u);
  });

  test("renders only the active dock tab content", () => {
    let activeRenderCount = 0;
    let inactiveRenderCount = 0;
    const markup = renderToStaticMarkup(
      createElement(ControlRail, {
        errors: [],
        globalActions: [],
        disabled: false,
        onAction: () => undefined,
        onHome: () => undefined,
        dockTabs: [
          {
            id: "action-log",
            title: "Log",
            renderContent: () => {
              inactiveRenderCount += 1;
              return createElement("p", null, "inactive log body");
            },
          },
          {
            id: "settings",
            title: "Settings",
            renderContent: () => {
              activeRenderCount += 1;
              return createElement("p", null, "active settings body");
            },
          },
        ],
        activeDockTabId: "settings",
        onDockTabChange: () => undefined,
        onDockTabClose: () => undefined,
      }),
    );

    assert.equal(activeRenderCount, 1);
    assert.equal(inactiveRenderCount, 0);
    assert.match(markup, /active settings body/u);
    assert.doesNotMatch(markup, /inactive log body/u);
  });

  test("docked tabs reorder inside the tab strip before dragging out", async () => {
    const [controlRailSource, dockingSource, floatingStateSource] =
      await Promise.all([
        readFile(join(sourceDirectory, "ControlRail.tsx"), "utf8"),
        readFile(
          join(sourceDirectory, "use-match-app-window-docking.ts"),
          "utf8",
        ),
        readFile(join(sourceDirectory, "use-floating-window-state.ts"), "utf8"),
      ]);

    assert.match(controlRailSource, /onDockTabReorder/u);
    assert.match(controlRailSource, /tabDragIntentFromPoint/u);
    assert.match(controlRailSource, /tabReorderTargetFromPointer/u);
    assert.match(controlRailSource, /tabStripRect/u);
    assert.match(dockingSource, /reorderDockTab/u);
    assert.match(dockingSource, /activeDockedWindowIds\.has\(infoWindowKey\)/u);
    assert.match(floatingStateSource, /reorderDockedWindow/u);
    assert.match(
      controlRailSource,
      /intent\s*===\s*"dragOut"[\s\S]*onDockTabDragOut/u,
    );
  });

  test("dock drop handlers do not return the dock rect to the floating shell", async () => {
    const dockingSource = await readFile(
      join(sourceDirectory, "use-match-app-window-docking.ts"),
      "utf8",
    );

    assert.doesNotMatch(
      dockingSource,
      /(?:dockFloatingWindows|dockInfoWindowTabs)\([\s\S]{0,260}return dockRect/u,
    );
  });

  test("dragging one tab out of a docked group preserves any remaining dock tab", async () => {
    const [dockingSource, dragOutSource] = await Promise.all([
      readFile(
        join(sourceDirectory, "use-match-app-window-docking.ts"),
        "utf8",
      ),
      readFile(join(sourceDirectory, "use-info-window-drag-out.ts"), "utf8"),
    ]);

    assert.match(dragOutSource, /dockedInfoWindowStateAfterDockTabDragOut/u);
    assert.match(dragOutSource, /replacementDockWindowKeys/u);
    assert.match(dragOutSource, /replacedDockWindowKeys/u);
    assert.match(dragOutSource, /onDockInfoWindowGroupSplit/u);
    assert.match(dockingSource, /onDockInfoWindowGroupSplit/u);
    assert.match(
      dockingSource,
      /dockFloatingWindows\(\{\s*windowKeys,\s*rect,\s*replacedWindowKeys,/u,
    );
    assert.match(
      dragOutSource,
      /dragOutDockWindow[\s\S]*updateFloatingWindowOpen\(windowKey,\s*true\)/u,
    );
  });
});
