export interface BotSelfPlayTurnMetric {
  readonly turnNumber: number;
  readonly botPlayerId: string;
  readonly actionCount: number;
  readonly endedByChoice: boolean;
  readonly unexplainedChoiceCount: number;
}

export interface BotSelfPlayReport {
  readonly gameCount: number;
  readonly completedGameCount: number;
  readonly stalledGameCount: number;
  readonly averageActionsPerTurn: number;
  readonly unexplainedChoiceCount: number;
}

export const summarizeBotSelfPlayMetrics = (
  turns: readonly BotSelfPlayTurnMetric[],
): BotSelfPlayReport => {
  const actionCount = turns.reduce(
    (total, turn) => total + turn.actionCount,
    0,
  );
  const unexplainedChoiceCount = turns.reduce(
    (total, turn) => total + turn.unexplainedChoiceCount,
    0,
  );
  return {
    gameCount: turns.length === 0 ? 0 : 1,
    completedGameCount: turns.some((turn) => turn.endedByChoice) ? 1 : 0,
    stalledGameCount: turns.some((turn) => !turn.endedByChoice) ? 1 : 0,
    averageActionsPerTurn: turns.length === 0 ? 0 : actionCount / turns.length,
    unexplainedChoiceCount,
  };
};
