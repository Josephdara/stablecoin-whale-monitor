import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { StatusApp } from "../../components/status/StatusApp";
import { StatusMaintenance } from "../../components/status/StatusMaintenance";
import { MAINTENANCE } from "../../lib/config";

export const metadata: Metadata = { title: "Service status" };

export default function StatusPage() {
  return (
    <>
      {MAINTENANCE.paused ? <StatusMaintenance /> : <StatusApp />}
      <SiteFooter />
    </>
  );
}
