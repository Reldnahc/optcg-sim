import type { Effect } from "@optcg/types";

export type ContinuousQueueEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "allowAttackActiveCharacters"
      | "giveKeyword"
      | "giveAttribute"
      | "setPowerToZero"
      | "setBasePower"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "enterRested"
      | "preventPlayByEffects"
      | "invalidateEffects"
      | "invalidateEffectEntryPoint"
      | "giveProtection"
      | "protectFromKO"
      | "grantReplacement"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotAttackTarget"
      | "attackCost"
      | "cannotBlock"
      | "preventBlockerActivation"
      | "redirectDonPhasePlacement";
  }
>;
