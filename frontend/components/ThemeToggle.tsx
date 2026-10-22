"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export const THEME_STORAGE_KEY = "swm-theme";

// Runs in <head> before paint so the stored theme never flashes.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page view.
    }
    setTheme(next);
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button className="btn-icon" type="button" aria-label={label} title={label} onClick={toggle}>
      <Icon name={theme === "light" ? "sun" : "moon"} />
    </button>
  );
}
