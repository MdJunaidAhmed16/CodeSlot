"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("codeslot-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
    >
      <span className="flex items-center gap-2">
        {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Theme
      </span>
      <span className="text-xs text-muted-foreground">{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
