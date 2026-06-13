import type { Effect } from "@optcg/types";

export type ContinuousQueueEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "allowAttackActiveCharacters"
      | "giveKeyword"
      | "giveAttribute"
      | "setBasePower"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "preventPlayByEffects"
      | "invalidateEffects"
      | "giveProtection"
      | "protectFromKO"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotAttackTarget"
      | "attackCost"
      | "cannotBlock"
      | "preventBlockerActivation"
      | "redirectDonPhasePlacement";
  }
>;
