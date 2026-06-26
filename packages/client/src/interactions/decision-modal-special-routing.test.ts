import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecision,
} from "@optcg/types";

import {
  createDecisionDraft,
  createDecisionModalModel,
} from "./decision-modal.js";
import type { ClientActionModel } from "../view-model.js";

const p1 = "p1" as PlayerId;

const cardRef = (id: string): CardRef => ({
  instanceId: id as InstanceId,
  cardId: `CARD-${id}` as CardId,
  playerId: p1,
});

const baseDecision = {
  id: "decision-1" as DecisionId,
  spotlightPendingId:
    "spotlight:decision-1" as PublicPendingDecision["spotlightPendingId"],
  playerId: p1,
  prompt: "Choose",
  causedBy: { type: "playerAction", actionId: "action-1" },
  presentation: {
    title: "Choose",
    instruction: "Choose",
  },
} satisfies Omit<PublicPendingDecision, "type">;

const responseAction = (
  index: number,
  label: string,
  responseKey: string,
): ClientActionModel => ({
  index,
  type: "respondToDecision",
  label,
  responseKey,
});

const modelFor = (
  decision: PublicPendingDecision,
  responseActions: readonly ClientActionModel[],
) =>
  createDecisionModalModel(
    decision,
    createDecisionDraft(decision, responseActions),
    responseActions,
  );

describe("special decision modal routing", () => {
  test("optional activation decisions use dedicated routing", () => {
    const source = cardRef("source");
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "chooseOptionalActivation",
      prompt: "Choose whether to activate this effect.",
      presentation: {
        title: "Optional effect",
        instruction: "Choose whether to activate this effect",
        source,
        choices: [
          { responseKey: "activate", label: "Activate effect" },
          { responseKey: "decline", label: "Decline effect" },
        ],
      },
      source,
    };

    const model = modelFor(decision, [
      responseAction(1, "Raw activate", "activate"),
      responseAction(2, "Raw decline", "decline"),
    ]);

    assert.equal(model.kind, "optionalActivation");
    assert.deepEqual(model.options, [
      { actionIndex: 1, label: "Activate effect" },
      { actionIndex: 2, label: "Decline effect" },
    ]);
    assert.equal(model.source?.instanceId, source.instanceId);
  });

  test("replacement decisions use dedicated routing and preserve source cards", () => {
    const replacementSource = cardRef("replacement-source");
    const decision: PublicPendingDecision = {
      ...baseDecision,
      type: "chooseReplacement",
      prompt: "Choose replacement.",
      presentation: {
        title: "Choose replacement",
        instruction: "Choose replacement",
        choices: [
          {
            responseKey: "replacement-a",
            label: "Use replacement",
            cards: [replacementSource],
          },
          { responseKey: "decline", label: "Do not replace" },
        ],
      },
    };

    const model = modelFor(decision, [
      responseAction(1, "Raw replacement", "replacement-a"),
      responseAction(2, "Raw decline", "decline"),
    ]);

    assert.equal(model.kind, "replacementOptions");
    assert.deepEqual(model.options, [
      {
        actionIndex: 1,
        label: "Use replacement",
        cards: [replacementSource],
      },
      { actionIndex: 2, label: "Do not replace" },
    ]);
  });

  test("rollback consent and loop-count decisions use named routing", () => {
    const rollbackDecision: PublicPendingDecision = {
      ...baseDecision,
      type: "rollbackConsent",
      prompt: "Allow rollback?",
      presentation: {
        title: "Rollback request",
        instruction: "Choose whether to allow rollback.",
        choices: [
          { responseKey: "allow", label: "Allow rollback" },
          { responseKey: "deny", label: "Deny rollback" },
        ],
      },
    };
    const loopDecision: PublicPendingDecision = {
      ...baseDecision,
      type: "declareLoopCount",
      prompt: "Declare loop count.",
      presentation: {
        title: "Declare loop count",
        instruction: "Choose how many times to repeat.",
        choices: [
          { responseKey: "1", label: "1" },
          { responseKey: "2", label: "2" },
        ],
      },
    };

    assert.equal(
      modelFor(rollbackDecision, [
        responseAction(1, "Raw allow", "allow"),
        responseAction(2, "Raw deny", "deny"),
      ]).kind,
      "rollbackConsent",
    );
    assert.equal(
      modelFor(loopDecision, [
        responseAction(1, "Raw one", "1"),
        responseAction(2, "Raw two", "2"),
      ]).kind,
      "loopCount",
    );
  });
});
