import { defaultBotStrategy } from "./bot-strategy.js";
import type { BotActionChoice, BotOpponentDeckKnowledge } from "./bot-types.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";
import type { PlayerId } from "@optcg/types";

export type {
  BotActionChoice,
  BotBehaviorProfile,
  BotStrategy,
} from "./bot-types.js";
export {
  chooseBotActionReport,
  createBotStrategy,
  createPassiveBotStrategy,
  defaultBotStrategy,
  passiveBotStrategy,
  type BotStrategyActionReport,
} from "./bot-strategy.js";

export const chooseBotAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotActionChoice | undefined =>
  defaultBotStrategy.chooseAction({ snapshot, botPlayerId });

export const chooseBotActionWithKnowledge = ({
  snapshot,
  botPlayerId,
  opponentDeckKnowledge,
}: {
  readonly snapshot: DevMatchSnapshot;
  readonly botPlayerId: PlayerId;
  readonly opponentDeckKnowledge?: BotOpponentDeckKnowledge | undefined;
}): BotActionChoice | undefined =>
  defaultBotStrategy.chooseAction({
    snapshot,
    botPlayerId,
    opponentDeckKnowledge,
  });
