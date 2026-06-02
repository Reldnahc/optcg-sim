import { ControlRail } from "./ControlRail.js";
import type { ControlRailProps } from "./ControlRail.js";

export type MatchControlPanelProps = ControlRailProps;

export const MatchControlPanel = (
  props: MatchControlPanelProps,
): React.JSX.Element => <ControlRail {...props} />;
