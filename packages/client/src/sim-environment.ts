export interface SimBrowserLocation {
  readonly hostname: string;
}

export type SimAccessEnvironment = "dev" | "local";

const localSimHostnames = new Set([
  "localhost",
  "127.0.0.1",
  "local-sim.poneglyph.one",
]);

export const allowsLocalRawDeckSubmissions = ({
  hostname,
}: SimBrowserLocation): boolean =>
  localSimHostnames.has(hostname.trim().toLowerCase());

export const simAccessEnvironmentForLocation = ({
  hostname,
}: SimBrowserLocation): SimAccessEnvironment =>
  localSimHostnames.has(hostname.trim().toLowerCase()) ? "local" : "dev";
