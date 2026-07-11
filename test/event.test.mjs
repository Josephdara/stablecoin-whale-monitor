import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvent,
  classifyTransfer,
  decodeTransferLog,
  eventKey,
  rangeObjectName,
} from "../src/event.mjs";
import {
  ADDRESS_A,
  ADDRESS_B,
  ZERO_ADDRESS,
  block,
  testConfig,
  transferLog,
} from "./helpers.mjs";

test("decodes USDC and serializes the complete event contract", () => {
  const config = testConfig();
  const transfer = decodeTransferLog(transferLog(config, { rawAmount: 125_000n * 1_000_000n, logIndex: 42 }), config);
  const event = buildEvent(transfer, block(100), config, "2026-06-30T18:47:02.000Z");

  assert.deepEqual(event, {
    chain: "ethereum",
    chainId: 1,
    token: "USDC",
    tokenContract: config.tokens[0].address,
    transactionHash: `0x${43n.toString(16).padStart(64, "0")}`,
    blockNumber: 100,
    blockTimestamp: block(100).timestamp,
    logIndex: 42,
    from: ADDRESS_A,
    to: ADDRESS_B,
    rawAmount: "125000000000",
    amount: "125000",
    threshold: "100000",
    transactionStatus: "success",
    transferType: "normal",
    detectedAt: "2026-06-30T18:47:02.000Z",
  });
  assert.equal(eventKey(event), `1:${event.transactionHash}:42`);
  assert.equal(rangeObjectName(100, 199), "ethereum/ranges/000000000100-000000000199.json");
  assert.throws(() => rangeObjectName(200, 100), /Invalid block range/);
});

test("decodes USDT and classifies mint, burn, and normal transfers", () => {
  const config = testConfig();
  assert.equal(decodeTransferLog(transferLog(config, { token: "USDT" }), config).token.symbol, "USDT");
  assert.equal(classifyTransfer(ZERO_ADDRESS, ADDRESS_B), "mint");
  assert.equal(classifyTransfer(ADDRESS_A, ZERO_ADDRESS), "burn");
  assert.equal(classifyTransfer(ADDRESS_A, ADDRESS_B), "normal");
});
