"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Transfer = {
  chain: "ethereum";
  chainId: number;
  token: "USDC" | "USDT";
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

type TransfersResponse = {
  items: Transfer[];
  nextCursor: string | null;
  total: number;
  counts: { USDC: number; USDT: number };
  refreshedAt: string;
};

type TransactionResponse = {
  transactionHash: string;
  items: Transfer[];
  total: number;
  refreshedAt: string | null;
};

type HealthResponse = {
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
};

type HealthLevel = "healthy" | "delayed" | "stale" | "unavailable";
type TransferLoadResult = "loaded" | "reset" | "ignored" | "failed";

type Filters = { token: "" | "USDC" | "USDT"; minimumAmount: string; address: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const PAGE_SIZE = 50;
const EMPTY_FILTERS: Filters = { token: "", minimumAmount: "", address: "" };
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_PATTERN = /^[0-9]+(?:\.[0-9]{1,6})?$/;
// Paused until 2026-10-25 along with the API and indexer.
const SERVICES_PAUSED = true;

function apiUrl(path: string) {
  return new URL(`${API_BASE_URL}${path}`, window.location.origin);
}

class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function fetchTransfersPage(cursor: string, filters: Filters): Promise<TransfersResponse> {
  const url = apiUrl("/api/transfers");
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (cursor) url.searchParams.set("cursor", cursor);
  if (filters.token) url.searchParams.set("token", filters.token);
  if (filters.minimumAmount) url.searchParams.set("minimumAmount", filters.minimumAmount);
  if (filters.address) url.searchParams.set("address", filters.address);

  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      getApiError(payload) ?? `Could not load transfer data (${response.status})`,
    );
  }
  if (!isTransfersResponse(payload)) throw new Error("API returned an invalid transfer response");
  return payload;
}

export default function Home() {
  return SERVICES_PAUSED ? <Offline /> : <Monitor />;
}

function Offline() {
  return (
    <main>
      <Hero />
      <section className="offlineBanner" role="status">
        <span className="offlineEmoji" aria-hidden="true">🐋</span>
        <div>
          <p className="eyebrow">Gone fishing</p>
          <strong>The whales are migrating, and so are we.</strong>
          <span>
            The indexer and API are switched off until October 25. No point serving stale
            splashes, so the live feed is taking a break too. See you back in the deep end!
          </span>
        </div>
      </section>
    </main>
  );
}

function Monitor() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ USDC: 0, USDT: 0 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [now, setNow] = useState(() => new Date());

  const [form, setForm] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthOk, setHealthOk] = useState(true);

  const [txQuery, setTxQuery] = useState("");
  const [txDetail, setTxDetail] = useState<TransactionResponse | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const transferRequestId = useRef(0);

  const loadTransfers = useCallback(
    async (cursor = "", resetHistory = false): Promise<TransferLoadResult> => {
      const requestId = transferRequestId.current + 1;
      transferRequestId.current = requestId;
      setLoading(true);
      setError(null);

      try {
        let payload: TransfersResponse;
        let recoveredExpiredCursor = false;
        try {
          payload = await fetchTransfersPage(cursor, applied);
        } catch (reason) {
          if (requestId !== transferRequestId.current) return "ignored";
          if (!(cursor && reason instanceof ApiRequestError && reason.status === 400)) throw reason;
          payload = await fetchTransfersPage("", applied);
          recoveredExpiredCursor = true;
        }

        if (requestId !== transferRequestId.current) return "ignored";
        setTransfers(payload.items);
        setTotal(payload.total);
        setCounts(payload.counts);
        setNextCursor(payload.nextCursor);
        if (resetHistory || recoveredExpiredCursor) setCursorHistory([""]);
        return recoveredExpiredCursor ? "reset" : "loaded";
      } catch (reason) {
        if (requestId !== transferRequestId.current) return "ignored";
        setError(reason instanceof Error ? reason.message : "Unable to load data");
        return "failed";
      } finally {
        if (requestId === transferRequestId.current) setLoading(false);
      }
    },
    [applied],
  );

  const loadHealth = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
      const payload: unknown = await response.json();
      setHealth(isHealthResponse(payload) ? payload : null);
      setHealthOk(response.ok);
    } catch {
      setHealth(null);
      setHealthOk(false);
    }
  }, []);

  useEffect(() => {
    void loadTransfers("", true);
    const refresh = window.setInterval(() => void loadTransfers("", true), 30_000);
    return () => window.clearInterval(refresh);
  }, [loadTransfers]);

  useEffect(() => {
    void loadHealth();
    const refresh = window.setInterval(() => void loadHealth(), 30_000);
    return () => window.clearInterval(refresh);
  }, [loadHealth]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentPage = cursorHistory.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageOffset = (currentPage - 1) * PAGE_SIZE;
  const pageStart = Math.min(pageOffset + 1, total);
  const pageEnd = Math.min(pageOffset + transfers.length, total);
  const paginationIsConsistent = currentPage <= pageCount && pageStart <= pageEnd;
  const healthLevel = classifyHealth(health, healthOk);
  const hasActiveFilters = Boolean(applied.token || applied.minimumAmount || applied.address);
  const retentionWindow = health
    ? `the last ${health.retentionDays} ${health.retentionDays === 1 ? "day" : "days"}`
    : "the current retention window";

  useEffect(() => {
    if (!loading && !error && currentPage > pageCount) void loadTransfers("", true);
  }, [currentPage, error, loadTransfers, loading, pageCount]);

  async function goNext() {
    const cursor = nextCursor;
    if (!cursor) return;
    if (await loadTransfers(cursor) === "loaded") {
      setCursorHistory((history) => [...history, cursor]);
    }
  }

  async function goPrevious() {
    if (cursorHistory.length <= 1) return;
    const previousCursor = cursorHistory.at(-2) ?? "";
    if (await loadTransfers(previousCursor) === "loaded") {
      setCursorHistory((history) => history.slice(0, -1));
    }
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    const address = form.address.trim();
    const minimumAmount = form.minimumAmount.trim();
    if (address && !ADDRESS_PATTERN.test(address)) {
      setFilterError("Enter a valid 0x wallet address (40 hex characters).");
      return;
    }
    if (minimumAmount && !AMOUNT_PATTERN.test(minimumAmount)) {
      setFilterError("Minimum amount must be a number with up to 6 decimals.");
      return;
    }
    setFilterError(null);
    setApplied({ token: form.token, minimumAmount, address: address.toLowerCase() });
  }

  function resetFilters() {
    setForm(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFilterError(null);
  }

  async function lookupTransaction(event: React.FormEvent) {
    event.preventDefault();
    const hash = txQuery.trim().toLowerCase();
    if (!HASH_PATTERN.test(hash)) {
      setTxDetail(null);
      setTxError("Enter a 32-byte transaction hash (0x followed by 64 hex characters).");
      return;
    }
    setTxLoading(true);
    setTxError(null);
    try {
      const response = await fetch(apiUrl(`/api/transfers/${hash}`), { cache: "no-store" });
      if (response.status === 404) {
        setTxDetail(null);
        setTxError("No qualifying transfers are indexed for that transaction.");
        return;
      }
      if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
      const payload: unknown = await response.json();
      if (!isTransactionResponse(payload)) throw new Error("API returned an invalid transaction response");
      setTxDetail(payload);
    } catch (reason) {
      setTxDetail(null);
      setTxError(reason instanceof Error ? reason.message : "Unable to look up transaction");
    } finally {
      setTxLoading(false);
    }
  }

  function clearTransaction() {
    setTxQuery("");
    setTxDetail(null);
    setTxError(null);
  }

  return (
    <main>
      <Hero>
        <button type="button" onClick={() => void loadTransfers("", true)} disabled={loading}>
          {loading ? "Loading…" : "Reload data"}
        </button>
      </Hero>

      <section className={`healthbar level-${healthLevel}`} aria-label="Indexer status">
        <span className="healthBadge">{HEALTH_LABEL[healthLevel]}</span>
        <HealthField label="Last processed block" value={
          health?.lastProcessedBlock != null ? health.lastProcessedBlock.toLocaleString() : "—"
        } />
        <HealthField label="Checkpoint age" value={
          health?.checkpointAgeSeconds != null ? formatDuration(health.checkpointAgeSeconds) : "—"
        } />
        <HealthField label={
          health ? `Events in ${health.retentionDays}-day window` : "Events in retention window"
        } value={
          health?.indexedEvents != null ? health.indexedEvents.toLocaleString() : "—"
        } />
        <HealthField label="Index refresh" value={
          health?.indexRefreshedAt ? new Date(health.indexRefreshedAt).toLocaleTimeString() : "—"
        } />
      </section>

      <section className="panel lookup">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Transaction lookup</p>
            <h2>Find a transaction</h2>
          </div>
          <span className="source">Every qualifying log</span>
        </div>
        <form className="toolbar" onSubmit={(event) => void lookupTransaction(event)}>
          <input
            className="control grow"
            type="text"
            inputMode="text"
            placeholder="0x transaction hash"
            value={txQuery}
            onChange={(event) => setTxQuery(event.target.value)}
            aria-label="Transaction hash"
          />
          <button type="submit" className="pageButton" disabled={txLoading}>
            {txLoading ? "Searching…" : "Look up"}
          </button>
          {txDetail || txError ? (
            <button type="button" className="pageButton" onClick={clearTransaction}>
              Clear
            </button>
          ) : null}
        </form>

        {txError ? (
          <div className="state error" role="alert">
            <strong>Transaction not shown.</strong>
            <span>{txError}</span>
          </div>
        ) : txDetail ? (
          <>
            <p className="detailNote">
              {txDetail.total} qualifying {txDetail.total === 1 ? "transfer" : "transfers"} in{" "}
              <span className="address">{shorten(txDetail.transactionHash)}</span>
            </p>
            <TransfersTable transfers={txDetail.items} now={now} />
          </>
        ) : null}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Transfer feed</p>
            <h2>Recent transfers</h2>
          </div>
          <span className="source">
            {total.toLocaleString()} matching · {counts.USDC.toLocaleString()} USDC ·{" "}
            {counts.USDT.toLocaleString()} USDT
          </span>
        </div>

        <form className="toolbar" onSubmit={applyFilters}>
          <label className="control-label">
            Token
            <select
              className="control"
              value={form.token}
              onChange={(event) => setForm((f) => ({ ...f, token: event.target.value as Filters["token"] }))}
            >
              <option value="">All</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </label>
          <label className="control-label">
            Minimum amount
            <input
              className="control"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 250000"
              value={form.minimumAmount}
              onChange={(event) => setForm((f) => ({ ...f, minimumAmount: event.target.value }))}
            />
          </label>
          <label className="control-label grow">
            Wallet address
            <input
              className="control"
              type="text"
              placeholder="0x sender or receiver"
              value={form.address}
              onChange={(event) => setForm((f) => ({ ...f, address: event.target.value }))}
            />
          </label>
          <div className="toolbarActions">
            <button type="submit" className="pageButton" disabled={loading}>Apply</button>
            <button type="button" className="pageButton" onClick={resetFilters}>Reset</button>
          </div>
        </form>

        {filterError ? (
          <div className="state error" role="alert">
            <strong>Filters not applied.</strong>
            <span>{filterError}</span>
          </div>
        ) : error ? (
          <div className="state error" role="alert">
            <strong>Data could not be loaded.</strong>
            <span>{error}</span>
          </div>
        ) : transfers.length === 0 && !loading ? (
          <div className="state">
            <strong>
              {hasActiveFilters
                ? "No transfers match these filters."
                : `No qualifying transfers in ${retentionWindow}.`}
            </strong>
            <span>
              {hasActiveFilters
                ? "Adjust or reset the filters to broaden the results."
                : "New qualifying transfers will appear automatically."}
            </span>
          </div>
        ) : (
          <TransfersTable transfers={transfers} now={now} />
        )}

        {!error && !filterError && transfers.length > 0 && paginationIsConsistent ? (
          <nav className="pagination" aria-label="Transfer pages">
            <span>
              Showing {pageStart}–{pageEnd} of {total}
            </span>
            <div>
              <button
                type="button"
                className="pageButton"
                disabled={currentPage === 1}
                onClick={() => void goPrevious()}
              >
                Previous
              </button>
              <span>Page {currentPage} of {pageCount}</span>
              <button
                type="button"
                className="pageButton"
                disabled={!nextCursor}
                onClick={() => void goNext()}
              >
                Next
              </button>
            </div>
          </nav>
        ) : null}
      </section>

      <p className="disclosure">
        Events are published after 6 confirmations, which reduces short-reorganization
        exposure but is not a finality guarantee. After a deep reorganization, records that
        were already published are not rewritten.
      </p>
    </main>
  );
}

function Hero({ children }: { children?: ReactNode }) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Ethereum mainnet</p>
        <h1>Stablecoin Whale Monitor</h1>
        <p className="subtitle">
          Locally indexed USDC and USDT transfers, straight from the chain.
        </p>
      </div>
      {children}
    </header>
  );
}

function TransfersTable({ transfers, now }: { transfers: Transfer[]; now: Date }) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Amount</th>
            <th>Sender</th>
            <th>Receiver</th>
            <th>Token address</th>
            <th>Age</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr key={`${transfer.chainId}:${transfer.transactionHash}:${transfer.logIndex}`}>
              <td>
                <span className={`token token${transfer.token}`}>{transfer.token}</span>
              </td>
              <td className="amount">{formatDecimal(transfer.amount)}</td>
              <td><Address value={transfer.from} /></td>
              <td><Address value={transfer.to} /></td>
              <td><Address value={transfer.tokenContract} /></td>
              <td className="age">{formatRelativeAge(transfer.blockTimestamp, now)}</td>
              <td>
                <a
                  className="hash"
                  href={`https://etherscan.io/tx/${transfer.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={transfer.transactionHash}
                >
                  {shorten(transfer.transactionHash)} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthField({ label, value }: { label: string; value: string }) {
  return (
    <span className="healthField">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function Address({ value }: { value: string }) {
  return <span className="address" title={value}>{shorten(value)}</span>;
}

const HEALTH_LABEL: Record<HealthLevel, string> = {
  healthy: "Healthy",
  delayed: "Delayed",
  stale: "Stale",
  unavailable: "Unavailable",
};

function classifyHealth(health: HealthResponse | null, healthOk: boolean): HealthLevel {
  if (!healthOk || !health || health.indexError) return "unavailable";
  if (health.lastRefreshError || health.checkpointError) return "delayed";
  const age = health.checkpointAgeSeconds;
  if (age == null) return "delayed";
  if (age < 120) return "healthy";
  if (age < 300) return "delayed";
  return "stale";
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
    (response.status === "ok" || response.status === "degraded") &&
    typeof response.transactionHash === "string" && HASH_PATTERN.test(response.transactionHash) &&
    Array.isArray(response.items) && response.items.every(isTransfer) &&
    Number.isSafeInteger(response.total) && Number(response.total) >= 0
  );
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    (response.lastProcessedBlock === null || Number.isSafeInteger(response.lastProcessedBlock)) &&
    (response.checkpointAgeSeconds === null || Number.isSafeInteger(response.checkpointAgeSeconds)) &&
    Number.isSafeInteger(response.retentionDays) &&
    Number(response.retentionDays) >= 1 && Number(response.retentionDays) <= 365 &&
    Number.isSafeInteger(response.indexedEvents) &&
    (response.indexError === null || typeof response.indexError === "string") &&
    (response.lastRefreshError === null || typeof response.lastRefreshError === "string") &&
    (response.checkpointError === null || typeof response.checkpointError === "string")
  );
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
    typeof item.amount === "string" &&
    /^[0-9]+(?:\.[0-9]+)?$/.test(item.amount) &&
    typeof item.threshold === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(item.threshold) &&
    Number.isSafeInteger(item.blockNumber) && Number(item.blockNumber) >= 0 &&
    typeof item.blockTimestamp === "string" && !Number.isNaN(Date.parse(item.blockTimestamp)) &&
    Number.isSafeInteger(item.logIndex) && Number(item.logIndex) >= 0 &&
    typeof item.transactionHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(item.transactionHash) &&
    item.transactionStatus === "success" &&
    (item.transferType === "mint" || item.transferType === "burn" || item.transferType === "normal") &&
    typeof item.detectedAt === "string" && !Number.isNaN(Date.parse(item.detectedAt))
  );
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function shorten(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDecimal(value: string) {
  const [whole, fraction] = value.split(".");
  const formattedWhole = formatInteger(whole);
  return fraction ? `${formattedWhole}.${fraction}` : formattedWhole;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatRelativeAge(timestamp: string, now: Date) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(timestamp)) / 1000),
  );

  if (elapsedSeconds < 10) return "Just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
