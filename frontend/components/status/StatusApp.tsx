"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth, type HealthResult } from "../../lib/api";
import { COVERAGE } from "../../lib/config";
import { etherscan, formatDuration, formatUtcTime, groupInteger } from "../../lib/format";
import {
  blocksBehindHead,
  checkpointAge,
  checkpointLevel,
  classifyHealth,
  indexAge,
  indexLevel,
  OVERALL_LABEL,
  OVERALL_LEVEL,
  reportedCoverage,
  type Level,
  type OverallState,
} from "../../lib/health";
import { useAnnounce } from "../Announcer";
import { HistoryNotice } from "../HistoryNotice";
import { Icon } from "../Icon";
import { LEVEL_ICON, StatusLabel } from "../ui";
import { SignalCard } from "./SignalCard";

const POLL_MS = COVERAGE.monitorRefreshSeconds * 1000;

export function StatusApp() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | null>(null);
  const announce = useAnnounce();

  const check = useCallback(async (manual: boolean) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setChecking(true);
    try {
      const next = await fetchHealth(current.signal);
      setResult(next);
      setNow(Date.now());
      if (manual) {
        const state = classifyHealth(next, Date.now());
        announce(`Checked. ${state ? SUMMARY_TITLE[state] : ""}`);
      }
    } catch {
      // Aborted by a newer check.
    } finally {
      if (controller.current === current) setChecking(false);
    }
  }, [announce]);

  useEffect(() => {
    void check(false);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 5000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      controller.current?.abort();
    };
  }, [check]);

  const state = classifyHealth(result, now);
  const body = result?.kind === "response" ? result.body : null;
  const indexSeconds = body ? indexAge(body.indexRefreshedAt, now) : null;
  const checkpointSeconds = body && result?.kind === "response" ? checkpointAge(body, result.at, now) : null;
  const coverage = reportedCoverage(body);
  const behindHead = body ? blocksBehindHead(body) : null;

  return (
    <main id="content" className="wrap stack" style={{ paddingTop: 40, paddingBottom: 64, gap: 28, maxWidth: 1120 }}>
      <div className="row spread gap-16" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="stack gap-6">
          <h1 className="h1">Service status</h1>
          <p className="muted">
            Current health of the indexer and API, read from <code className="ic-code">GET /api/health</code>.
          </p>
        </div>
        <div className="row gap-12">
          <span className="small subtle num">
            {result ? `Checked ${formatUtcTime(new Date(result.at).toISOString())} UTC · every ${COVERAGE.monitorRefreshSeconds} s` : "Checking…"}
          </span>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void check(true)} disabled={checking}>
            <Icon name="refresh" size={14} />
            {checking ? "Checking…" : "Check now"}
          </button>
        </div>
      </div>

      <Summary state={state} result={result} indexSeconds={indexSeconds} checkpointSeconds={checkpointSeconds} />

      <section aria-label="Signals" className="grid-auto-320" style={{ gap: 16 }}>
        <SignalCard icon="api" title="API availability" status={apiStatus(result)} rows={apiRows(result)}>
          {apiText(result)}
        </SignalCard>

        <SignalCard
          icon="index"
          title="Index refresh"
          status={indexStatus(body?.indexError ?? null, body?.lastRefreshError ?? null, indexSeconds, result)}
          rows={body ? [
            ["Refreshed", body.indexRefreshedAt && indexSeconds !== null
              ? `${formatDuration(indexSeconds)} ago · ${formatUtcTime(body.indexRefreshedAt)} UTC`
              : "Never"],
            ["Indexed events", `${groupInteger(String(body.indexedEvents))} in the retention window`],
          ] : []}
        >
          How recently the API reloaded stored events into memory. It reloads every {COVERAGE.apiRefreshSeconds} seconds.
          {body?.lastRefreshError ? " The last refresh failed, so it is serving the last good index." : ""}
        </SignalCard>

        <SignalCard
          icon="chain"
          title="Chain progress"
          status={chainStatus(body?.checkpointError ?? null, checkpointSeconds, result)}
          rows={body ? [
            ["Last processed block", body.lastProcessedBlock !== null
              ? <a className="mono" href={etherscan("block", body.lastProcessedBlock)} target="_blank" rel="noopener noreferrer">{groupInteger(String(body.lastProcessedBlock))}</a>
              : "Unknown"],
            ...(behindHead !== null && body.chainHeadBlock != null ? [[
              "Behind chain head",
              `${groupInteger(String(behindHead))} ${behindHead === 1 ? "block" : "blocks"} · head ${groupInteger(String(body.chainHeadBlock))}`,
            ] as [string, string]] : []),
            ["Checkpoint updated", body.checkpointUpdatedAt && checkpointSeconds !== null
              ? `${formatDuration(checkpointSeconds)} ago · ${formatUtcTime(body.checkpointUpdatedAt)} UTC`
              : "Unknown"],
          ] : []}
        >
          The last block the indexer finished and saved. The checkpoint normally moves every {coverage.pollIntervalSeconds} seconds.
          {behindHead !== null ? " The gap to the chain head is measured when the checkpoint is saved, and is normally the confirmation buffer." : ""}
          {body?.checkpointError ? " The API could not read the checkpoint on its last check." : ""}
        </SignalCard>

        <SignalCard
          icon="clock"
          title="Retention"
          status={<span className="small subtle">{body ? "Reported by the API" : "Configuration"}</span>}
          rows={[["Window", `${body?.retentionDays ?? COVERAGE.retentionDays} days`]]}
        >
          Events older than this are removed from the API, and from storage by a lifecycle rule. Older activity is
          still on Etherscan.
        </SignalCard>

        <SignalCard
          icon="shield"
          title="Confirmation buffer"
          status={<span className="small subtle">{body?.confirmationBuffer != null ? "Reported by the API" : "Configuration"}</span>}
          rows={[["Buffer", `${coverage.confirmationBlocks} blocks · about ${coverage.confirmationBlocks * COVERAGE.blockTimeSeconds} s`]]}
        >
          The indexer reads a block only once it is this many blocks behind the newest one. This lowers
          reorganization risk but is not a finality guarantee.
        </SignalCard>
      </section>

      <HistoryNotice />

      <section className="stack gap-16" aria-labelledby="rules-h">
        <h2 className="h3" id="rules-h">How each state is decided</h2>
        <p className="small muted" style={{ maxWidth: 820 }}>
          Each signal is judged on its own and the summary shows the most serious one. Thresholds are counted in
          missed cycles: the indexer and the API both run every 30 seconds.
        </p>
        <div className="card scroll-x">
          <table className="dtbl" style={{ margin: 0 }}>
            <thead>
              <tr><th scope="col">State</th><th scope="col">Rule</th><th scope="col">What visitors see</th></tr>
            </thead>
            <tbody>
              <RuleRow level="ok" label="Healthy" rule={'Status "ok", index refreshed under 90 s ago, checkpoint under 2 min old'} effect="Transfers appear about 1 to 3 minutes after their block" />
              <RuleRow level="warn" label="Delayed" rule="Index 90 s to 5 min old, or checkpoint 2 to 5 min old" effect="Data is correct but new transfers arrive late" />
              <RuleRow level="warn" icon="warning" label="Degraded" rule={'HTTP 200 with status "degraded": a refresh or checkpoint read failed'} effect="Results load but may stop updating" />
              <RuleRow level="stale" label="Stale" rule="Index or checkpoint more than 5 min old" effect={`Recent transfers are missing. The API refuses at ${COVERAGE.maxStaleMinutes} min`} />
              <RuleRow level="err" label="Unavailable" rule="HTTP 503, any other error status, or no response" effect="The monitor cannot load transfers" />
              <RuleRow level="paused" label="Paused" rule="The site was built in maintenance mode. No requests are made" effect="Docs work. Monitoring returns on the stated date" />
            </tbody>
          </table>
        </div>
        <p className="small subtle">
          This page shows the current state only. Uptime history and incident records are not collected, so none are
          shown.
        </p>
      </section>
    </main>
  );
}

const SUMMARY_TITLE: Record<OverallState, string> = {
  healthy: "Monitoring is healthy",
  delayed: "Monitoring is delayed",
  degraded: "Monitoring is degraded",
  stale: "Data is stale",
  unavailable: "Monitoring is unavailable",
};

function Summary({
  state,
  result,
  indexSeconds,
  checkpointSeconds,
}: {
  state: OverallState | null;
  result: HealthResult | null;
  indexSeconds: number | null;
  checkpointSeconds: number | null;
}) {
  const level: Level = state ? OVERALL_LEVEL[state] : "unknown";
  const icon = state === "degraded" ? "warning" : LEVEL_ICON[level];
  const title = state ? SUMMARY_TITLE[state] : "Checking the service";
  const body = result?.kind === "response" ? result.body : null;
  const block = body?.lastProcessedBlock != null ? groupInteger(String(body.lastProcessedBlock)) : null;
  const indexAgo = indexSeconds !== null ? formatDuration(indexSeconds) : "an unknown time";
  const checkpointAgo = checkpointSeconds !== null ? formatDuration(checkpointSeconds) : "an unknown time";

  let text = "Asking the API for its current health.";
  if (state === "healthy") {
    text = `The API is answering, its index refreshed ${indexAgo} ago, and the indexer recorded block ${block} ${checkpointAgo} ago. New qualifying transfers should appear about 1 to 3 minutes after their block.`;
  } else if (state === "delayed") {
    text = checkpointSeconds !== null && checkpointSeconds >= 120
      ? `The indexer last recorded a block ${checkpointAgo} ago. The data shown is correct, but new transfers are arriving later than usual.`
      : `The API last reloaded its index ${indexAgo} ago. The data shown is correct, but new transfers are arriving later than usual.`;
  } else if (state === "degraded") {
    const cause = body?.lastRefreshError ? "its last index refresh failed" : "it could not read the indexer checkpoint";
    text = `The API is answering, but it reported an error: ${cause}. It keeps serving the last good data from ${indexAgo} ago.`;
  } else if (state === "stale") {
    text = checkpointSeconds !== null && checkpointSeconds >= 300
      ? `Nothing new has been indexed for ${checkpointAgo}. Transfers since block ${block ?? "the last checkpoint"} are missing from the monitor until the indexer catches up.`
      : `The API has not reloaded its index for ${indexAgo}. Recent transfers may be missing until it refreshes.`;
  } else if (state === "unavailable") {
    const cause = result?.kind === "unreachable"
      ? "no response"
      : result?.httpStatus === 503
        ? `HTTP 503, the index is more than ${COVERAGE.maxStaleMinutes} minutes old`
        : result?.httpStatus === 429
          ? "HTTP 429, too many requests from your network"
          : `HTTP ${result?.httpStatus}`;
    text = `The health check did not succeed: ${cause}. The monitor cannot load transfers right now. This page checks again every ${COVERAGE.monitorRefreshSeconds} seconds.`;
  }

  return (
    <section className={`tinted ${level === "unknown" ? "" : level} row gap-20 summary-box`} role="status" aria-live="polite">
      <Icon name={icon} size={32} className={`tone-${level}`} />
      <div className="stack gap-6">
        <h2 className="h2">{title}</h2>
        <p className="lead" style={{ color: "var(--text)" }}>{text}</p>
      </div>
    </section>
  );
}

function apiStatus(result: HealthResult | null) {
  if (!result) return <StatusLabel level="unknown">Checking</StatusLabel>;
  if (result.kind === "unreachable") return <StatusLabel level="err">Not reachable</StatusLabel>;
  if (result.httpStatus === 429) return <StatusLabel level="warn">Rate limited</StatusLabel>;
  if (result.httpStatus !== 200 || !result.body) return <StatusLabel level="err">Unavailable</StatusLabel>;
  if (result.body.status === "degraded") return <StatusLabel level="warn" icon="warning">Degraded</StatusLabel>;
  return <StatusLabel level="ok">Healthy</StatusLabel>;
}

function apiText(result: HealthResult | null) {
  if (!result) return "Waiting for the first response.";
  if (result.kind === "unreachable") return "The health endpoint did not answer. The network, the load balancer or the API may be down.";
  if (result.httpStatus === 429) return "Too many requests from your network. The API allows 60 requests per minute from each IP address.";
  if (result.httpStatus === 503) return "The API answered, but its index has not refreshed for too long, so it is refusing to serve old data.";
  if (result.httpStatus !== 200 || !result.body) return `The health endpoint answered with HTTP ${result.httpStatus}.`;
  if (result.body.status === "degraded") return 'The health endpoint answered with HTTP 200 and status "degraded". A refresh or checkpoint read failed.';
  return 'The health endpoint answered with HTTP 200 and status "ok". No refresh or checkpoint errors were reported.';
}

function apiRows(result: HealthResult | null): Array<[string, string]> {
  if (!result || result.kind === "unreachable") return [];
  return [
    ["HTTP", String(result.httpStatus)],
    ["Reported status", result.body?.status ?? "Not reported"],
  ];
}

function indexStatus(indexError: string | null, refreshError: string | null, seconds: number | null, result: HealthResult | null) {
  if (!result) return <StatusLabel level="unknown">Checking</StatusLabel>;
  if (result.kind === "unreachable" || !result.body) return <StatusLabel level="unknown">Unknown</StatusLabel>;
  if (indexError || seconds === null) return <StatusLabel level="err">Unavailable</StatusLabel>;
  if (refreshError) return <StatusLabel level="warn" icon="warning">Refresh failed</StatusLabel>;
  const level = indexLevel(seconds);
  return <StatusLabel level={level}>{OVERALL_LABEL[level === "ok" ? "healthy" : level === "warn" ? "delayed" : "stale"]}</StatusLabel>;
}

function chainStatus(checkpointError: string | null, seconds: number | null, result: HealthResult | null) {
  if (!result) return <StatusLabel level="unknown">Checking</StatusLabel>;
  if (result.kind === "unreachable" || !result.body) return <StatusLabel level="unknown">Unknown</StatusLabel>;
  if (checkpointError) return <StatusLabel level="warn" icon="warning">Unreadable</StatusLabel>;
  if (seconds === null) return <StatusLabel level="warn">No checkpoint</StatusLabel>;
  const level = checkpointLevel(seconds);
  return <StatusLabel level={level}>{OVERALL_LABEL[level === "ok" ? "healthy" : level === "warn" ? "delayed" : "stale"]}</StatusLabel>;
}

function RuleRow({ level, icon, label, rule, effect }: { level: Level; icon?: "warning"; label: string; rule: string; effect: string }) {
  return (
    <tr>
      <td><StatusLabel level={level} icon={icon}>{label}</StatusLabel></td>
      <td>{rule}</td>
      <td className="muted">{effect}</td>
    </tr>
  );
}
