import type { ClientCardModel } from "../view-model.js";

export interface CardTileProps {
  card: ClientCardModel;
  label?: string | undefined;
  selected?: boolean;
  onClick?: (() => void) | undefined;
}

export const CardTile = ({
  card,
  label,
  selected = false,
  onClick,
}: CardTileProps): React.JSX.Element => {
  const image =
    card.imageUrl === undefined ? (
      <div className="card-face card-placeholder">{card.name}</div>
    ) : (
      <img className="card-face" src={card.imageUrl} alt={card.name} />
    );
  return (
    <button
      className={`card-tile ${card.state === "rested" ? "is-rested" : ""} ${
        selected ? "is-selected" : ""
      }`}
      type="button"
      title={card.name}
      onClick={onClick}
    >
      {image}
      {label === undefined ? null : <span className="card-tag">{label}</span>}
    </button>
  );
};
