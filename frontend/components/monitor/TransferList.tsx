"use client";

import { transferKey, type Transfer } from "../../lib/api";
import { etherscan, formatAgo, formatUtcTime, formatAmount, shorten, ZERO_ADDRESS } from "../../lib/format";
import { CopyButton } from "../CopyButton";
import { Icon } from "../Icon";
import { Amount, TokenBadge, TypeBadge } from "../ui";

type Props = {
  items: Transfer[];
  now: number;
  selectedKey: string | null;
  newKeys: Set<string>;
  onOpen: (transfer: Transfer) => void;
  caption: string;
};

function AddressCell({ value, role }: { value: string; role: "sender" | "receiver" }) {
  if (value === ZERO_ADDRESS) {
    return <span className="addr zero" title="Zero address">{shorten(value)}</span>;
  }
  return (
    <span className="addr" title={value}>
      {shorten(value)}
      <CopyButton value={value} label={`Copy ${role} address`} />
    </span>
  );
}

function amountLabel(transfer: Transfer) {
  const type = transfer.transferType === "normal" ? "" : ` ${transfer.transferType}`;
  return `Details for ${formatAmount(transfer.amount)} ${transfer.token}${type}`;
}

export function TransferTable({ items, now, selectedKey, newKeys, onOpen, caption }: Props) {
  return (
    <div className="card scroll-x feed-table">
      <table className="tbl clickable">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Token</th>
            <th scope="col" className="r">Amount</th>
            <th scope="col">Type</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {items.map((transfer) => {
            const key = transferKey(transfer);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                data-row-key={key}
                className={`${selected ? "sel" : ""} ${newKeys.has(key) ? "is-new" : ""}`}
                aria-selected={selected}
                onClick={() => onOpen(transfer)}
              >
                <td>
                  <div className="stack">
                    <span className="small num">
                      <span className="new-label">New · </span>
                      {formatAgo(transfer.blockTimestamp, now)}
                    </span>
                    <span className="small subtle num">{formatUtcTime(transfer.blockTimestamp)}</span>
                  </div>
                </td>
                <td><TokenBadge token={transfer.token} /></td>
                <td className="r">
                  <button
                    className="rowbtn"
                    type="button"
                    data-open-key={key}
                    aria-label={amountLabel(transfer)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(transfer);
                    }}
                  >
                    <Amount value={transfer.amount} />
                  </button>
                </td>
                <td><TypeBadge type={transfer.transferType} /></td>
                <td><AddressCell value={transfer.from} role="sender" /></td>
                <td><AddressCell value={transfer.to} role="receiver" /></td>
                <td>
                  <a
                    className="addr"
                    href={etherscan("tx", transfer.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={transfer.transactionHash}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {shorten(transfer.transactionHash)}
                    <Icon name="external" size={14} />
                    <span className="sr-only"> on Etherscan (opens in a new tab)</span>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TransferCards({ items, now, selectedKey, newKeys, onOpen, caption }: Props) {
  return (
    <ul className="plain-list feed-cards" aria-label={caption}>
      {items.map((transfer) => {
        const key = transferKey(transfer);
        return (
          <li key={key}>
            <button
              type="button"
              className={`mcard ${newKeys.has(key) ? "is-new" : ""}`}
              data-open-key={key}
              aria-current={key === selectedKey ? "true" : undefined}
              aria-label={amountLabel(transfer)}
              onClick={() => onOpen(transfer)}
            >
              <span className="row spread gap-8">
                <span className="row gap-6">
                  <TokenBadge token={transfer.token} />
                  <TypeBadge type={transfer.transferType} />
                </span>
                <span className="caption subtle num">
                  <span className="new-label">New · </span>
                  {formatAgo(transfer.blockTimestamp, now)} · {formatUtcTime(transfer.blockTimestamp).slice(0, 5)} UTC
                </span>
              </span>
              <Amount value={transfer.amount} />
              <span className="row gap-6">
                <span className={`addr ${transfer.from === ZERO_ADDRESS ? "zero" : ""}`}>{shorten(transfer.from)}</span>
                <Icon name="arrow" size={14} className="subtle" />
                <span className={`addr ${transfer.to === ZERO_ADDRESS ? "zero" : ""}`}>{shorten(transfer.to)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SkeletonRows() {
  return (
    <div className="card feed-table" aria-hidden="true">
      <table className="tbl">
        <thead>
          <tr>
            <th>Time (UTC)</th><th>Token</th><th className="r">Amount</th><th>Type</th><th>From</th><th>To</th><th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }, (_, index) => (
            <tr key={index}>
              <td><span className="sk" style={{ width: 70 }} /></td>
              <td><span className="sk" style={{ width: 54 }} /></td>
              <td className="r"><span className="sk" style={{ width: 96 }} /></td>
              <td />
              <td><span className="sk" style={{ width: 100 }} /></td>
              <td><span className="sk" style={{ width: 100 }} /></td>
              <td><span className="sk" style={{ width: 100 }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
