import { defaultBotStrategy } from "./bot-strategy.js";
import type { BotActionChoice } from "./bot-types.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";
import type { PlayerId } from "@optcg/types";

export type {
  BotActionChoice,
  BotBehaviorProfile,
  BotStrategy,
} from "./bot-types.js";
export { createBotStrategy, defaultBotStrategy } from "./bot-strategy.js";

export const chooseBotAction = (
  snapshot: DevMatchSnapshot,
  botPlayerId: PlayerId,
): BotActionChoice | undefined =>
  defaultBotStrategy.chooseAction({ snapshot, botPlayerId });
