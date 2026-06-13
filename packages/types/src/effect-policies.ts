export type FailurePolicy =
  | "doAsMuchAsPossible"
  | "requiresAll"
  | "skipIfNoLegalTarget"
  | "optionalIfPossible";

export type SourcePresencePolicy =
  | "mustRemainInSameZone"
  | "resolveFromDestinationZone"
  | "resolveFromLastKnownInformation"
  | "noSourceRequired";
