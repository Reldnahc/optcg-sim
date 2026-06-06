export interface ShellPageCardProps {
  title: string;
  description: string;
  href?: string | undefined;
  label?: string | undefined;
  target?: string | undefined;
  rel?: string | undefined;
  disabled?: boolean | undefined;
}

export const ShellPageCard = ({
  title,
  description,
  href,
  label = "Open",
  target,
  rel,
  disabled = false,
}: ShellPageCardProps): React.JSX.Element => (
  <article className={`shell-page-card ${disabled ? "is-disabled" : ""}`}>
    <h3>{title}</h3>
    <p>{description}</p>
    {disabled || href === undefined ? (
      <span className="shell-card-action is-disabled">{label}</span>
    ) : (
      <a className="shell-card-action" href={href} target={target} rel={rel}>
        {label}
      </a>
    )}
  </article>
);
