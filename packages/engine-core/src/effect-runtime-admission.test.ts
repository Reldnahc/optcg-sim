import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardFilter,
  Effect,
  EffectDefinition,
  ReplacementTrigger,
  SelectionId,
  Target,
} from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";

type EffectBlock = EffectDefinition["effects"][number];

const block = (
  params: Pick<
    EffectBlock,
    "category" | "effect" | "sourcePresencePolicy" | "trigger"
  > &
    Partial<
      Omit<
        EffectBlock,
        "category" | "effect" | "id" | "sourcePresencePolicy" | "trigger"
      >
    >,
): EffectBlock => ({
  id: "effect:test" as EffectBlock["id"],
  ...params,
});

test("runtime admission accepts reusable auto bodies through supported entry adapters", () => {
  const effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
    { supported: true },
  );

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts deck-top card movement as a reusable auto body", () => {
  const effect = {
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "deck", position: "top" },
    to: { player: "self", zone: "trash" },
    order: "original",
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts DON deck movement as a reusable auto body", () => {
  const effect = {
    type: "moveCards",
    min: 0,
    count: 1,
    from: { player: "self", zone: "donDeck", position: "top" },
    to: { player: "self", zone: "costArea" },
    order: "original",
    destinationState: "active",
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts effect damage as a reusable auto body", () => {
  const effect = {
    type: "damage",
    target: "leader",
    player: "opponent",
    count: 1,
  } as const;

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts selected trash cards with trigger-presence filters", () => {
  const selectionId = "trashSelection:play" as SelectionId;
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "select",
        connector: "always",
        saveResultAs: selectionId,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          saveAs: selectionId,
          visibility: "bothPlayers",
          filter: {
            categories: ["character"],
            cost: { max: 4 },
            effectEntryPoint: {
              mode: "with",
              trigger: { type: "trigger" },
            },
          },
        },
      },
      {
        id: "play",
        connector: "ifPossible",
        effect: {
          type: "playSelected",
          selection: selectionId,
          ignoreCost: true,
        },
      },
    ],
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts selected trash cards moving to face-up Life", () => {
  const selectionId = "trashSelection:choose-destination" as SelectionId;
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "select",
        connector: "always",
        saveResultAs: selectionId,
        effect: {
          type: "selectCards",
          zone: "trash",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          saveAs: selectionId,
          visibility: "bothPlayers",
          filter: { categories: ["character"] },
        },
      },
      {
        id: "move",
        connector: "ifPossible",
        effect: {
          type: "moveSelected",
          selection: selectionId,
          from: "trash",
          to: "life",
          position: "top",
          destinationFaceUp: true,
        },
      },
    ],
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts Activate Main rested DON attachment to named field cards", () => {
  const donSelectionId = "donSelection:attach" as SelectionId;
  const targetSelectionId = "targetSelection:attach-don" as SelectionId;
  const namedFieldCardFilter: CardFilter = {
    categories: ["leader", "character"],
    names: ["Example Name"],
  };
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        id: "select:rested-don",
        connector: "always",
        saveResultAs: donSelectionId,
        effect: {
          type: "selectCards",
          zone: "costArea",
          player: "self",
          chooser: "self",
          min: 0,
          max: 1,
          saveAs: donSelectionId,
          visibility: "bothPlayers",
          filter: { categories: ["don"], state: "rested" },
        },
      },
      {
        id: "select:don-attach-target",
        connector: "ifYouDo",
        saveResultAs: targetSelectionId,
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            filter: namedFieldCardFilter,
            min: 1,
            max: 1,
            allowFewerIfUnavailable: false,
            visibility: "public",
          },
        },
      },
      {
        id: "attach:selected-don",
        connector: "then",
        effect: {
          type: "attachSelectedDon",
          selection: donSelectionId,
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: targetSelectionId,
            },
            zones: ["leaderArea", "characterArea"],
            player: "self",
            filter: namedFieldCardFilter,
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
        },
      },
    ],
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "activate",
        effect,
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "activateMain" },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts opponent field-removal replacement with reusable life movement body", () => {
  const target: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Sky Island"],
      power: { min: 6000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    target,
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "replacement",
        trigger: { type: "replacement", replacement: when },
        optional: true,
        sourcePresencePolicy: "resolveFromLastKnownInformation",
        effect: {
          type: "replacement",
          when,
          instead: {
            type: "moveCards",
            count: 1,
            from: { player: "self", zone: "life", position: "top" },
            to: { player: "self", zone: "hand" },
            order: "original",
          },
        },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts opponent field-removal replacement with reusable owner deck-bottom body", () => {
  const target: Target = {
    type: "all",
    zone: "characterArea",
    player: "self",
    filter: {
      categories: ["character"],
      power: { max: 7000 },
    },
  };
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    target,
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "replacement",
        trigger: { type: "replacement", replacement: when },
        optional: true,
        sourcePresencePolicy: "resolveFromLastKnownInformation",
        effect: {
          type: "replacement",
          when,
          instead: {
            type: "sequence",
            effects: [
              {
                id: "select:owner-deck-bottom",
                connector: "always",
                saveResultAs: "selected:owner-deck-bottom",
                effect: {
                  type: "selectTargets",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "self",
                    zone: "characterArea",
                    min: 1,
                    max: 1,
                    allowFewerIfUnavailable: false,
                    visibility: "public",
                    filter: { categories: ["character"] },
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "bounce",
                  destination: "deckBottom",
                  target: {
                    type: "savedFieldObject",
                    binding: {
                      family: "selectedTargets",
                      saveResultAs: "selected:owner-deck-bottom",
                    },
                    zone: "characterArea",
                    player: "self",
                    visibility: "publicOnly",
                    onFailure: "failClosed",
                  },
                },
              },
            ],
          },
        },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts costed main sequences with conditional draw and this-turn power reduction", () => {
  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "main" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:return-don",
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 1, optional: true },
              },
            },
            {
              id: "body:after-cost",
              connector: "ifYouDo",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    effect: {
                      type: "conditional",
                      if: {
                        type: "hasCardInZone",
                        player: "self",
                        zone: "leaderArea",
                        filter: { categories: ["leader"], names: ["Enel"] },
                      },
                      then: { type: "draw", player: "self", count: 1 },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "modifyPower",
                      target: {
                        type: "choose",
                        request: {
                          timing: "onResolution",
                          chooser: "self",
                          player: "opponent",
                          zone: "characterArea",
                          min: 0,
                          max: 1,
                          allowFewerIfUnavailable: true,
                          visibility: "public",
                          filter: { categories: ["character"] },
                        },
                      },
                      value: -1000,
                      duration: { type: "thisTurn" },
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts opponent-attack optional rest-DON target-rest sequence", () => {
  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "onOpponentAttack" },
        sourcePresencePolicy: "mustRemainInSameZone",
        oncePerTurn: true,
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "paidCost",
              effect: {
                type: "payCost",
                cost: {
                  type: "restDon",
                  count: 1,
                  chooser: "self",
                  optional: true,
                },
              },
            },
            {
              connector: "ifYouDo",
              effect: {
                type: "rest",
                target: {
                  type: "chooseFromZones",
                  request: {
                    timing: "onResolution",
                    chooser: "self",
                    player: "opponent",
                    zones: ["leaderArea", "characterArea"],
                    min: 0,
                    max: 1,
                    allowFewerIfUnavailable: true,
                    visibility: "public",
                    filter: { categories: ["leader", "character"] },
                  },
                },
              },
            },
          ],
        },
      }),
    ),
    { supported: true },
  );
});

test("runtime admission accepts saved Leader or Character effect invalidation sequences across trigger adapters", () => {
  const effect: Effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        saveResultAs: "selected:invalidate-effects-target",
        effect: {
          type: "selectTargets",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["leader", "character"] },
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "invalidateEffects",
          target: {
            type: "savedFieldObject",
            binding: {
              family: "selectedTargets",
              saveResultAs: "selected:invalidate-effects-target",
            },
            zones: ["leaderArea", "characterArea"],
            player: "opponent",
            visibility: "publicOnly",
            onFailure: "failClosed",
          },
          duration: { type: "thisTurn" },
        },
      },
    ],
  };

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "trigger" },
        sourcePresencePolicy: "noSourceRequired",
        effect,
      }),
    ),
    { supported: true },
  );

  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect,
      }),
    ),
    { supported: true },
  );
});

test("runtime admission rejects parsed unsupported entry adapters", () => {
  assert.deepEqual(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: { type: "draw", player: "self", count: 1 },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onBlock" },
      }),
    ),
    {
      reason: "unsupported trigger/category/source-presence envelope",
      supported: false,
    },
  );
});
