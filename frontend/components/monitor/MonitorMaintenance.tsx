import Link from "next/link";
import { COVERAGE, MAINTENANCE } from "../../lib/config";
import { formatLongDate, groupInteger } from "../../lib/format";
import { Icon, TokenGlyph } from "../Icon";
import { StatusLabel } from "../ui";

// In a paused build no filter, lookup, table or refresh control is rendered,
// so nothing looks clickable that cannot work. A shared link keeps its query
// string and works again once the services return.
export function MonitorMaintenance() {
  const returnDate = formatLongDate(MAINTENANCE.expectedReturn);
  return (
    <main id="content" className="monitor-main" style={{ maxWidth: 1280 }}>
      <div className="row spread gap-16 monitor-title" style={{ flexWrap: "wrap" }}>
        <h1 className="h2">Transfer monitor</h1>
        <div className="wrap-row gap-8" aria-label="Coverage">
          <span className="pill"><Icon name="chain" size={14} />Ethereum mainnet · chain {COVERAGE.chainId}</span>
          <span className="pill"><TokenGlyph token="USDC" />USDC<TokenGlyph token="USDT" />USDT</span>
          <span className="pill num">Qualifies at {groupInteger(COVERAGE.indexThreshold)} tokens or more</span>
        </div>
      </div>

      <section aria-label="Service signals" className="card signals">
        <div className="signal">
          <span className="overline">API</span>
          <StatusLabel level="paused">Paused</StatusLabel>
          <span className="small subtle signal-detail">Not contacted during maintenance</span>
        </div>
        <div className="signal">
          <span className="overline">Index refreshed</span>
          <StatusLabel level="paused">Paused</StatusLabel>
          <span className="small subtle signal-detail">Resumes with the API</span>
        </div>
        <div className="signal">
          <span className="overline">Chain progress</span>
          <StatusLabel level="paused">Paused</StatusLabel>
          <span className="small subtle signal-detail">Indexer stopped</span>
        </div>
      </section>

      <div className="m-pad">
        <section className="tinted paused stack gap-16 pause-card" aria-labelledby="pause-h">
          <span className="row gap-8 small tone-paused strong">
            <Icon name="clock" size={14} />
            Expected back {returnDate}
          </span>
          <h2 className="h2" id="pause-h">Monitoring is paused for maintenance</h2>
          <p className="lead" style={{ color: "var(--text)", maxWidth: 760 }}>
            The transfer feed and API are offline until {returnDate}. This page is not loading any data, so nothing here
            is out of date or broken. The whale is just below the surface for a few days.
          </p>
          <div className="stack gap-6" style={{ maxWidth: 760 }}>
            <h3 className="h4">When monitoring resumes</h3>
            <p className="muted">
              The indexer continues from its last saved checkpoint, so qualifying transfers from the pause appear once
              processed, as long as they are still inside the {COVERAGE.retentionDays}-day retention window. Expect the
              feed to catch up over a short period after restart.
            </p>
          </div>
          <div className="wrap-row gap-10">
            <Link className="btn btn-secondary" href="/docs/guide/">Read the product guide</Link>
            <Link className="btn btn-ghost" href="/docs/api/">API reference</Link>
            <Link className="btn btn-ghost" href="/status/">Maintenance details</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
