import test from "node:test";
import assert from "node:assert/strict";
import { formatAlertEmail, selectAlertEvents } from "../src/alerter/alert.mjs";

function alertEvent(overrides = {}) {
  return {
    token: "USDC",
    amount: "1500000",
    transferType: "normal",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    blockNumber: 100,
    blockTimestamp: "2026-07-11T00:00:00.000Z",
    transactionHash: `0x${"ab".repeat(32)}`,
    ...overrides,
  };
}

test("alert threshold is inclusive and drops below-threshold transfers", () => {
  const events = [
    alertEvent({ amount: "999999.99" }),
    alertEvent({ amount: "1000000" }),
    alertEvent({ amount: "2500000.5" }),
  ];
  const selected = selectAlertEvents(events, "1000000");
  assert.deepEqual(selected.map((event) => event.amount), ["1000000", "2500000.5"]);
});

test("alert email carries transaction details and an etherscan link", () => {
  const { subject, text } = formatAlertEmail(
    [alertEvent(), alertEvent({ blockNumber: 105, token: "USDT" })],
    "1000000",
  );
  assert.match(subject, /2 transfers >= 1000000 \(blocks 100-105\)/);
  assert.match(text, /USDC 1500000 \(normal\)/);
  assert.match(text, /USDT 1500000/);
  assert.match(text, new RegExp(`https://etherscan\\.io/tx/0x(?:ab){32}`));
});
