"use client";

import { useEffect, useRef, useState } from "react";
import { useAnnounce } from "./Announcer";
import { Icon } from "./Icon";

type Props = {
  value: string;
  label: string;
  variant?: "icon" | "text";
  className?: string;
};

// Copies the full value even when the display is truncated.
export function CopyButton({ value, label, variant = "icon", className }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  const announce = useAnnounce();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      announce("Copied to clipboard.");
    } catch {
      setState("failed");
      announce("Copy blocked. Select the text instead.");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  }

  const note = state === "copied" ? "Copied" : state === "failed" ? "Copy blocked. Select the text instead" : null;

  if (variant === "text") {
    return (
      <span className="row gap-6">
        <button type="button" className={`btn btn-ghost btn-sm ${className ?? ""}`} onClick={copy} aria-label={label}>
          <Icon name={state === "copied" ? "ok" : "copy"} size={14} />
          {state === "copied" ? "Copied" : "Copy"}
        </button>
        {state === "failed" ? <span className="copy-note failed">{note}</span> : null}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`cp ${state === "copied" ? "done" : ""} ${className ?? ""}`}
        onClick={copy}
        aria-label={label}
        title={label}
      >
        <Icon name={state === "copied" ? "ok" : "copy"} size={14} />
      </button>
      {note ? <span className={`copy-note ${state === "failed" ? "failed" : ""}`} aria-hidden="true">{note}</span> : null}
    </>
  );
}
