import type { Effect } from "@optcg/types";

export type ContinuousQueueEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "giveAttribute"
      | "setBasePower"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "invalidateEffects"
      | "giveProtection"
      | "protectFromKO"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "attackCost"
      | "cannotBlock"
      | "preventBlockerActivation"
      | "redirectDonPhasePlacement";
  }
>;
