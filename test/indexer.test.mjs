import test from "node:test";
import assert from "node:assert/strict";
import { processRange, runCycle, runIndexer } from "../src/indexer/indexer.mjs";
import { FakeRpc, MemoryStorage, blockHash, testConfig, transferLog } from "./helpers.mjs";

test("threshold is inclusive and applies to USDC and USDT", async () => {
  const config = testConfig();
  const logs = [
    transferLog(config, { rawAmount: 99_999n * 1_000_000n, logIndex: 0 }),
    transferLog(config, { rawAmount: 100_000n * 1_000_000n, logIndex: 1 }),
    transferLog(config, { token: "USDT", rawAmount: 100_001n * 1_000_000n, logIndex: 2 }),
  ];
  const storage = new MemoryStorage();
  const result = await processRange({ config, rpc: new FakeRpc({ logs }), storage, fromBlock: 100, toBlock: 100 });
  assert.equal(result.qualifyingEvents, 2);
  assert.equal(result.eventsCreated, 2);
  assert.deepEqual([...storage.events.keys()], ["ethereum/ranges/000000000100-000000000100.json"]);
  assert.equal(storage.events.get("ethereum/ranges/000000000100-000000000100.json").length, 2);
});

test("confirmation buffer and 2,000-block boundaries advance an empty checkpoint", async () => {
  const config = testConfig();
  const rpc = new FakeRpc({ latest: 2_112 });
  const storage = new MemoryStorage();
  const committed = [];
  const result = await runCycle({
    config,
    rpc,
    storage,
    hooks: { onRangeCommitted: async (range) => committed.push(range) },
  });

  assert.deepEqual(rpc.ranges, [[100, 2_099], [2_100, 2_100]]);
  assert.deepEqual(committed.map((range) => [range.fromBlock, range.toBlock]), [
    [100, 2_099],
    [2_100, 2_100],
  ]);
  assert.deepEqual(committed.map((range) => range.checkpointGeneration), ["1", "2"]);
  assert.equal(result.confirmedHead, 2_100);
  assert.equal(storage.checkpoint.lastProcessedBlock, 2_100);
  assert.equal(storage.checkpoint.lastProcessedBlockHash, blockHash(2_100));
});

test("the continuous indexer retries after a failed cycle", async () => {
  const config = testConfig({ pollIntervalMs: 1 });
  const rpc = new FakeRpc();
  const storage = new MemoryStorage();
  const logs = [];
  let attempts = 0;
  let failures = 0;
  rpc.latestBlockNumber = async () => {
    attempts += 1;
    throw new Error("transient RPC failure");
  };

  await assert.rejects(
    runIndexer({
      config,
      rpc,
      storage,
      logger: (line) => logs.push(JSON.parse(line)),
      hooks: {
        onCycleError: async () => {
          failures += 1;
          if (failures === 2) throw new Error("stop test loop");
        },
      },
    }),
    /stop test loop/,
  );

  assert.equal(attempts, 2);
  assert.equal(failures, 2);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((entry) => entry.message === "Indexer cycle failed; retrying"));
});

test("crash after event creation replays as one duplicate before checkpointing", async () => {
  const config = testConfig();
  const log = transferLog(config);
  const rpc = new FakeRpc({ logs: [log] });
  const storage = new MemoryStorage();

  await assert.rejects(
    runCycle({ config, rpc, storage, hooks: { afterEventsBeforeCheckpoint: () => { throw new Error("crash"); } } }),
    /crash/,
  );
  assert.equal(storage.events.size, 1);
  assert.equal(storage.checkpoint, null);

  const replay = await runCycle({ config, rpc, storage });
  assert.equal(replay.duplicateEvents, 1);
  assert.equal(storage.events.size, 1);
  assert.equal(storage.checkpoint.lastProcessedBlock, 100);
});

test("storage failure leaves the checkpoint unchanged", async () => {
  const config = testConfig();
  const storage = new MemoryStorage();
  storage.failEventWrites = true;
  await assert.rejects(
    runCycle({ config, rpc: new FakeRpc({ logs: [transferLog(config)] }), storage }),
    /storage unavailable/,
  );
  assert.equal(storage.checkpoint, null);
});

test("checkpoint block hash mismatch stops possible deep reorganization", async () => {
  const config = testConfig();
  const storage = new MemoryStorage();
  storage.checkpoint = {
    chain: "ethereum",
    chainId: 1,
    lastProcessedBlock: 99,
    lastProcessedBlockHash: `0x${"ff".repeat(32)}`,
    updatedAt: new Date().toISOString(),
  };
  storage.generation = 1;
  await assert.rejects(runCycle({ config, rpc: new FakeRpc(), storage }), /Deep reorganization detected/);
});
