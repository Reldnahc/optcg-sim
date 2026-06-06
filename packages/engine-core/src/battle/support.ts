import type { CardRef, GameState, Keyword, ResolvedCard } from "@optcg/types";

export const sameCardRef = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

export const expireBattleDurationStateForCleanup = (
  state: GameState,
): GameState => {
  const cleanedState: GameState = {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (effect) => effect.duration.type !== "thisBattle",
    ),
  };
  delete cleanedState.battle;
  return cleanedState;
};

const supportedExplanatoryNoteKeywordBodies = new Map<string, Keyword>([
  ["[Banish]", "banish"],
  ["[Blocker]", "blocker"],
  ["[Rush]", "rush"],
  ["[Rush: Character]", "rushCharacter"],
]);

const stripParentheticalExplanatoryNotes = (text: string): string | null => {
  let depth = 0;
  let stripped = "";

  for (const character of text) {
    if (character === "(") {
      depth += 1;
      if (depth > 1) {
        return null;
      }
      stripped += " ";
      continue;
    }
    if (character === ")") {
      if (depth === 0) {
        return null;
      }
      depth -= 1;
      stripped += " ";
      continue;
    }
    if (depth === 0) {
      stripped += character;
    }
  }

  if (depth !== 0) {
    return null;
  }
  return stripped;
};

const normalizeSupportGateText = (text: string): string =>
  text.replace(/\s+/gu, " ").trim();

export const hasUnsupportedSupportGateText = (
  text: string | undefined,
  card: ResolvedCard,
): boolean => {
  if (text === undefined || text.trim().length === 0) {
    return false;
  }

  const stripped = stripParentheticalExplanatoryNotes(text);
  if (stripped === null) {
    return true;
  }

  const normalized = normalizeSupportGateText(stripped);
  if (normalized.length === 0) {
    return false;
  }

  const keyword = supportedExplanatoryNoteKeywordBodies.get(normalized);
  return keyword === undefined || !card.printedKeywords.includes(keyword);
};

export const isSupportedBattleResolutionEnvelope = (
  battle: NonNullable<GameState["battle"]>,
): boolean => {
  if (battle.damageCount !== 1 && battle.damageCount !== 2) {
    return false;
  }
  if (battle.blocker === undefined) {
    return battle.step === "attack" || battle.step === "counter";
  }
  return (
    (battle.step === "block" || battle.step === "counter") &&
    sameCardRef(battle.blocker, battle.currentTarget)
  );
};
