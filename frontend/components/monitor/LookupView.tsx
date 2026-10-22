"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchTransaction, transferKey, type Transfer, type TransactionResponse } from "../../lib/api";
import { COVERAGE } from "../../lib/config";
import { etherscan, formatAgo, formatUtc, groupInteger, shorten, ZERO_ADDRESS } from "../../lib/format";
import { useAnnounce } from "../Announcer";
import { CopyButton } from "../CopyButton";
import { Icon } from "../Icon";
import { Amount, Callout, ExternalLink, TokenBadge, TypeBadge } from "../ui";
import { DetailPanel } from "./DetailPanel";
import { LookupField } from "./FilterFields";
import { buildMonitorHref, navigateMonitor, validateHash, type MonitorUrl } from "./url";
import { useSelectedTransfer } from "./useSelectedTransfer";

const THRESHOLD = groupInteger(COVERAGE.indexThreshold);

type Result =
  | { status: "loading" }
  | { status: "found"; data: TransactionResponse }
  | { status: "missing" }
  | { status: "error"; message: string };

export function LookupView({ url, now }: { url: MonitorUrl; now: number }) {
  const announce = useAnnounce();
  const check = validateHash(url.tx ?? "");
  const hash = check.ok ? check.value : null;
  const [result, setResult] = useState<Result>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [fieldError, setFieldError] = useState<string | undefined>(check.ok ? undefined : check.error);
  const lastOpener = useRef<string | null>(null);

  useEffect(() => {
    setFieldError(check.ok ? undefined : check.error);
    // check is derived from url.tx.
  }, [url.tx]);

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    setResult({ status: "loading" });
    fetchTransaction(hash, controller.signal)
      .then((data) => {
        if (data) {
          setResult({ status: "found", data });
          announce(`${data.total} retained qualifying ${data.total === 1 ? "transfer" : "transfers"} found.`);
        } else {
          setResult({ status: "missing" });
          announce("No retained qualifying transfers for this transaction.");
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        const status = reason instanceof ApiRequestError ? reason.status : 0;
        const message = status === 429
          ? `Too many requests from your network. Wait ${COVERAGE.rateLimitWindowSeconds} seconds and try again.`
          : status === 503
            ? "Transfer data is unavailable because the API index has not refreshed recently."
            : "The lookup could not reach the API.";
        setResult({ status: "error", message });
        announce(message);
      });
    return () => controller.abort();
  }, [hash, attempt, announce]);

  const items = result.status === "found" ? result.data.items : [];
  const selection = useSelectedTransfer(url.selected, items);

  function submit(value: string) {
    const next = validateHash(value);
    if (!next.ok) {
      setFieldError(next.error);
      document.getElementById("lk-tx")?.focus();
      announce(next.error);
      return;
    }
    navigateMonitor(buildMonitorHref({ tx: next.value }), "push");
  }

  function open(transfer: Transfer) {
    lastOpener.current = transferKey(transfer);
    navigateMonitor(buildMonitorHref({ tx: hash, selected: { hash: transfer.transactionHash, logIndex: transfer.logIndex } }), "replace");
  }

  function close() {
    navigateMonitor(buildMonitorHref({ tx: hash }), "replace");
    const key = lastOpener.current;
    window.setTimeout(() => {
      if (key) document.querySelector<HTMLElement>(`[data-open-key="${key}"]`)?.focus();
    }, 0);
  }

  const first = items[0];

  return (
    <div className="monitor-shell">
      <main id="content" className="monitor-main" style={{ maxWidth: 1280 }}>
        <nav aria-label="Breadcrumb" className="row small gap-8 m-pad">
          <Link href="/monitor/">Monitor</Link>
          <span className="subtle" aria-hidden="true">/</span>
          <span className="muted" aria-current="page">Transaction lookup</span>
        </nav>

        <div className="wrap-row gap-12 m-pad" style={{ alignItems: "flex-end" }}>
          <LookupField
            id="lk-tx"
            label="Transaction hash"
            inline={false}
            initial={url.tx ?? ""}
            error={fieldError}
            onSubmit={submit}
            className="grow"
          />
          <Link className="btn btn-ghost" href="/monitor/" style={{ marginBottom: 22 }}>
            <Icon name="left" size={14} />
            Back to feed
          </Link>
        </div>

        <div className="m-pad stack gap-16">
          {hash && result.status === "loading" ? <p className="muted" role="status">Looking up the transaction…</p> : null}

          {result.status === "error" && hash ? (
            <Callout tone="err" role="alert">
              <span>{result.message}</span>
              <div className="actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
                <ExternalLink className="btn btn-ghost btn-sm" href={etherscan("tx", hash)}>Check on Etherscan</ExternalLink>
              </div>
            </Callout>
          ) : null}

          {result.status === "found" && hash ? (
            <section className="card pad-24 stack gap-16" aria-labelledby="lk-h">
              <div className="row spread gap-16" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                <div className="stack gap-6" style={{ minWidth: 0 }}>
                  <h1 className="h3" id="lk-h">
                    {result.data.total} retained qualifying {result.data.total === 1 ? "transfer" : "transfers"} in this transaction
                  </h1>
                  <div className="wrap-row gap-6">
                    <span className="full-hex">{result.data.transactionHash}</span>
                    <CopyButton value={result.data.transactionHash} label="Copy transaction hash" />
                  </div>
                  {first ? (
                    <div className="wrap-row small muted num gap-16">
                      <span>
                        Block{" "}
                        <a className="mono" href={etherscan("block", first.blockNumber)} target="_blank" rel="noopener noreferrer">
                          {groupInteger(String(first.blockNumber))}
                        </a>
                      </span>
                      <span>{formatUtc(first.blockTimestamp)} · {formatAgo(first.blockTimestamp, now)}</span>
                      <span>Status: success</span>
                    </div>
                  ) : null}
                </div>
                <ExternalLink className="btn btn-secondary" href={etherscan("tx", result.data.transactionHash)}>
                  View full transaction on Etherscan
                </ExternalLink>
              </div>
              <Callout tone="info">
                <span>
                  These are the qualifying USDC and USDT transfers from this transaction that the monitor still
                  retains. This is not the transaction receipt. Transfers under {THRESHOLD} tokens, other tokens and
                  other events in the same transaction are not shown.
                </span>
              </Callout>
              <div className="scroll-x">
                <table className="tbl">
                  <caption className="sr-only">
                    Retained qualifying transfers in transaction {shorten(result.data.transactionHash)}, as returned by the API
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Log index</th>
                      <th scope="col">Token</th>
                      <th scope="col" className="r">Amount</th>
                      <th scope="col">Type</th>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((transfer) => {
                      const key = transferKey(transfer);
                      const selected = url.selected?.logIndex === transfer.logIndex;
                      return (
                        <tr key={key} className={selected ? "sel" : undefined}>
                          <td className="mono">{transfer.logIndex}</td>
                          <td><TokenBadge token={transfer.token} /></td>
                          <td className="r"><Amount value={transfer.amount} /></td>
                          <td><TypeBadge type={transfer.transferType} showNormal /></td>
                          <td><LookupAddress value={transfer.from} role="sender" /></td>
                          <td><LookupAddress value={transfer.to} role="receiver" /></td>
                          <td className="r">
                            <button className="btn btn-ghost btn-sm" type="button" data-open-key={key} onClick={() => open(transfer)}>
                              Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small subtle">
                Amounts are listed per transfer and are not added together. Mixed tokens in one transaction are common,
                and token units are not priced.
              </p>
            </section>
          ) : null}

          {result.status === "missing" && hash ? (
            <section className="card pad-28 row gap-20" style={{ alignItems: "flex-start" }} aria-labelledby="miss-h">
              <svg aria-hidden="true" viewBox="0 0 48 48" width="48" height="48" fill="none" style={{ flex: "none" }}>
                <circle cx="24" cy="24" r="22" stroke="var(--ring-2)" strokeWidth="1.5" />
                <circle cx="24" cy="24" r="14" stroke="var(--ring-2)" strokeWidth="1.5" />
                <circle cx="24" cy="24" r="6" stroke="var(--ring-3)" strokeWidth="1.5" />
              </svg>
              <div className="stack gap-10" style={{ maxWidth: 780 }}>
                <h1 className="h3" id="miss-h">No retained qualifying transfers for this transaction</h1>
                <p className="muted">
                  This does not mean the transaction does not exist. It may contain no USDC or USDT transfer of{" "}
                  {THRESHOLD} tokens or more, it may be older than the {COVERAGE.retentionDays}-day retention window,
                  or it may not be indexed yet if it was mined in the last few minutes.
                </p>
                <div className="wrap-row gap-10">
                  <ExternalLink className="btn btn-secondary" href={etherscan("tx", hash)}>Check on Etherscan</ExternalLink>
                  <Link className="btn btn-ghost" href="/monitor/">Back to feed</Link>
                  <Link className="btn btn-ghost" href="/docs/guide/#qualifies">What qualifies</Link>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      {selection.state !== "closed" ? (
        <DetailPanel
          transfer={selection.transfer}
          state={selection.state}
          now={now}
          sameTransactionCount={0}
          activeAddress=""
          onClose={close}
          onFilterAddress={(address) => navigateMonitor(buildMonitorHref({ filters: { token: "", minimumAmount: "", address } }), "push")}
        />
      ) : null}
    </div>
  );
}

function LookupAddress({ value, role }: { value: string; role: "sender" | "receiver" }) {
  if (value === ZERO_ADDRESS) return <span className="addr zero">{shorten(value)}</span>;
  return (
    <span className="addr" title={value}>
      {shorten(value)}
      <CopyButton value={value} label={`Copy ${role} address`} />
    </span>
  );
}
