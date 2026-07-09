export class EthereumRpcClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.nextId = 1;
  }

  async assertChainId() {
    const result = await this.call("eth_chainId", []);
    const actual = quantity(result);
    if (actual !== this.config.chainId) {
      throw new Error(`RPC chain ID ${actual} does not match configured chain ID ${this.config.chainId}`);
    }
  }

  async latestBlockNumber() {
    return quantity(await this.call("eth_blockNumber", []));
  }

  async getLogs(fromBlock, toBlock) {
    const logs = [];
    for await (const chunk of this.getLogChunks(fromBlock, toBlock)) logs.push(...chunk);
    return logs;
  }

  async *getLogChunks(fromBlock, toBlock) {
    if (toBlock < fromBlock || toBlock - fromBlock + 1 > this.config.blockBatchSize) {
      throw new Error("Requested log range exceeds configured BLOCK_BATCH_SIZE");
    }
    for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += this.config.rpcLogChunkSize) {
      const chunkEnd = Math.min(toBlock, chunkStart + this.config.rpcLogChunkSize - 1);
      const result = await this.call("eth_getLogs", [{
        fromBlock: rpcQuantity(chunkStart),
        toBlock: rpcQuantity(chunkEnd),
        address: this.config.tokens.map((token) => token.address),
        topics: [this.config.transferTopic],
      }]);
      if (!Array.isArray(result)) throw new Error("Invalid eth_getLogs response");
      yield result;
    }
  }

  async getBlock(blockNumber) {
    const result = await this.call("eth_getBlockByNumber", [rpcQuantity(blockNumber), false]);
    return parseBlock(result, blockNumber);
  }

  async getBlockWithRetry(blockNumber) {
    let lastError;
    for (let attempt = 0; attempt <= this.config.rpcMaxRetries; attempt += 1) {
      try {
        return await this.getBlock(blockNumber);
      } catch (error) {
        lastError = error;
      }
      if (attempt < this.config.rpcMaxRetries) {
        const retryInMs = this.config.rpcRetryBaseMs * 2 ** attempt;
        console.error(JSON.stringify({ level: "warn", message: "Block lookup failed; retrying", blockNumber, attempt: attempt + 1, retryInMs }));
        await sleep(retryInMs);
      }
    }
    throw new Error(`Unable to load block ${blockNumber}: ${lastError?.message ?? "unknown RPC error"}`);
  }

  async call(method, params) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.rpcTimeoutMs);
    const id = this.nextId++;
    try {
      const response = await this.fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > this.config.maxRpcResponseBytes) throw new Error("RPC response exceeds configured size limit");
      const text = await response.text();
      if (Buffer.byteLength(text) > this.config.maxRpcResponseBytes) throw new Error("RPC response exceeds configured size limit");
      if (!response.ok) {
        throw new Error(`RPC HTTP ${response.status} ${response.statusText}${rpcHttpDetail(text)}`);
      }
      const payload = JSON.parse(text);
      if (typeof payload !== "object" || payload === null || payload.jsonrpc !== "2.0" || payload.id !== id) {
        throw new Error("Invalid JSON-RPC response envelope");
      }
      if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message ?? "Unknown error"}`);
      if (!("result" in payload)) throw new Error("JSON-RPC result is missing");
      return payload.result;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`RPC request timed out after ${this.config.rpcTimeoutMs} ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function rpcHttpDetail(text) {
  try {
    const payload = JSON.parse(text);
    const message = payload?.error?.message;
    return typeof message === "string" && message ? `: ${message.slice(0, 500)}` : "";
  } catch {
    return "";
  }
}

function parseBlock(block, expectedNumber) {
  if (
    typeof block !== "object" || block === null ||
    !/^0x[0-9a-fA-F]+$/.test(block.number) ||
    !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
    !/^0x[0-9a-fA-F]+$/.test(block.timestamp)
  ) throw new Error(`RPC returned a null or incomplete block ${expectedNumber}`);
  const number = quantity(block.number);
  if (number !== expectedNumber) throw new Error(`RPC returned block ${number}, expected ${expectedNumber}`);
  const timestampSeconds = BigInt(block.timestamp);
  if (timestampSeconds > BigInt(Math.floor(8.64e15 / 1000))) throw new Error("RPC block timestamp is out of range");
  const milliseconds = Number(timestampSeconds * 1000n);
  const timestamp = new Date(milliseconds).toISOString();
  return { number, hash: block.hash.toLowerCase(), timestamp };
}

function quantity(value) {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`Invalid RPC quantity: ${value}`);
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("RPC quantity exceeds safe integer range");
  return Number(parsed);
}

function rpcQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid block number");
  return `0x${value.toString(16)}`;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
