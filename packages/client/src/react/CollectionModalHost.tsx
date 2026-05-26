import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";
import { ModalFrame } from "./ModalFrame.js";

export interface CollectionModalModel {
  title: string;
  cards: readonly ClientCardModel[];
}

export interface CollectionModalHostProps {
  model?: CollectionModalModel | undefined;
  onClose: () => void;
}

export const CollectionModalHost = ({
  model,
  onClose,
}: CollectionModalHostProps): React.JSX.Element | null => {
  if (model === undefined) {
    return null;
  }

  return (
    <ModalFrame
      title={model.title}
      className="modal-frame-collection collection-modal"
      onClose={onClose}
    >
      <div className="collection-modal-card-grid">
        {model.cards.map((card) => (
          <CardTile key={String(card.instanceId)} card={card} />
        ))}
      </div>
    </ModalFrame>
  );
};
