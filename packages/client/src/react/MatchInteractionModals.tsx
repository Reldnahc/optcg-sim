import type { ComponentProps } from "react";

import { CollectionModalHost } from "./CollectionModalHost.js";
import { DecisionModalHost } from "./DecisionModalHost.js";
import { OpponentRevealWindowLayer } from "./OpponentRevealWindowLayer.js";

type DecisionModalHostProps = ComponentProps<typeof DecisionModalHost>;
type CollectionModalHostProps = ComponentProps<typeof CollectionModalHost>;
type OpponentRevealWindowLayerProps = ComponentProps<
  typeof OpponentRevealWindowLayer
>;

export interface MatchInteractionModalsProps {
  actionInFlight: boolean;
  cardDisplay: DecisionModalHostProps["cardDisplay"];
  cardModel: DecisionModalHostProps["cardModel"];
  collectionModalHostProps: CollectionModalHostProps;
  decisionModal: DecisionModalHostProps["model"];
  decisionModalCoveredByCollection: boolean;
  opponentRevealWindowLayerProps: OpponentRevealWindowLayerProps;
  onActionOption: DecisionModalHostProps["onActionOption"];
  onChooseTrigger: DecisionModalHostProps["onChooseTrigger"];
  onConfirm: DecisionModalHostProps["onConfirm"];
  onMoveOrderedCard: DecisionModalHostProps["onMoveOrderedCard"];
  onOption: DecisionModalHostProps["onOption"];
  onPlacementDestination: DecisionModalHostProps["onPlacementDestination"];
  onPreviewCard: DecisionModalHostProps["onPreviewCard"];
  onQuantity: DecisionModalHostProps["onQuantity"];
  onSubmitActionOption: DecisionModalHostProps["onSubmitActionOption"];
  onSubmitOption: DecisionModalHostProps["onSubmitOption"];
  onSubmitQuantity: DecisionModalHostProps["onSubmitQuantity"];
  onToggleCard: DecisionModalHostProps["onToggleCard"];
}

export const MatchInteractionModals = ({
  actionInFlight,
  cardDisplay,
  cardModel,
  collectionModalHostProps,
  decisionModal,
  decisionModalCoveredByCollection,
  opponentRevealWindowLayerProps,
  onActionOption,
  onChooseTrigger,
  onConfirm,
  onMoveOrderedCard,
  onOption,
  onPlacementDestination,
  onPreviewCard,
  onQuantity,
  onSubmitActionOption,
  onSubmitOption,
  onSubmitQuantity,
  onToggleCard,
}: MatchInteractionModalsProps): React.JSX.Element => (
  <>
    <DecisionModalHost
      model={!decisionModalCoveredByCollection ? decisionModal : undefined}
      disabled={actionInFlight}
      cardDisplay={cardDisplay}
      cardModel={cardModel}
      onToggleCard={onToggleCard}
      onChooseTrigger={onChooseTrigger}
      onQuantity={onQuantity}
      onOption={onOption}
      onActionOption={onActionOption}
      onSubmitQuantity={onSubmitQuantity}
      onSubmitOption={onSubmitOption}
      onSubmitActionOption={onSubmitActionOption}
      onPreviewCard={onPreviewCard}
      onMoveOrderedCard={onMoveOrderedCard}
      onPlacementDestination={onPlacementDestination}
      onConfirm={onConfirm}
    />
    <CollectionModalHost {...collectionModalHostProps} />
    <OpponentRevealWindowLayer {...opponentRevealWindowLayerProps} />
  </>
);
