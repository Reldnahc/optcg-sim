import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type { ClientActionModel } from "../view-model.js";
import { primarySidebarActionPosition } from "./action-emphasis.js";

const action = (
  index: number,
  label: string,
  options: Partial<ClientActionModel> = {},
): ClientActionModel => ({
  index,
  label,
  type: "respondToDecision",
  ...options,
});

describe("sidebar action emphasis", () => {
  test("marks a single sidebar action as primary", () => {
    assert.equal(
      primarySidebarActionPosition([
        action(12, "End turn", { type: "endMainPhase" }),
      ]),
      0,
    );
  });

  test("prefers confirm actions over choose-none and clear actions", () => {
    assert.equal(
      primarySidebarActionPosition([
        action(-4, "Choose no card", { type: "chooseNoDecisionCards" }),
        action(-2, "Confirm selection", {
          type: "confirmDecisionSelection",
        }),
        action(-3, "Clear selection", { type: "clearDecisionSelection" }),
      ]),
      1,
    );
  });

  test("prefers payment actions over decline and clear actions", () => {
    assert.equal(
      primarySidebarActionPosition([
        action(1, "Decline cost", { responseKey: "decline" }),
        action(2, "Place 2 cards from trash at bottom", {
          type: "confirmDecisionSelection",
        }),
        action(-3, "Clear selection", { type: "clearDecisionSelection" }),
      ]),
      1,
    );
  });

  test("does not force a primary when every multi-action choice is secondary", () => {
    assert.equal(
      primarySidebarActionPosition([
        action(1, "Decline cost", { responseKey: "decline" }),
        action(-3, "Clear selection", { type: "clearDecisionSelection" }),
      ]),
      undefined,
    );
  });
});
