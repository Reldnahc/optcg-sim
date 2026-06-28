import type { AuthSubject, PlayerProfileTitleView } from "./dev-auth.js";

export type BotDifficulty = "novice" | "advanced";

export const defaultBotDifficulty: BotDifficulty = "novice";

const botTitleByDifficulty = {
  novice: {
    key: "bot-novice",
    label: "Novice Bot",
    style: {
      text_color: "#a7f3d0",
      font_family: "mono",
      font_weight: 800,
      glow_color: "#34d399",
    },
  },
  advanced: {
    key: "bot-advanced",
    label: "Advanced Bot",
    style: {
      text_color: "#bfdbfe",
      font_family: "mono",
      font_weight: 800,
      gradient: {
        from: "#60a5fa",
        to: "#f0abfc",
        angle: 110,
      },
      glow_color: "#60a5fa",
    },
  },
} satisfies Record<BotDifficulty, PlayerProfileTitleView>;

export const botTitleForDifficulty = (
  difficulty: BotDifficulty = defaultBotDifficulty,
): PlayerProfileTitleView => structuredClone(botTitleByDifficulty[difficulty]);

export const createBotSubject = (
  difficulty: BotDifficulty = defaultBotDifficulty,
): AuthSubject => ({
  type: "user",
  userId: "bot",
  sessionId: "bot",
  displayName: "Bot",
  title: botTitleForDifficulty(difficulty),
});
