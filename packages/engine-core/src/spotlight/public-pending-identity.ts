import type {
  PendingDecision,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

export const publicPendingDecisionIdForAnchor = ({
  decisionAnchorEventId,
  playerId,
}: {
  readonly decisionAnchorEventId: NonNullable<
    PendingDecision["decisionAnchorEventId"]
  >;
  readonly playerId: PlayerId;
}): PublicPendingDecisionId =>
  `spotlight:pending:${String(decisionAnchorEventId)}:recipient:${String(
    playerId,
  )}` as PublicPendingDecisionId;

export const publicPendingDecisionIdForPendingDecision = ({
  pending,
  recipientPlayerId,
}: {
  readonly pending: PendingDecision;
  readonly recipientPlayerId: PlayerId;
}): PublicPendingDecisionId => {
  if (pending.decisionAnchorEventId !== undefined) {
    return publicPendingDecisionIdForAnchor({
      decisionAnchorEventId: pending.decisionAnchorEventId,
      playerId: recipientPlayerId,
    });
  }

  void pending;
  return `spotlight:pending:unanchored:recipient:${String(
    recipientPlayerId,
  )}` as PublicPendingDecisionId;
};
