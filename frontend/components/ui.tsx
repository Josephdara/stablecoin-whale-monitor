import type { ReactNode } from "react";
import type { Token, Transfer } from "../lib/api";
import { MAINTENANCE } from "../lib/config";
import { formatLongDate, splitAmount } from "../lib/format";
import type { Level } from "../lib/health";
import { Icon, TokenGlyph, type IconName } from "./Icon";

export function TokenBadge({ token }: { token: Token }) {
  return (
    <span className={`tok ${token.toLowerCase()}`}>
      <TokenGlyph token={token} />
      <span>{token}</span>
    </span>
  );
}

export function TypeBadge({ type, showNormal = false }: { type: Transfer["transferType"]; showNormal?: boolean }) {
  if (type === "mint") return <span className="ttype mint"><Icon name="mint" />Mint</span>;
  if (type === "burn") return <span className="ttype burn"><Icon name="burn" />Burn</span>;
  return showNormal ? <span className="ttype normal">Transfer</span> : null;
}

export function Amount({ value, className }: { value: string; className?: string }) {
  const { whole, fraction } = splitAmount(value);
  return (
    <span className={`amount num ${className ?? ""}`}>
      {whole}
      {fraction ? <span className="dec">{fraction}</span> : null}
    </span>
  );
}

export const LEVEL_ICON: Record<Level, IconName> = {
  ok: "ok",
  warn: "delayed",
  stale: "warning",
  err: "unavailable",
  paused: "paused",
  unknown: "info",
};

export function StatusLabel({ level, icon, children }: { level: Level; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`st ${level}`}>
      <Icon name={icon ?? LEVEL_ICON[level]} />
      <span className="num">{children}</span>
    </span>
  );
}

type Tone = "info" | "ok" | "warn" | "stale" | "err" | "paused";

const TONE_ICON: Record<Tone, IconName> = {
  info: "info",
  ok: "ok",
  warn: "delayed",
  stale: "warning",
  err: "unavailable",
  paused: "paused",
};

export function Callout({
  tone,
  icon,
  role,
  children,
  className,
}: {
  tone: Tone;
  icon?: IconName;
  role?: "alert" | "status";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`callout tinted ${tone} ${className ?? ""}`} role={role}>
      <Icon name={icon ?? TONE_ICON[tone]} className={`tone-${tone}`} />
      <div className="body">{children}</div>
    </div>
  );
}

export function ExampleTag({ small = false, children = "Example data" }: { small?: boolean; children?: ReactNode }) {
  return (
    <span className={`example ${small ? "sm" : ""}`}>
      <Icon name="eye" size={14} />
      {children}
    </span>
  );
}

export function MaintenanceBanner() {
  if (!MAINTENANCE.paused) return null;
  return (
    <div className="banner" role="status">
      <Icon name="paused" size={20} />
      <span>
        Monitoring is paused for maintenance until {formatLongDate(MAINTENANCE.expectedReturn)}. The website and
        documentation are fully available. <a href="/status/">Details</a>
      </span>
    </div>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className ?? "lnk"} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <Icon name="external" size={14} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
