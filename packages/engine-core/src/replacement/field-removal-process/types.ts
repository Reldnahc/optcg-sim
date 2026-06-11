import type {
  ActiveEffectTextPresentation,
  CardInstance,
  CardRef,
  EffectQueueEntry,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

export interface SelectedTargetKoReplacementPayload {
  effectId: string;
  queueEntryId?: EffectQueueEntry["id"];
  source: CardRef;
  target: CardRef;
  targets?: CardRef[];
  fieldRemovalAttempt: {
    processFamily: "fieldRemoval";
    classification:
      | "moveFromFieldToDeckBottom"
      | "moveFromFieldToLife"
      | "moveFromFieldToHand"
      | "moveFromFieldToTrash";
    sourceKind: "battle" | "cardEffect";
    sourceControllerId: PlayerId;
  };
  fieldRemovalDestination?: {
    zone: "life";
    position: "top" | "bottom";
    faceUp?: boolean;
  };
  battleContinuation?: {
    type: "endBattleAfterCharacterKoAttempt";
  };
}

export type LocatedReplacementSource = {
  card: CardInstance;
};

export type LocatedKoTarget = {
  playerId: PlayerId;
  card: CardInstance;
};

export interface PendingReplacementRestInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  coveredTargets?: CardRef[];
  causedBy: ReplacementProcess["causedBy"];
  controllerId: PlayerId;
  presentation?: ActiveEffectTextPresentation;
}

export interface PendingReplacementTrashFromHandInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  coveredTargets?: CardRef[];
  causedBy: ReplacementProcess["causedBy"];
  controllerId: PlayerId;
  count: number;
  presentation?: ActiveEffectTextPresentation;
  oncePerTurn?: {
    cardInstanceId: CardInstance["instanceId"];
    effectId: EffectQueueEntry["effectBlockId"];
    turnNumber: GameState["turn"]["globalTurn"];
  };
}
