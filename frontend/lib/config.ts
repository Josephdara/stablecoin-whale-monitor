// Values shown in copy and used by the monitor. They mirror the deployment
// defaults so the docs and the interface never disagree. Live screens prefer
// what the API reports when it reports it.

const SERVICES_PAUSED_DEFAULT = false;
const EXPECTED_RETURN_DEFAULT = "2026-10-25";

export const SITE = {
  name: "Stablecoin Whale Monitor",
  origin: "https://swm.josephdara.com",
  repository: "https://github.com/Josephdara/stablecoin-whale-monitor",
  runbook: "https://github.com/Josephdara/stablecoin-whale-monitor/blob/main/docs/RUNBOOK.md",
  issues: "https://github.com/Josephdara/stablecoin-whale-monitor/issues",
} as const;

export const TOKENS = {
  USDC: { symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
  USDT: { symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
} as const;

export const COVERAGE = {
  network: "Ethereum mainnet",
  chainId: 1,
  indexThreshold: "100000",
  alertThreshold: "1000000",
  confirmationBlocks: 6,
  blockTimeSeconds: 12,
  pollIntervalSeconds: 30,
  apiRefreshSeconds: 30,
  monitorRefreshSeconds: 30,
  retentionDays: 7,
  maxStaleMinutes: 10,
  pageSize: 50,
  rateLimitRequests: 60,
  rateLimitWindowSeconds: 60,
} as const;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export const MAINTENANCE = {
  paused: parseFlag(process.env.NEXT_PUBLIC_SERVICES_PAUSED, SERVICES_PAUSED_DEFAULT),
  expectedReturn: process.env.NEXT_PUBLIC_EXPECTED_RETURN?.trim() || EXPECTED_RETURN_DEFAULT,
};

// Set when the checkpoint is moved forward after a pause, as YYYY-MM-DD.
export const HISTORY_STARTS = process.env.NEXT_PUBLIC_HISTORY_STARTS?.trim() || null;

export const CONFIRMATION_SECONDS = COVERAGE.confirmationBlocks * COVERAGE.blockTimeSeconds;

function parseFlag(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}
