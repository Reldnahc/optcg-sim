export interface ActionLogToggleProps {
  open: boolean;
  onToggle: () => void;
}

export const ActionLogToggle = ({
  open,
  onToggle,
}: ActionLogToggleProps): React.JSX.Element => (
  <button
    className={`action-log-toggle ${open ? "is-open" : ""}`}
    type="button"
    aria-label={`${open ? "Close" : "Open"} action log`}
    aria-pressed={open}
    title={`${open ? "Close" : "Open"} action log`}
    onClick={onToggle}
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
