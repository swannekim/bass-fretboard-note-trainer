import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { NAV } from "@/lib/nav";
import { HomePage } from "@/pages/home";
import { QuizPage } from "@/pages/quiz";
import { TunerPage } from "@/pages/tuner";

export interface AppRoute {
  /** "/" is the index route; others are paths under the shell. */
  path: string;
  element: ReactElement;
  /** Optional nav metadata — set these only for routes that should appear in a
   *  navbar/sidebar (the shell ships none by default; map over `routes` when you
   *  add one). Omit for detail/utility routes that aren't top-level nav targets. */
  label?: string;
  icon?: LucideIcon;
}

// Single source of truth for routes. Add a page = add ONE entry here.
// `App.tsx` builds <Routes> from this array; when you add a navbar or sidebar,
// map over `routes` (e.g. filter to entries with a `label`) so the router and
// the nav can never drift out of sync. `not-found` is wired in App.tsx.
// Tab metadata (path, label, icon) comes from `@/lib/nav`, which the header
// tabs render too — one list drives both.
export const routes: AppRoute[] = [
  { ...NAV[0], element: <HomePage /> },
  { ...NAV[1], element: <QuizPage /> },
  { ...NAV[2], element: <TunerPage /> },
];
