import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const LobbiesPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Custom Lobbies</h1>
      <p>
        Use the current local lobby flow while production lobby services evolve.
      </p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Create Custom Lobby"
        description="Start the current dev lobby flow from the match board."
        href={appRoutePath("match")}
        label="Create"
      />
      <ShellPageCard
        title="Join Custom Lobby"
        description="Open an existing lobby link with lobbyId and seat query parameters."
        href={appRoutePath("match")}
        label="Join"
      />
    </div>
  </section>
);
