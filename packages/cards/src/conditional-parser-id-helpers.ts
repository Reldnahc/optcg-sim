export function toConditionConnectorId({
  connector,
  connectorEnd,
  connectorStart,
}: {
  readonly connector: "and" | "or";
  readonly connectorEnd: number;
  readonly connectorStart: number;
}): string {
  return `condition-connector:${connector}:${String(connectorStart)}-${String(connectorEnd)}`;
}
