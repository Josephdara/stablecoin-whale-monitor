import { CONFIRMATION_SECONDS, COVERAGE, MAINTENANCE } from "../../lib/config";
import { formatLongDate } from "../../lib/format";
import { Icon } from "../Icon";
import { StatusLabel } from "../ui";
import { SignalCard } from "./SignalCard";

export function StatusMaintenance() {
  return (
    <main id="content" className="wrap stack gap-24" style={{ paddingTop: 40, paddingBottom: 64, maxWidth: 1120 }}>
      <div className="stack gap-6">
        <h1 className="h1">Service status</h1>
        <p className="muted">
          This build of the site is in maintenance mode, so it does not call <code className="ic-code">/api/health</code>.
        </p>
      </div>

      <section className="tinted paused row gap-20 summary-box" role="status">
        <Icon name="paused" size={32} className="tone-paused" />
        <div className="stack gap-6">
          <h2 className="h2">Monitoring is paused for maintenance</h2>
          <p className="lead" style={{ color: "var(--text)" }}>
            The indexer and API are switched off on purpose. Expected back on{" "}
            {formatLongDate(MAINTENANCE.expectedReturn)}. The website and documentation are fully available.
          </p>
          <p className="muted">
            This is planned downtime, not an outage. When the services return, the site is rebuilt without the
            maintenance switch and this page goes back to live checks.
          </p>
        </div>
      </section>

      <section aria-label="Signals" className="grid-auto-320" style={{ gap: 16 }}>
        <SignalCard icon="api" title="API availability" status={<StatusLabel level="paused">Paused</StatusLabel>}>
          Requests to /api are not routed during maintenance.
        </SignalCard>
        <SignalCard icon="index" title="Index refresh" status={<StatusLabel level="paused">Paused</StatusLabel>}>
          Resumes when the API starts again.
        </SignalCard>
        <SignalCard icon="chain" title="Chain progress" status={<StatusLabel level="paused">Paused</StatusLabel>}>
          The indexer is stopped. It continues from its saved checkpoint on restart.
        </SignalCard>
        <SignalCard
          icon="clock"
          title="Retention"
          status={<span className="small subtle">Configuration</span>}
          rows={[["Window", `${COVERAGE.retentionDays} days`]]}
        />
        <SignalCard
          icon="shield"
          title="Confirmation buffer"
          status={<span className="small subtle">Configuration</span>}
          rows={[["Buffer", `${COVERAGE.confirmationBlocks} blocks · about ${CONFIRMATION_SECONDS} s`]]}
        />
      </section>
      <p className="small subtle">Values marked Configuration are part of the site build and do not need the API.</p>
    </main>
  );
}
