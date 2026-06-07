export interface ActionLogButtonProps {
  open: boolean;
  onActivate: () => void;
}

export const ActionLogButton = ({
  open,
  onActivate,
}: ActionLogButtonProps): React.JSX.Element => (
  <button
    className={`action-log-button ${open ? "is-open" : ""}`}
    type="button"
    aria-label="Show action log"
    aria-pressed={open}
    title="Show action log"
    onClick={onActivate}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h11" />
      <path d="M8 12h11" />
      <path d="M8 18h11" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  </button>
);
