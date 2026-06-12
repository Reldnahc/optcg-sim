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

const assertRuntimeSupported = (
  report: ReturnType<typeof evaluateEffectBlockRuntimeSupport>,
): void => {
  assert.equal(report.supported, true);
  assert.deepEqual(report.missing, []);
};

const supportedChoiceBody = (): Extract<Effect, { type: "choice" }> => ({
  type: "choice",
  chooser: "self",
  min: 1,
  max: 1,
  options: [
    {
      id: "choice:trash",
      label: "Your opponent trashes 1 card from their hand.",
      effect: {
        type: "trashFromHand",
        player: "opponent",
        chooser: "opponent",
        count: 1,
      },
    },
    {
      id: "choice:cost",
      label: "Give up to 1 of your opponent's Characters -3 cost.",
      effect: {
        type: "modifyCost",
        player: "self",
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
        value: -3,
        duration: { type: "thisTurn" },
      },
    },
  ],
});

test("runtime admission reports reusable primitive records", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      effect: { type: "draw", count: 1, player: "self" },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    }),
  );

  assert.equal(report.supported, true);
  assert.deepEqual(
    report.records.map((record) => [
      record.authority,
      record.family,
      record.id,
      record.supported,
    ]),
    [
      ["runtime", "entryPoint", "onPlay", true],
      ["runtime", "sourcePresence", "mustRemainInSameZone", true],
      ["runtime", "body", "draw", true],
    ],
  );
  assert.deepEqual(report.missing, []);
});

test("runtime admission reports missing evidence for unsupported bodies", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      effect: { type: "lookAtTop", player: "self", count: 1 },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    }),
  );

  assert.equal(report.supported, false);
  assert.equal(report.reason, "unsupported auto effect body");
  assert.deepEqual(report.missing, [
    {
      authority: "runtime",
      family: "body",
      id: "lookAtTop",
      reason: "unsupported auto effect body",
      effectPath: ["effect"],
    },
  ]);
});

test("runtime admission accepts reusable auto bodies through supported entry adapters", () => {
  const effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  } as const;

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
  );

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );
});

test("runtime admission accepts choice bodies through supported auto entry adapters", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: supportedChoiceBody(),
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
  );

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: supportedChoiceBody(),
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );
});

test("runtime admission accepts pay-cost before choice as reusable sequence composition", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:return-don",
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 3, optional: true },
              },
            },
            {
              id: "body:choice",
              connector: "ifYouDo",
              effect: supportedChoiceBody(),
            },
          ],
        },
      }),
    ),
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      }),
    ),
  );
});

test("runtime admission accepts effect damage as a reusable auto body", () => {
  const effect = {
    type: "damage",
    target: "leader",
    player: "opponent",
    count: 1,
  } as const;

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );
});

test("runtime admission accepts self damage as the same reusable damage body", () => {
  const effect = {
    type: "damage",
    target: "leader",
    player: "self",
    count: 1,
  } as const;

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );
});

test("runtime admission accepts damage inside reusable sequence and choice composition", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "damage",
                target: "leader",
                player: "opponent",
                count: 1,
              },
            },
            {
              connector: "then",
              effect: { type: "draw", player: "self", count: 1 },
            },
          ],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
  );

  const damageThenLifeToHand: Effect = {
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "conditional",
          if: { type: "lifeCount", player: "opponent", op: "eq", value: 1 },
          then: {
            type: "damage",
            target: "leader",
            player: "opponent",
            count: 1,
          },
        },
      },
      {
        connector: "then",
        effect: {
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    ],
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: {
          type: "choice",
          chooser: "self",
          min: 1,
          max: 1,
          options: [
            {
              id: "choice:draw",
              label: "Draw 1 card.",
              effect: { type: "draw", player: "self", count: 1 },
            },
            {
              id: "choice:damage",
              label: "Deal damage, then take life.",
              effect: damageThenLifeToHand,
            },
          ],
        },
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
  );
});

test("runtime admission accepts saved Leader-or-Character activation and self-rest segments", () => {
  const selectionId = "targetSelection:set-field-active" as SelectionId;
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect: {
          type: "choice",
          chooser: "self",
          min: 1,
          max: 1,
          options: [
            {
              id: "choice:activate",
              label: "Set a Leader or Character active.",
              effect: {
                type: "sequence",
                effects: [
                  {
                    connector: "always",
                    saveResultAs: selectionId,
                    effect: {
                      type: "selectTargets",
                      request: {
                        timing: "onResolution",
                        chooser: "self",
                        player: "self",
                        zones: ["leaderArea", "characterArea"],
                        min: 0,
                        max: 1,
                        allowFewerIfUnavailable: true,
                        visibility: "public",
                        filter: {
                          categories: ["leader", "character"],
                          cost: { max: 6 },
                        },
                      },
                    },
                  },
                  {
                    connector: "then",
                    effect: {
                      type: "activate",
                      target: {
                        type: "savedFieldObject",
                        binding: {
                          family: "selectedTargets",
                          saveResultAs: selectionId,
                        },
                        zones: ["leaderArea", "characterArea"],
                        player: "self",
                        visibility: "publicOnly",
                        onFailure: "failClosed",
                      },
                    },
                  },
                ],
              },
            },
            {
              id: "choice:rest",
              label: "Rest this Character.",
              effect: {
                type: "rest",
                target: { type: "self" },
              },
            },
          ],
        },
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "resolveFromDestinationZone",
        trigger: { type: "onKO" },
      }),
    ),
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        effect,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "onPlay" },
      }),
    ),
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "activate",
        effect,
        oncePerTurn: true,
        sourcePresencePolicy: "mustRemainInSameZone",
        trigger: { type: "activateMain" },
      }),
    ),
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

  assertRuntimeSupported(
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

  assertRuntimeSupported(
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
  );
});

test("runtime admission accepts self field-removal replacement with reusable power modifier body", () => {
  const when: ReplacementTrigger = {
    type: "wouldMoveZone",
    from: "characterArea",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    target: { type: "self" },
  };

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "replacement",
        trigger: { type: "replacement", replacement: when },
        oncePerTurn: true,
        optional: true,
        sourcePresencePolicy: "resolveFromLastKnownInformation",
        effect: {
          type: "replacement",
          when,
          instead: {
            type: "modifyPower",
            target: { type: "self" },
            value: -2000,
            duration: { type: "thisTurn" },
          },
        },
      }),
    ),
  );
});

test("runtime admission accepts costed main sequences with conditional draw and this-turn power reduction", () => {
  assertRuntimeSupported(
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
  );
});

test("runtime admission accepts activate-main choice through reusable sequence support", () => {
  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "activate",
        trigger: { type: "activateMain" },
        sourcePresencePolicy: "mustRemainInSameZone",
        oncePerTurn: true,
        effect: {
          type: "sequence",
          effects: [
            {
              id: "cost:return-don",
              connector: "always",
              effect: {
                type: "payCost",
                cost: { type: "returnDon", count: 2, optional: true },
              },
            },
            {
              id: "body:choice",
              connector: "ifYouDo",
              effect: supportedChoiceBody(),
            },
          ],
        },
      }),
    ),
  );
});

test("runtime admission accepts opponent-attack optional rest-DON target-rest sequence", () => {
  assertRuntimeSupported(
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

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "trigger" },
        sourcePresencePolicy: "noSourceRequired",
        effect,
      }),
    ),
  );

  assertRuntimeSupported(
    evaluateEffectBlockRuntimeSupport(
      block({
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect,
      }),
    ),
  );
});

test("runtime admission rejects parsed unsupported entry adapters", () => {
  const report = evaluateEffectBlockRuntimeSupport(
    block({
      category: "auto",
      effect: { type: "draw", player: "self", count: 1 },
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onBlock" },
    }),
  );

  assert.equal(report.supported, false);
  assert.equal(
    report.reason,
    "unsupported trigger/category/source-presence envelope",
  );
  const firstMissing = report.missing[0];
  assert.ok(firstMissing);
  assert.equal(firstMissing.family, "entryPoint");
  assert.equal(firstMissing.id, "onBlock");
});
