import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { test } from "vitest";

const readUiScript = (): string =>
  readFileSync(fileURLToPath(new URL("../ui/app.js", import.meta.url)), "utf8");

const readUiStyles = (): string =>
  readFileSync(
    fileURLToPath(new URL("../ui/styles.css", import.meta.url)),
    "utf8",
  );

test("dev UI keeps concede out of popup followups and requires confirmation", () => {
  const script = readUiScript();

  assert.equal(script.includes("actionInFlight"), true);
  assert.equal(script.includes("nonConcedeGlobalActions"), true);
  assert.equal(script.includes("concedeActions"), true);
  assert.equal(script.includes("data-concede-confirm"), true);
  assert.equal(script.includes("Confirm concede"), true);
  assert.equal(script.includes("expectedStateSeq"), true);
  assert.equal(script.includes("/api/matches"), true);
  assert.equal(script.includes("matchApiPath"), true);
});

test("dev UI keeps action lists height bounded independently from concede", () => {
  const styles = readUiStyles();

  assert.match(
    styles,
    /\.rail-actions\s*\{[^}]*max-height:[^}]*overflow: auto/s,
  );
});
