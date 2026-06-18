import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, test } from "vitest";

import { MatchApp } from "./MatchApp.js";
import { createReplayMatchClient } from "./replay-match-client.js";
import type { MatchClientUi } from "./useMatchClient-support.js";

const replayClientWithConnectionStatus = (
  status: "connecting" | "connected" | "reconnecting" | undefined,
): MatchClientUi => {
  const client = createReplayMatchClient(undefined);
  return {
    ...client,
    state: {
      ...client.state,
      errors: [],
      ...(status === undefined ? {} : { connectionStatus: status }),
    },
  };
};

describe("match reconnect screen", () => {
  test("renders a blocking reconnect screen while the live socket is reconnecting", () => {
    const markup = renderToStaticMarkup(
      createElement(MatchApp, {
        client: replayClientWithConnectionStatus("reconnecting"),
      }),
    );

    assert.match(markup, /match-reconnect-overlay/u);
    assert.match(markup, /Lost connection/u);
    assert.match(
      markup,
      /The server might be restarting or shutting down\. Please wait\. Your game will resume once reconnected\./u,
    );
  });

  test("does not render the reconnect screen before an established disconnect", () => {
    const connectingMarkup = renderToStaticMarkup(
      createElement(MatchApp, {
        client: replayClientWithConnectionStatus("connecting"),
      }),
    );
    const connectedMarkup = renderToStaticMarkup(
      createElement(MatchApp, {
        client: replayClientWithConnectionStatus("connected"),
      }),
    );

    assert.doesNotMatch(connectingMarkup, /match-reconnect-overlay/u);
    assert.doesNotMatch(connectedMarkup, /match-reconnect-overlay/u);
  });
});
