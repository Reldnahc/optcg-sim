import type { BotFeatures } from "./bot-features.js";
import type {
  BotExplainableScore,
  BotScoreTerm,
  BotStrategicMode,
} from "./bot-types.js";

const score = (terms: readonly BotScoreTerm[]): BotExplainableScore => ({
  total: terms.reduce((total, term) => total + term.value, 0),
  terms: terms.filter((term) => term.value !== 0),
});

const term = (key: string, value: number, reason: string): BotScoreTerm => ({
  key,
  value,
  reason,
});

export const evaluateVisibleBoardState = ({
  features,
  mode,
}: {
  readonly features: BotFeatures;
  readonly mode: BotStrategicMode;
}): BotExplainableScore => {
  const lifeDelta = features.self.lifeCount - features.opponent.lifeCount;
  const boardDelta =
    features.self.characterCount - features.opponent.characterCount;
  const handDelta = features.self.handCount - features.opponent.handCount;
  const defenseRisk =
    features.self.lifeCount <= 1
      ? -300
      : features.self.lifeCount === 2
        ? -120
        : 0;
  const modePressure =
    mode === "pressure" || mode === "lethal"
      ? (5 - features.opponent.lifeCount) * 45
      : 0;
  const modeStability =
    mode === "stabilize" || mode === "survive"
      ? features.self.blockerCount * 80 - features.opponent.characterCount * 35
      : 0;

  return score([
    term("life", lifeDelta * 35, "life differential"),
    term("board", boardDelta * 90, "character board differential"),
    term("hand", handDelta * 20, "visible hand count differential"),
    term("defense-risk", defenseRisk, "low life risk"),
    term("pressure", modePressure, "pressure mode rewards opponent life loss"),
    term("stability", modeStability, "stabilize mode values defense"),
  ]);
};
