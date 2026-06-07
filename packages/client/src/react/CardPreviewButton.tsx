export interface CardPreviewButtonProps {
  open: boolean;
  onActivate: () => void;
}

export const CardPreviewButton = ({
  open,
  onActivate,
}: CardPreviewButtonProps): React.JSX.Element => (
  <button
    className={`card-preview-button ${open ? "is-open" : ""}`}
    type="button"
    aria-label="Show preview"
    aria-pressed={open}
    title="Show preview"
    onClick={onActivate}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  </button>
);
