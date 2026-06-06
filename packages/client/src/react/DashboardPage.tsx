import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const DashboardPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Dashboard</h1>
      <p>Choose a play flow or join a custom lobby.</p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Play"
        description="Enter queue flows or launch a development match."
        href={appRoutePath("play")}
        label="Go to Play"
      />
      <ShellPageCard
        title="Custom Lobbies"
        description="Create or join custom games with the current local lobby flow."
        href={appRoutePath("lobbies")}
        label="Open Lobbies"
      />
      <ShellPageCard
        title="Deck editor"
        description="Build and manage Poneglyph deck loadouts in a new tab."
        href="https://poneglyph.one/decks"
        label="Open Deck Editor"
        target="_blank"
        rel="noreferrer"
      />
    </div>
  </section>
);
