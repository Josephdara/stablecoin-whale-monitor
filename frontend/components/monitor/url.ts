import {
  ADDRESS_PATTERN,
  AMOUNT_PATTERN,
  EMPTY_FILTERS,
  HASH_PATTERN,
  normalizeAmount,
  type Filters,
  type Token,
} from "../../lib/api";

export const MONITOR_PATH = "/monitor/";

export type FieldErrors = { token?: string; minimumAmount?: string; address?: string };

export type MonitorUrl = {
  filters: Filters;
  errors: FieldErrors;
  raw: { token: string; minimumAmount: string; address: string };
  tx: string | null;
  selected: { hash: string; logIndex: number } | null;
};

export const AMOUNT_ERROR = "Enter a number with up to 6 decimal places, for example 250000 or 250000.5.";
export const ADDRESS_ERROR = "Enter a full address: 0x followed by 40 hexadecimal characters.";
export const HASH_ERROR = "Enter a transaction hash: 0x followed by 64 hexadecimal characters.";
export const HASH_LOOKS_LIKE_ADDRESS = "That looks like an address. Use the address filter instead.";

export type Checked = { ok: true; value: string } | { ok: false; error: string };

export function validateAmount(value: string): Checked {
  const amount = normalizeAmount(value);
  return amount === "" || AMOUNT_PATTERN.test(amount) ? { ok: true, value: amount } : { ok: false, error: AMOUNT_ERROR };
}

export function validateAddress(value: string): Checked {
  const address = value.trim();
  return address === "" || ADDRESS_PATTERN.test(address)
    ? { ok: true, value: address.toLowerCase() }
    : { ok: false, error: ADDRESS_ERROR };
}

export function validateHash(value: string): Checked {
  const hash = value.trim();
  if (HASH_PATTERN.test(hash)) return { ok: true, value: hash.toLowerCase() };
  return { ok: false, error: ADDRESS_PATTERN.test(hash) ? HASH_LOOKS_LIKE_ADDRESS : HASH_ERROR };
}

// Invalid values from a shared link stay visible with their message instead of being dropped.
export function parseMonitorUrl(params: URLSearchParams): MonitorUrl {
  const raw = {
    token: params.get("token") ?? "",
    minimumAmount: params.get("min") ?? "",
    address: params.get("address") ?? "",
  };
  const filters: Filters = { ...EMPTY_FILTERS };
  const errors: FieldErrors = {};

  const token = raw.token.trim().toUpperCase();
  if (token === "USDC" || token === "USDT") filters.token = token as Token;
  else if (token) errors.token = "Token must be USDC or USDT.";

  const amount = validateAmount(raw.minimumAmount);
  if (amount.ok) filters.minimumAmount = amount.value;
  else errors.minimumAmount = amount.error;

  const address = validateAddress(raw.address);
  if (address.ok) filters.address = address.value;
  else errors.address = address.error;

  const tx = params.has("tx") ? (params.get("tx") ?? "").trim() : null;

  let selected: MonitorUrl["selected"] = null;
  const selectedMatch = /^(0x[0-9a-fA-F]{64}):(\d{1,9})$/.exec(params.get("selected") ?? "");
  if (selectedMatch) selected = { hash: selectedMatch[1].toLowerCase(), logIndex: Number(selectedMatch[2]) };

  return { filters, errors, raw, tx, selected };
}

export function buildMonitorHref({
  filters = EMPTY_FILTERS,
  tx = null,
  selected = null,
}: {
  filters?: Filters;
  tx?: string | null;
  selected?: { hash: string; logIndex: number } | null;
}) {
  const params = new URLSearchParams();
  if (tx !== null) {
    params.set("tx", tx);
  } else {
    if (filters.token) params.set("token", filters.token);
    if (filters.minimumAmount) params.set("min", filters.minimumAmount);
    if (filters.address) params.set("address", filters.address);
  }
  if (selected) params.set("selected", `${selected.hash}:${selected.logIndex}`);
  const query = params.toString();
  return query ? `${MONITOR_PATH}?${query}` : MONITOR_PATH;
}

// Native history calls stay in sync with useSearchParams in the App Router.
export function navigateMonitor(href: string, mode: "push" | "replace") {
  if (mode === "push") window.history.pushState(null, "", href);
  else window.history.replaceState(null, "", href);
}
