import { Gauge, Guitar, Target, type LucideIcon } from "lucide-react";

export interface NavEntry {
  path: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Top-level pages, in tab order. `routes.tsx` builds its entries from this
 * list and the header tabs render it, so the router and the tabs can never
 * drift apart.
 */
export const NAV: readonly NavEntry[] = [
  { path: "/", label: "지판", icon: Guitar },
  { path: "/quiz", label: "퀴즈", icon: Target },
  { path: "/tuner", label: "조율", icon: Gauge },
];
