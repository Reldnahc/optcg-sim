import { createRoot } from "react-dom/client";
import "optcg-card-rules/styles.css";
import { AppRoot } from "./AppRoot.js";
import "./styles.css";
import "./styles/auth-gate.css";
import "./styles/app-shell.css";
import "./styles/app-shell-pages.css";
import "./styles/count-badge.css";
import "./styles/playmat.css";
import "./styles/zone.css";
import "./styles/card.css";
import "./styles/card-preview-window.css";
import "./styles/action-log-window.css";
import "./styles/settings-window.css";
import "./styles/controls.css";
import "./styles/modal-frame.css";
import "./styles/floating-window.css";
import "./styles/tabbed-floating-window.css";
import "./styles/decision-modal.css";
import "./styles/collection-modal.css";
import "./styles/reveal-window.css";
import "./styles/presentation-effects.css";
import "./styles/effect-rules-text.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}

createRoot(root).render(<AppRoot />);
