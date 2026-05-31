import { describe, expect, it } from "vitest";

import {
  fieldRemovalProtectionProcessPrimitive,
  koProtectionProcessPrimitive,
  parseProtectionProcess,
  restProtectionProcessPrimitive,
} from "./process.js";

describe("protection process parser", () => {
  it("defines only the actual protection processes as primitive parents", () => {
    expect(fieldRemovalProtectionProcessPrimitive).toMatchObject({
      primitiveId: "protectionProcess:fieldRemoval",
      matches: [
        {
          id: "cannot-be-removed-from-field",
        },
      ],
    });
    expect(koProtectionProcessPrimitive).toMatchObject({
      primitiveId: "protectionProcess:ko",
      matches: [
        {
          id: "cannot-be-ko",
        },
      ],
    });
    expect(restProtectionProcessPrimitive).toMatchObject({
      primitiveId: "protectionProcess:rest",
      matches: [
        {
          id: "cannot-be-rested",
        },
      ],
    });
  });

  it("parses field removal as a protection process and leaves source text", () => {
    expect(
      parseProtectionProcess({
        text: "cannot be removed from the field by your opponent's effects",
      }),
    ).toEqual({
      process: { type: "fieldRemoval" },
      evidence: ["protectionProcess:fieldRemoval"],
      rest: "by your opponent's effects",
    });
  });

  it("parses K.O. as a protection process independently from source/cause", () => {
    expect(
      parseProtectionProcess({
        text: "cannot be K.O.'d in battle by <Slash> attribute cards",
      }),
    ).toEqual({
      process: { type: "ko" },
      evidence: ["protectionProcess:ko"],
      rest: "in battle by <Slash> attribute cards",
    });
  });

  it("parses rest as a protection process independently from source/cause", () => {
    expect(
      parseProtectionProcess({
        text: "cannot be rested by your opponent's Leader and Character effects",
      }),
    ).toEqual({
      process: { type: "rest" },
      evidence: ["protectionProcess:rest"],
      rest: "by your opponent's Leader and Character effects",
    });
  });
});
