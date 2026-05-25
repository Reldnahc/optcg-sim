import type { ClientActionModel } from "../view-model.js";

export interface ActionMenuProps {
  title: string;
  actions: readonly ClientActionModel[];
  disabled: boolean;
  onAction: (actionIndex: number) => void;
}

export const ActionMenu = ({
  title,
  actions,
  disabled,
  onAction,
}: ActionMenuProps): React.JSX.Element => (
  <section className="action-menu-panel">
    <h2>{title}</h2>
    {actions.length === 0 ? (
      <p className="muted">No actions</p>
    ) : (
      <div className="action-list">
        {actions.map((action) => (
          <button
            key={action.index}
            className="action-button"
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
    )}
  </section>
);
