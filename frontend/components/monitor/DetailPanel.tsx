"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Transfer } from "../../lib/api";
import { COVERAGE } from "../../lib/config";
import {
  compactAmount,
  etherscan,
  formatAgo,
  formatUtc,
  groupInteger,
  ZERO_ADDRESS,
} from "../../lib/format";
import { CopyButton } from "../CopyButton";
import { Icon } from "../Icon";
import { Amount, Callout, ExternalLink, TokenBadge, TypeBadge } from "../ui";
import { buildMonitorHref } from "./url";
import type { SelectionState } from "./useSelectedTransfer";

type Props = {
  transfer: Transfer | null;
  state: SelectionState;
  now: number;
  sameTransactionCount: number;
  activeAddress: string;
  onClose: () => void;
  onFilterAddress: (address: string) => void;
};

const TYPE_TEXT: Record<Transfer["transferType"], { label: string; text: string }> = {
  mint: {
    label: "Mint",
    text: "The sender is the zero address, so these tokens were newly created. Classification uses only the zero address.",
  },
  burn: {
    label: "Burn",
    text: "The receiver is the zero address, so these tokens were removed from supply. Classification uses only the zero address.",
  },
  normal: {
    label: "Transfer",
    text: "Neither side is the zero address, so this is a normal transfer between two addresses.",
  },
};

export function DetailPanel({ transfer, state, now, sameTransactionCount, activeAddress, onClose, onFilterAddress }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, [transfer]);

  return (
    <aside
      className="detail"
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="detail-head">
        <h2 className="h4" id="detail-title" tabIndex={-1} ref={heading}>Transfer detail</h2>
        <div className="row gap-4">
          {shareUrl && transfer ? <CopyButton value={shareUrl} label="Copy link to this transfer" /> : null}
          <button className="btn-icon lg" type="button" aria-label="Close transfer detail" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="detail-body">
        {state === "loading" ? <p className="muted">Loading this transfer…</p> : null}
        {state === "missing" ? (
          <Callout tone="warn">
            <span>
              This transfer is not in the retained data. It may be older than {COVERAGE.retentionDays} days, or the
              link may be wrong.
            </span>
          </Callout>
        ) : null}
        {state === "error" ? (
          <Callout tone="err">
            <span>The transfer could not be loaded because the API did not answer. Try again in a moment.</span>
          </Callout>
        ) : null}
        {transfer ? (
          <TransferDetail
            transfer={transfer}
            now={now}
            sameTransactionCount={sameTransactionCount}
            activeAddress={activeAddress}
            onFilterAddress={onFilterAddress}
          />
        ) : null}
      </div>
    </aside>
  );
}

function TransferDetail({
  transfer,
  now,
  sameTransactionCount,
  activeAddress,
  onFilterAddress,
}: {
  transfer: Transfer;
  now: number;
  sameTransactionCount: number;
  activeAddress: string;
  onFilterAddress: (address: string) => void;
}) {
  const type = TYPE_TEXT[transfer.transferType];
  const lookupHref = buildMonitorHref({ tx: transfer.transactionHash });

  return (
    <>
      <div className="stack gap-10">
        <div className="row gap-8">
          <TokenBadge token={transfer.token} />
          <TypeBadge type={transfer.transferType} showNormal />
        </div>
        <div className="wrap-row gap-10" style={{ alignItems: "baseline" }}>
          <Amount value={transfer.amount} className="amount-xl" />
          <span className="h4 muted">{transfer.token}</span>
        </div>
        <span className="small subtle num">
          {compactAmount(transfer.amount)} {transfer.token} · exact amount shown above
        </span>
      </div>

      {sameTransactionCount > 1 ? (
        <Callout tone="info">
          <span>
            This transaction contains at least {sameTransactionCount} qualifying transfers.{" "}
            <Link href={lookupHref}>View all</Link>
          </span>
        </Callout>
      ) : null}

      <AddressSection
        title="From"
        address={transfer.from}
        role="sender"
        filterable={transfer.from !== ZERO_ADDRESS && transfer.from !== activeAddress}
        onFilter={() => onFilterAddress(transfer.from)}
        note={transfer.from === ZERO_ADDRESS ? "Zero address. Tokens sent from it are newly created." : null}
      />
      <AddressSection
        title="To"
        address={transfer.to}
        role="receiver"
        filterable={transfer.to !== ZERO_ADDRESS && transfer.to !== activeAddress}
        onFilter={() => onFilterAddress(transfer.to)}
        note={transfer.to === ZERO_ADDRESS
          ? "Zero address. Tokens sent to it are removed from supply."
          : "An address does not identify its owner. Labels are not provided."}
      />

      <div className="dsec">
        <span className="overline">Transfer type · {type.label}</span>
        <p className="small muted">{type.text}</p>
      </div>

      <div className="dsec">
        <span className="overline">On-chain record</span>
        <dl className="dl">
          <dt>Transaction</dt>
          <dd>
            <div className="row gap-6" style={{ alignItems: "flex-start" }}>
              <span className="full-hex grow">{transfer.transactionHash}</span>
              <CopyButton value={transfer.transactionHash} label="Copy transaction hash" />
            </div>
            <ExternalLink href={etherscan("tx", transfer.transactionHash)}>View on Etherscan</ExternalLink>
          </dd>
          <dt>Block</dt>
          <dd>
            <a className="mono" href={etherscan("block", transfer.blockNumber)} target="_blank" rel="noopener noreferrer">
              {groupInteger(String(transfer.blockNumber))}
            </a>
          </dd>
          <dt>Block time</dt>
          <dd className="num">
            {formatUtc(transfer.blockTimestamp)}
            <br />
            <span className="subtle small">{formatAgo(transfer.blockTimestamp, now)}</span>
          </dd>
          <dt>Log index</dt>
          <dd className="mono">{transfer.logIndex}</dd>
          <dt>Raw amount</dt>
          <dd>
            <span className="mono" style={{ wordBreak: "break-all" }}>{transfer.rawAmount}</span>
            <br />
            <span className="subtle small">Base units. {transfer.token} uses 6 decimals.</span>
          </dd>
          <dt>Token contract</dt>
          <dd>
            <a className="full-hex" href={etherscan("token", transfer.tokenContract)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--link)" }}>
              {transfer.tokenContract}
            </a>
          </dd>
          <dt>Status</dt>
          <dd>Success</dd>
        </dl>
      </div>

      <div className="dsec">
        <span className="overline">Indexing</span>
        <dl className="dl">
          <dt>Detected at</dt>
          <dd className="num">{formatUtc(transfer.detectedAt)}</dd>
          <dt>Threshold</dt>
          <dd className="num">{groupInteger(transfer.threshold.split(".")[0])} tokens when recorded</dd>
          <dt>Network</dt>
          <dd>Ethereum mainnet · chain {transfer.chainId}</dd>
        </dl>
      </div>

      <div className="wrap-row gap-8" style={{ paddingTop: 4 }}>
        <Link className="btn btn-secondary" href={lookupHref}>View whole transaction</Link>
        <ExternalLink className="btn btn-ghost" href={etherscan("tx", transfer.transactionHash)}>Open in Etherscan</ExternalLink>
      </div>
    </>
  );
}

function AddressSection({
  title,
  address,
  role,
  filterable,
  onFilter,
  note,
}: {
  title: string;
  address: string;
  role: "sender" | "receiver";
  filterable: boolean;
  onFilter: () => void;
  note: ReactNode;
}) {
  return (
    <div className="dsec">
      <span className="overline">{title}</span>
      <div className="inset stack gap-8" style={{ padding: "10px 12px" }}>
        <span className="full-hex">{address}</span>
        <div className="wrap-row gap-12">
          <CopyButton value={address} label={`Copy ${role} address`} variant="text" />
          <ExternalLink href={etherscan("address", address)}>Etherscan</ExternalLink>
          {filterable ? (
            <button className="btn btn-ghost btn-sm btn-link" type="button" onClick={onFilter}>
              Filter by {role}
            </button>
          ) : null}
        </div>
      </div>
      {note ? <span className="small subtle">{note}</span> : null}
    </div>
  );
}
