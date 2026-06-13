import { describe, expect, it } from "vitest";

import {
  entryPointDefinitions,
  recognizedUnsupportedEntryPoints,
  supportedEntryPoints,
} from "../entry-point-definitions.js";
import { parseRecognizedUnsupportedEntryPoint } from "./recognized-unsupported.js";
import { parseSupportedEntryPoint } from "./supported.js";

describe("recognized unsupported entry-point parser", () => {
  it("derives recognized unsupported entries from the shared entry-point registry", () => {
    expect(entryPointDefinitions).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ supportStatus: "recognizedUnsupported" }),
      ]),
    );
    expect(recognizedUnsupportedEntryPoints.map((entry) => entry.text)).toEqual(
      [],
    );
    expect(supportedEntryPoints.map((entry) => entry.text)).toContain(
      "[On Block]",
    );
  });

  it("does not mark supported entries as recognized unsupported", () => {
    expect(
      parseRecognizedUnsupportedEntryPoint({ text: "[On Block]" }),
    ).toBeUndefined();
    expect(parseSupportedEntryPoint({ text: "[On Block]" })).toMatchObject({
      node: { type: "entryPoint", trigger: { type: "onBlock" } },
      evidence: ["entry:onBlock", "sourcePresence:mustRemain"],
      rest: "",
    });
  });
});
