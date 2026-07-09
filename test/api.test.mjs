import test from "node:test";
import assert from "node:assert/strict";
import { EventIndex, getTransfersByTransactionHash } from "../src/api/app.mjs";
import { buildEvent, decodeTransferLog } from "../src/event.mjs";
import { ADDRESS_A, ADDRESS_B, block, testConfig, transferLog } from "./helpers.mjs";

test("event index sorts newest first, filters, and paginates by cursor", async () => {
  const config = testConfig();
  const events = [
    makeEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }),
    makeEvent(config, { token: "USDT", blockNumber: 102, logIndex: 1, transaction: 2 }),
    makeEvent(config, { token: "USDC", blockNumber: 101, logIndex: 2, transaction: 3, rawAmount: 200_000n * 1_000_000n }),
  ];
  const index = new EventIndex({ listEvents: async () => events });
  await index.refresh();

  const first = index.query({ token: "", minimumAmount: "", address: "", limit: 2, cursor: "" });
  assert.deepEqual(first.items.map((event) => event.blockNumber), [102, 101]);
  assert.equal(first.total, 3);
  assert.ok(first.nextCursor);
  const second = index.query({ token: "", minimumAmount: "", address: "", limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((event) => event.blockNumber), [100]);

  const filtered = index.query({ token: "USDC", minimumAmount: "150000", address: ADDRESS_A, limit: 50, cursor: "" });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].amount, "200000");
  assert.equal(filtered.counts.USDC, 1);
  assert.equal(filtered.counts.USDT, 0);
});

test("event index coalesces concurrent refreshes", async () => {
  let calls = 0;
  let release;
  const storage = {
    listEvents: async () => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return [];
    },
  };
  const index = new EventIndex(storage);
  const first = index.refresh();
  const second = index.refresh();
  assert.equal(first, second);
  release();
  await first;
  assert.equal(calls, 1);
});

test("event index downloads only newly discovered immutable event objects", async () => {
  const config = testConfig();
  const entries = [
    { name: "ethereum/one.json", event: makeEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }) },
    { name: "ethereum/two.json", event: makeEvent(config, { token: "USDT", blockNumber: 101, logIndex: 0, transaction: 2 }) },
  ];
  let yielded = 0;
  const storage = {
    async *iterateEvents({ knownNames }) {
      for (const entry of entries) {
        if (knownNames.has(entry.name)) continue;
        yielded += 1;
        yield entry;
      }
    },
  };
  const index = new EventIndex(storage);
  await index.refresh();
  await index.refresh();
  assert.equal(yielded, 2);
  assert.equal(index.events.length, 2);

  entries.push({
    name: "ethereum/three.json",
    event: makeEvent(config, { token: "USDC", blockNumber: 102, logIndex: 0, transaction: 3 }),
  });
  await index.refresh();
  assert.equal(yielded, 3);
  assert.deepEqual(index.events.map((event) => event.blockNumber), [102, 101, 100]);
});

test("event index returns every transfer emitted by a transaction", async () => {
  const config = testConfig();
  const events = [
    makeEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 9 }),
    makeEvent(config, { token: "USDT", blockNumber: 100, logIndex: 1, transaction: 9 }),
    makeEvent(config, { token: "USDC", blockNumber: 101, logIndex: 0, transaction: 10 }),
  ];
  const index = new EventIndex({ listEvents: async () => events });
  await index.refresh();

  const transactionHash = events[0].transactionHash;
  const found = index.findByTransactionHash(transactionHash);
  assert.deepEqual(found.map((event) => event.logIndex), [1, 0]);
  assert.equal(index.findByTransactionHash(`0x${transactionHash.slice(2).toUpperCase()}`).length, 2);
  assert.deepEqual(index.findByTransactionHash(`0x${"ff".repeat(32)}`), []);

  const response = getTransfersByTransactionHash(index, transactionHash);
  assert.equal(response.total, 2);
  assert.equal(response.transactionHash, transactionHash);
  assert.throws(
    () => getTransfersByTransactionHash(index, "0x1234"),
    (error) => error.status === 400,
  );
  assert.throws(
    () => getTransfersByTransactionHash(index, `0x${"ff".repeat(32)}`),
    (error) => error.status === 404,
  );
});

test("stats aggregates a day's transfers by token and reports the largest", async () => {
  const config = testConfig();
  const events = [
    makeEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1, rawAmount: 100_000n * 1_000_000n }),
    makeEvent(config, { token: "USDC", blockNumber: 101, logIndex: 0, transaction: 2, rawAmount: 250_000n * 1_000_000n }),
    makeEvent(config, { token: "USDT", blockNumber: 102, logIndex: 0, transaction: 3, rawAmount: 300_000n * 1_000_000n }),
  ];
  const index = new EventIndex({ listEvents: async () => events });
  await index.refresh();

  // helpers.mjs block timestamps fall on 2026-06-30 (UTC).
  const stats = index.stats({ date: "2026-06-30" });
  assert.equal(stats.date, "2026-06-30");
  assert.equal(stats.transferCount, 3);
  assert.equal(stats.usdcVolume, "350000");
  assert.equal(stats.usdtVolume, "300000");
  assert.equal(stats.largestTransfer.token, "USDT");
  assert.equal(stats.largestTransfer.amount, "300000");
  assert.equal(stats.largestTransfer.transactionHash, events[2].transactionHash);

  const empty = index.stats({ date: "2020-01-01" });
  assert.equal(empty.transferCount, 0);
  assert.equal(empty.usdcVolume, "0");
  assert.equal(empty.usdtVolume, "0");
  assert.equal(empty.largestTransfer, null);
});

function makeEvent(config, options) {
  const transfer = decodeTransferLog(transferLog(config, { from: ADDRESS_A, to: ADDRESS_B, ...options }), config);
  return buildEvent(transfer, block(options.blockNumber), config);
}
