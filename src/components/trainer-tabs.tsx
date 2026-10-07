import { NavLink } from "react-router-dom";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Skip link + the page tabs shared by every trainer page header. */
export function TrainerTabs() {
  return (
    <>
      <a
        href="#bft-content"
        onClick={(event) => {
          const content = document.getElementById("bft-content");
          if (content) {
            event.preventDefault();
            content.focus();
            content.scrollIntoView({ block: "nearest" });
          }
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-primary focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-primary-foreground"
      >
        본문으로 건너뛰기
      </a>
      <nav aria-label="페이지" className="flex shrink-0 items-center gap-0.5 rounded-full bg-secondary p-0.5">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end
            className={({ isActive }) =>
              cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-[760px]:px-3",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            {/* Icons only where there is room — three tabs share a 667px-wide phone header. */}
            <Icon className="hidden size-3.5 min-[760px]:block" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
        <a
          href="https://github.com/swannekim/bass-fretboard-note-trainer#license"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="소스 코드 및 AGPL-3.0 라이선스 (새 탭)"
          className="inline-flex h-8 items-center rounded-full px-2 text-[10px] font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          소스 · AGPL
        </a>
      </nav>
    </>
  );
}
