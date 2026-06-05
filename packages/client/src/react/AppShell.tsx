export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps): React.JSX.Element => (
  <div className="client-app-shell">
    <main className="client-shell-main">{children}</main>
  </div>
);
