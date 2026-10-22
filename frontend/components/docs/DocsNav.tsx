"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { SITE } from "../../lib/config";
import { Icon } from "../Icon";

type Item = { href: string; label: string; sub?: boolean; external?: boolean };

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Get started",
    items: [
      { href: "/docs/", label: "Overview" },
      { href: "/docs/guide/", label: "Product guide" },
    ],
  },
  {
    title: "API reference",
    items: [
      { href: "/docs/api/", label: "API overview" },
      { href: "/docs/api/#transfers", label: "GET /api/transfers", sub: true },
      { href: "/docs/api/#transaction", label: "GET /api/transfers/{txHash}", sub: true },
      { href: "/docs/api/#health", label: "GET /api/health", sub: true },
    ],
  },
  {
    title: "Architecture and security",
    items: [
      { href: "/docs/architecture/", label: "Architecture and data flow" },
      { href: "/docs/architecture/#compute", label: "Compute and service boundaries", sub: true },
      { href: "/docs/architecture/#security", label: "Security", sub: true },
      { href: "/docs/architecture/#identity", label: "Identity and permissions", sub: true },
      { href: "/docs/architecture/#delivery", label: "Build and deployment", sub: true },
      { href: "/docs/architecture/#monitoring", label: "Monitoring and failure handling", sub: true },
      { href: "/docs/architecture/#alerting", label: "Alerting (disabled)", sub: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/docs/operations/", label: "Operations guide" },
      { href: SITE.runbook, label: "Runbook", external: true },
    ],
  },
  {
    title: "Version history",
    items: [{ href: "/docs/history/", label: "Versions" }],
  },
];

function normalize(path: string) {
  return path.endsWith("/") ? path : `${path}/`;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = normalize(usePathname() ?? "/docs/");
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.title}>
          <div className="grp">{group.title}</div>
          <div>
            {group.items.map((item) =>
              item.external ? (
                <a key={item.href} href={item.href} onClick={onNavigate}>
                  <span className="row gap-6">{item.label}<Icon name="external" size={14} /></span>
                </a>
              ) : (
                <div key={item.href} className={item.sub ? "sub" : undefined}>
                  <Link
                    href={item.href}
                    aria-current={!item.sub && normalize(item.href) === pathname ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {item.sub ? <span className="mono" style={{ fontSize: 12 }}>{item.label}</span> : item.label}
                  </Link>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </>
  );
}

export function DocsNav() {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <nav className="dnav desktop" aria-label="Documentation">
        <div className="dnav-inner">
          <NavLinks />
        </div>
      </nav>

      <div className="docs-menu-bar">
        <span className="small strong">Documentation</span>
        <button className="btn btn-ghost" type="button" style={{ minHeight: 44 }} onClick={() => dialog.current?.showModal()}>
          <Icon name="menu" />
          Menu
        </button>
      </div>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="docs-menu-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="sheet-grip" aria-hidden="true"><span /></div>
        <div className="sheet-head">
          <h2 className="h3" id="docs-menu-title">Documentation</h2>
          <button className="btn-icon lg" type="button" aria-label="Close menu" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="dnav" aria-label="Documentation" style={{ padding: "0 12px 20px" }}>
          <NavLinks onNavigate={close} />
        </nav>
      </dialog>
    </>
  );
}
