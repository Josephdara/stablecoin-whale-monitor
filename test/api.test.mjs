import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApiApp, EventIndex, getTransfersByTransactionHash } from "../src/api/app.mjs";
import { loadApiConfig } from "../src/config.mjs";
import { buildEvent, decodeTransferLog } from "../src/event.mjs";
import { ADDRESS_A, ADDRESS_B, block, testConfig, transferLog } from "./helpers.mjs";

const DAY_MS = 86_400_000;
const ALL = { token: "", minimumAmount: "", address: "", limit: 50, cursor: "" };

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
    { name: "ethereum/ranges/000000000100-000000000100.json", event: makeEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }) },
    { name: "ethereum/ranges/000000000101-000000000101.json", event: makeEvent(config, { token: "USDT", blockNumber: 101, logIndex: 0, transaction: 2 }) },
  ];
  let yielded = 0;
  const startOffsets = [];
  const storage = {
    async *iterateEvents({ knownNames, startOffset }) {
      startOffsets.push(startOffset);
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
    name: "ethereum/ranges/000000000102-000000000102.json",
    event: makeEvent(config, { token: "USDC", blockNumber: 102, logIndex: 0, transaction: 3 }),
  });
  await index.refresh();
  assert.equal(yielded, 3);
  assert.deepEqual(startOffsets, [
    undefined,
    "ethereum/ranges/000000000101-000000000101.json",
    "ethereum/ranges/000000000101-000000000101.json",
  ]);
  assert.equal(index.highestObjectName, "ethereum/ranges/000000000102-000000000102.json");
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

test("retention retains an event at exactly the window and drops it one millisecond later", async () => {
  const config = testConfig();
  const event = agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 60_000);
  const index = new EventIndex({ listEvents: async () => [event] }, 1, 7);
  await index.refresh();
  assert.equal(index.events.length, 1);

  const boundary = Date.parse(event.blockTimestamp) + 7 * DAY_MS;
  index.prune(boundary);
  assert.equal(index.events.length, 1);
  index.prune(boundary + 1);
  assert.equal(index.events.length, 0);
});

test("retention drops only events outside the window and preserves newest-first order", async () => {
  const config = testConfig();
  const events = [
    agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 8 * DAY_MS),
    agedEvent(config, { blockNumber: 101, logIndex: 0, transaction: 2 }, 6 * DAY_MS),
    agedEvent(config, { blockNumber: 102, logIndex: 0, transaction: 3 }, 3_600_000),
  ];
  const index = new EventIndex({ listEvents: async () => events }, 1, 7);
  await index.refresh();
  assert.deepEqual(index.events.map((event) => event.blockNumber), [102, 101]);
});

test("refresh prunes aged events even when no new objects are discovered", async () => {
  const config = testConfig();
  const entries = [{
    name: "ethereum/ranges/000000000100-000000000100.json",
    event: agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 8 * DAY_MS),
  }];
  const storage = {
    async *iterateEvents({ knownNames }) {
      for (const entry of entries) {
        if (knownNames.has(entry.name)) continue;
        yield entry;
      }
    },
  };
  const index = new EventIndex(storage, 1, 0);
  await index.refresh();
  assert.equal(index.events.length, 1);

  index.retentionDays = 7;
  await index.refresh();
  assert.equal(index.events.length, 0);
});

test("query totals and counts exclude events outside the retention window", async () => {
  const config = testConfig();
  const events = [
    agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 8 * DAY_MS),
    agedEvent(config, { token: "USDT", blockNumber: 101, logIndex: 0, transaction: 2 }, 3_600_000),
  ];
  const index = new EventIndex({ listEvents: async () => events }, 1, 0);
  await index.refresh();
  assert.equal(index.query(ALL).total, 2);

  index.retentionDays = 7;
  const visible = index.query(ALL);
  assert.equal(visible.total, 1);
  assert.equal(visible.counts.USDC, 0);
  assert.equal(visible.counts.USDT, 1);
});

test("retention drops an event whose block timestamp cannot be parsed", async () => {
  const config = testConfig();
  const event = agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 60_000);
  const index = new EventIndex({ listEvents: async () => [event] }, 1, 7);
  await index.refresh();

  index.events[0].blockTimestamp = "not-a-timestamp";
  index.prune();
  assert.equal(index.events.length, 0);
});

test("a cursor pointing at a pruned event returns a controlled 400", async () => {
  const config = testConfig();
  const events = [
    agedEvent(config, { blockNumber: 102, logIndex: 0, transaction: 3 }, 3_600_000),
    agedEvent(config, { blockNumber: 101, logIndex: 0, transaction: 2 }, 6 * DAY_MS),
    agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 6.5 * DAY_MS),
  ];
  const index = new EventIndex({ listEvents: async () => events }, 1, 7);
  await index.refresh();

  const first = index.query({ ...ALL, limit: 2 });
  assert.deepEqual(first.items.map((event) => event.blockNumber), [102, 101]);
  assert.ok(first.nextCursor);

  index.retentionDays = 1;
  assert.throws(
    () => index.query({ ...ALL, limit: 2, cursor: first.nextCursor }),
    (error) => error.status === 400,
  );
});

test("transaction lookup excludes events outside the retention window", async () => {
  const config = testConfig();
  const event = agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 8 * DAY_MS);
  const index = new EventIndex({ listEvents: async () => [event] }, 1, 0);
  await index.refresh();
  assert.equal(index.findByTransactionHash(event.transactionHash).length, 1);

  index.retentionDays = 7;
  assert.equal(index.findByTransactionHash(event.transactionHash).length, 0);
  assert.throws(
    () => getTransfersByTransactionHash(index, event.transactionHash),
    (error) => error.status === 404,
  );
});

test("an unset retention window leaves every indexed event visible", async () => {
  const config = testConfig();
  const event = agedEvent(config, { blockNumber: 100, logIndex: 0, transaction: 1 }, 400 * DAY_MS);
  const index = new EventIndex({ listEvents: async () => [event] });
  await index.refresh();

  index.prune();
  assert.equal(index.events.length, 1);
});

test("a stale index refreshes on the request path and a fresh index does not", async () => {
  const config = testConfig();
  const events = [agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 3_600_000)];
  let calls = 0;
  const storage = { listEvents: async () => { calls += 1; return events; } };
  const index = new EventIndex(storage, 1, 7);

  await withApi({ config: apiConfig(), storage, index }, async (request) => {
    const cold = await request("/api/transfers");
    assert.equal(cold.status, 200);
    assert.equal((await cold.json()).total, 1);
    assert.equal(calls, 1);

    await request("/api/transfers");
    assert.equal(calls, 1);

    index.refreshedAt = new Date(Date.now() - 60_000).toISOString();
    await request("/api/transfers");
    assert.equal(calls, 2);
  });
});

test("concurrent freshness checks share a single storage sweep", async () => {
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
  const first = index.ensureFresh(30_000);
  const second = index.ensureFresh(30_000);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("a startup refresh and request freshness check share one storage sweep", async () => {
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
  const startup = index.refresh();
  const request = index.ensureFresh(30_000);
  release();
  await Promise.all([startup, request]);
  assert.equal(calls, 1);
});

test("background refresh starts once and stops cleanly", async () => {
  let calls = 0;
  const index = new EventIndex({
    listEvents: async () => {
      calls += 1;
      return [];
    },
  });

  index.startBackgroundRefresh(5);
  const timer = index.refreshTimer;
  index.startBackgroundRefresh(5);
  assert.equal(index.refreshTimer, timer);

  await waitFor(() => calls >= 2);
  index.stopBackgroundRefresh();
  assert.equal(index.refreshTimer, null);

  const callsAtStop = calls;
  await delay(20);
  assert.equal(calls, callsAtStop);
});

test("staleness includes an invalid timestamp and the exact maximum-age boundary", () => {
  const index = new EventIndex({});
  assert.equal(index.isStale(30_000, 100_000), true);

  index.refreshedAt = "not-a-timestamp";
  assert.equal(index.isStale(30_000, 100_000), true);

  index.refreshedAt = new Date(70_000).toISOString();
  assert.equal(index.isStale(30_000, 99_999), false);
  assert.equal(index.isStale(30_000, 100_000), true);
});

test("a failed refresh serves a warm index and reports degraded health", async () => {
  const config = testConfig();
  const events = [agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 3_600_000)];
  let calls = 0;
  const storage = {
    listEvents: async () => {
      calls += 1;
      if (calls > 1) throw new Error("gs://swm-events unreachable");
      return events;
    },
    readCheckpoint: async () => null,
  };
  const index = new EventIndex(storage, 1, 7);
  await index.refresh();
  index.refreshedAt = new Date(Date.now() - 60_000).toISOString();

  await withApi({ config: apiConfig(), storage, index }, async (request) => {
    const transfers = await request("/api/transfers");
    assert.equal(transfers.status, 200);
    assert.equal((await transfers.json()).total, 1);

    const health = await request("/api/health");
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.status, "degraded");
    assert.equal(body.indexedEvents, 1);
    assert.equal(body.indexError, null);
    assert.match(body.lastRefreshError, /unreachable/);
    assert.deepEqual(
      [body.chainHeadBlock, body.indexThreshold, body.confirmationBuffer, body.pollIntervalSeconds],
      [null, null, null, null],
    );
  });
});

test("a never-loaded index that cannot reach storage returns 503 without leaking detail", async () => {
  const storage = {
    listEvents: async () => { throw new Error("gs://swm-events unreachable"); },
    readCheckpoint: async () => null,
  };
  const index = new EventIndex(storage, 1, 7);

  await withApi({ config: apiConfig(), storage, index }, async (request) => {
    const transfers = await request("/api/transfers");
    assert.equal(transfers.status, 503);
    assert.equal((await transfers.json()).error, "Event index could not be refreshed");

    const health = await request("/api/health");
    assert.equal(health.status, 503);
    assert.equal((await health.json()).indexedEvents, 0);
  });
});

test("a slow refresh on a warm index serves cached data at the deadline", async () => {
  const config = testConfig();
  const events = [agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 3_600_000)];
  let calls = 0;
  let release = () => {};
  const storage = {
    listEvents: async () => {
      calls += 1;
      if (calls > 1) await new Promise((resolve) => { release = resolve; });
      return events;
    },
  };
  const index = new EventIndex(storage, 1, 7);
  await index.refresh();
  index.refreshedAt = new Date(Date.now() - 60_000).toISOString();

  await withApi({ config: apiConfig({ refreshDeadlineMs: 100 }), storage, index }, async (request) => {
    const response = await request("/api/transfers");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 1);
    assert.equal(calls, 2);
    release();
    await index.refreshPromise;
  });
});

test("a refresh deadline returns 503 after the cached index exceeds maxStaleMs", async () => {
  const config = testConfig();
  const events = [agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 3_600_000)];
  let release = () => {};
  let calls = 0;
  const storage = {
    listEvents: async () => {
      calls += 1;
      if (calls > 1) await new Promise((resolve) => { release = resolve; });
      return events;
    },
  };
  const index = new EventIndex(storage, 1, 7);
  await index.refresh();
  index.refreshedAt = new Date(Date.now() - 700_000).toISOString();

  await withApi({ config: apiConfig({ refreshDeadlineMs: 100 }), storage, index }, async (request) => {
    const response = await request("/api/transfers");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "Event index could not be refreshed");
    release();
    await index.refreshPromise;
  });
});

test("a never-loaded index returns 503 at the refresh deadline", async () => {
  const config = testConfig();
  const events = [agedEvent(config, { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 }, 3_600_000)];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const storage = { listEvents: async () => { await pending; return events; } };
  const index = new EventIndex(storage, 1, 7);

  await withApi({ config: apiConfig({ refreshDeadlineMs: 100 }), storage, index }, async (request) => {
    const response = await request("/api/transfers");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "Event index could not be refreshed");
    release();
    await index.refreshPromise;
  });
});

test("invalid transfer parameters are rejected before storage refresh", async () => {
  let calls = 0;
  const storage = {
    listEvents: async () => {
      calls += 1;
      return [];
    },
  };
  const index = new EventIndex(storage, 1, 7);

  await withApi({ config: apiConfig(), storage, index }, async (request) => {
    const filter = await request("/api/transfers?token=not-a-token");
    assert.equal(filter.status, 400);

    const cursor = await request("/api/transfers?cursor=not-base64-json");
    assert.equal(cursor.status, 400);

    const transaction = await request("/api/transfers/not-a-transaction-hash");
    assert.equal(transaction.status, 400);
    assert.equal(calls, 0);
  });
});

test("transaction lookup and health refresh stale indexes on their request paths", async () => {
  const config = testConfig();
  const event = agedEvent(
    config,
    { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 },
    3_600_000,
  );
  let calls = 0;
  const storage = {
    listEvents: async () => {
      calls += 1;
      return [event];
    },
    readCheckpoint: async () => ({
      value: { lastProcessedBlock: 100, chainHeadBlock: 106, updatedAt: new Date().toISOString() },
      generation: "1",
    }),
  };
  const index = new EventIndex(storage, 1, 7);
  const reportedConfig = apiConfig({ minimumAmount: "100000", confirmationBuffer: 6, pollIntervalMs: 30_000 });

  await withApi({ config: reportedConfig, storage, index }, async (request) => {
    const transaction = await request(`/api/transfers/${event.transactionHash}`);
    assert.equal(transaction.status, 200);
    assert.equal((await transaction.json()).total, 1);
    assert.equal(calls, 1);

    index.refreshedAt = new Date(Date.now() - 60_000).toISOString();
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.status, "ok");
    assert.deepEqual(
      [body.lastProcessedBlock, body.chainHeadBlock, body.indexThreshold, body.confirmationBuffer, body.pollIntervalSeconds],
      [100, 106, "100000", 6, 30],
    );
    assert.equal(calls, 2);
  });
});

test("checkpoint read failures return degraded health without invalidating the index", async () => {
  const config = testConfig();
  const event = agedEvent(
    config,
    { token: "USDC", blockNumber: 100, logIndex: 0, transaction: 1 },
    3_600_000,
  );
  const storage = {
    listEvents: async () => [event],
    readCheckpoint: async () => { throw new Error("checkpoint bucket unavailable"); },
  };
  const index = new EventIndex(storage, 1, 7);
  const logs = [];
  await index.refresh();

  await withApi({
    config: apiConfig(),
    storage,
    index,
    logger: (line) => logs.push(JSON.parse(line)),
  }, async (request) => {
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.status, "degraded");
    assert.equal(body.indexError, null);
    assert.equal(body.lastRefreshError, null);
    assert.match(body.checkpointError, /unavailable/);
    assert.equal(body.indexedEvents, 1);
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "health_degraded");
  assert.match(logs[0].checkpointError, /unavailable/);
});

test("api configuration validates refresh deadlines, maximum staleness and reported indexer settings", () => {
  const base = {
    STORAGE_BACKEND: "local",
    API_PORT: "3001",
    API_REFRESH_MS: "30000",
    API_MAX_PAGE_SIZE: "50",
    CHAIN_ID: "1",
    RETENTION_DAYS: "7",
  };
  assert.equal(loadApiConfig({ ...base }).refreshDeadlineMs, 5_000);
  assert.equal(loadApiConfig({ ...base }).maxStaleMs, 600_000);
  assert.equal(loadApiConfig({ ...base, API_REFRESH_DEADLINE_MS: "2000" }).refreshDeadlineMs, 2_000);
  assert.equal(loadApiConfig({ ...base, API_MAX_STALE_MS: "900000" }).maxStaleMs, 900_000);
  assert.throws(() => loadApiConfig({ ...base, API_REFRESH_DEADLINE_MS: "99" }), /API_REFRESH_DEADLINE_MS/);
  assert.throws(() => loadApiConfig({ ...base, API_REFRESH_DEADLINE_MS: "60001" }), /API_REFRESH_DEADLINE_MS/);
  assert.throws(() => loadApiConfig({ ...base, API_REFRESH_DEADLINE_MS: "abc" }), /API_REFRESH_DEADLINE_MS/);
  assert.throws(
    () => loadApiConfig({ ...base, API_MAX_STALE_MS: "29999" }),
    /API_MAX_STALE_MS cannot be less than API_REFRESH_MS/,
  );
  const unset = loadApiConfig({ ...base });
  assert.deepEqual([unset.minimumAmount, unset.confirmationBuffer, unset.pollIntervalMs], [null, null, null]);
  const reported = loadApiConfig({ ...base, MIN_AMOUNT: "100000", CONFIRMATION_BUFFER: "6", POLL_INTERVAL_MS: "30000" });
  assert.deepEqual([reported.minimumAmount, reported.confirmationBuffer, reported.pollIntervalMs], ["100000", 6, 30_000]);
  assert.throws(() => loadApiConfig({ ...base, CONFIRMATION_BUFFER: "1001" }), /CONFIRMATION_BUFFER/);
});

test("api configuration requires a valid retention window", () => {
  const base = {
    STORAGE_BACKEND: "local",
    API_PORT: "3001",
    API_REFRESH_MS: "30000",
    API_MAX_PAGE_SIZE: "50",
    CHAIN_ID: "1",
    RETENTION_DAYS: "7",
  };
  assert.equal(loadApiConfig({ ...base }).retentionDays, 7);
  assert.throws(() => loadApiConfig({ ...base, RETENTION_DAYS: "" }), /RETENTION_DAYS/);
  assert.throws(() => loadApiConfig({ ...base, RETENTION_DAYS: "0" }), /RETENTION_DAYS/);
  assert.throws(() => loadApiConfig({ ...base, RETENTION_DAYS: "7.5" }), /RETENTION_DAYS/);
  assert.throws(() => loadApiConfig({ ...base, RETENTION_DAYS: "366" }), /RETENTION_DAYS/);
});

function apiConfig(overrides = {}) {
  return {
    chainId: 1,
    maxPageSize: 50,
    retentionDays: 7,
    refreshMs: 30_000,
    refreshDeadlineMs: 5_000,
    maxStaleMs: 600_000,
    allowedOrigin: "",
    ...overrides,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await delay(5);
  }
}

async function withApi(options, run) {
  const server = createApiApp({ logger: () => {}, ...options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await run((path) => fetch(`http://127.0.0.1:${port}${path}`));
  } finally {
    server.close();
    await once(server, "close");
  }
}

function makeEvent(config, options) {
  const transfer = decodeTransferLog(transferLog(config, { from: ADDRESS_A, to: ADDRESS_B, ...options }), config);
  return buildEvent(transfer, block(options.blockNumber), config);
}

function agedEvent(config, options, ageMs) {
  const transfer = decodeTransferLog(transferLog(config, { from: ADDRESS_A, to: ADDRESS_B, ...options }), config);
  const source = block(options.blockNumber);
  const timestamp = new Date(Date.now() - ageMs).toISOString();
  return buildEvent(transfer, { ...source, timestamp }, config);
}
