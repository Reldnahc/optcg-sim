import type { Effect } from "@optcg/types";

export type ContinuousQueueEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock"
      | "preventBlockerActivation";
  }
>;
