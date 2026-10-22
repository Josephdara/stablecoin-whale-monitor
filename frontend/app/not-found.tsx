import Link from "next/link";
import { Callout } from "../components/ui";

export default function NotFound() {
  return (
    <main
      id="content"
      className="wrap"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))",
        gap: 48,
        alignItems: "center",
        paddingTop: 72,
        paddingBottom: 72,
      }}
    >
      <div className="stack gap-20">
        <span className="mono subtle">404</span>
        <h1 className="display" style={{ fontSize: 48, lineHeight: "54px" }}>Nothing at this address.</h1>
        <p className="lead">The page you asked for does not exist or has moved.</p>
        <Callout tone="info">
          <span>
            Looking for a transaction? Transfer pages do not have their own paths. Use the lookup in the monitor, or a
            link like <code className="ic-code">/monitor/?tx=0x…</code>
          </span>
        </Callout>
        <div className="wrap-row gap-12">
          <Link className="btn btn-primary" href="/monitor/">Open monitor</Link>
          <Link className="btn btn-secondary" href="/">Go to home</Link>
          <Link className="btn btn-ghost" href="/docs/">Documentation</Link>
        </div>
      </div>
      <div aria-hidden="true" className="row" style={{ justifyContent: "center" }}>
        <svg viewBox="0 0 320 320" width="320" height="320" fill="none" style={{ maxWidth: "100%", height: "auto" }}>
          <circle cx="160" cy="160" r="150" stroke="var(--ring-1)" strokeWidth="1.5" />
          <circle cx="160" cy="160" r="110" stroke="var(--ring-1)" strokeWidth="1.5" />
          <circle cx="160" cy="160" r="70" stroke="var(--ring-2)" strokeWidth="1.5" />
          <circle cx="160" cy="160" r="30" stroke="var(--ring-2)" strokeWidth="1.5" />
          <path d="M160 160 266 54" stroke="#00CFFF" strokeWidth="2" strokeLinecap="round" opacity=".7" />
          <circle cx="160" cy="160" r="5" fill="#00CFFF" />
        </svg>
      </div>
    </main>
  );
}
