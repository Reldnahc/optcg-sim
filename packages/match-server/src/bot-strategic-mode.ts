import { botDoctrine } from "./bot-gameplay-doctrine.js";
import type { BotFeatures } from "./bot-features.js";
import type { BotStrategicMode } from "./bot-types.js";

export interface BotStrategicModeReport {
  readonly mode: BotStrategicMode;
  readonly reasons: readonly string[];
}

export const chooseBotStrategicMode = (
  features: BotFeatures,
): BotStrategicModeReport => {
  if (features.combat.incomingBattleIsLethal) {
    return { mode: "survive", reasons: ["incoming lethal attack"] };
  }
  if (features.combat.hasAvailableLethalLine) {
    return { mode: "lethal", reasons: ["available lethal line"] };
  }
  if (
    features.self.lifeCount <= botDoctrine.dangerLifeThreshold &&
    features.opponent.characterCount > 0
  ) {
    return { mode: "stabilize", reasons: ["low life under board pressure"] };
  }
  if (
    features.opponent.lifeCount <= botDoctrine.lowLifeThreshold ||
    features.opponent.handCount <= 2
  ) {
    return { mode: "pressure", reasons: ["opponent low life or low hand"] };
  }
  if (
    features.opponent.highestCharacterValue >=
    botDoctrine.highValueCharacterFloor
  ) {
    return { mode: "stabilize", reasons: ["opponent high-value character"] };
  }
  if (
    features.actions.hasPlayableDevelopmentCard ||
    features.self.characterCount < 3
  ) {
    return { mode: "develop", reasons: ["need persistent board"] };
  }
  return { mode: "cleanup", reasons: ["no urgent pressure or development"] };
};
