import type { Metadata } from "next";
import Link from "next/link";
import { DocsPage, H2 } from "../../../components/docs/DocsPage";
import { SITE } from "../../../lib/config";

export const metadata: Metadata = { title: "Version history" };

const VERSIONS = [
  {
    version: "v3",
    current: true,
    platform: "Terraform-managed Cloud Run: an indexer worker pool and an API service, Pub/Sub, a global edge, monitoring and gated CI/CD",
    docs: { href: "/docs/architecture/", label: "Architecture and security" },
    source: `${SITE.repository}/tree/V3`,
  },
  {
    version: "v2",
    current: false,
    platform: "Manually deployed containers on a Cloud Run Job and Scheduler, Pub/Sub, and a GKE Autopilot portability exercise",
    docs: { href: `${SITE.repository}/blob/main/docs/PLAYBOOK.md`, label: "v2 deployment playbook" },
    source: `${SITE.repository}/tree/V2`,
  },
  {
    version: "v1",
    current: false,
    platform: "Hand-configured Compute Engine virtual machines with systemd, Nginx, VPC and NAT, and a global load balancer",
    docs: { href: `${SITE.repository}/blob/main/docs/V1.md`, label: "v1 architecture and operations" },
    source: `${SITE.repository}/tree/V1`,
  },
];

export default function HistoryPage() {
  return (
    <DocsPage
      section="Version history"
      title="Version history"
      lead="Explore how the infrastructure evolved across three versions."
      toc={[{ id: "versions", label: "Versions" }]}
      previous={{ href: "/docs/operations/", label: "Operations guide" }}
    >
      <H2 id="versions">Versions</H2>
      <p>
        Use the current <a href={SITE.runbook}>deployment runbook</a> to set up the system.
      </p>
      <div className="card scroll-x" style={{ marginBottom: 20 }}>
        <table className="dtbl" style={{ margin: 0 }}>
          <thead>
            <tr><th scope="col">Version</th><th scope="col">Platform</th><th scope="col">Status</th><th scope="col">Documents</th></tr>
          </thead>
          <tbody>
            {VERSIONS.map((item) => (
              <tr key={item.version}>
                <td className="mono">{item.version}</td>
                <td>{item.platform}</td>
                <td><span className={`pill ${item.current ? "current" : ""}`}>{item.current ? "Current" : "Historical"}</span></td>
                <td>
                  <div className="stack gap-4">
                    {item.docs.href.startsWith("/") ? <Link href={item.docs.href}>{item.docs.label}</Link> : <a href={item.docs.href}>{item.docs.label}</a>}
                    <a href={item.source}>Source snapshot</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The current version is also on the <code>main</code> branch.
      </p>
    </DocsPage>
  );
}
