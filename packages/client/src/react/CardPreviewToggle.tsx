export interface CardPreviewToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export const CardPreviewToggle = ({
  enabled,
  onToggle,
}: CardPreviewToggleProps): React.JSX.Element => (
  <button
    className={`card-preview-toggle ${enabled ? "is-enabled" : ""}`}
    type="button"
    aria-label={`${enabled ? "Disable" : "Enable"} card preview on hover`}
    aria-pressed={enabled}
    title={`${enabled ? "Disable" : "Enable"} card preview on hover`}
    onClick={onToggle}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
  </button>
);
