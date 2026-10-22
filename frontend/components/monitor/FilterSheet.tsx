"use client";

import { useState, type Ref, type RefObject } from "react";
import type { Filters } from "../../lib/api";
import { Icon } from "../Icon";
import { AddressField, AmountField, LookupField, TokenSegment, type Drafts } from "./FilterFields";
import type { FieldErrors } from "./url";

type Props = {
  ref: Ref<HTMLDialogElement>;
  filters: Filters;
  drafts: Drafts;
  errors: FieldErrors;
  lookupError?: string;
  onDraftsChange: (drafts: Drafts) => void;
  onApply: (token: Filters["token"], drafts: Drafts) => boolean;
  onLookup: (value: string) => boolean;
  onReset: () => void;
};

// Native modal dialog: focus is trapped, Escape closes and focus returns to the opener.
export function FilterSheet({ ref, filters, drafts, errors, lookupError, onDraftsChange, onApply, onLookup, onReset }: Props) {
  const [token, setToken] = useState<Filters["token"]>(filters.token);
  const dialog = ref as RefObject<HTMLDialogElement | null>;
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDialogElement).open) setToken(filters.token);
      }}
    >
      <div className="sheet-grip" aria-hidden="true"><span /></div>
      <div className="sheet-head">
        <h2 className="h3" id="sheet-title">Filters</h2>
        <button className="btn-icon lg" type="button" aria-label="Close filters" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">
        <form
          className="stack"
          style={{ gap: 18 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (onApply(token, drafts)) close();
          }}
        >
          <TokenSegment idPrefix="m" value={token} onChange={setToken} />
          <AmountField
            id="m-min"
            value={drafts.minimumAmount}
            error={errors.minimumAmount}
            onChange={(value) => onDraftsChange({ ...drafts, minimumAmount: value })}
          />
          <AddressField
            id="m-addr"
            value={drafts.address}
            error={errors.address}
            onChange={(value) => onDraftsChange({ ...drafts, address: value })}
          />
          <div className="row gap-10">
            <button
              className="btn btn-ghost btn-lg"
              type="button"
              style={{ flex: 1 }}
              onClick={() => {
                setToken("");
                onReset();
                close();
              }}
            >
              Reset all
            </button>
            <button className="btn btn-primary btn-lg" type="submit" style={{ flex: 2 }}>Apply filters</button>
          </div>
        </form>
        <hr className="divider" />
        <LookupField
          id="m-tx"
          inline={false}
          error={lookupError}
          onSubmit={(value) => {
            if (onLookup(value)) close();
          }}
        />
      </div>
    </dialog>
  );
}
