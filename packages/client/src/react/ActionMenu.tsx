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
}: ActionMenuProps): React.JSX.Element | null =>
  actions.length === 0 ? null : (
    <section className="action-menu-panel">
      <h2>{title}</h2>
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
    </section>
  );
