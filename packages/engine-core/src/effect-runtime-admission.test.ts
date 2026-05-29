import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectDefinition,
  ReplacementTrigger,
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
