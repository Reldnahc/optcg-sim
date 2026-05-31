import { appRoutePath } from "./app-route.js";
import { ShellPageCard } from "./ShellPageCard.js";

export const PlayPage = (): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Play</h1>
      <p>
        Queue entry will live here once deck and account validation are wired.
      </p>
    </div>
    <div className="shell-card-grid">
      <ShellPageCard
        title="Ranked Queue"
        description="Requires production accounts, deck validation, and ladder policy."
        label="Unavailable"
        disabled
      />
      <ShellPageCard
        title="Unranked Queue"
        description="Requires queue tickets and server-side deck validation."
        label="Unavailable"
        disabled
      />
      <ShellPageCard
        title="Dev Match"
        description="Open the current match board for local simulator testing."
        href={appRoutePath("match")}
        label="Open Match"
      />
    </div>
  </section>
);
