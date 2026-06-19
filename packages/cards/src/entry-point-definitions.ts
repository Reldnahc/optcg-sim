import type { Condition, EffectCategory, Trigger } from "@optcg/types";

import type { PrimitiveEvidence } from "./types.js";

export interface SupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly category?: EffectCategory;
  readonly condition?: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly supportStatus: "supported";
}

export interface RecognizedUnsupportedEntryPoint {
  readonly text: string;
  readonly trigger: Trigger;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly supportStatus: "recognizedUnsupported";
}

export type EntryPointDefinition =
  | SupportedEntryPoint
  | RecognizedUnsupportedEntryPoint;

export const entryPointDefinitions: readonly EntryPointDefinition[] = [
  {
    text: "[On Play]",
    trigger: { type: "onPlay" },
    evidence: ["entry:onPlay", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
  {
    text: "[When Attacking]",
    trigger: { type: "whenAttacking" },
    evidence: ["entry:whenAttacking", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
  {
    text: "[On Your Opponent's Attack]",
    trigger: { type: "onOpponentAttack" },
    evidence: ["entry:onOpponentAttack", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
  {
    text: "This effect can be activated when your opponent attacks.",
    trigger: { type: "onOpponentAttack" },
    evidence: ["entry:onOpponentAttack", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
  {
    text: "[On K.O.]",
    trigger: { type: "onKO" },
    evidence: ["entry:onKO", "sourcePresence:resolveFromDestination"],
    supportStatus: "supported",
  },
  {
    text: "[End of Your Turn]",
    trigger: { type: "endOfYourTurn" },
    evidence: ["entry:endOfYourTurn", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
  {
    text: "[Trigger]",
    trigger: { type: "trigger" },
    evidence: ["entry:lifeTrigger", "sourcePresence:noSourceRequired"],
    supportStatus: "supported",
  },
  {
    text: "[Main]",
    trigger: { type: "main" },
    evidence: ["entry:eventMain", "sourcePresence:resolveFromDestination"],
    supportStatus: "supported",
  },
  {
    text: "[Counter]",
    trigger: { type: "counter" },
    evidence: ["entry:eventCounter", "sourcePresence:resolveFromDestination"],
    supportStatus: "supported",
  },
  {
    text: "[Activate: Main]",
    trigger: { type: "activateMain" },
    category: "activate",
    evidence: ["entry:activateMain", "sourcePresence:mustRemain"],
    supportStatus: "supported",
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
    supportStatus: "supported",
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
    supportStatus: "supported",
  },
  {
    text: "[On Opponent's Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "opponentTurn" },
    evidence: [
      "entry:opponentTurn",
      "condition:opponentTurn",
      "sourcePresence:mustRemain",
    ],
    supportStatus: "supported",
  },
  {
    text: "[On Block]",
    trigger: { type: "onBlock" },
    evidence: ["entry:onBlock", "sourcePresence:mustRemain"],
    supportStatus: "supported",
  },
];

export const supportedEntryPoints: readonly SupportedEntryPoint[] =
  entryPointDefinitions.filter(
    (entryPoint): entryPoint is SupportedEntryPoint =>
      entryPoint.supportStatus === "supported",
  );

export const recognizedUnsupportedEntryPoints: readonly RecognizedUnsupportedEntryPoint[] =
  entryPointDefinitions.filter(
    (entryPoint): entryPoint is RecognizedUnsupportedEntryPoint =>
      entryPoint.supportStatus === "recognizedUnsupported",
  );
