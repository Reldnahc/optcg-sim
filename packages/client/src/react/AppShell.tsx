import { appRoutePath, appRoutes, type AppRouteId } from "./app-route.js";

export interface AppShellProps {
  activeRouteId: AppRouteId;
  children: React.ReactNode;
}

const navRoutes = appRoutes.filter((route) => route.id !== "match");

export const AppShell = ({
  activeRouteId,
  children,
}: AppShellProps): React.JSX.Element => (
  <div className="client-app-shell">
    <header className="client-shell-header">
      <a className="client-shell-brand" href={appRoutePath("dashboard")}>
        Poneglyph Sim
      </a>
      <nav className="client-shell-nav" aria-label="Primary">
        {navRoutes.map((route) => (
          <a
            key={route.id}
            className={route.id === activeRouteId ? "is-active" : ""}
            href={route.path}
          >
            {route.label}
          </a>
        ))}
      </nav>
    </header>
    <main className="client-shell-main">{children}</main>
  </div>
);
