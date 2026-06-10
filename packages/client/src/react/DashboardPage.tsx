import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const DashboardPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Poneglyph Sim</h1>
      <p>Create a lobby or manage your account deck loadouts.</p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Make Lobby"
        description="Create a shareable lobby link and pick account deck loadouts."
        href={appRoutePath("match")}
        label="Make Lobby"
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
