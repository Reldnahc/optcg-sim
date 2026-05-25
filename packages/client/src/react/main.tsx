import { createRoot } from "react-dom/client";
import { MatchApp } from "./MatchApp.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}

createRoot(root).render(<MatchApp />);
