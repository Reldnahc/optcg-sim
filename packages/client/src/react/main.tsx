import { createRoot } from "react-dom/client";
import { MatchApp } from "./MatchApp.js";
import "./styles.css";
import "./styles/app-shell.css";
import "./styles/count-badge.css";
import "./styles/playmat.css";
import "./styles/zone.css";
import "./styles/card.css";
import "./styles/card-preview-window.css";
import "./styles/controls.css";
import "./styles/modal-frame.css";
import "./styles/floating-window.css";
import "./styles/decision-modal.css";
import "./styles/collection-modal.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}

createRoot(root).render(<MatchApp />);
