import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const DashboardPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Dashboard</h1>
      <p>Choose a play flow, manage decks, or review account state.</p>
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
        title="Decks"
        description="Future home for the Poneglyph deck builder."
        href={appRoutePath("decks")}
        label="View Decks"
      />
      <ShellPageCard
        title="Profile"
        description="Future account, identity, and player settings."
        href={appRoutePath("profile")}
        label="View Profile"
      />
    </div>
  </section>
);
