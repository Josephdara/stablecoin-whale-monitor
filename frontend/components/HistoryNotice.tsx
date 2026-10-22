"use client";

import { useEffect, useState } from "react";
import { COVERAGE, HISTORY_STARTS } from "../lib/config";
import { addDays, formatLongDate } from "../lib/format";
import { Callout } from "./ui";

// Shown after a restart that moved the checkpoint forward, until the start
// date falls outside the retention window.
export function HistoryNotice() {
  const [visible, setVisible] = useState(false);
  const fullFrom = HISTORY_STARTS ? addDays(HISTORY_STARTS, COVERAGE.retentionDays) : null;

  useEffect(() => {
    if (!fullFrom) return;
    setVisible(Date.now() < Date.parse(`${fullFrom}T00:00:00Z`));
  }, [fullFrom]);

  if (!visible || !HISTORY_STARTS || !fullFrom) return null;
  return (
    <Callout tone="info" icon="clock">
      <span>
        History starts on {formatLongDate(HISTORY_STARTS)}. Monitoring was paused for maintenance and restarted from
        that date, so transfers before it are not available here. The full {COVERAGE.retentionDays}-day window is back
        on {formatLongDate(fullFrom)}.
      </span>
    </Callout>
  );
}
