import type { CardId, ResolvedCard } from "@optcg/types";

import type { ProbeCardProfile } from "./behavior-probe-scenario-profiles.js";

export const resolvedProbeCard = (params: {
  readonly cardId: CardId;
  readonly category: "leader" | "character" | "event" | "don" | "stage";
  readonly effectText: string;
  readonly profile?: ProbeCardProfile;
  readonly support?: ResolvedCard["support"];
}): ResolvedCard => ({
  cardId: params.cardId,
  language: "en",
  name: params.profile?.name ?? String(params.cardId),
  category: params.category,
  set: "PROBE",
  setName: "Behavior Probe",
  released: true,
  colors:
    params.category === "don" ? [] : [...(params.profile?.colors ?? ["red"])],
  attributes: [...(params.profile?.attributes ?? [])],
  types: [...(params.profile?.types ?? [])],
  printedKeywords: [...(params.profile?.keywords ?? [])],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: "behavior-probe-source",
  behaviorHash: "behavior-probe-behavior",
  support: params.support ?? {
    cardId: params.cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "behavior-probe",
    cardDataVersion: "behavior-probe",
    sourceTextHash: "behavior-probe-source",
    behaviorHash: "behavior-probe-behavior",
  },
  ...(params.category === "character"
    ? {
        cost: params.profile?.cost ?? 0,
        power: params.profile?.power ?? 2000,
      }
    : {}),
  ...(params.category === "leader"
    ? { power: params.profile?.power ?? 5000 }
    : {}),
  ...(params.category === "event" || params.category === "stage"
    ? { cost: params.profile?.cost ?? 0 }
    : {}),
  ...(params.profile?.counter === undefined
    ? {}
    : { counter: params.profile.counter }),
  ...(params.effectText.length === 0 ? {} : { effectText: params.effectText }),
});
