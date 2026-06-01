import type { CardRef, PlayerState } from "@optcg/types";

export const restSourceCard = (
  player: PlayerState,
  source: CardRef,
): PlayerState | null => {
  if (
    player.leader.instanceId === source.instanceId &&
    player.leader.cardId === source.cardId &&
    source.zone?.zone === "leaderArea" &&
    player.leader.state !== "rested"
  ) {
    return {
      ...player,
      leader: { ...player.leader, state: "rested" },
    };
  }
  const characterIndex = player.characters.findIndex(
    (card) =>
      card.instanceId === source.instanceId &&
      card.cardId === source.cardId &&
      source.zone?.zone === "characterArea" &&
      card.state !== "rested",
  );
  if (characterIndex >= 0) {
    return {
      ...player,
      characters: player.characters.map((card, index) =>
        index === characterIndex ? { ...card, state: "rested" } : card,
      ),
    };
  }
  if (
    player.stage !== undefined &&
    player.stage.instanceId === source.instanceId &&
    player.stage.cardId === source.cardId &&
    source.zone?.zone === "stageArea" &&
    player.stage.state !== "rested"
  ) {
    return {
      ...player,
      stage: { ...player.stage, state: "rested" },
    };
  }
  return null;
};
