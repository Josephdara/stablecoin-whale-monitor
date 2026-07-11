export const ADDRESS_A = "0x1111111111111111111111111111111111111111";
export const ADDRESS_B = "0x2222222222222222222222222222222222222222";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function testConfig(overrides = {}) {
  return {
    chain: "ethereum",
    chainId: 1,
    startBlock: 100,
    confirmationBuffer: 12,
    blockBatchSize: 2_000,
    pollIntervalMs: 15_000,
    minimumAmount: "100000",
    transferTopic: `0x${"ab".repeat(32)}`,
    rpcMaxRetries: 0,
    tokens: [
      { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
      { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
    ],
    ...overrides,
  };
}

export function blockHash(number) {
  return `0x${BigInt(number).toString(16).padStart(64, "0")}`;
}

export function transferLog(config, {
  token = "USDC",
  blockNumber = 100,
  logIndex = 0,
  transaction = logIndex + 1,
  from = ADDRESS_A,
  to = ADDRESS_B,
  rawAmount = 100_000n * 1_000_000n,
} = {}) {
  const contract = config.tokens.find((item) => item.symbol === token).address;
  return {
    address: contract,
    topics: [config.transferTopic, addressTopic(from), addressTopic(to)],
    data: `0x${rawAmount.toString(16).padStart(64, "0")}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    blockHash: blockHash(blockNumber),
    logIndex: `0x${logIndex.toString(16)}`,
    transactionHash: `0x${BigInt(transaction).toString(16).padStart(64, "0")}`,
  };
}

export function block(number) {
  return {
    number,
    hash: blockHash(number),
    timestamp: new Date(Date.UTC(2026, 5, 30, 18, 45, number % 60)).toISOString(),
  };
}

export class MemoryStorage {
  constructor() {
    this.events = new Map();
    this.checkpoint = null;
    this.generation = 0;
    this.failEventWrites = false;
  }

  async createEventBatch(name, events) {
    if (this.failEventWrites) throw new Error("storage unavailable");
    if (this.events.has(name)) return { created: false };
    this.events.set(name, [...events]);
    return { created: true };
  }

  async readCheckpoint() {
    return this.checkpoint
      ? { value: structuredClone(this.checkpoint), generation: String(this.generation) }
      : null;
  }

  async writeCheckpoint(checkpoint, expectedGeneration) {
    const actual = this.checkpoint ? String(this.generation) : "0";
    if (expectedGeneration !== actual) throw new Error("checkpoint conflict");
    this.checkpoint = structuredClone(checkpoint);
    this.generation += 1;
    return { generation: String(this.generation) };
  }

  async writeTokenMetadata() {}
  async listEvents() { return [...this.events.values()].flat(); }
}

export class FakeRpc {
  constructor({ latest = 112, logs = [] } = {}) {
    this.latest = latest;
    this.logs = logs;
    this.ranges = [];
  }

  async assertChainId() {}
  async latestBlockNumber() { return this.latest; }
  async getLogs(from, to) {
    this.ranges.push([from, to]);
    return this.logs.filter((log) => {
      const number = Number(BigInt(log.blockNumber));
      return number >= from && number <= to;
    });
  }
  async getBlockWithRetry(number) { return block(number); }
}

function addressTopic(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}
