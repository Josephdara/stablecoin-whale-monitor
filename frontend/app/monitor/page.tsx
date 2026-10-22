import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitorApp } from "../../components/monitor/MonitorApp";
import { MonitorMaintenance } from "../../components/monitor/MonitorMaintenance";
import { MAINTENANCE } from "../../lib/config";

export const metadata: Metadata = { title: "Transfer monitor" };

export default function MonitorPage() {
  if (MAINTENANCE.paused) return <MonitorMaintenance />;
  // Query parameters are read on the client, so the page still exports statically.
  return (
    <Suspense fallback={<main id="content" className="monitor-main"><p className="muted">Loading the monitor…</p></main>}>
      <MonitorApp />
    </Suspense>
  );
}
