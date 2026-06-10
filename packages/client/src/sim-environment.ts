export interface SimBrowserLocation {
  readonly hostname: string;
}

const localSimHostnames = new Set([
  "localhost",
  "127.0.0.1",
  "local-sim.poneglyph.one",
]);

export const allowsLocalRawDeckSubmissions = ({
  hostname,
}: SimBrowserLocation): boolean =>
  localSimHostnames.has(hostname.trim().toLowerCase());
