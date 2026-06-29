export const botDoctrine = {
  assumedUnknownCounterPowerPerCard: 2_000,
  leaderBasePower: 5_000,
  usefulLeaderAttackBands: [5_000, 6_000, 7_000, 9_000],
  lowLifeThreshold: 2,
  dangerLifeThreshold: 1,
  highValueCharacterFloor: 8_000,
  highCounterValue: 2_000,
} as const;

export const counterPowerRequiredToStopAttack = ({
  attackerPower,
  targetPower,
}: {
  readonly attackerPower: number;
  readonly targetPower: number;
}): number | undefined =>
  attackerPower < targetPower ? undefined : attackerPower - targetPower + 1_000;

export const estimatedCounterCardsRequiredToStopAttack = ({
  attackerPower,
  targetPower,
  assumedCounterPowerPerCard = botDoctrine.assumedUnknownCounterPowerPerCard,
}: {
  readonly attackerPower: number;
  readonly targetPower: number;
  readonly assumedCounterPowerPerCard?: number;
}): number | undefined => {
  const requiredPower = counterPowerRequiredToStopAttack({
    attackerPower,
    targetPower,
  });
  return requiredPower === undefined
    ? undefined
    : Math.ceil(requiredPower / assumedCounterPowerPerCard);
};
