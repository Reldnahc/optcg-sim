export const opponentCharactersTargetPrimitive = {
  primitiveId: "target:opponentCharacters",
  matches: [{ id: "of-your-opponents-characters" }],
} as const;

export const opponentCardsTargetPrimitive = {
  primitiveId: "target:opponentCards",
  matches: [{ id: "of-your-opponents-cards" }],
} as const;

export const opponentStagesTargetPrimitive = {
  primitiveId: "target:opponentStages",
  matches: [{ id: "of-your-opponents-stages" }],
} as const;

export const opponentLeaderOrCharactersTargetPrimitive = {
  primitiveId: "target:opponentLeaderOrCharacters",
  matches: [{ id: "of-your-opponents-leader-or-character-cards" }],
} as const;

export const opponentCharactersOrDonCardsTargetPrimitive = {
  primitiveId: "target:opponentCharactersOrDonCards",
  matches: [{ id: "of-your-opponents-characters-or-don-cards" }],
} as const;

export const opponentDonCardsTargetPrimitive = {
  primitiveId: "target:opponentDonCards",
  matches: [{ id: "of-your-opponents-don-cards" }],
} as const;

export const yourLeaderTargetPrimitive = {
  primitiveId: "target:yourLeader",
  matches: [{ id: "your-leader" }],
} as const;

export const yourLeaderOrCharactersTargetPrimitive = {
  primitiveId: "target:yourLeaderOrCharacters",
  matches: [{ id: "of-your-leader-or-character-cards" }],
} as const;

export const yourNamedCardsTargetPrimitive = {
  primitiveId: "target:yourNamedCards",
  matches: [{ id: "of-your-bracketed-name-cards" }],
} as const;

export const yourCharactersTargetPrimitive = {
  primitiveId: "target:yourCharacters",
  matches: [{ id: "of-your-characters" }],
} as const;
