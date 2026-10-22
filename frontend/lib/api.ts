import { API_BASE_URL, COVERAGE } from "./config";

export type Token = "USDC" | "USDT";

export type Transfer = {
  chain: "ethereum";
  chainId: number;
  token: Token;
  from: string;
  to: string;
  amount: string;
  rawAmount: string;
  threshold: string;
  tokenContract: string;
  blockNumber: number;
  blockTimestamp: string;
  logIndex: number;
  transactionHash: string;
  transactionStatus: "success";
  transferType: "mint" | "burn" | "normal";
  detectedAt: string;
};

export type TransfersResponse = {
  items: Transfer[];
  nextCursor: string | null;
  total: number;
  counts: { USDC: number; USDT: number };
  refreshedAt: string;
};

export type TransactionResponse = {
  transactionHash: string;
  items: Transfer[];
  total: number;
  refreshedAt: string | null;
};

export type HealthResponse = {
  status: "ok" | "degraded";
  lastProcessedBlock: number | null;
  checkpointUpdatedAt: string | null;
  checkpointAgeSeconds: number | null;
  retentionDays: number;
  indexedEvents: number;
  indexRefreshedAt: string | null;
  indexError: string | null;
  lastRefreshError: string | null;
  checkpointError: string | null;
  // Absent from older API builds; null when the API or checkpoint does not carry them.
  chainHeadBlock?: number | null;
  indexThreshold?: string | null;
  confirmationBuffer?: number | null;
  pollIntervalSeconds?: number | null;
};

export type Filters = { token: "" | Token; minimumAmount: string; address: string };

export const EMPTY_FILTERS: Filters = { token: "", minimumAmount: "", address: "" };
export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
export const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
export const AMOUNT_PATTERN = /^[0-9]+(?:\.[0-9]{1,6})?$/;
export const EXPIRED_CURSOR_MESSAGE = "Cursor is invalid or no longer available";

// status 0 means no HTTP response: network failure, timeout or unreadable body.
export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function transferKey(transfer: Transfer) {
  return `${transfer.chainId}:${transfer.transactionHash}:${transfer.logIndex}`;
}

export function hasFilters(filters: Filters) {
  return Boolean(filters.token || filters.minimumAmount || filters.address);
}

// Commas are accepted and removed; leading zeros are dropped.
export function normalizeAmount(value: string) {
  return value.replace(/,/g, "").trim().replace(/^0+(?=\d)/, "");
}

function apiUrl(path: string) {
  return new URL(`${API_BASE_URL}${path}`, window.location.origin);
}

async function request(url: URL, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    throw new ApiRequestError(0, "The API could not be reached");
  }
  // A 429 from the load balancer may not be JSON, so the status code alone decides.
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      getApiError(payload) ?? `Request failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

export async function fetchTransfersPage(
  filters: Filters,
  cursor: string,
  signal?: AbortSignal,
): Promise<TransfersResponse> {
  const url = apiUrl("/api/transfers");
  url.searchParams.set("limit", String(COVERAGE.pageSize));
  if (cursor) url.searchParams.set("cursor", cursor);
  if (filters.token) url.searchParams.set("token", filters.token);
  if (filters.minimumAmount) url.searchParams.set("minimumAmount", filters.minimumAmount);
  if (filters.address) url.searchParams.set("address", filters.address);

  const payload = await request(url, signal);
  if (!isTransfersResponse(payload)) throw new ApiRequestError(0, "The API returned an unexpected transfer response");
  return payload;
}

// Resolves to null when nothing is retained for the hash (HTTP 404).
export async function fetchTransaction(hash: string, signal?: AbortSignal): Promise<TransactionResponse | null> {
  try {
    const payload = await request(apiUrl(`/api/transfers/${hash}`), signal);
    if (!isTransactionResponse(payload)) throw new ApiRequestError(0, "The API returned an unexpected transaction response");
    return payload;
  } catch (reason) {
    if (reason instanceof ApiRequestError && reason.status === 404) return null;
    throw reason;
  }
}

export type HealthResult =
  | { kind: "response"; httpStatus: number; body: HealthResponse | null; at: number }
  | { kind: "unreachable"; at: number };

// /api/health answers 503 with a JSON body, so both are kept.
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResult> {
  try {
    const response = await fetch(apiUrl("/api/health"), { cache: "no-store", signal });
    const payload: unknown = await response.json().catch(() => null);
    return {
      kind: "response",
      httpStatus: response.status,
      body: isHealthResponse(payload) ? payload : null,
      at: Date.now(),
    };
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    return { kind: "unreachable", at: Date.now() };
  }
}

function isTransfersResponse(value: unknown): value is TransfersResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  const counts = response.counts as Record<string, unknown> | null;
  return (
    Array.isArray(response.items) && response.items.every(isTransfer) &&
    (response.nextCursor === null || typeof response.nextCursor === "string") &&
    Number.isSafeInteger(response.total) && Number(response.total) >= 0 &&
    typeof counts === "object" && counts !== null &&
    Number.isSafeInteger(counts.USDC) && Number(counts.USDC) >= 0 &&
    Number.isSafeInteger(counts.USDT) && Number(counts.USDT) >= 0 &&
    typeof response.refreshedAt === "string" && !Number.isNaN(Date.parse(response.refreshedAt))
  );
}

function isTransactionResponse(value: unknown): value is TransactionResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.transactionHash === "string" && HASH_PATTERN.test(response.transactionHash) &&
    Array.isArray(response.items) && response.items.every(isTransfer) &&
    Number.isSafeInteger(response.total) && Number(response.total) >= 0 &&
    (response.refreshedAt === null || typeof response.refreshedAt === "string")
  );
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    (response.status === "ok" || response.status === "degraded") &&
    (response.lastProcessedBlock === null || Number.isSafeInteger(response.lastProcessedBlock)) &&
    (response.checkpointAgeSeconds === null || Number.isSafeInteger(response.checkpointAgeSeconds)) &&
    (response.checkpointUpdatedAt === null || typeof response.checkpointUpdatedAt === "string") &&
    (response.indexRefreshedAt === null || typeof response.indexRefreshedAt === "string") &&
    Number.isSafeInteger(response.retentionDays) &&
    Number(response.retentionDays) >= 1 && Number(response.retentionDays) <= 365 &&
    Number.isSafeInteger(response.indexedEvents) &&
    (response.indexError === null || typeof response.indexError === "string") &&
    (response.lastRefreshError === null || typeof response.lastRefreshError === "string") &&
    (response.checkpointError === null || typeof response.checkpointError === "string") &&
    isOptional(response.chainHeadBlock, (head) => Number.isSafeInteger(head) && Number(head) >= 0) &&
    isOptional(response.indexThreshold, (amount) => typeof amount === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(amount)) &&
    isOptional(response.confirmationBuffer, (blocks) => Number.isSafeInteger(blocks) && Number(blocks) >= 0) &&
    isOptional(response.pollIntervalSeconds, (seconds) => typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0)
  );
}

function isOptional(value: unknown, check: (value: unknown) => boolean) {
  return value === undefined || value === null || check(value);
}

function getApiError(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && error.trim() ? error : null;
}

function isTransfer(value: unknown): value is Transfer {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;

  return (
    item.chain === "ethereum" && item.chainId === 1 &&
    (item.token === "USDC" || item.token === "USDT") &&
    isAddress(item.from) && isAddress(item.to) && isAddress(item.tokenContract) &&
    typeof item.rawAmount === "string" && /^[0-9]+$/.test(item.rawAmount) &&
    typeof item.amount === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(item.amount) &&
    typeof item.threshold === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(item.threshold) &&
    Number.isSafeInteger(item.blockNumber) && Number(item.blockNumber) >= 0 &&
    typeof item.blockTimestamp === "string" && !Number.isNaN(Date.parse(item.blockTimestamp)) &&
    Number.isSafeInteger(item.logIndex) && Number(item.logIndex) >= 0 &&
    typeof item.transactionHash === "string" && HASH_PATTERN.test(item.transactionHash) &&
    item.transactionStatus === "success" &&
    (item.transferType === "mint" || item.transferType === "burn" || item.transferType === "normal") &&
    typeof item.detectedAt === "string" && !Number.isNaN(Date.parse(item.detectedAt))
  );
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}
