import type { Condition, EffectCategory, Trigger } from "@optcg/types";

import type { PrimitiveEvidence } from "./types.js";

export interface SupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly category?: EffectCategory;
  readonly condition?: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
}

export const supportedEntryPoints: readonly SupportedEntryPoint[] = [
  {
    text: "[On Play]",
    trigger: { type: "onPlay" },
    evidence: ["entry:onPlay", "sourcePresence:mustRemain"],
  },
  {
    text: "[When Attacking]",
    trigger: { type: "whenAttacking" },
    evidence: ["entry:whenAttacking", "sourcePresence:mustRemain"],
  },
  {
    text: "[On Your Opponent's Attack]",
    trigger: { type: "onOpponentAttack" },
    evidence: ["entry:onOpponentAttack", "sourcePresence:mustRemain"],
  },
  {
    text: "[On K.O.]",
    trigger: { type: "onKO" },
    evidence: ["entry:onKO", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[End of Your Turn]",
    trigger: { type: "endOfYourTurn" },
    evidence: ["entry:endOfYourTurn", "sourcePresence:mustRemain"],
  },
  {
    text: "[Trigger]",
    trigger: { type: "trigger" },
    evidence: ["entry:lifeTrigger", "sourcePresence:noSourceRequired"],
  },
  {
    text: "[Main]",
    trigger: { type: "main" },
    evidence: ["entry:eventMain", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Counter]",
    trigger: { type: "counter" },
    evidence: ["entry:eventCounter", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Activate: Main]",
    trigger: { type: "activateMain" },
    category: "activate",
    evidence: ["entry:activateMain", "sourcePresence:mustRemain"],
  },
  {
    text: "[Your Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "yourTurn" },
    evidence: [
      "entry:yourTurn",
      "condition:yourTurn",
      "sourcePresence:mustRemain",
    ],
  },
  {
    text: "[Opponent's Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "opponentTurn" },
    evidence: [
      "entry:opponentTurn",
      "condition:opponentTurn",
      "sourcePresence:mustRemain",
    ],
  },
];
