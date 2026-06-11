import type { ClientActionModel } from "../view-model.js";
import { primarySidebarActionPosition } from "./action-emphasis.js";

export interface ActionMenuProps {
  title?: string | undefined;
  actions: readonly ClientActionModel[];
  disabled: boolean;
  onAction: (actionIndex: number) => void;
}

export const ActionMenu = ({
  title,
  actions,
  disabled,
  onAction,
}: ActionMenuProps): React.JSX.Element | null => {
  const primaryActionPosition = primarySidebarActionPosition(actions);
  return actions.length === 0 ? null : (
    <section className="action-menu-panel">
      {title === undefined || title.length === 0 ? null : <h2>{title}</h2>}
      <div className="action-list">
        {actions.map((action, position) => (
          <button
            key={`${String(action.index)}:${String(position)}`}
            className={[
              "action-button",
              position === primaryActionPosition ? "is-primary" : "",
            ]
              .filter(Boolean)
              .join(" ")}
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
};
