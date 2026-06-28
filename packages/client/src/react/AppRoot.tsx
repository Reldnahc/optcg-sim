import { AuthGate } from "./AuthGate.js";
import { AppShell } from "./AppShell.js";
import { appRouteFromPath } from "./app-route.js";
import { DashboardPage } from "./DashboardPage.js";
import { MatchApp } from "./MatchApp.js";
import { NotFoundPage } from "./NotFoundPage.js";
import { ReplaySelectorPage } from "./ReplaySelectorPage.js";
import { ReplayViewerPage } from "./ReplayViewerPage.js";
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
  if (route.id === "match") {
    return (
      <div data-app-route="match">
        {matchSurface ??
          (accountSessionToken === undefined ? undefined : (
            <MatchApp accountSessionToken={accountSessionToken} />
          ))}
      </div>
    );
  }
  if (route.id === "replay") {
    return (
      <div data-app-route="replay">
        <ReplayViewerPage path={route.path} />
      </div>
    );
  }

  const page =
    route.id === "dashboard" ? (
      <DashboardPage />
    ) : route.id === "replayList" ? (
      <ReplaySelectorPage />
    ) : (
      <NotFoundPage path={route.path} />
    );

  return <AppShell>{page}</AppShell>;
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
