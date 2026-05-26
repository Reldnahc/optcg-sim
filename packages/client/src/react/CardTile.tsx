import type { ClientActionModel, ClientCardModel } from "../view-model.js";

export interface CardTileProps {
  card: ClientCardModel;
  label?: string | undefined;
  selected?: boolean;
  actions?: readonly ClientActionModel[] | undefined;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onAction?: ((actionIndex: number) => void) | undefined;
}

export const CardTile = ({
  card,
  label,
  selected = false,
  actions = [],
  disabled = false,
  onClick,
  onAction,
}: CardTileProps): React.JSX.Element => {
  const image =
    card.imageUrl === undefined ? (
      <div className="card-face card-placeholder">{card.name}</div>
    ) : (
      <img className="card-face" src={card.imageUrl} alt={card.name} />
    );
  return (
    <div className="card-tile-shell">
      <button
        className={`card-tile ${card.state === "rested" ? "is-rested" : ""} ${
          selected ? "is-selected" : ""
        }`}
        type="button"
        title={card.name}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        {image}
        {label === undefined ? null : <span className="card-tag">{label}</span>}
      </button>
      {selected && actions.length > 0 && onAction !== undefined ? (
        <div
          className="card-action-popover"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {actions.map((action) => (
            <button
              key={action.index}
              className="card-action-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                onAction(action.index);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
