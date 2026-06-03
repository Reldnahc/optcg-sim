export interface PlayerRestrictionBadgesProps {
  label: string;
  restrictions?: readonly string[] | undefined;
}

export const PlayerRestrictionBadges = ({
  label,
  restrictions = [],
}: PlayerRestrictionBadgesProps): React.JSX.Element | null => {
  if (restrictions.length === 0) {
    return null;
  }

  return (
    <div
      className="player-restriction-badges"
      aria-label={`${label} restrictions`}
    >
      {restrictions.map((restriction) => (
        <span key={restriction} className="player-restriction-badge">
          {restrictionLabel(restriction)}
        </span>
      ))}
    </div>
  );
};

const restrictionLabel = (restriction: string): string =>
  restriction
    .replaceAll("-", " ")
    .replace("don", "DON")
    .replace("event", "Event")
    .replace("stage", "Stage")
    .replace("leader", "Leader");
