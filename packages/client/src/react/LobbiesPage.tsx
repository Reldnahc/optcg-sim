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
        description="Create a shareable lobby link. The server assigns seats when players join."
        href={appRoutePath("match")}
        label="Create"
      />
      <ShellPageCard
        title="Join Custom Lobby"
        description="Open a shared /lobbies link. Your browser identity claims or resumes your seat."
        href={appRoutePath("lobbies")}
        label="View Lobbies"
      />
    </div>
  </section>
);
