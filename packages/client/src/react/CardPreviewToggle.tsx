export interface CardPreviewToggleProps {
  open: boolean;
  onToggle: () => void;
}

export const CardPreviewToggle = ({
  open,
  onToggle,
}: CardPreviewToggleProps): React.JSX.Element => (
  <button
    className={`card-preview-toggle ${open ? "is-open" : ""}`}
    type="button"
    aria-label={`${open ? "Close" : "Open"} preview`}
    aria-pressed={open}
    title={`${open ? "Close" : "Open"} preview`}
    onClick={onToggle}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  </button>
);
