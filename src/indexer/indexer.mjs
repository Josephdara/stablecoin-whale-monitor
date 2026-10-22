import { buildEvent, decodeTransferLog, parseAmount, rangeObjectName } from "../event.mjs";

export async function runIndexer({
  config,
  rpc,
  storage,
  once = false,
  hooks = {},
  logger = console.error,
}) {
  await rpc.assertChainId();
  await storage.writeTokenMetadata({
    chain: config.chain,
    chainId: config.chainId,
    tokens: config.tokens,
    updatedAt: new Date().toISOString(),
  });

  do {
    try {
      const result = await runCycle({
        config,
        rpc,
        storage,
        hooks: {
          ...hooks,
          onRangeCommitted: hooks.onRangeCommitted ?? ((range) => {
            logger(JSON.stringify({ level: "info", message: "Indexer range committed", ...range }));
          }),
        },
      });
      logger(JSON.stringify({ level: "info", message: "Indexer cycle complete", ...result }));
    } catch (error) {
      if (once) throw error;
      logger(JSON.stringify({
        level: "error",
        message: "Indexer cycle failed; retrying",
        error: error instanceof Error ? error.message : String(error),
      }));
      if (hooks.onCycleError) await hooks.onCycleError(error);
    }
    if (!once) await sleep(config.pollIntervalMs);
  } while (!once);
}

export async function runCycle({ config, rpc, storage, hooks = {} }) {
  let checkpointState = await storage.readCheckpoint();
  validateCheckpoint(checkpointState?.value, config);

  if (checkpointState) {
    const canonicalBlock = await rpc.getBlockWithRetry(checkpointState.value.lastProcessedBlock);
    if (canonicalBlock.hash !== checkpointState.value.lastProcessedBlockHash.toLowerCase()) {
      throw new Error(
        `Deep reorganization detected at block ${checkpointState.value.lastProcessedBlock}: checkpoint hash no longer canonical`,
      );
    }
  }

  const latestBlock = await rpc.latestBlockNumber();
  const confirmedHead = Math.max(0, latestBlock - config.confirmationBuffer);
  let nextBlock = checkpointState ? checkpointState.value.lastProcessedBlock + 1 : config.startBlock;
  let rangesProcessed = 0;
  let eventsCreated = 0;
  let duplicateEvents = 0;

  while (nextBlock <= confirmedHead) {
    const toBlock = Math.min(confirmedHead, nextBlock + config.blockBatchSize - 1);
    const rangeResult = await processRange({
      config,
      rpc,
      storage,
      fromBlock: nextBlock,
      toBlock,
      hooks,
    });

    if (hooks.afterEventsBeforeCheckpoint) await hooks.afterEventsBeforeCheckpoint(rangeResult);

    const checkpoint = {
      chain: config.chain,
      chainId: config.chainId,
      lastProcessedBlock: toBlock,
      lastProcessedBlockHash: rangeResult.endBlock.hash,
      // Chain head read at the start of this cycle, reported by /api/health.
      chainHeadBlock: latestBlock,
      updatedAt: new Date().toISOString(),
    };
    const expectedGeneration = checkpointState?.generation ?? "0";
    const written = await storage.writeCheckpoint(checkpoint, expectedGeneration);
    checkpointState = { value: checkpoint, generation: written.generation };

    if (hooks.onRangeCommitted) {
      await hooks.onRangeCommitted({
        fromBlock: rangeResult.fromBlock,
        toBlock: rangeResult.toBlock,
        qualifyingEvents: rangeResult.qualifyingEvents,
        eventsCreated: rangeResult.eventsCreated,
        duplicateEvents: rangeResult.duplicateEvents,
        checkpointGeneration: written.generation,
      });
    }

    rangesProcessed += 1;
    eventsCreated += rangeResult.eventsCreated;
    duplicateEvents += rangeResult.duplicateEvents;
    nextBlock = toBlock + 1;
  }

  return { latestBlock, confirmedHead, rangesProcessed, eventsCreated, duplicateEvents };
}

export async function processRange({ config, rpc, storage, fromBlock, toBlock }) {
  const minimums = new Map(
    config.tokens.map((token) => [token.address, parseAmount(config.minimumAmount, token.decimals)]),
  );
  const blocks = new Map();
  const detectedAt = new Date().toISOString();
  const events = [];
  let qualifyingEvents = 0;
  let eventsCreated = 0;
  let duplicateEvents = 0;

  const chunks = rpc.getLogChunks
    ? rpc.getLogChunks(fromBlock, toBlock)
    : singleChunk(await rpc.getLogs(fromBlock, toBlock));
  for await (const logs of chunks) {
    for (const log of logs) {
      const transfer = decodeTransferLog(log, config);
      if (transfer.blockNumber < fromBlock || transfer.blockNumber > toBlock) {
        throw new Error(`RPC returned a log outside requested range ${fromBlock}-${toBlock}`);
      }
      if (transfer.rawAmount < minimums.get(transfer.token.address)) continue;
      qualifyingEvents += 1;

      let block = blocks.get(transfer.blockNumber);
      if (!block) {
        block = await rpc.getBlockWithRetry(transfer.blockNumber);
        blocks.set(transfer.blockNumber, block);
      }
      if (block.hash !== transfer.blockHash) {
        throw new Error(`Log block hash mismatch at block ${transfer.blockNumber}`);
      }
      events.push(buildEvent(transfer, block, config, detectedAt));
    }
  }

  if (events.length) {
    const result = await storage.createEventBatch(rangeObjectName(fromBlock, toBlock), events);
    if (result.created) eventsCreated = events.length;
    else duplicateEvents = events.length;
  }

  if (!blocks.has(toBlock)) blocks.set(toBlock, await rpc.getBlockWithRetry(toBlock));

  return {
    fromBlock,
    toBlock,
    qualifyingEvents,
    eventsCreated,
    duplicateEvents,
    endBlock: blocks.get(toBlock),
  };
}

async function* singleChunk(logs) {
  yield logs;
}

function validateCheckpoint(checkpoint, config) {
  if (checkpoint === undefined) return;
  if (
    typeof checkpoint !== "object" || checkpoint === null ||
    checkpoint.chain !== config.chain ||
    checkpoint.chainId !== config.chainId ||
    !Number.isSafeInteger(checkpoint.lastProcessedBlock) || checkpoint.lastProcessedBlock < 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(checkpoint.lastProcessedBlockHash) ||
    typeof checkpoint.updatedAt !== "string" || Number.isNaN(Date.parse(checkpoint.updatedAt))
  ) throw new Error("Stored checkpoint is malformed or belongs to another chain");
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
