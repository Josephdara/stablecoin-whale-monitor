"use client";

import { useEffect, useState } from "react";
import type { Filters, Token } from "../../lib/api";
import { COVERAGE } from "../../lib/config";
import { groupInteger, toBaseUnits } from "../../lib/format";
import { Icon, TokenGlyph } from "../Icon";
import type { FieldErrors } from "./url";

const THRESHOLD = groupInteger(COVERAGE.indexThreshold);

export type Drafts = { minimumAmount: string; address: string };

export function TokenSegment({
  value,
  onChange,
  idPrefix,
}: {
  value: Filters["token"];
  onChange: (token: Filters["token"]) => void;
  idPrefix: string;
}) {
  const options: Array<{ value: Filters["token"]; label: string; token?: Token }> = [
    { value: "", label: "All" },
    { value: "USDC", label: "USDC", token: "USDC" },
    { value: "USDT", label: "USDT", token: "USDT" },
  ];
  return (
    <div className="field">
      <span className="label" id={`${idPrefix}-token`}>Token</span>
      <div className="seg" role="group" aria-labelledby={`${idPrefix}-token`}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.token ? <TokenGlyph token={option.token} /> : null}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function minimumHelp(value: string) {
  const amount = value.replace(/,/g, "").trim();
  if (/^[0-9]+(?:\.[0-9]{1,6})?$/.test(amount) && toBaseUnits(amount) < toBaseUnits(COVERAGE.indexThreshold)) {
    return `Below the ${THRESHOLD} indexing threshold, so results are the same as no minimum.`;
  }
  return `Only transfers of ${THRESHOLD} or more are indexed.`;
}

export function AmountField({
  id,
  value,
  error,
  onChange,
  className,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label className="label" htmlFor={id}>Minimum amount</label>
      <div className={`input-wrap ${error ? "invalid" : ""}`}>
        <input
          id={id}
          className="num"
          inputMode="decimal"
          placeholder={THRESHOLD}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          autoComplete="off"
        />
        <span className="suffix">tokens</span>
      </div>
      <span className={error ? "err-text" : "help"} id={`${id}-help`}>{error ?? minimumHelp(value)}</span>
    </div>
  );
}

export function AddressField({
  id,
  value,
  error,
  onChange,
  className,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label className="label" htmlFor={id}>Address, sender or receiver</label>
      <div className={`input-wrap ${error ? "invalid" : ""}`}>
        <input
          id={id}
          className="mono"
          placeholder="0x followed by 40 characters"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </div>
      <span className={error ? "err-text" : "help"} id={`${id}-help`}>
        {error ?? "Matches transfers where it is the sender or the receiver."}
      </span>
    </div>
  );
}

export function LookupField({
  id,
  initial,
  error,
  onSubmit,
  className,
  inline = true,
  label,
}: {
  id: string;
  initial?: string;
  error?: string;
  onSubmit: (hash: string) => void;
  className?: string;
  inline?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  useEffect(() => setValue(initial ?? ""), [initial]);

  return (
    <form
      className={`field ${className ?? ""}`}
      aria-label="Transaction lookup"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <label className="label" htmlFor={id}>{label ?? "Look up a transaction"}</label>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div className={`input-wrap grow ${error ? "invalid" : ""}`}>
          <Icon name="search" />
          <input
            id={id}
            className="mono"
            placeholder="0x transaction hash"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
          {inline ? <button className="btn btn-ghost btn-sm" type="submit">Look up</button> : null}
        </div>
        {inline ? null : <button className="btn btn-primary" type="submit">Look up</button>}
      </div>
      <span className={error ? "err-text" : "help"} id={`${id}-help`}>
        {error ?? "Shows the qualifying transfers retained for that transaction"}
      </span>
    </form>
  );
}

export function draftsFrom(raw: { minimumAmount: string; address: string }): Drafts {
  return { minimumAmount: raw.minimumAmount, address: raw.address };
}

export function errorsWithout(errors: FieldErrors, field: keyof FieldErrors): FieldErrors {
  const next = { ...errors };
  delete next[field];
  return next;
}
