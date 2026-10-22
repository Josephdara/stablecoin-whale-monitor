"use client";

import { useEffect, useState } from "react";
import { fetchTransaction, type Transfer } from "../../lib/api";

export type SelectionState = "closed" | "ready" | "loading" | "missing" | "error";

type Fetched = { key: string; transfer: Transfer | null; state: SelectionState };

// Details come from the loaded page. Only a selection from a shared link that
// is not on the page is fetched, through the lookup endpoint.
export function useSelectedTransfer(selected: { hash: string; logIndex: number } | null, items: Transfer[]) {
  const key = selected ? `${selected.hash}:${selected.logIndex}` : null;
  const fromPage = selected
    ? items.find((item) => item.transactionHash === selected.hash && item.logIndex === selected.logIndex) ?? null
    : null;
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!selected || !key || fromPage) return;
    if (fetched?.key === key && fetched.state !== "loading") return;
    const controller = new AbortController();
    setFetched({ key, transfer: null, state: "loading" });
    fetchTransaction(selected.hash, controller.signal)
      .then((response) => {
        const transfer = response?.items.find((item) => item.logIndex === selected.logIndex) ?? null;
        setFetched({ key, transfer, state: transfer ? "ready" : "missing" });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setFetched({ key, transfer: null, state: "error" });
      });
    return () => controller.abort();
    // Refetch only when the selection itself changes or leaves the page.
  }, [key, Boolean(fromPage)]);

  if (!selected) return { transfer: null, state: "closed" as SelectionState };
  if (fromPage) return { transfer: fromPage, state: "ready" as SelectionState };
  if (fetched?.key === key) return { transfer: fetched.transfer, state: fetched.state };
  return { transfer: null, state: "loading" as SelectionState };
}
