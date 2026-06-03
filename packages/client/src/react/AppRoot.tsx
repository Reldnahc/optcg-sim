import { AuthGate } from "./AuthGate.js";
import { AppShell } from "./AppShell.js";
import { appRouteFromPath } from "./app-route.js";
import { DashboardPage } from "./DashboardPage.js";
import { DecksPage } from "./DecksPage.js";
import { LobbiesPage } from "./LobbiesPage.js";
import { MatchApp } from "./MatchApp.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { PlayPage } from "./PlayPage.js";
import { ProfilePage } from "./ProfilePage.js";
import { simAuthSessionToken, useSimAuth } from "./use-sim-auth.js";

export interface AppRootProps {
  path?: string | undefined;
  matchSurface?: React.ReactNode | undefined;
  accountSessionToken?: string | undefined;
}

export const AppRootContent = ({
  path,
  matchSurface,
  accountSessionToken,
}: AppRootProps): React.JSX.Element => {
  const route = appRouteFromPath(
    path ?? `${window.location.pathname}${window.location.search}`,
  );
  if (route.id === "match" || route.path.startsWith("/lobbies/")) {
    return (
      <div data-app-route="match">
        {matchSurface ??
          (accountSessionToken === undefined ? undefined : (
            <MatchApp accountSessionToken={accountSessionToken} />
          ))}
      </div>
    );
  }

  const page =
    route.id === "dashboard" ? (
      <DashboardPage />
    ) : route.id === "play" ? (
      <PlayPage />
    ) : route.id === "lobbies" ? (
      <LobbiesPage />
    ) : route.id === "decks" ? (
      <DecksPage />
    ) : route.id === "profile" ? (
      <ProfilePage />
    ) : (
      <NotFoundPage path={route.path} />
    );

  return <AppShell activeRouteId={route.id}>{page}</AppShell>;
};

export const AppRoot = (props: AppRootProps): React.JSX.Element => {
  const auth = useSimAuth();
  const accountSessionToken =
    auth.session === undefined ? undefined : simAuthSessionToken(auth.session);
  return (
    <AuthGate
      sessionStatus={auth.status}
      submitStatus={auth.submitStatus}
      error={auth.error}
      onLogin={auth.login}
      onRegister={auth.register}
    >
      <AppRootContent {...props} accountSessionToken={accountSessionToken} />
    </AuthGate>
  );
};
