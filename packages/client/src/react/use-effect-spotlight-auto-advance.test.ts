import { describe, expect, it } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import { shouldAutoAdvanceSpotlightPlayback } from "./use-effect-spotlight.js";

const source = (
  key: string,
  spanId: EffectTextSpanId,
  mode: "live" | "resolved" = "resolved",
) => ({
  active: {
    source: {
      instanceId: "source-1" as InstanceId,
      cardId: "OP00-001" as CardId,
      playerId: "p1" as PlayerId,
    },
    activeSpanIds: [spanId],
  },
  id: key,
  key,
  semanticKey: `p1|source-1|OP00-001|effect|${spanId}`,
  mode,
  status: mode === "live" ? ("pending" as const) : ("resolved" as const),
});

const publicPendingId = (value: string): PublicPendingDecisionId =>
  value as PublicPendingDecisionId;

describe("effect spotlight auto advance", () => {
  it("does not advance while a modal-pinned spotlight is past its timer", () => {
    expect(
      shouldAutoAdvanceSpotlightPlayback({
        currentSource: source("decision:pinned", "span:body", "live"),
        model: {
          active: source("decision:pinned", "span:body", "live").active,
          activeKey: "decision:pinned",
          activeMode: "live",
          sourceInstanceId: "source-1",
          activeSpanIds: ["span:body"],
          shownAtMs: 1_000,
          visibleUntilMs: 3_000,
          pinned: true,
        },
        paused: false,
      }),
    ).toBe(false);
  });

  it("does not advance a pending current source using a stale resolved display", () => {
    expect(
      shouldAutoAdvanceSpotlightPlayback({
        currentSource: {
          ...source(
            "decision:order|source-1||span:search:remaining",
            "span:search:remaining",
            "live",
          ),
          pendingDecisionId: publicPendingId("spotlight:pending:order"),
        },
        model: {
          active: source(
            "event:search:span:search:selection",
            "span:search:selection",
          ).active,
          activeKey: "event:search:span:search:selection",
          activeMode: "resolved",
          sourceInstanceId: "source-1",
          activeSpanIds: ["span:search:selection"],
          shownAtMs: 1_000,
          visibleUntilMs: 3_000,
          pinned: false,
        },
        paused: false,
      }),
    ).toBe(false);
  });
});
