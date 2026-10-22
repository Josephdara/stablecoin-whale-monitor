import Link from "next/link";
import { SITE } from "../lib/config";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="stack gap-12">
          <div className="row gap-10">
            <img className="logo" src="/logo.png" alt="" width={28} height={28} />
            <span className="strong">{SITE.name}</span>
          </div>
          <p className="small subtle">Large USDC and USDT transfers on Ethereum mainnet. Read-only. Not financial advice.</p>
        </div>
        <nav aria-label="Product">
          <span className="overline">Product</span>
          <Link href="/monitor/">Monitor</Link>
          <Link href="/status/">Status</Link>
          <Link href="/docs/guide/#lookup">Look up a transaction</Link>
        </nav>
        <nav aria-label="Documentation">
          <span className="overline">Docs</span>
          <Link href="/docs/guide/">Product guide</Link>
          <Link href="/docs/api/">API reference</Link>
          <Link href="/docs/architecture/">Architecture and security</Link>
          <Link href="/docs/history/">Version history</Link>
        </nav>
        <nav aria-label="Source">
          <span className="overline">Source</span>
          <a href={SITE.repository}>GitHub repository</a>
          <a href={SITE.runbook}>Runbook</a>
        </nav>
      </div>
    </footer>
  );
}
