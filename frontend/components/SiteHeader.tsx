"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAINTENANCE, SITE } from "../lib/config";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Product", match: (path: string) => path === "/" },
  { href: "/monitor/", label: "Monitor", match: (path: string) => path.startsWith("/monitor") },
  { href: "/docs/", label: "Docs", match: (path: string) => path.startsWith("/docs") },
  { href: "/status/", label: "Status", match: (path: string) => path.startsWith("/status") },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const onHome = pathname === "/";

  return (
    <header className="gh">
      <Link className="brand" href="/">
        <img className="logo" src="/logo.png" alt="" width={30} height={30} />
        {SITE.name}
      </Link>
      <nav aria-label="Main">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={item.match(pathname) ? "page" : undefined}>
            {item.label}
            {item.label === "Monitor" && MAINTENANCE.paused ? <span className="nav-paused">Paused</span> : null}
          </Link>
        ))}
      </nav>
      <div className="gh-actions">
        <ThemeToggle />
        <a className="btn btn-ghost btn-sm hide-narrow" href={SITE.repository}>
          <Icon name="code" size={14} />
          Repository
        </a>
        {onHome && !MAINTENANCE.paused ? (
          <Link className="btn btn-primary btn-sm" href="/monitor/">Open monitor</Link>
        ) : null}
      </div>
    </header>
  );
}
