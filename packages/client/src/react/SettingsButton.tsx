export interface SettingsButtonProps {
  open: boolean;
  onActivate: () => void;
}

export const SettingsButton = ({
  open,
  onActivate,
}: SettingsButtonProps): React.JSX.Element => (
  <button
    className={`settings-button ${open ? "is-open" : ""}`}
    type="button"
    aria-label="Show settings"
    aria-pressed={open}
    title="Show settings"
    onClick={onActivate}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.1 2.8h3.8l.4 2.3a7.2 7.2 0 0 1 1.3.6l2-1.3 2.7 2.7-1.3 2a7.2 7.2 0 0 1 .6 1.3l2.3.4v3.8l-2.3.4a7.2 7.2 0 0 1-.6 1.3l1.3 2-2.7 2.7-2-1.3a7.2 7.2 0 0 1-1.3.6l-.4 2.3h-3.8l-.4-2.3a7.2 7.2 0 0 1-1.3-.6l-2 1.3-2.7-2.7 1.3-2a7.2 7.2 0 0 1-.6-1.3l-2.3-.4v-3.8l2.3-.4A7.2 7.2 0 0 1 5 9.1l-1.3-2 2.7-2.7 2 1.3a7.2 7.2 0 0 1 1.3-.6Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  </button>
);
