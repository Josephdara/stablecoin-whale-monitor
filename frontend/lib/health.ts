import type { HealthResponse, HealthResult } from "./api";
import { COVERAGE } from "./config";

export type Level = "ok" | "warn" | "stale" | "err" | "paused" | "unknown";

export type OverallState = "healthy" | "delayed" | "degraded" | "stale" | "unavailable";

// Both the indexer and the API run every 30 seconds, so thresholds are
// counted in missed cycles.
export const INDEX_DELAYED_SECONDS = 90;
export const CHECKPOINT_DELAYED_SECONDS = 120;
export const STALE_SECONDS = 300;

export function indexLevel(ageSeconds: number): Level {
  if (ageSeconds < INDEX_DELAYED_SECONDS) return "ok";
  if (ageSeconds < STALE_SECONDS) return "warn";
  return "stale";
}

export function checkpointLevel(ageSeconds: number): Level {
  if (ageSeconds < CHECKPOINT_DELAYED_SECONDS) return "ok";
  if (ageSeconds < STALE_SECONDS) return "warn";
  return "stale";
}

// The API reports the checkpoint age when it answered; keep counting from there.
export function checkpointAge(body: HealthResponse, fetchedAt: number, now: number) {
  if (body.checkpointAgeSeconds === null) return null;
  return body.checkpointAgeSeconds + Math.max(0, Math.floor((now - fetchedAt) / 1000));
}

// Indexer settings as the API reports them, or the build defaults when it does not.
export function reportedCoverage(body: HealthResponse | null) {
  return {
    indexThreshold: body?.indexThreshold ?? COVERAGE.indexThreshold,
    confirmationBlocks: body?.confirmationBuffer ?? COVERAGE.confirmationBlocks,
    pollIntervalSeconds: body?.pollIntervalSeconds ?? COVERAGE.pollIntervalSeconds,
  };
}

// Measured when the checkpoint was saved, so it normally equals the confirmation buffer.
export function blocksBehindHead(body: HealthResponse) {
  if (body.chainHeadBlock == null || body.lastProcessedBlock === null) return null;
  return Math.max(0, body.chainHeadBlock - body.lastProcessedBlock);
}

export function indexAge(refreshedAt: string | null, now: number) {
  if (!refreshedAt) return null;
  return Math.max(0, Math.floor((now - Date.parse(refreshedAt)) / 1000));
}

export function classifyHealth(result: HealthResult | null, now: number): OverallState | null {
  if (!result) return null;
  if (result.kind === "unreachable" || result.httpStatus !== 200 || !result.body) return "unavailable";
  const body = result.body;
  const indexSeconds = indexAge(body.indexRefreshedAt, now);
  const checkpointSeconds = checkpointAge(body, result.at, now);
  if ((indexSeconds ?? 0) >= STALE_SECONDS || (checkpointSeconds ?? 0) >= STALE_SECONDS) return "stale";
  if (body.status === "degraded") return "degraded";
  if (checkpointSeconds === null) return "delayed";
  if ((indexSeconds ?? 0) >= INDEX_DELAYED_SECONDS || checkpointSeconds >= CHECKPOINT_DELAYED_SECONDS) {
    return "delayed";
  }
  return "healthy";
}

export const OVERALL_LEVEL: Record<OverallState, Level> = {
  healthy: "ok",
  delayed: "warn",
  degraded: "warn",
  stale: "stale",
  unavailable: "err",
};

export const OVERALL_LABEL: Record<OverallState, string> = {
  healthy: "Healthy",
  delayed: "Delayed",
  degraded: "Degraded",
  stale: "Stale",
  unavailable: "Unavailable",
};
