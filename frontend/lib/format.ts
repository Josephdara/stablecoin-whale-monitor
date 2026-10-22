export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function shorten(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function groupInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Splits an exact decimal string for display. Never parses to a float.
export function splitAmount(value: string) {
  const [whole, fraction] = value.split(".");
  return { whole: groupInteger(whole), fraction: fraction ? `.${fraction}` : "" };
}

export function formatAmount(value: string) {
  const { whole, fraction } = splitAmount(value);
  return whole + fraction;
}

// Secondary display only, always beside the exact amount.
export function compactAmount(value: string) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function toBaseUnits(value: string, decimals = 6) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0").slice(0, decimals) || "0");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatUtcTime(iso: string) {
  const date = new Date(iso);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatUtcShortTime(iso: string) {
  const date = new Date(iso);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatUtc(iso: string) {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${formatUtcTime(iso)} UTC`;
}

// "2026-10-25" -> "25 October 2026"
export function formatLongDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function secondsSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
}

export function formatAgo(iso: string, now: number) {
  const seconds = secondsSince(iso, now);
  if (seconds < 10) return "Just now";
  return `${formatDuration(seconds)} ago`;
}

export function etherscan(kind: "tx" | "address" | "block" | "token", value: string | number) {
  return `https://etherscan.io/${kind}/${value}`;
}
