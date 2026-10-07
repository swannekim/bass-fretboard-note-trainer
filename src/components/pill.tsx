import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PillProps {
  children: ReactNode;
  onClick: () => void;
  /** Present only for on/off toggles; a cycling control omits it. */
  pressed?: boolean;
  /** Accessible name for an icon-only pill. */
  label?: string;
  className?: string;
}

/** Compact header control shared by the trainer pages. */
export function Pill({ children, onClick, pressed, label, className }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        pressed
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
