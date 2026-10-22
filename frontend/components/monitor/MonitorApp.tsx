"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiRequestError,
  EMPTY_FILTERS,
  fetchHealth,
  fetchTransfersPage,
  hasFilters,
  transferKey,
  type Filters,
  type HealthResponse,
  type HealthResult,
  type Transfer,
  type TransfersResponse,
} from "../../lib/api";
import { COVERAGE } from "../../lib/config";
import { formatAmount, formatDuration, formatUtcShortTime, formatUtcTime, groupInteger, shorten } from "../../lib/format";
import { checkpointAge, checkpointLevel, indexAge, indexLevel, reportedCoverage, STALE_SECONDS } from "../../lib/health";
import { useAnnounce } from "../Announcer";
import { HistoryNotice } from "../HistoryNotice";
import { Icon, TokenGlyph } from "../Icon";
import { Callout } from "../ui";
import { DetailPanel } from "./DetailPanel";
import { AddressField, AmountField, draftsFrom, LookupField, TokenSegment, type Drafts } from "./FilterFields";
import { FilterSheet } from "./FilterSheet";
import { LookupView } from "./LookupView";
import { AutoRefreshNote, Countdown, SignalStrip, type SignalView } from "./SignalStrip";
import { SkeletonRows, TransferCards, TransferTable } from "./TransferList";
import {
  buildMonitorHref,
  navigateMonitor,
  parseMonitorUrl,
  validateAddress,
  validateAmount,
  validateHash,
  type FieldErrors,
  type MonitorUrl,
} from "./url";
import { useSelectedTransfer } from "./useSelectedTransfer";

const POLL_MS = COVERAGE.monitorRefreshSeconds * 1000;
const RATE_LIMIT_MS = COVERAGE.rateLimitWindowSeconds * 1000;
// Retry after 30, 60 and 120 seconds, then every 5 minutes.
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000];
const EMPTY_KEYS = new Set<string>();

type Failure =
  | { kind: "rate-limited"; at: number; until: number }
  | { kind: "unreachable"; at: number }
  | { kind: "index-unavailable"; at: number }
  | { kind: "bad-request"; at: number; message: string };

type FeedRequest = "load" | "refresh" | "older" | "newer" | "newest";

type Notice = { kind: "expired" } | { kind: "recovered"; at: number } | null;

export function MonitorApp() {
  const params = useSearchParams();
  const query = params?.toString() ?? "";
  const url = useMemo(() => parseMonitorUrl(new URLSearchParams(query)), [query]);
  const [now, setNow] = useState(() => Date.now());

  // Relative times are recalculated without new requests.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (url.tx !== null) return <LookupView url={url} now={now} />;
  return <FeedView url={url} now={now} />;
}

function plural(count: number, word: string) {
  return `${groupInteger(String(count))} ${word}${count === 1 ? "" : "s"}`;
}

function newRowKeys(previous: Transfer[], next: Transfer[]) {
  const known = new Set(previous.map(transferKey));
  const fresh = new Set<string>();
  for (const item of next) {
    const key = transferKey(item);
    if (known.has(key)) break;
    fresh.add(key);
  }
  return fresh;
}

function FeedView({ url, now }: { url: MonitorUrl; now: number }) {
  const announce = useAnnounce();
  const filters = url.filters;
  const filtersKey = `${filters.token}|${filters.minimumAmount}|${filters.address}`;
  const urlInvalid = Object.keys(url.errors).length > 0;

  const [data, setData] = useState<TransfersResponse | null>(null);
  const [pageIndex, setPageIndexState] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailureState] = useState<Failure | null>(null);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [pending, setPending] = useState<{ data: TransfersResponse; keys: Set<string> } | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(EMPTY_KEYS);
  const [notice, setNotice] = useState<Notice>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [nextAt, setNextAt] = useState(() => Date.now() + POLL_MS);

  const cursors = useRef<string[]>([""]);
  const pageIndexRef = useRef(0);
  const failureRef = useRef<Failure | null>(null);
  const failCount = useRef(0);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedRef = useRef(url.selected);
  selectedRef.current = url.selected;

  function setPageIndex(index: number) {
    pageIndexRef.current = index;
    setPageIndexState(index);
  }

  function setFailure(next: Failure | null) {
    failureRef.current = next;
    setFailureState(next);
  }

  const runFeed = useCallback(async (kind: FeedRequest, manual = false) => {
    if (urlInvalid) return;
    const blocked = failureRef.current;
    if (blocked?.kind === "rate-limited" && Date.now() < blocked.until) return;

    let targetIndex = pageIndexRef.current;
    let cursor = "";
    if (kind === "load" || kind === "newest") targetIndex = 0;
    if (kind === "newer") targetIndex = Math.max(0, targetIndex - 1);
    if (kind === "older") {
      const next = dataRef.current?.nextCursor;
      if (!next) return;
      targetIndex += 1;
      cursor = next;
    } else if (targetIndex > 0) {
      cursor = cursors.current[targetIndex] ?? "";
    }

    const id = requestId.current + 1;
    requestId.current = id;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingRef.current = true;
    setLoading(true);

    const healthRequest = kind === "load" || kind === "refresh" ? fetchHealth(controller.signal).catch(() => null) : null;
    const applyHealth = (result: HealthResult | null) => {
      if (!result) return;
      setHealth((previous) =>
        result.kind === "response" && result.httpStatus === 429 && previous ? previous : result,
      );
    };

    try {
      let payload: TransfersResponse;
      let expired = false;
      try {
        payload = await fetchTransfersPage(filters, cursor, controller.signal);
      } catch (reason) {
        if (!(cursor && reason instanceof ApiRequestError && reason.status === 400)) throw reason;
        payload = await fetchTransfersPage(filters, "", controller.signal);
        expired = true;
      }
      const healthResult = healthRequest ? await healthRequest : null;
      if (id !== requestId.current) return;
      applyHealth(healthResult);

      const recovered = failureRef.current !== null && failureRef.current.kind !== "bad-request";
      setFailure(null);
      failCount.current = 0;
      setLastSuccessAt(Date.now());
      setNextAt(Date.now() + POLL_MS);

      if (expired) {
        cursors.current = [""];
        setPageIndex(0);
        setData(payload);
        setPending(null);
        setNewKeys(EMPTY_KEYS);
        setNotice({ kind: "expired" });
        announce("That page is no longer available. Showing the newest transfers.");
        return;
      }

      if (kind === "older") cursors.current = [...cursors.current.slice(0, targetIndex), cursor];
      setPageIndex(targetIndex);

      const current = dataRef.current;
      if (kind === "refresh" && targetIndex === 0 && current) {
        const fresh = newRowKeys(current.items, payload.items);
        if (fresh.size && selectedRef.current) {
          setPending({ data: payload, keys: fresh });
          announce(`${plural(fresh.size, "new transfer")} available. Use Show to add them.`);
        } else {
          setData(payload);
          setPending(null);
          setNewKeys(fresh);
          if (fresh.size) announce(`${plural(fresh.size, "new transfer")} added at the top.`);
          else if (manual) announce("Feed refreshed. No new transfers.");
        }
      } else {
        setData(payload);
        setPending(null);
        setNewKeys(EMPTY_KEYS);
        if (kind !== "load" || manual) {
          const start = targetIndex * COVERAGE.pageSize + 1;
          announce(payload.items.length
            ? `Showing ${start} to ${start + payload.items.length - 1} of ${payload.total} matching transfers.`
            : "No matching transfers.");
        }
      }

      if (recovered) setNotice({ kind: "recovered", at: Date.now() });
      else setNotice((previous) => (kind === "refresh" && previous?.kind === "expired" ? previous : null));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      const healthResult = healthRequest ? await healthRequest : null;
      if (id !== requestId.current) return;
      applyHealth(healthResult);

      const at = Date.now();
      const status = reason instanceof ApiRequestError ? reason.status : 0;
      let next: Failure;
      if (status === 429) next = { kind: "rate-limited", at, until: at + RATE_LIMIT_MS };
      else if (status === 503) next = { kind: "index-unavailable", at };
      else if (status === 400) next = { kind: "bad-request", at, message: (reason as Error).message };
      else next = { kind: "unreachable", at };
      failCount.current += 1;
      const firstFailure = failureRef.current === null;
      setFailure(next);
      setNextAt(next.kind === "rate-limited" ? next.until : at + BACKOFF_MS[Math.min(failCount.current - 1, BACKOFF_MS.length - 1)]);
      if (firstFailure || manual) {
        announce(
          next.kind === "rate-limited"
            ? "Too many requests. Refresh is paused for 60 seconds."
            : next.kind === "index-unavailable"
              ? "Transfer data is unavailable right now."
              : next.kind === "bad-request"
                ? `The API rejected the request: ${next.message}`
                : "The API could not be reached.",
        );
      }
    } finally {
      if (id === requestId.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [filtersKey, urlInvalid, announce]);

  const runRef = useRef(runFeed);
  runRef.current = runFeed;

  // Any filter change clears the cursor stack and loads page 1.
  useEffect(() => {
    cursors.current = [""];
    setPageIndex(0);
    setData(null);
    setPending(null);
    setNewKeys(EMPTY_KEYS);
    setNotice(null);
    if (!urlInvalid) void runRef.current("load");
    return () => abortRef.current?.abort();
  }, [filtersKey, urlInvalid]);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const detailOpen = url.selected !== null;
  const autoActive = !urlInvalid && visible && pageIndex === 0 && !detailOpen && !userPaused;

  useEffect(() => {
    if (!autoActive) return;
    const timer = window.setTimeout(() => {
      if (loadingRef.current) setNextAt(Date.now() + POLL_MS);
      else void runRef.current("refresh");
    }, Math.max(0, nextAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [autoActive, nextAt]);

  const showPending = useCallback(() => {
    if (!pending) return;
    setData(pending.data);
    setNewKeys(pending.keys);
    setPending(null);
    announce(`${plural(pending.keys.size, "new transfer")} added at the top.`);
  }, [pending, announce]);

  // New rows wait behind the prompt until Show or until the panel closes.
  useEffect(() => {
    if (!url.selected && pending) showPending();
  }, [url.selected, pending, showPending]);

  const items = data?.items ?? [];
  const selection = useSelectedTransfer(url.selected, items);
  const selectedKey = url.selected ? `1:${url.selected.hash}:${url.selected.logIndex}` : null;
  const lastOpener = useRef<string | null>(null);

  function openTransfer(transfer: Transfer) {
    lastOpener.current = transferKey(transfer);
    const href = buildMonitorHref({ filters, selected: { hash: transfer.transactionHash, logIndex: transfer.logIndex } });
    navigateMonitor(href, "replace");
    if (!detailOpen) announce("Transfer detail opened. Auto-refresh paused.");
  }

  function closeTransfer() {
    navigateMonitor(buildMonitorHref({ filters }), "replace");
    announce("Transfer detail closed.");
    const key = lastOpener.current;
    window.setTimeout(() => {
      const target = key ? document.querySelector<HTMLElement>(`[data-open-key="${key}"]`) : null;
      if (target && target.offsetParent !== null) target.focus();
      else document.querySelectorAll<HTMLElement>(`[data-open-key="${key}"]`).forEach((element) => {
        if (element.offsetParent !== null) element.focus();
      });
    }, 0);
  }

  // Each filter change is a new history entry.
  function applyFilters(next: Filters, message: string) {
    navigateMonitor(buildMonitorHref({ filters: next }), "push");
    announce(message);
  }

  // Drafts follow the URL when it changes, for example on Back.
  const rawKey = `${url.raw.token}|${url.raw.minimumAmount}|${url.raw.address}`;
  const [drafts, setDrafts] = useState<Drafts>(() => draftsFrom(url.raw));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(url.errors);
  const [lookupError, setLookupError] = useState<string | undefined>();
  const keepDrafts = useRef(false);
  useEffect(() => {
    if (keepDrafts.current) {
      keepDrafts.current = false;
      return;
    }
    setDrafts(draftsFrom(url.raw));
    setFieldErrors(url.errors);
    // url.raw and url.errors are derived from rawKey.
  }, [rawKey]);

  function submitFilters(token: Filters["token"], source: Drafts, idPrefix: string) {
    const amount = validateAmount(source.minimumAmount);
    const address = validateAddress(source.address);
    const errors: FieldErrors = {};
    if (!amount.ok) errors.minimumAmount = amount.error;
    if (!address.ok) errors.address = address.error;
    if (!amount.ok || !address.ok) {
      setFieldErrors(errors);
      document.getElementById(errors.minimumAmount ? `${idPrefix}-min` : `${idPrefix}-addr`)?.focus();
      announce("Check the highlighted fields.");
      return false;
    }
    setFieldErrors({});
    applyFilters(
      { token, minimumAmount: amount.value, address: address.value },
      "Filters applied.",
    );
    return true;
  }

  function submitLookup(value: string, idPrefix: string) {
    const result = validateHash(value);
    if (!result.ok) {
      setLookupError(result.error);
      document.getElementById(`${idPrefix}-tx`)?.focus();
      announce(result.error);
      return false;
    }
    setLookupError(undefined);
    navigateMonitor(buildMonitorHref({ tx: result.value }), "push");
    return true;
  }

  function setToken(token: Filters["token"]) {
    keepDrafts.current = true;
    applyFilters({ ...filters, token }, token ? `Showing ${token} only.` : "Showing all tokens.");
  }

  function resetAll() {
    setDrafts({ minimumAmount: "", address: "" });
    setFieldErrors({});
    applyFilters(EMPTY_FILTERS, "All filters cleared.");
  }

  function filterByAddress(address: string) {
    setDrafts((previous) => ({ ...previous, address }));
    applyFilters({ ...filters, address }, `Filtered by ${shorten(address)}.`);
  }

  // Signals: API reachability, index refresh age and chain progress are judged separately.
  const healthBody = health?.kind === "response" ? health.body : null;
  const threshold = formatAmount(reportedCoverage(healthBody).indexThreshold);
  const indexRefreshedAt = latest(data?.refreshedAt ?? null, healthBody?.indexRefreshedAt ?? null);
  const indexSeconds = indexAge(indexRefreshedAt, now);
  const checkpointSeconds = healthBody && health?.kind === "response" ? checkpointAge(healthBody, health.at, now) : null;
  const rateLimited = failure?.kind === "rate-limited" && failure.until > Date.now();

  const apiSignal: SignalView = (() => {
    if (failure?.kind === "rate-limited") return { level: "warn", label: "Rate limited", detail: "Requests paused" };
    if (failure?.kind === "unreachable") return { level: "err", label: "Not reachable", detail: `Failed at ${formatUtcTime(new Date(failure.at).toISOString())} UTC` };
    if (failure?.kind === "index-unavailable") return { level: "warn", label: "Responding", detail: "Index unavailable" };
    if (healthBody?.status === "degraded") return { level: "warn", icon: "warning", label: "Degraded", detail: "A refresh or checkpoint read failed" };
    if (lastSuccessAt) return { level: "ok", label: "Reachable", detail: `Checked ${formatUtcTime(new Date(lastSuccessAt).toISOString())} UTC` };
    return { level: "unknown", label: "Checking", detail: "First request in flight" };
  })();

  const indexSignal: SignalView = (() => {
    if (failure?.kind === "index-unavailable") return { level: "err", label: `Over ${COVERAGE.maxStaleMinutes} min ago`, detail: "Not serving old data" };
    if (failure && indexRefreshedAt) return { level: "unknown", label: "Unknown", detail: `As of ${formatUtcTime(indexRefreshedAt)} UTC` };
    if (indexSeconds === null || !indexRefreshedAt) return { level: "unknown", label: failure ? "Unknown" : "Checking", detail: "" };
    if (healthBody?.lastRefreshError) return { level: "warn", icon: "warning", label: `${formatDuration(indexSeconds)} ago`, detail: "Last refresh failed" };
    return { level: indexLevel(indexSeconds), label: `${formatDuration(indexSeconds)} ago`, detail: `${formatUtcTime(indexRefreshedAt)} UTC` };
  })();

  const chainSignal: SignalView = (() => {
    if (!healthBody) return { level: "unknown", label: failure ? "Unknown" : "Checking", detail: "" };
    if (healthBody.checkpointError) return { level: "warn", icon: "warning", label: "Unreadable", detail: "Checkpoint read failed" };
    if (healthBody.lastProcessedBlock === null || checkpointSeconds === null) return { level: "warn", label: "No checkpoint", detail: "" };
    const level = checkpointLevel(checkpointSeconds);
    return {
      level,
      label: `Block ${groupInteger(String(healthBody.lastProcessedBlock))}`,
      short: `${formatDuration(checkpointSeconds)} old`,
      detail: `Checkpoint ${formatDuration(checkpointSeconds)} old`,
    };
  })();

  const autoReason = userPaused
    ? "Auto-refresh paused"
    : detailOpen
      ? "Auto-refresh paused while a transfer is open"
      : pageIndex > 0
        ? "Auto-refresh is off on older pages"
        : !visible
          ? "Auto-refresh waits while this tab is hidden"
          : "Auto-refresh paused";

  const refreshControls = (
    <>
      <AutoRefreshNote active={autoActive && !rateLimited && !failure} reason={failure && autoActive ? retryText(failure, nextAt) : autoReason} nextAt={nextAt} />
      <div className="wrap-row gap-8">
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => void runFeed("refresh", true)} disabled={loading || rateLimited || urlInvalid}>
          <Icon name="refresh" size={14} />
          {rateLimited ? <>Refresh now · <Countdown to={nextAt} /> s</> : loading && data ? "Refreshing…" : "Refresh now"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          aria-pressed={userPaused}
          onClick={() => {
            setUserPaused(!userPaused);
            announce(userPaused ? "Auto-refresh resumed." : "Auto-refresh paused.");
          }}
        >
          {userPaused ? "Resume" : "Pause"}
        </button>
      </div>
    </>
  );

  const chips: Array<{ key: string; label: string; value: string; className?: string; remove: () => void }> = [];
  if (filters.token) chips.push({ key: "token", label: "Token", value: filters.token, remove: () => applyFilters({ ...filters, token: "" }, "Token filter removed.") });
  if (filters.minimumAmount) chips.push({ key: "min", label: "Min", value: groupInteger(filters.minimumAmount.split(".")[0]) + (filters.minimumAmount.includes(".") ? `.${filters.minimumAmount.split(".")[1]}` : ""), className: "num", remove: () => { setDrafts((d) => ({ ...d, minimumAmount: "" })); applyFilters({ ...filters, minimumAmount: "" }, "Minimum amount filter removed."); } });
  if (filters.address) chips.push({ key: "address", label: "Address", value: shorten(filters.address), className: "mono", remove: () => { setDrafts((d) => ({ ...d, address: "" })); applyFilters({ ...filters, address: "" }, "Address filter removed."); } });
  const activeCount = chips.length;

  const pageStart = pageIndex * COVERAGE.pageSize + 1;
  const showing = data && data.items.length
    ? `Showing ${groupInteger(String(pageStart))} to ${groupInteger(String(pageStart + data.items.length - 1))} of ${groupInteger(String(data.total))} matching transfers`
    : data ? "No matching transfers" : "Loading transfers…";
  const caption = `Qualifying USDC and USDT transfers, newest first. ${showing}. Select a row for details.`;
  const sameTransaction = selection.transfer
    ? items.filter((item) => item.transactionHash === selection.transfer?.transactionHash).length
    : 0;

  const sheetRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div className="monitor-shell">
        <main id="content" className="monitor-main">
          <div className="row spread gap-16 monitor-title" style={{ flexWrap: "wrap" }}>
            <h1 className="h2">Transfer monitor</h1>
            <CoveragePills threshold={threshold} />
          </div>

          <SignalStrip api={apiSignal} index={indexSignal} chain={chainSignal} controls={refreshControls} />

          <div className="mobile-bar">
            <button className="btn btn-secondary" type="button" style={{ minHeight: 44 }} onClick={() => sheetRef.current?.showModal()}>
              <Icon name="filters" />
              Filters{activeCount ? ` · ${activeCount}` : ""}
            </button>
            <span className="row small subtle gap-6" style={{ marginLeft: "auto" }}>
              {autoActive && !failure ? <><span className="ping-dot" aria-hidden="true" /><span className="num">Auto 30 s</span></> : <span>Auto off</span>}
            </span>
            <button className="btn-icon lg" type="button" aria-label="Refresh now" onClick={() => void runFeed("refresh", true)} disabled={loading || rateLimited || urlInvalid}>
              <Icon name="refresh" />
            </button>
          </div>

          <div className="filters desktop-only">
            <form
              className="filters"
              aria-label="Filters"
              onSubmit={(event) => {
                event.preventDefault();
                submitFilters(filters.token, drafts, "f");
              }}
            >
              <TokenSegment idPrefix="f" value={filters.token} onChange={setToken} />
              <AmountField
                id="f-min"
                className="filter-min"
                value={drafts.minimumAmount}
                error={fieldErrors.minimumAmount}
                onChange={(value) => {
                  setDrafts((d) => ({ ...d, minimumAmount: value }));
                  setFieldErrors((e) => ({ ...e, minimumAmount: undefined }));
                }}
              />
              <AddressField
                id="f-addr"
                className="filter-addr"
                value={drafts.address}
                error={fieldErrors.address}
                onChange={(value) => {
                  setDrafts((d) => ({ ...d, address: value }));
                  setFieldErrors((e) => ({ ...e, address: undefined }));
                }}
              />
              <div className="field">
                <span className="label apply-spacer" aria-hidden="true">Apply</span>
                <button className="btn btn-primary" type="submit">Apply filters</button>
              </div>
            </form>
            <div className="vsep" aria-hidden="true" />
            <LookupField id="f-tx" className="filter-tx" error={lookupError} onSubmit={(value) => submitLookup(value, "f")} />
          </div>

          {activeCount || fieldErrors.token ? (
            <div className="wrap-row gap-8 chips-row" aria-label="Active filters" role="group">
              <span className="small subtle desktop-only">Active filters</span>
              {chips.map((chip) => (
                <span className="chip" key={chip.key}>
                  <span className="k">{chip.label}</span>
                  <span className={chip.className}>{chip.value}</span>
                  <button type="button" aria-label={`Remove ${chip.label.toLowerCase()} filter`} onClick={chip.remove}>
                    <Icon name="close" size={14} />
                  </button>
                </span>
              ))}
              {fieldErrors.token ? <span className="err-text">{fieldErrors.token}</span> : null}
              <button className="btn btn-ghost btn-sm" type="button" onClick={resetAll}>Reset all</button>
            </div>
          ) : null}

          <div className="stack gap-12 m-pad" style={{ gap: 12 }}>
            {urlInvalid ? (
              <Callout tone="err" role="alert">
                <span>This link has a filter value that is not valid. Fix or remove the highlighted filter to load transfers.</span>
                <div className="actions"><button className="btn btn-secondary btn-sm" type="button" onClick={resetAll}>Reset filters</button></div>
              </Callout>
            ) : null}
            <ServiceNotice
              failure={failure}
              nextAt={nextAt}
              lastSuccessAt={lastSuccessAt}
              healthBody={healthBody}
              indexSeconds={indexSeconds}
              checkpointSeconds={checkpointSeconds}
              onRetry={() => void runFeed("refresh", true)}
            />
            {notice?.kind === "expired" ? (
              <Callout tone="warn">
                <span>
                  <strong>That page is no longer available.</strong> It started from a transfer that is now older than{" "}
                  {COVERAGE.retentionDays} days and has been removed. Your filters are kept and you are back at the
                  newest transfers.
                </span>
                <div className="actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => setNotice(null)}>Dismiss</button></div>
              </Callout>
            ) : null}
            {notice?.kind === "recovered" ? (
              <Callout tone="ok" role="status">
                <span>
                  Connection restored at {formatUtcShortTime(new Date(notice.at).toISOString())} UTC. The feed is
                  current again, including transfers indexed while it was unavailable.
                </span>
                <div className="actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => setNotice(null)}>Dismiss</button></div>
              </Callout>
            ) : null}
            {pageIndex === 0 ? <HistoryNotice /> : null}
          </div>

          {!urlInvalid ? (
            <div className="row spread gap-16 m-pad" style={{ flexWrap: "wrap" }}>
              <div className="wrap-row gap-16" style={{ rowGap: 4 }}>
                <span className="small num strong">{showing}</span>
                {data ? (
                  <span className="row small subtle num gap-10">
                    <span className="row gap-4"><TokenGlyph token="USDC" />USDC {groupInteger(String(data.counts.USDC))}</span>
                    <span className="row gap-4"><TokenGlyph token="USDT" />USDT {groupInteger(String(data.counts.USDT))}</span>
                  </span>
                ) : null}
                <span className="row small subtle gap-6 desktop-only">
                  <Icon name="info" size={14} />
                  Counts cover matching transfers retained in the last {COVERAGE.retentionDays} days
                </span>
              </div>
              {pending ? (
                <button className="btn btn-secondary btn-sm btn-accent-border" type="button" onClick={showPending}>
                  <Icon name="down" size={14} />
                  {plural(pending.keys.size, "new transfer")} · Show
                </button>
              ) : null}
            </div>
          ) : null}

          {pageIndex > 0 ? (
            <div className="m-pad">
              <Callout tone="info" icon="pause">
                <span>
                  Auto-refresh is off on older pages so the list stays put.{" "}
                  <button className="btn btn-link btn-sm" type="button" onClick={() => void runFeed("newest")} disabled={loading}>Go to newest</button>
                </span>
              </Callout>
            </div>
          ) : null}

          {!urlInvalid && !data && loading ? (
            <>
              <SkeletonRows />
              <p className="small subtle m-pad mobile-only-block">Loading transfers…</p>
            </>
          ) : null}

          {data && data.items.length === 0 ? (
            <div className="card empty m-pad">
              {hasFilters(filters) ? (
                <>
                  <h2 className="h3">No transfers match these filters</h2>
                  <p className="muted" style={{ maxWidth: 640 }}>
                    Nothing in the last {COVERAGE.retentionDays} days of qualifying transfers matches. Remove a filter
                    or try a lower minimum. Transfers under {threshold} tokens are never indexed.
                  </p>
                  <button className="btn btn-secondary" type="button" onClick={resetAll}>Reset filters</button>
                </>
              ) : (
                <>
                  <h2 className="h3">No qualifying transfers in the last {COVERAGE.retentionDays} days</h2>
                  <p className="muted" style={{ maxWidth: 640 }}>
                    The index holds no USDC or USDT transfers of {threshold} tokens or more from the retention window.
                    If you expected some, the indexer may be behind.
                  </p>
                  <Link className="btn btn-secondary" href="/status/">Check service status</Link>
                </>
              )}
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <div className={failure ? "dimmed" : undefined}>
              {failure && lastSuccessAt ? (
                <p className="small subtle m-pad" style={{ marginBottom: 8 }}>
                  {plural(data.items.length, "transfer")} from {formatUtcShortTime(new Date(lastSuccessAt).toISOString())} UTC, shown dimmed and still selectable.
                </p>
              ) : null}
              <TransferTable items={data.items} now={now} selectedKey={selectedKey} newKeys={newKeys} onOpen={openTransfer} caption={caption} />
              <TransferCards items={data.items} now={now} selectedKey={selectedKey} newKeys={newKeys} onOpen={openTransfer} caption={caption} />
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <nav aria-label="Pagination" className="row spread gap-16 pager" style={{ flexWrap: "wrap" }}>
              <span className="small muted num desktop-only">{showing}</span>
              <div className="row gap-8 grow" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" type="button" disabled={pageIndex === 0 || loading} onClick={() => void runFeed("newer")}>
                  <Icon name="left" size={14} />
                  Newer
                </button>
                <button className="btn btn-secondary btn-sm" type="button" disabled={!data.nextCursor || loading} onClick={() => void runFeed("older")}>
                  Older
                  <Icon name="right" size={14} />
                </button>
              </div>
            </nav>
          ) : null}
        </main>

        {selection.state !== "closed" ? (
          <DetailPanel
            transfer={selection.transfer}
            state={selection.state}
            now={now}
            sameTransactionCount={sameTransaction}
            activeAddress={filters.address}
            onClose={closeTransfer}
            onFilterAddress={filterByAddress}
          />
        ) : null}
      </div>

      <FilterSheet
        ref={sheetRef}
        filters={filters}
        drafts={drafts}
        errors={fieldErrors}
        lookupError={lookupError}
        onDraftsChange={(next) => {
          setDrafts(next);
          setFieldErrors({});
        }}
        onApply={(token, next) => submitFilters(token, next, "m")}
        onLookup={(value) => submitLookup(value, "m")}
        onReset={resetAll}
      />
    </>
  );
}

function latest(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function retryText(failure: Failure, nextAt: number) {
  if (failure.kind === "rate-limited") return <>Paused by the rate limit for <Countdown to={nextAt} /> s</>;
  return <>Retrying in <Countdown to={nextAt} /> s</>;
}

function ServiceNotice({
  failure,
  nextAt,
  lastSuccessAt,
  healthBody,
  indexSeconds,
  checkpointSeconds,
  onRetry,
}: {
  failure: Failure | null;
  nextAt: number;
  lastSuccessAt: number | null;
  healthBody: HealthResponse | null;
  indexSeconds: number | null;
  checkpointSeconds: number | null;
  onRetry: () => void;
}) {
  const asOf = lastSuccessAt ? formatUtcShortTime(new Date(lastSuccessAt).toISOString()) : null;

  if (failure?.kind === "rate-limited") {
    return (
      <Callout tone="warn" role="alert">
        <span>
          Too many requests from your network. The API allows {COVERAGE.rateLimitRequests} requests per minute from
          each IP address and blocks further requests for {COVERAGE.rateLimitWindowSeconds} seconds.
          {asOf ? ` Results below are from ${asOf} UTC.` : ""} Auto-refresh resumes in <Countdown to={nextAt} /> s.
          Shared networks can hit this limit together.
        </span>
      </Callout>
    );
  }
  if (failure?.kind === "unreachable") {
    return (
      <Callout tone="err" role="alert">
        <span>
          The monitor could not reach the API.
          {asOf ? ` Showing transfers last loaded at ${asOf} UTC. They are not updating.` : " No transfers could be loaded."}
        </span>
        <div className="actions"><button className="btn btn-secondary btn-sm" type="button" onClick={onRetry}>Try again</button></div>
      </Callout>
    );
  }
  if (failure?.kind === "index-unavailable") {
    return (
      <Callout tone="err" role="alert">
        <span>
          Transfer data is unavailable. The API is running, but its index has not refreshed for more than{" "}
          {COVERAGE.maxStaleMinutes} minutes, so it is not serving results rather than serving old ones.
        </span>
        <div className="actions"><Link className="btn btn-secondary btn-sm" href="/status/">Service status</Link></div>
      </Callout>
    );
  }
  if (failure?.kind === "bad-request") {
    return (
      <Callout tone="err" role="alert">
        <span>The API rejected the request: {failure.message}</span>
      </Callout>
    );
  }
  if (!healthBody) return null;

  if (checkpointSeconds !== null && checkpointSeconds >= STALE_SECONDS) {
    return (
      <Callout tone="stale">
        <span>
          Recent transfers may be missing. The indexer last recorded block{" "}
          {healthBody.lastProcessedBlock !== null ? groupInteger(String(healthBody.lastProcessedBlock)) : "unknown"}
          {healthBody.checkpointUpdatedAt ? ` at ${formatUtcShortTime(healthBody.checkpointUpdatedAt)} UTC` : ""}. The
          API is answering, but nothing newer has been indexed since.
        </span>
      </Callout>
    );
  }
  if (indexSeconds !== null && indexSeconds >= STALE_SECONDS) {
    return (
      <Callout tone="stale">
        <span>Recent transfers may be missing. The API has not reloaded its index for {formatDuration(indexSeconds)}.</span>
      </Callout>
    );
  }
  if (healthBody.status === "degraded") {
    return (
      <Callout tone="warn" icon="warning">
        <span>
          The API is responding, but its last {healthBody.checkpointError ? "checkpoint read" : "refresh"} failed.
          {healthBody.indexRefreshedAt
            ? ` Results are correct as of ${formatUtcShortTime(healthBody.indexRefreshedAt)} UTC and may be missing transfers from the last ${formatDuration(indexSeconds ?? 0)}.`
            : ""}
        </span>
      </Callout>
    );
  }
  if ((checkpointSeconds !== null && checkpointLevel(checkpointSeconds) === "warn") || (indexSeconds !== null && indexLevel(indexSeconds) === "warn")) {
    return (
      <Callout tone="warn">
        <span>Indexing is running behind. The list is correct, but new transfers may take a few extra minutes to appear.</span>
      </Callout>
    );
  }
  return null;
}

function CoveragePills({ threshold }: { threshold: string }) {
  return (
    <div className="wrap-row gap-8 desktop-only" aria-label="Coverage">
      <span className="pill"><Icon name="chain" size={14} />Ethereum mainnet · chain {COVERAGE.chainId}</span>
      <span className="pill"><TokenGlyph token="USDC" />USDC<TokenGlyph token="USDT" />USDT</span>
      <Link className="pill" href="/docs/guide/#qualifies">
        <span className="num">Qualifies at {threshold} tokens or more</span>
        <Icon name="info" size={14} />
      </Link>
    </div>
  );
}
