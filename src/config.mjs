import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(path = resolve(process.cwd(), ".env"), env = process.env) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid .env line: ${sourceLine}`);
    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid .env key: ${key}`);
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
}

export function loadIndexerConfig(env = process.env) {
  const storage = loadStorageConfig(env);
  const rpcUrl = required(env, "GOOGLE_BLOCKCHAIN_RPC_URL");
  const parsedUrl = new URL(rpcUrl);
  if (parsedUrl.protocol !== "https:" && !isLoopback(parsedUrl.hostname)) {
    throw new Error("GOOGLE_BLOCKCHAIN_RPC_URL must use HTTPS");
  }

  const config = {
    ...storage,
    rpcUrl,
    chain: "ethereum",
    chainId: integer(env, "CHAIN_ID", { min: 1, max: 2 ** 31 - 1 }),
    startBlock: integer(env, "START_BLOCK", { min: 0 }),
    confirmationBuffer: integer(env, "CONFIRMATION_BUFFER", { min: 0, max: 1_000 }),
    blockBatchSize: integer(env, "BLOCK_BATCH_SIZE", { min: 1, max: 10_000 }),
    rpcLogChunkSize: integer(env, "RPC_LOG_CHUNK_SIZE", { min: 1, max: 10_000 }),
    pollIntervalMs: integer(env, "POLL_INTERVAL_MS", { min: 1_000, max: 3_600_000 }),
    rpcTimeoutMs: integer(env, "RPC_TIMEOUT_MS", { min: 1_000, max: 120_000 }),
    rpcMaxRetries: integer(env, "RPC_MAX_RETRIES", { min: 0, max: 8 }),
    rpcRetryBaseMs: integer(env, "RPC_RETRY_BASE_MS", { min: 100, max: 60_000 }),
    maxRpcResponseBytes: integer(env, "MAX_RPC_RESPONSE_BYTES", { min: 1_024, max: 150_000_000 }),
    minimumAmount: decimal(env, "MIN_AMOUNT"),
    transferTopic: topic(env, "TRANSFER_TOPIC"),
    tokens: [
      token(env, "USDC", "USDC_ADDRESS", "USDC_DECIMALS"),
      token(env, "USDT", "USDT_ADDRESS", "USDT_DECIMALS"),
    ],
    lockFile: resolve(process.cwd(), env.INDEXER_LOCK_FILE || "data/indexer.lock"),
  };

  if (new Set(config.tokens.map((item) => item.address)).size !== config.tokens.length) {
    throw new Error("Configured token addresses must be unique");
  }
  if (config.rpcLogChunkSize > config.blockBatchSize) {
    throw new Error("RPC_LOG_CHUNK_SIZE cannot exceed BLOCK_BATCH_SIZE");
  }
  return config;
}

export function loadApiConfig(env = process.env) {
  return {
    ...loadStorageConfig(env),
    port: integer(env, "API_PORT", { min: 1, max: 65_535 }),
    host: env.API_HOST?.trim() || "127.0.0.1",
    refreshMs: integer(env, "API_REFRESH_MS", { min: 1_000, max: 3_600_000 }),
    maxPageSize: integer(env, "API_MAX_PAGE_SIZE", { min: 1, max: 200 }),
    allowedOrigin: env.API_ALLOWED_ORIGIN?.trim() || "",
    chainId: integer(env, "CHAIN_ID", { min: 1, max: 2 ** 31 - 1 }),
  };
}

function loadStorageConfig(env) {
  const backend = required(env, "STORAGE_BACKEND").toLowerCase();
  if (!new Set(["local", "gcs"]).has(backend)) {
    throw new Error("STORAGE_BACKEND must be local or gcs");
  }
  return {
    storageBackend: backend,
    localStorageRoot: resolve(process.cwd(), env.LOCAL_STORAGE_ROOT || "data/local-storage"),
    gcsEventsBucket: backend === "gcs" ? required(env, "GCS_EVENTS_BUCKET") : "",
    gcsStateBucket: backend === "gcs" ? required(env, "GCS_STATE_BUCKET") : "",
  };
}

function token(env, symbol, addressKey, decimalsKey) {
  return {
    symbol,
    address: address(env, addressKey),
    decimals: integer(env, decimalsKey, { min: 0, max: 255 }),
  };
}

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${key}`);
  return value;
}

function integer(env, key, { min, max = Number.MAX_SAFE_INTEGER }) {
  const raw = required(env, key);
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${key} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return value;
}

function decimal(env, key) {
  const value = required(env, key);
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) throw new Error(`${key} must be a non-negative decimal`);
  return value;
}

function address(env, key) {
  const value = required(env, key).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(value)) throw new Error(`${key} must be an Ethereum address`);
  return value;
}

function topic(env, key) {
  const value = required(env, key).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${key} must be a 32-byte topic`);
  return value;
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
