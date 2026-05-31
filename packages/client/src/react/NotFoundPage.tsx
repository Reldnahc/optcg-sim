import { appRoutePath } from "./app-route.js";

export interface NotFoundPageProps {
  path: string;
}

export const NotFoundPage = ({
  path,
}: NotFoundPageProps): React.JSX.Element => (
  <section className="shell-page">
    <div className="shell-page-heading">
      <h1>Page not found</h1>
      <p>No simulator page exists at {path}.</p>
      <a className="shell-card-action" href={appRoutePath("dashboard")}>
        Back to dashboard
      </a>
    </div>
  </section>
);
