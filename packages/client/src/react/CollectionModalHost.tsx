import type { ClientCardModel } from "../view-model.js";
import { CardTile } from "./CardTile.js";

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
    <section
      className="collection-modal"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className="collection-modal-header">
        <h2>{model.title}</h2>
        <button
          className="collection-modal-close"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="collection-modal-card-grid">
        {model.cards.map((card) => (
          <CardTile key={String(card.instanceId)} card={card} />
        ))}
      </div>
    </section>
  );
};
