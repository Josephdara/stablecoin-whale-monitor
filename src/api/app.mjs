import express from "express";
import { eventKey, formatAmount, parseAmount } from "../event.mjs";

export class EventIndex {
  constructor(storage, chainId = 1) {
    this.storage = storage;
    this.chainId = chainId;
    this.events = [];
    this.eventObjectNames = new Set();
    this.refreshedAt = null;
    this.lastError = null;
    this.refreshPromise = null;
  }

  refresh() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshOnce().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  async refreshOnce() {
    try {
      if (typeof this.storage.iterateEvents === "function") {
        const additions = [];
        const objectNames = [];
        for await (const { name, event } of this.storage.iterateEvents({
          knownNames: this.eventObjectNames,
        })) {
          validateEvent(event, this.chainId);
          additions.push(event);
          objectNames.push(name);
        }
        if (additions.length) {
          const combined = this.events.length ? [...this.events, ...additions] : additions;
          this.events = deduplicate(combined).sort(compareNewestFirst);
          for (const name of objectNames) this.eventObjectNames.add(name);
        }
      } else {
        const events = await this.storage.listEvents();
        for (const event of events) validateEvent(event, this.chainId);
        this.events = deduplicate(events).sort(compareNewestFirst);
      }
      this.refreshedAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  query({ token, minimumAmount, address, limit, cursor }) {
    const filtered = this.events.filter((event) => {
      if (token && event.token !== token) return false;
      if (address && event.from !== address && event.to !== address) return false;
      if (minimumAmount && parseAmount(event.amount, 6) < parseAmount(minimumAmount, 6)) return false;
      return true;
    });

    let start = 0;
    if (cursor) {
      const cursorKey = decodeCursor(cursor);
      const position = filtered.findIndex((event) => eventKey(event) === cursorKey);
      if (position < 0) throw httpError(400, "Cursor is invalid or no longer available");
      start = position + 1;
    }
    const items = filtered.slice(start, start + limit);
    const hasMore = start + items.length < filtered.length;
    return {
      items,
      nextCursor: hasMore && items.length ? encodeCursor(eventKey(items.at(-1))) : null,
      total: filtered.length,
      counts: {
        USDC: filtered.filter((event) => event.token === "USDC").length,
        USDT: filtered.filter((event) => event.token === "USDT").length,
      },
      refreshedAt: this.refreshedAt,
    };
  }

  findByTransactionHash(transactionHash) {
    return this.events.filter(
      (event) => event.transactionHash.toLowerCase() === transactionHash.toLowerCase(),
    );
  }

  stats({ date } = {}) {
    const day = date ?? utcDateString(new Date());
    let usdcVolume = 0n;
    let usdtVolume = 0n;
    let transferCount = 0;
    let largestTransfer = null;
    let largestValue = -1n;

    for (const event of this.events) {
      if (utcDateString(new Date(event.blockTimestamp)) !== day) continue;
      transferCount += 1;
      const value = parseAmount(event.amount, 6);
      if (event.token === "USDC") usdcVolume += value;
      else if (event.token === "USDT") usdtVolume += value;
      if (value > largestValue) {
        largestValue = value;
        largestTransfer = {
          token: event.token,
          amount: event.amount,
          transactionHash: event.transactionHash,
        };
      }
    }

    return {
      date: day,
      transferCount,
      usdcVolume: formatAmount(usdcVolume, 6),
      usdtVolume: formatAmount(usdtVolume, 6),
      largestTransfer,
      refreshedAt: this.refreshedAt,
    };
  }
}

export function createApiApp({ config, storage, index }) {
  const app = express();
  app.disable("x-powered-by");

  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    if (config.allowedOrigin) response.setHeader("Access-Control-Allow-Origin", config.allowedOrigin);
    next();
  });

  app.get("/api/transfers", (request, response, next) => {
    try {
      const token = parseToken(request.query.token);
      const minimumAmount = parseMinimum(request.query.minimumAmount);
      const address = parseAddress(request.query.address);
      const limit = parseLimit(request.query.limit, config.maxPageSize);
      const cursor = parseCursor(request.query.cursor);
      response.json(index.query({ token, minimumAmount, address, limit, cursor }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/transfers/:txHash", (request, response, next) => {
    try {
      response.json(getTransfersByTransactionHash(index, request.params.txHash));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stats", (request, response, next) => {
    try {
      const date = parseDate(request.query.date);
      response.json(index.stats({ date }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/health", async (_request, response, next) => {
    try {
      const checkpointState = await storage.readCheckpoint();
      const checkpoint = checkpointState?.value ?? null;
      const checkpointAgeSeconds = checkpoint
        ? Math.max(0, Math.floor((Date.now() - Date.parse(checkpoint.updatedAt)) / 1000))
        : null;
      response.status(index.lastError ? 503 : 200).json({
        status: index.lastError ? "degraded" : "ok",
        chainId: config.chainId,
        lastProcessedBlock: checkpoint?.lastProcessedBlock ?? null,
        checkpointUpdatedAt: checkpoint?.updatedAt ?? null,
        checkpointAgeSeconds,
        indexedEvents: index.events.length,
        indexRefreshedAt: index.refreshedAt,
        indexError: index.lastError,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    const status = Number(error?.status) || 500;
    response.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
  });

  return app;
}

export function getTransfersByTransactionHash(index, value) {
  const transactionHash = parseTransactionHash(value);
  const items = index.findByTransactionHash(transactionHash);
  if (!items.length) throw httpError(404, "Transaction was not found in the indexed transfers");
  return {
    transactionHash,
    items,
    total: items.length,
    refreshedAt: index.refreshedAt,
  };
}

function validateEvent(event, chainId) {
  if (
    typeof event !== "object" || event === null ||
    event.chain !== "ethereum" || event.chainId !== chainId ||
    !new Set(["USDC", "USDT"]).has(event.token) ||
    !isAddress(event.tokenContract) || !isAddress(event.from) || !isAddress(event.to) ||
    !/^0x[0-9a-fA-F]{64}$/.test(event.transactionHash) ||
    !Number.isSafeInteger(event.blockNumber) || !Number.isSafeInteger(event.logIndex) ||
    typeof event.blockTimestamp !== "string" || Number.isNaN(Date.parse(event.blockTimestamp)) ||
    !/^[0-9]+$/.test(event.rawAmount) || !/^[0-9]+(?:\.[0-9]+)?$/.test(event.amount) ||
    !/^[0-9]+(?:\.[0-9]+)?$/.test(event.threshold) || event.transactionStatus !== "success" ||
    !new Set(["mint", "burn", "normal"]).has(event.transferType) ||
    typeof event.detectedAt !== "string" || Number.isNaN(Date.parse(event.detectedAt))
  ) throw new Error("Stored event failed schema validation");
}

function deduplicate(events) {
  const unique = new Map();
  for (const event of events) unique.set(eventKey(event), event);
  return [...unique.values()];
}

function compareNewestFirst(a, b) {
  return b.blockNumber - a.blockNumber || b.logIndex - a.logIndex;
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify({ key: value })).toString("base64url");
}

function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed.key !== "string") throw new Error();
    return parsed.key;
  } catch {
    throw httpError(400, "Malformed cursor");
  }
}

function parseToken(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !new Set(["USDC", "USDT"]).has(value.toUpperCase())) throw httpError(400, "Invalid token filter");
  return value.toUpperCase();
}

function parseMinimum(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !/^[0-9]+(?:\.[0-9]{1,6})?$/.test(value)) throw httpError(400, "Invalid minimumAmount filter");
  return value;
}

function parseAddress(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !isAddress(value)) throw httpError(400, "Invalid address filter");
  return value.toLowerCase();
}

function parseLimit(value, max) {
  if (value === undefined || value === "") return max;
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw httpError(400, "Invalid limit");
  const parsed = Number(value);
  if (parsed < 1 || parsed > max) throw httpError(400, `limit must be between 1 and ${max}`);
  return parsed;
}

function parseCursor(value) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 512) throw httpError(400, "Invalid cursor");
  return value;
}

function parseTransactionHash(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw httpError(400, "Invalid transaction hash");
  }
  return value.toLowerCase();
}

function parseDate(value) {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) throw httpError(400, "Invalid date filter");
  return value;
}

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function isAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
