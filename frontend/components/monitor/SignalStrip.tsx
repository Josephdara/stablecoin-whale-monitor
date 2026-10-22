"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import type { Level } from "../../lib/health";
import { StatusLabel } from "../ui";

export type SignalView = { level: Level; label: string; detail: string; icon?: "warning"; short?: string };

export function useCountdown(to: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [to]);
  return Math.max(0, Math.ceil((to - now) / 1000));
}

export function Countdown({ to }: { to: number }) {
  const seconds = useCountdown(to);
  return <>{seconds}</>;
}

export function SignalStrip({
  api,
  index,
  chain,
  controls,
}: {
  api: SignalView;
  index: SignalView;
  chain: SignalView;
  controls: ReactNode;
}) {
  return (
    <section aria-label="Service signals" className="card signals">
      <Signal title="API" short="API" view={api} />
      <Signal title="Index refreshed" short="Index" view={index} />
      <Signal title="Chain progress" short="Chain" view={chain} />
      <div className="signal controls">{controls}</div>
    </section>
  );
}

function Signal({ title, short, view }: { title: string; short: string; view: SignalView }) {
  return (
    <div className="signal">
      <span className="overline">
        <span className="desktop-only">{title}</span>
        <span className="mobile-only" aria-hidden="true">{short}</span>
      </span>
      <StatusLabel level={view.level} icon={view.icon}>
        {view.short ? (
          <>
            <span className="desktop-only">{view.label}</span>
            <span className="mobile-only">{view.short}</span>
          </>
        ) : view.label}
      </StatusLabel>
      <span className="small subtle num signal-detail">{view.detail}</span>
    </div>
  );
}

export function AutoRefreshNote({ active, reason, nextAt }: { active: boolean; reason: ReactNode; nextAt: number }) {
  if (active) {
    return (
      <span className="row small muted gap-8">
        <span className="ping-dot" aria-hidden="true" />
        <span className="num">Auto-refresh every 30 s · next in <Countdown to={nextAt} /> s</span>
      </span>
    );
  }
  return (
    <span className="row small gap-8 tone-paused">
      <Icon name="pause" size={14} />
      <span>{reason}</span>
    </span>
  );
}
