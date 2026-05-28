import type { ClientActionModel, ClientCardModel } from "../view-model.js";

export interface CardTileProps {
  card: ClientCardModel;
  label?: string | undefined;
  selectionOrderLabel?: string | undefined;
  selected?: boolean;
  active?: boolean | undefined;
  pendingChoice?: boolean | undefined;
  selectedDonInstanceIds?: readonly string[] | undefined;
  actions?: readonly ClientActionModel[] | undefined;
  disabled?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onAction?: ((actionIndex: number) => void) | undefined;
  onAttachedDonClick?: ((instanceId: string) => void) | undefined;
  onHover?: ((card: ClientCardModel) => void) | undefined;
}

export const CardTile = ({
  card,
  label,
  selectionOrderLabel,
  selected = false,
  active = false,
  pendingChoice = false,
  selectedDonInstanceIds = [],
  actions = [],
  disabled = false,
  onClick,
  onAction,
  onAttachedDonClick,
  onHover,
}: CardTileProps): React.JSX.Element => {
  const isSelected =
    selected || selectedDonInstanceIds.includes(String(card.instanceId));
  const image =
    card.category === "hidden" ? (
      <div className="card-face card-back" aria-label={card.name} />
    ) : card.imageUrl === undefined ? (
      <div className="card-face card-placeholder">{card.name}</div>
    ) : (
      <img className="card-face" src={card.imageUrl} alt={card.name} />
    );
  const powerDeltaText =
    card.powerDelta === undefined
      ? undefined
      : `${card.powerDelta > 0 ? "+" : ""}${String(card.powerDelta)}`;
  return (
    <div
      className="card-tile-shell"
      data-card-instance-id={String(card.instanceId)}
      onPointerEnter={() => {
        onHover?.(card);
      }}
    >
      <button
        className={`card-tile ${card.state === "rested" ? "is-rested" : ""} ${
          isSelected ? "is-selected" : ""
        } ${active ? "is-active" : ""} ${
          pendingChoice ? "is-pending-choice" : ""
        }`}
        type="button"
        title={card.name}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        {image}
        {label === undefined ? null : <span className="card-tag">{label}</span>}
        {selectionOrderLabel === undefined ? null : (
          <span className="selection-order-badge">{selectionOrderLabel}</span>
        )}
        {powerDeltaText === undefined ? null : (
          <span
            className={`power-delta ${
              card.powerDelta === undefined || card.powerDelta > 0
                ? "power-delta-positive"
                : "power-delta-negative"
            }`}
          >
            {powerDeltaText}
          </span>
        )}
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
      {card.attachedDonCards.length > 0 ? (
        <div className="attached-don-stack" aria-label="Attached DON!!">
          {card.attachedDonCards.map((donCard) => (
            <button
              key={String(donCard.instanceId)}
              className="attached-don-card"
              type="button"
              title={donCard.name}
              onClick={(event) => {
                event.stopPropagation();
                onAttachedDonClick?.(String(donCard.instanceId));
              }}
            >
              {donCard.imageUrl === undefined ? (
                <span>{donCard.name}</span>
              ) : (
                <img src={donCard.imageUrl} alt={donCard.name} />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
